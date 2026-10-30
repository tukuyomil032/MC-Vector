use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, watch, Mutex, OwnedMutexGuard};

use super::eula::ensure_server_eula_accepted;
use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use super::java::{validate_java_executable_path, validate_jvm_extra_args};
use super::server_registry::{MinecraftServer, ServerRegistry};
use crate::metric_history::{should_poll_tps, MetricHistory, MetricHistorySnapshot};
use crate::server_stdout::route_stdout_line;
use crate::state::operation_manager::{
    GlobalOperation, OperationGuard, OperationKind, ServerOperationManager,
};

const MAX_RUNNING_SERVERS: usize = 8;
const MIN_MEMORY_MB: u32 = 256;
const MAX_MEMORY_MB: u32 = 65_536;
const COMMAND_MIN_INTERVAL: Duration = Duration::from_millis(100);
const MAX_SERVER_ID_LENGTH: usize = 128;
const COMMAND_QUEUE_CAPACITY: usize = 256;
pub const SERVER_STOP_GRACE_PERIOD: Duration = Duration::from_secs(20);
pub const PROCESS_KILL_REAP_TIMEOUT: Duration = Duration::from_secs(5);
pub(crate) const STOP_ERROR_RECOVERY_WAIT: Duration = Duration::from_secs(1);
const LOG_BUFFER_CAPACITY: usize = 4096;
const LOG_EMIT_INTERVAL: Duration = Duration::from_millis(50);
const LOG_EMIT_LINES_PER_TICK: usize = 200;
const TPS_POLL_INTERVAL: Duration = Duration::from_secs(5);

fn is_link_or_reparse_point(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return metadata.file_attributes() & 0x0400 != 0;
    }
    #[cfg(not(windows))]
    false
}

fn resolve_java_executable_path(java_path: &str, managed_root: &Path) -> Result<PathBuf, String> {
    let value = java_path.trim();
    if matches!(value, "java" | "java.exe") {
        return validate_java_executable_path(value, managed_root);
    }

    let configured_path = Path::new(value);
    if let Ok(metadata) = std::fs::symlink_metadata(configured_path) {
        if is_link_or_reparse_point(&metadata) {
            return Err("Java home must not be a symbolic link or reparse point".to_string());
        }
        if metadata.is_dir() {
            let executable_name = if cfg!(windows) { "java.exe" } else { "java" };
            let executable = configured_path.join("bin").join(executable_name);
            return validate_java_executable_path(&executable.to_string_lossy(), managed_root);
        }
    }

    validate_java_executable_path(value, managed_root)
}

/// 実行中サーバーの情報
pub(crate) struct RunningServer {
    command_tx: mpsc::Sender<String>,
    process_control_tx: mpsc::Sender<ServerProcessControl>,
    exit_rx: watch::Receiver<Option<ServerProcessExit>>,
    pub(crate) java_path: String,
    pub(crate) pid: u32,
    pub(crate) generation: u64,
    pub(crate) metrics: Arc<Mutex<MetricHistory>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ServerProcessExit {
    success: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum StopErrorRecoveryState {
    Stopped,
    RunningOrUnconfirmed,
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct StopServerError {
    pub(crate) message: String,
    pub(crate) recovery_state: StopErrorRecoveryState,
}

#[derive(Clone, Copy, Debug)]
enum ServerProcessControl {
    Stop,
    ForceKill,
}

/// 全サーバーのプロセスを管理する State
#[derive(Clone)]
pub struct ServerManager {
    pub servers: Arc<Mutex<HashMap<String, RunningServer>>>,
    expected_stops: Arc<Mutex<HashSet<String>>>,
    next_generation: Arc<std::sync::atomic::AtomicU64>,
    start_capacity_lock: Arc<Mutex<()>>,
    shutting_down: Arc<std::sync::atomic::AtomicBool>,
    status_events_tx: mpsc::UnboundedSender<ServerStatusEvent>,
    status_events_rx: Arc<StdMutex<Option<mpsc::UnboundedReceiver<ServerStatusEvent>>>>,
}

impl Default for ServerManager {
    fn default() -> Self {
        let (status_events_tx, status_events_rx) = mpsc::unbounded_channel();
        Self {
            servers: Arc::default(),
            expected_stops: Arc::default(),
            next_generation: Arc::default(),
            start_capacity_lock: Arc::default(),
            shutting_down: Arc::default(),
            status_events_tx,
            status_events_rx: Arc::new(StdMutex::new(Some(status_events_rx))),
        }
    }
}

/// Holds both per-server serialization and the global capacity reservation
/// until a successfully spawned child has been inserted into `servers`.
struct ServerStartGuard {
    _operation: OperationGuard,
    _capacity: OwnedMutexGuard<()>,
}

impl ServerManager {
    /// The receiver is taken once by the automation service. Until then, status
    /// transitions remain queued so startup ordering cannot lose early starts.
    pub(crate) fn take_status_receiver(
        &self,
    ) -> Option<mpsc::UnboundedReceiver<ServerStatusEvent>> {
        self.status_events_rx.lock().ok()?.take()
    }

    pub(crate) fn send_status_event(&self, event: ServerStatusEvent) {
        let _ = self.status_events_tx.send(event);
    }

    async fn mark_expected_stop(&self, server_id: &str) {
        self.expected_stops
            .lock()
            .await
            .insert(server_id.to_string());
    }

    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(std::sync::atomic::Ordering::SeqCst)
    }

    pub async fn is_server_running(&self, server_id: &str) -> bool {
        self.servers.lock().await.contains_key(server_id)
    }

    #[cfg(test)]
    pub(crate) async fn install_test_running_server_for_stop_recovery(
        &self,
        server_id: &str,
    ) -> TestServerExitSignal {
        let (command_tx, _command_rx) = mpsc::channel(1);
        let (process_control_tx, _process_control_rx) = mpsc::channel(1);
        let (exit_tx, exit_rx) = watch::channel(None);
        self.servers.lock().await.insert(
            server_id.to_string(),
            RunningServer {
                command_tx,
                process_control_tx,
                exit_rx,
                java_path: "java".to_string(),
                pid: 1,
                generation: 1,
                metrics: Arc::new(Mutex::new(MetricHistory::new(
                    server_id.to_string(),
                    1,
                    Instant::now(),
                ))),
            },
        );
        TestServerExitSignal {
            server_id: server_id.to_string(),
            exit_tx,
        }
    }

    pub async fn is_java_runtime_in_use(&self, install_dir: &Path) -> bool {
        self.servers
            .lock()
            .await
            .values()
            .any(|server| Path::new(&server.java_path).starts_with(install_dir))
    }

    /// Stop all tracked servers concurrently. Each child gets a graceful stop
    /// window, then receives a force-kill request and is reaped by its owner.
    pub async fn shutdown_all(&self) -> Result<(), String> {
        let was_shutting_down = self
            .shutting_down
            .swap(true, std::sync::atomic::Ordering::SeqCst);
        // Wait for a start that already reserved capacity to finish inserting
        // its process before taking the shutdown snapshot.
        let capacity_guard = self.start_capacity_lock.clone().lock_owned().await;
        let running = {
            let servers = self.servers.lock().await;
            servers
                .values()
                .map(|server| (server.process_control_tx.clone(), server.exit_rx.clone()))
                .collect::<Vec<_>>()
        };
        drop(capacity_guard);
        if running.is_empty() {
            return Ok(());
        }

        for (control_tx, _) in &running {
            let control = if was_shutting_down {
                ServerProcessControl::ForceKill
            } else {
                ServerProcessControl::Stop
            };
            // A prior shutdown attempt may still be waiting on a failed OS
            // reap. Never block on a full bounded queue; the next cleanup pass
            // will retry the force-kill request.
            let _ = control_tx.try_send(control);
        }

        let mut exits = spawn_server_exit_waiters(&running);
        let graceful_result = match tokio::time::timeout(
            SERVER_STOP_GRACE_PERIOD + Duration::from_secs(2),
            drain_server_exit_waiters(&mut exits),
        )
        .await
        {
            Ok(Ok(())) => return Ok(()),
            Ok(Err(error)) => Some(error),
            Err(_) => Some("Timed out waiting for graceful Minecraft server shutdown".into()),
        };

        for (control_tx, _) in &running {
            let _ = control_tx.try_send(ServerProcessControl::ForceKill);
        }
        let reap_result = tokio::time::timeout(
            PROCESS_KILL_REAP_TIMEOUT,
            drain_server_exit_waiters(&mut exits),
        )
        .await
        .map_err(|_| "Timed out while reaping Minecraft server processes".to_string())
        .and_then(|result| result);

        match (graceful_result, reap_result) {
            (None, Ok(())) => Ok(()),
            (Some(graceful_error), Ok(())) => Err(graceful_error),
            (None, Err(reap_error)) => Err(reap_error),
            (Some(graceful_error), Err(reap_error)) => {
                Err(format!("{graceful_error}; {reap_error}"))
            }
        }
    }

    #[cfg(test)]
    async fn reserve_start(
        &self,
        operations: &ServerOperationManager,
        server_id: &str,
    ) -> Result<ServerStartGuard, String> {
        let operation = operations.acquire(server_id, OperationKind::Start).await?;
        self.reserve_start_with_guard(server_id, operation).await
    }

    async fn reserve_start_with_guard(
        &self,
        server_id: &str,
        operation: OperationGuard,
    ) -> Result<ServerStartGuard, String> {
        if self.shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("Server manager is shutting down".into());
        }
        let capacity = self.start_capacity_lock.clone().lock_owned().await;

        if self.shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("Server manager is shutting down".into());
        }

        let servers = self.servers.lock().await;
        if servers.contains_key(server_id) {
            return Err("Server is already running".into());
        }
        if servers.len() >= MAX_RUNNING_SERVERS {
            return Err("Too many running servers".into());
        }
        drop(servers);

        Ok(ServerStartGuard {
            _operation: operation,
            _capacity: capacity,
        })
    }
}

#[cfg(test)]
#[derive(Clone)]
pub(crate) struct TestServerExitSignal {
    server_id: String,
    exit_tx: watch::Sender<Option<ServerProcessExit>>,
}

#[cfg(test)]
impl TestServerExitSignal {
    pub(crate) async fn wait_until_expected_stop_registered(&self, state: &ServerManager) {
        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if state.expected_stops.lock().await.contains(&self.server_id) {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        })
        .await
        .expect("stop attempt should register its expected-stop marker");
    }

    pub(crate) async fn remove_from_server_map(&self, state: &ServerManager) {
        state.servers.lock().await.remove(&self.server_id);
    }

    pub(crate) async fn finish_cleanup(self, state: &ServerManager) {
        let expected = state.expected_stops.lock().await.remove(&self.server_id);
        state.send_status_event(ServerStatusEvent {
            server_id: self.server_id,
            generation: 1,
            status: ServerStatus::Offline,
            expected,
        });
        let _ = self.exit_tx.send(Some(ServerProcessExit { success: true }));
    }
}

fn spawn_server_exit_waiters(
    running: &[(
        mpsc::Sender<ServerProcessControl>,
        watch::Receiver<Option<ServerProcessExit>>,
    )],
) -> tokio::task::JoinSet<Result<(), String>> {
    let mut waiters = tokio::task::JoinSet::new();
    for (_, mut exit_rx) in running.iter().cloned() {
        waiters.spawn(async move { wait_for_server_exit(&mut exit_rx).await.map(|_| ()) });
    }
    waiters
}

async fn drain_server_exit_waiters(
    waiters: &mut tokio::task::JoinSet<Result<(), String>>,
) -> Result<(), String> {
    while let Some(result) = waiters.join_next().await {
        result.map_err(|error| format!("Server exit monitor failed: {error}"))??;
    }
    Ok(())
}

async fn wait_for_server_exit(
    exit_rx: &mut watch::Receiver<Option<ServerProcessExit>>,
) -> Result<ServerProcessExit, String> {
    loop {
        if let Some(exit) = *exit_rx.borrow() {
            return Ok(exit);
        }
        exit_rx
            .changed()
            .await
            .map_err(|_| "Server process monitor stopped without an exit status".to_string())?;
    }
}

async fn wait_for_stop_recovery_cancellation(cancellation: &AtomicBool) {
    while !cancellation.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

/// Confirms that a failed stop has completed before callers decide whether it
/// is safe to restart. The receiver must come from the original stop attempt:
/// map removal alone happens before the Offline status is queued.
async fn confirm_server_stopped_after_stop_error(
    state: &ServerManager,
    server_id: &str,
    exit_rx: &mut watch::Receiver<Option<ServerProcessExit>>,
    cancellation: Option<&AtomicBool>,
) -> StopErrorRecoveryState {
    if cancellation.is_some_and(|token| token.load(Ordering::SeqCst)) {
        return StopErrorRecoveryState::Cancelled;
    }

    let exit_confirmed = if let Some(cancellation) = cancellation {
        tokio::select! {
            _ = wait_for_stop_recovery_cancellation(cancellation) => {
                return StopErrorRecoveryState::Cancelled;
            }
            result = tokio::time::timeout(
                STOP_ERROR_RECOVERY_WAIT,
                wait_for_server_exit(exit_rx),
            ) => matches!(result, Ok(Ok(_)))
        }
    } else {
        matches!(
            tokio::time::timeout(STOP_ERROR_RECOVERY_WAIT, wait_for_server_exit(exit_rx)).await,
            Ok(Ok(_))
        )
    };

    if cancellation.is_some_and(|token| token.load(Ordering::SeqCst)) {
        return StopErrorRecoveryState::Cancelled;
    }
    if !exit_confirmed || state.is_server_running(server_id).await {
        StopErrorRecoveryState::RunningOrUnconfirmed
    } else {
        StopErrorRecoveryState::Stopped
    }
}

async fn supervise_server_child(
    mut child: tokio::process::Child,
    mut control_rx: mpsc::Receiver<ServerProcessControl>,
    command_tx: mpsc::Sender<String>,
    stop_grace_period: Duration,
) -> std::process::ExitStatus {
    tokio::select! {
        status = child.wait() => match status {
            Ok(status) => return status,
            Err(error) => {
                log::error!(target: "process", "Failed to wait for Minecraft process; terminating and retrying reap: {error}");
                return kill_and_reap_server_child(&mut child).await;
            }
        },
        control = control_rx.recv() => match control {
            Some(ServerProcessControl::Stop) => {},
            Some(ServerProcessControl::ForceKill) => {
                return kill_and_reap_server_child(&mut child).await;
            }
            None => return kill_and_reap_server_child(&mut child).await,
        }
    }

    let _ = tokio::time::timeout(
        Duration::from_secs(1),
        command_tx.send("stop\n".to_string()),
    )
    .await;
    let grace = tokio::time::sleep(stop_grace_period);
    tokio::pin!(grace);
    loop {
        tokio::select! {
            status = child.wait() => match status {
                Ok(status) => return status,
                Err(error) => {
                    log::error!(target: "process", "Failed to wait for Minecraft process during graceful stop; retrying reap: {error}");
                    return kill_and_reap_server_child(&mut child).await;
                }
            },
            control = control_rx.recv() => match control {
                Some(ServerProcessControl::ForceKill) => {
                    return kill_and_reap_server_child(&mut child).await;
                }
                Some(ServerProcessControl::Stop) => {}
                None => return kill_and_reap_server_child(&mut child).await,
            },
            _ = &mut grace => {
                return kill_and_reap_server_child(&mut child).await;
            }
        }
    }
}

async fn kill_and_reap_server_child(child: &mut tokio::process::Child) -> std::process::ExitStatus {
    loop {
        if let Err(error) = child.start_kill() {
            log::warn!(target: "process", "Failed to force-kill Minecraft process; will retry: {error}");
        }
        match tokio::time::timeout(PROCESS_KILL_REAP_TIMEOUT, child.wait()).await {
            Ok(Ok(status)) => return status,
            Ok(Err(error)) => {
                log::error!(target: "process", "Failed to reap killed Minecraft process; will retry: {error}");
            }
            Err(_) => {
                log::error!(target: "process", "Timed out while reaping killed Minecraft process; retrying");
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// サーバーごとのコマンド送信間隔を制御する State
#[derive(Clone, Default)]
pub struct CommandLimiter {
    pub last_command_at: Arc<Mutex<HashMap<String, Instant>>>,
}

#[derive(serde::Serialize, Clone)]
struct ServerLogPayload {
    #[serde(rename = "serverId")]
    server_id: String,
    generation: u64,
    line: String,
    stream: String,
}

#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ServerStatus {
    Online,
    Offline,
    Crashed,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerStatusEvent {
    pub(crate) server_id: String,
    pub(crate) generation: u64,
    pub(crate) status: ServerStatus,
    pub(crate) expected: bool,
}

fn publish_server_status(app: &AppHandle, manager: &ServerManager, event: ServerStatusEvent) {
    manager.send_status_event(event.clone());
    // Keep this renderer-facing event as a notification only. Rust automation
    // consumes the private channel above and never trusts renderer event input.
    let _ = app.emit("server-status-change", event);
}

fn validate_jar_file_name(jar_file: &str) -> Result<String, String> {
    let normalized = jar_file.trim();
    if normalized.is_empty() {
        return Err("Jar file is empty".to_string());
    }

    let path = Path::new(normalized);
    if path.is_absolute() || normalized.contains('/') || normalized.contains('\\') {
        return Err("Jar file must be a file name under server directory".to_string());
    }

    let mut components = path.components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => {}
        _ => {
            return Err("Invalid jar file name".to_string());
        }
    }

    let is_jar = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("jar"))
        .unwrap_or(false);
    if !is_jar {
        return Err("Jar file extension must be .jar".to_string());
    }

    Ok(normalized.to_string())
}

pub(crate) fn validate_server_id(server_id: &str) -> Result<String, String> {
    let normalized = server_id.trim();
    if normalized.is_empty() {
        return Err("Server ID is empty".to_string());
    }
    if normalized.len() > MAX_SERVER_ID_LENGTH {
        return Err("Server ID is too long".to_string());
    }
    if normalized.chars().any(char::is_control) {
        return Err("Server ID contains control characters".to_string());
    }
    if matches!(normalized, "." | "..") || normalized.contains(['/', '\\', ':']) {
        return Err("Server ID must be a single safe identifier".to_string());
    }
    Ok(normalized.to_string())
}

fn audit_server_action(action: &str, server_id: &str) {
    log::info!(
        target: "security.audit",
        "[AUDIT] action={} server_id={}",
        action,
        server_id
    );
}

#[derive(Debug)]
struct ServerStartConfig {
    server_id: String,
    java_path: String,
    memory: u32,
    jar_file: String,
    jvm_extra_args: Option<String>,
    software: String,
}

fn start_config_for_profile(profile: MinecraftServer) -> Result<ServerStartConfig, String> {
    if let Some(reason) = profile
        .unavailable_reason
        .as_deref()
        .filter(|reason| !reason.trim().is_empty())
    {
        return Err(format!(
            "Server is unavailable and cannot be started: {reason}"
        ));
    }
    let server_id = validate_server_id(&profile.id)?;
    let memory = profile
        .memory
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| "Server memory setting is invalid".to_string())?;
    let java_path = profile
        .java_path
        .filter(|path| !path.trim().is_empty())
        .unwrap_or_else(|| "java".to_string());
    let jar_file = if profile.software.eq_ignore_ascii_case("forge") {
        "forge-server.jar"
    } else {
        "server.jar"
    };
    Ok(ServerStartConfig {
        server_id,
        java_path,
        memory,
        jar_file: jar_file.to_string(),
        jvm_extra_args: profile.jvm_args,
        software: profile.software,
    })
}

async fn load_start_config(
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<ServerStartConfig, String> {
    let registry = registry.clone();
    let server_id = server_id.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let profile = registry
            .get_servers()?
            .into_iter()
            .find(|profile| profile.id == server_id)
            .ok_or_else(|| "Server is not registered".to_string())?;
        start_config_for_profile(profile)
    })
    .await
    .map_err(|error| format!("Failed to load server profile: {error}"))?
}

/// サーバーを起動し、stdout/stderr をイベントストリーミングする
#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    registry: State<'_, ServerRegistry>,
    server_id: String,
) -> Result<(), String> {
    start_registered_server(
        app,
        state.inner(),
        limiter.inner(),
        operations.inner(),
        registry.inner(),
        server_id,
    )
    .await
}

pub(crate) async fn start_registered_server(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    registry: &ServerRegistry,
    server_id: String,
) -> Result<(), String> {
    let server_id = validate_server_id(&server_id)?;
    let operation = operations.acquire(&server_id, OperationKind::Start).await?;
    let config = load_start_config(registry, &server_id).await?;
    start_server_with_guard(app, state, limiter, operations, config, operation).await
}

pub(crate) async fn start_server_with_config(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    server_id: String,
    java_path: String,
    memory: u32,
    jar_file: String,
    jvm_extra_args: Option<String>,
    software: String,
) -> Result<(), String> {
    let server_id = validate_server_id(&server_id)?;
    let operation = operations.acquire(&server_id, OperationKind::Start).await?;
    start_server_with_config_and_guard(
        app,
        state,
        limiter,
        operations,
        server_id,
        java_path,
        memory,
        jar_file,
        jvm_extra_args,
        software,
        operation,
    )
    .await
}

pub(crate) async fn start_server_with_config_and_guard(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    server_id: String,
    java_path: String,
    memory: u32,
    jar_file: String,
    jvm_extra_args: Option<String>,
    software: String,
    operation: OperationGuard,
) -> Result<(), String> {
    let server_id = validate_server_id(&server_id)?;
    let config = ServerStartConfig {
        server_id,
        java_path,
        memory,
        jar_file,
        jvm_extra_args,
        software,
    };
    start_server_with_guard(app, state, limiter, operations, config, operation).await
}

pub(crate) async fn start_registered_server_with_guard(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    registry: &ServerRegistry,
    server_id: String,
    operation: OperationGuard,
) -> Result<(), String> {
    let server_id = validate_server_id(&server_id)?;
    let config = load_start_config(registry, &server_id).await?;
    start_server_with_guard(app, state, limiter, operations, config, operation).await
}

async fn start_server_with_guard(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    config: ServerStartConfig,
    operation: OperationGuard,
) -> Result<(), String> {
    let ServerStartConfig {
        server_id: validated_server_id,
        java_path,
        memory,
        jar_file,
        jvm_extra_args,
        software,
    } = config;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let server_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(validated_server_id.clone()),
        relative_path: String::new(),
    };
    let validated_server_dir = resolve_managed_request(&app_data_dir, &server_request, false)
        .map_err(|error| format!("Invalid managed server directory: {error}"))?;
    let validated_jar_file = validate_jar_file_name(&jar_file)?;
    if !(MIN_MEMORY_MB..=MAX_MEMORY_MB).contains(&memory) {
        return Err(format!(
            "Memory must be between {}MB and {}MB",
            MIN_MEMORY_MB, MAX_MEMORY_MB
        ));
    }

    let extra_args = match jvm_extra_args.as_deref() {
        Some(s) if !s.trim().is_empty() => validate_jvm_extra_args(s)?,
        _ => vec![],
    };

    let jar_path = validated_server_dir.join(&validated_jar_file);
    let jar_metadata = std::fs::symlink_metadata(&jar_path)
        .map_err(|_| format!("Jar file not found: {validated_jar_file}"))?;
    if is_link_or_reparse_point(&jar_metadata) || !jar_metadata.is_file() {
        return Err(format!("Jar file not found: {}", validated_jar_file));
    }

    ensure_server_eula_accepted(&app_data_dir, &validated_server_id)?;

    // Java installation mutations use this same application-wide operation
    // key. Hold it through executable validation, spawn, and process-map
    // insertion so a runtime cannot be replaced between validation and start.
    let java_runtime_guard = operations
        .acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall)
        .await?;
    let validated_java_path = resolve_java_executable_path(&java_path, &app_data_dir.join("java"))?
        .to_string_lossy()
        .to_string();

    // The server lock was acquired before the global Java lock. Keep it until
    // the process is registered, together with the capacity reservation.
    let _start_guard = state
        .reserve_start_with_guard(&validated_server_id, operation)
        .await?;

    let mut jvm_args: Vec<String> = vec![format!("-Xmx{}M", memory), format!("-Xms{}M", memory)];
    jvm_args.extend(extra_args);
    jvm_args.extend([
        "-jar".to_string(),
        validated_jar_file.clone(),
        "nogui".to_string(),
    ]);

    // Re-check immediately before spawning to narrow the in-process race
    // between EULA acceptance and process creation.
    ensure_server_eula_accepted(&app_data_dir, &validated_server_id)?;

    let mut child = Command::new(&validated_java_path)
        .args(&jvm_args)
        .current_dir(&validated_server_dir)
        .kill_on_drop(true)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    let pid = child.id().unwrap_or(0);
    let started_at = Instant::now();
    let generation = state
        .next_generation
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        .saturating_add(1);
    let metrics = Arc::new(Mutex::new(MetricHistory::new(
        validated_server_id.clone(),
        generation,
        started_at,
    )));
    let poll_tps = should_poll_tps(&software);

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    // stdin への書き込みをサーバーごとのキュー経由にし、バースト時の失敗を抑える
    let (command_tx, mut command_rx) = mpsc::channel::<String>(COMMAND_QUEUE_CAPACITY);
    let command_tx_for_tps = command_tx.clone();
    let command_tx_for_process = command_tx.clone();
    let (process_control_tx, process_control_rx) = mpsc::channel(4);
    let (exit_tx, exit_rx) = watch::channel(None);
    tokio::spawn(async move {
        let mut stdin = stdin;
        let mut last_sent_at: Option<Instant> = None;

        while let Some(command_line) = command_rx.recv().await {
            if let Some(last_sent) = last_sent_at {
                let elapsed = last_sent.elapsed();
                if elapsed < COMMAND_MIN_INTERVAL {
                    tokio::time::sleep(COMMAND_MIN_INTERVAL - elapsed).await;
                }
            }

            if stdin.write_all(command_line.as_bytes()).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
            last_sent_at = Some(Instant::now());
        }
    });

    // サーバーを管理マップに登録
    {
        let mut servers = state.servers.lock().await;
        servers.insert(
            validated_server_id.clone(),
            RunningServer {
                command_tx,
                process_control_tx,
                exit_rx,
                java_path: validated_java_path.clone(),
                pid,
                generation,
                metrics: metrics.clone(),
            },
        );
    }
    drop(java_runtime_guard);
    // ステータス通知: online
    publish_server_status(
        &app,
        state,
        ServerStatusEvent {
            server_id: validated_server_id.clone(),
            generation,
            status: ServerStatus::Online,
            expected: false,
        },
    );
    audit_server_action("start_server", &validated_server_id);

    // stdout ストリーミング (Rust 側でバッファ上限・送信レートを制御)
    let (stdout_log_tx, mut stdout_log_rx) = mpsc::channel::<String>(LOG_BUFFER_CAPACITY);
    let app_stdout_emit = app.clone();
    let sid_stdout_emit = validated_server_id.clone();
    let generation_stdout_emit = generation;
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(LOG_EMIT_INTERVAL);
        loop {
            ticker.tick().await;
            let mut emitted = 0usize;
            while emitted < LOG_EMIT_LINES_PER_TICK {
                match stdout_log_rx.try_recv() {
                    Ok(line) => {
                        let _ = app_stdout_emit.emit(
                            "server-log",
                            ServerLogPayload {
                                server_id: sid_stdout_emit.clone(),
                                generation: generation_stdout_emit,
                                line,
                                stream: "stdout".to_string(),
                            },
                        );
                        emitted += 1;
                    }
                    Err(tokio::sync::mpsc::error::TryRecvError::Empty) => break,
                    Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => return,
                }
            }
        }
    });
    let stdout_metrics = metrics.clone();
    let stdout_servers = state.servers.clone();
    let stdout_app = app.clone();
    let stdout_server_id = validated_server_id.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut dropped_lines = 0usize;
        while let Ok(Some(line)) = lines.next_line().await {
            let is_current_generation = {
                let servers = stdout_servers.lock().await;
                servers
                    .get(&stdout_server_id)
                    .is_some_and(|server| server.generation == generation)
            };
            let routed_line = if is_current_generation {
                let mut history = stdout_metrics.lock().await;
                route_stdout_line(Some(&mut *history), line)
            } else {
                route_stdout_line(None, line)
            };
            if let Some(snapshot) = routed_line.metric_snapshot {
                let _ = stdout_app.emit("server-metrics-updated", snapshot);
            }
            let Some(line) = routed_line.console_line else {
                continue;
            };

            if dropped_lines > 0 {
                let notice = format!(
                    "[mc-vector] {} log lines skipped due to high throughput",
                    dropped_lines
                );
                match stdout_log_tx.try_send(notice) {
                    Ok(_) => dropped_lines = 0,
                    Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {}
                    Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => return,
                }
            }

            match stdout_log_tx.try_send(line) {
                Ok(_) => {}
                Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                    dropped_lines += 1;
                }
                Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => return,
            }
        }

        if dropped_lines > 0 {
            let _ = stdout_log_tx.try_send(format!(
                "[mc-vector] {} log lines skipped due to high throughput",
                dropped_lines
            ));
        }
    });

    // stderr ストリーミング (エラーのみを別イベント名で)
    let _app_stderr = app.clone();
    let _sid_stderr = validated_server_id.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // stderr の内容は無視（Minecraft は stdout と stderr に同じログを出力するため、重複防止）
            let _ = line;
        }
    });

    // Paper/LeafMC は起動直後と5秒ごとにTPSコマンドを送る。
    if poll_tps {
        let servers_tps_ref = state.servers.clone();
        let sid_tps = validated_server_id.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(TPS_POLL_INTERVAL);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                ticker.tick().await;
                let is_current_generation = {
                    let servers = servers_tps_ref.lock().await;
                    servers
                        .get(&sid_tps)
                        .is_some_and(|server| server.generation == generation)
                };
                if !is_current_generation {
                    break;
                }
                if command_tx_for_tps.send("tps\n".to_string()).await.is_err() {
                    break;
                }
            }
        });
    }

    // プロセス統計を定期的に保持し、互換イベントと履歴スナップショットを送る。
    let app_stats = app.clone();
    let sid_stats = validated_server_id.clone();
    let servers_stats_ref = state.servers.clone();
    let stats_metrics = metrics.clone();
    tokio::spawn(async move {
        let mut sys = sysinfo::System::new_all();
        let spid = sysinfo::Pid::from_u32(pid);
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            // 起動世代も照合し、古いプロセスの遅延計測を新世代へ混ぜない。
            let is_current_generation = {
                let servers = servers_stats_ref.lock().await;
                servers
                    .get(&sid_stats)
                    .is_some_and(|server| server.generation == generation)
            };
            if !is_current_generation {
                break;
            }
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);
            if let Some(process) = sys.process(spid) {
                let raw_cpu = process.cpu_usage();
                let memory = process.memory();
                let cpu_usage = if raw_cpu.is_finite() {
                    raw_cpu.max(0.0)
                } else {
                    0.0
                };

                let snapshot = {
                    let mut history = stats_metrics.lock().await;
                    history.record_resource(cpu_usage, memory)
                };
                let _ = app_stats.emit(
                    "server-stats",
                    serde_json::json!({
                        "serverId": sid_stats,
                        "cpu": cpu_usage,
                        "memory": memory,
                        "generation": generation,
                        "sequence": snapshot.sequence,
                        "elapsedMs": snapshot.elapsed_ms,
                    }),
                );
                let _ = app_stats.emit("server-metrics-updated", snapshot);
            } else {
                break;
            }
        }
    });

    // プロセス終了監視
    let app_exit = app.clone();
    let sid_exit = validated_server_id;
    let servers_ref = state.servers.clone();
    let expected_stops_ref = state.expected_stops.clone();
    let status_manager = state.clone();
    let limiter_ref = limiter.last_command_at.clone();
    let generation_exit = generation;
    let pid_exit = pid;
    tokio::spawn(async move {
        let status = supervise_server_child(
            child,
            process_control_rx,
            command_tx_for_process,
            SERVER_STOP_GRACE_PERIOD,
        )
        .await;
        let process_exit = ServerProcessExit {
            success: status.success(),
        };
        // 管理マップから削除
        let should_remove = {
            let mut servers = servers_ref.lock().await;
            let should_remove = servers
                .get(&sid_exit)
                .map(|server| server.pid == pid_exit && server.generation == generation_exit)
                .unwrap_or(false);
            if should_remove {
                servers.remove(&sid_exit);
            }
            should_remove
        };
        if should_remove {
            let mut last_map = limiter_ref.lock().await;
            last_map.remove(&sid_exit);
        }
        let expected = if should_remove {
            expected_stops_ref.lock().await.remove(&sid_exit)
        } else {
            false
        };
        if should_remove {
            publish_server_status(
                &app_exit,
                &status_manager,
                ServerStatusEvent {
                    server_id: sid_exit,
                    generation: generation_exit,
                    status: if process_exit.success {
                        ServerStatus::Offline
                    } else {
                        ServerStatus::Crashed
                    },
                    expected,
                },
            );
        }
        // A restart waits for this signal before publishing the next online
        // generation, so the old exit event must be emitted first.
        let _ = exit_tx.send(Some(process_exit));
    });

    // The child is fully registered with its control and exit monitors. Future
    // starts can now reserve capacity, and app shutdown can safely snapshot it.
    drop(_start_guard);
    Ok(())
}

/// stdin に "stop\n" を送り、猶予後も残るプロセスは終了して回収する
#[tauri::command]
pub async fn stop_server(
    state: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<(), String> {
    stop_server_with_id(state.inner(), operations.inner(), server_id).await
}

pub(crate) async fn stop_server_with_id(
    state: &ServerManager,
    operations: &ServerOperationManager,
    server_id: String,
) -> Result<(), String> {
    let validated_server_id = validate_server_id(&server_id)?;
    let _operation_guard = operations
        .acquire(&validated_server_id, OperationKind::Stop)
        .await?;
    stop_server_with_guard(state, &validated_server_id).await
}

pub(crate) async fn stop_server_with_guard(
    state: &ServerManager,
    validated_server_id: &str,
) -> Result<(), String> {
    stop_server_with_guard_recovery(state, validated_server_id, None)
        .await
        .map_err(|error| error.message)
}

pub(crate) async fn stop_server_with_guard_recovery(
    state: &ServerManager,
    validated_server_id: &str,
    cancellation: Option<&AtomicBool>,
) -> Result<(), StopServerError> {
    let (process_control_tx, mut exit_rx) = {
        let servers = state.servers.lock().await;
        let Some(server) = servers.get(validated_server_id) else {
            return Err(StopServerError {
                message: "Server not found or not running".to_string(),
                recovery_state: StopErrorRecoveryState::RunningOrUnconfirmed,
            });
        };
        // Hold the server map lock while registering the expected stop so the
        // exit monitor cannot remove the entry before it sees this marker.
        state.mark_expected_stop(validated_server_id).await;
        (server.process_control_tx.clone(), server.exit_rx.clone())
    };

    if process_control_tx
        .send(ServerProcessControl::Stop)
        .await
        .is_err()
    {
        let recovery_state = confirm_server_stopped_after_stop_error(
            state,
            validated_server_id,
            &mut exit_rx,
            cancellation,
        )
        .await;
        return Err(StopServerError {
            message: "Server not found or not running".to_string(),
            recovery_state,
        });
    }

    let stop_result = tokio::time::timeout(
        SERVER_STOP_GRACE_PERIOD + PROCESS_KILL_REAP_TIMEOUT + Duration::from_secs(2),
        wait_for_server_exit(&mut exit_rx),
    )
    .await;
    match stop_result {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            let recovery_state = confirm_server_stopped_after_stop_error(
                state,
                validated_server_id,
                &mut exit_rx,
                cancellation,
            )
            .await;
            return Err(StopServerError {
                message: error,
                recovery_state,
            });
        }
        Err(_) => {
            let recovery_state = confirm_server_stopped_after_stop_error(
                state,
                validated_server_id,
                &mut exit_rx,
                cancellation,
            )
            .await;
            return Err(StopServerError {
                message: "Timed out while stopping Minecraft server".to_string(),
                recovery_state,
            });
        }
    }

    audit_server_action("stop_server", validated_server_id);
    Ok(())
}

/// Stop and start under one server operation lock, using the saved profile.
#[tauri::command]
pub async fn restart_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    registry: State<'_, ServerRegistry>,
    server_id: String,
) -> Result<(), String> {
    let server_id = validate_server_id(&server_id)?;
    let operation = operations
        .acquire(&server_id, OperationKind::Restart)
        .await?;
    let config = load_start_config(registry.inner(), &server_id).await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    ensure_server_eula_accepted(&app_data_dir, &server_id)?;
    stop_server_with_guard(state.inner(), &server_id).await?;
    start_server_with_guard(
        app,
        state.inner(),
        limiter.inner(),
        operations.inner(),
        config,
        operation,
    )
    .await
}

/// 任意のコマンドを stdin に送信
#[tauri::command]
pub async fn send_command(
    state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    server_id: String,
    command: String,
) -> Result<(), String> {
    let validated_server_id = validate_server_id(&server_id)?;
    let normalized_command = command.trim();
    if normalized_command.is_empty() {
        return Err("Command is empty".into());
    }
    if normalized_command.len() > 1024 {
        return Err("Command is too long".into());
    }
    if normalized_command.contains('\n')
        || normalized_command.contains('\r')
        || normalized_command.contains('\0')
    {
        return Err("Command contains invalid control characters".into());
    }

    {
        let last_map = limiter.last_command_at.lock().await;
        if let Some(last_sent) = last_map.get(&validated_server_id) {
            if last_sent.elapsed() < COMMAND_MIN_INTERVAL {
                return Err("Commands are being sent too quickly".into());
            }
        }
    }

    let command_tx = {
        let servers = state.servers.lock().await;
        let Some(server) = servers.get(&validated_server_id) else {
            let mut last_map = limiter.last_command_at.lock().await;
            last_map.remove(&validated_server_id);
            return Err("Server not found or not running".to_string());
        };
        server.command_tx.clone()
    };

    if command_tx
        .send(format!("{}\n", normalized_command))
        .await
        .is_err()
    {
        let mut last_map = limiter.last_command_at.lock().await;
        last_map.remove(&validated_server_id);
        return Err("Server not found or not running".to_string());
    }

    let mut last_map = limiter.last_command_at.lock().await;
    last_map.insert(validated_server_id.clone(), Instant::now());
    audit_server_action("send_command", &validated_server_id);
    Ok(())
}

/// サーバーが実行中かどうかを返す
#[tauri::command]
pub async fn is_server_running(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<bool, String> {
    let validated_server_id = validate_server_id(&server_id)?;
    let servers = state.servers.lock().await;
    Ok(servers.contains_key(&validated_server_id))
}

/// サーバーの PID を返す
#[tauri::command]
pub async fn get_server_pid(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<u32, String> {
    let validated_server_id = validate_server_id(&server_id)?;
    let servers = state.servers.lock().await;
    servers
        .get(&validated_server_id)
        .map(|s| s.pid)
        .ok_or_else(|| "Server not found or not running".into())
}

/// Return the current in-memory metric window for a running server.
#[tauri::command]
pub async fn get_server_metric_history(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<Option<MetricHistorySnapshot>, String> {
    let validated_server_id = validate_server_id(&server_id)?;
    let servers = state.servers.lock().await;
    let Some(server) = servers.get(&validated_server_id) else {
        return Ok(None);
    };
    let snapshot = server.metrics.lock().await.snapshot();
    if snapshot.generation == server.generation {
        Ok(Some(snapshot))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        load_start_config, resolve_java_executable_path, start_config_for_profile,
        stop_server_with_guard, supervise_server_child, Path, RunningServer, ServerManager,
        ServerProcessControl, ServerProcessExit, ServerStatus, ServerStatusEvent,
        MAX_RUNNING_SERVERS,
    };
    use crate::commands::server_registry::{MinecraftServer, ServerRegistry};
    use crate::metric_history::MetricHistory;
    use crate::state::operation_manager::{OperationKind, ServerOperationManager};
    use crate::test_support::test_temp_dir;
    use std::sync::Arc;
    use std::time::Instant;
    use tokio::process::Command;
    use tokio::sync::{mpsc, oneshot, watch, Mutex};
    use tokio::time::{timeout, Duration};

    fn registered_profile() -> MinecraftServer {
        serde_json::from_value(serde_json::json!({
            "id": "server-1",
            "name": "Test server",
            "version": "1.21.10",
            "software": "Forge",
            "port": 25565,
            "memory": 4096,
            "path": "/ignored/profile/path",
            "javaPath": "/managed/java/bin/java",
            "jvmArgs": "-XX:+UseG1GC"
        }))
        .expect("test profile should deserialize")
    }

    #[test]
    fn start_configuration_comes_from_the_registered_profile() {
        let config = start_config_for_profile(registered_profile()).unwrap();
        assert_eq!(config.server_id, "server-1");
        assert_eq!(config.java_path, "/managed/java/bin/java");
        assert_eq!(config.memory, 4096);
        assert_eq!(config.jar_file, "forge-server.jar");
        assert_eq!(config.jvm_extra_args.as_deref(), Some("-XX:+UseG1GC"));
        assert_eq!(config.software, "Forge");
    }

    #[test]
    fn start_configuration_rejects_a_profile_with_an_unavailable_reason() {
        let mut profile = registered_profile();
        profile.unavailable_reason =
            Some("Plugin transaction recovery needs attention: damaged journal".into());

        let error =
            start_config_for_profile(profile).expect_err("unavailable profile must not start");

        assert!(error.contains("Server is unavailable and cannot be started"));
        assert!(error.contains("damaged journal"));
    }

    #[test]
    fn java_home_resolves_to_the_platform_executable() {
        let root = test_temp_dir("mc-vector-java-home-tests").join(format!(
            "{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let managed_root = root.join("java");
        let java_home = managed_root.join("jdk-21");
        let executable_name = if cfg!(windows) { "java.exe" } else { "java" };
        let executable = java_home.join("bin").join(executable_name);
        std::fs::create_dir_all(executable.parent().unwrap()).expect("Java home should be created");
        std::fs::write(&executable, "test executable")
            .expect("executable fixture should be written");

        let resolved = resolve_java_executable_path(&java_home.to_string_lossy(), &managed_root)
            .expect("Java home should resolve to its platform executable");
        assert_eq!(resolved, std::fs::canonicalize(executable).unwrap());

        std::fs::remove_dir_all(root).expect("Java path fixture should be removed");
    }

    #[test]
    fn java_executable_paths_remain_validated_and_path_fallback_is_preserved() {
        let root = test_temp_dir("mc-vector-java-executable-tests").join(format!(
            "{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let managed_root = root.join("java");
        let java_home = managed_root.join("jdk-21");
        let executable_name = if cfg!(windows) { "java.exe" } else { "java" };
        let executable = java_home.join("bin").join(executable_name);
        std::fs::create_dir_all(executable.parent().unwrap()).expect("Java home should be created");
        std::fs::write(&executable, "test executable")
            .expect("executable fixture should be written");

        let resolved_explicit =
            resolve_java_executable_path(&executable.to_string_lossy(), &managed_root)
                .expect("explicit managed executable path should remain valid");
        assert_eq!(
            resolved_explicit,
            std::fs::canonicalize(&executable).unwrap()
        );
        assert_eq!(
            resolve_java_executable_path("java", &managed_root).unwrap(),
            Path::new("java")
        );

        std::fs::remove_dir_all(root).expect("Java path fixture should be removed");
    }

    #[tokio::test]
    async fn start_configuration_rejects_unregistered_server_id() {
        let directory =
            test_temp_dir("mc-vector-start-profile-tests").join(uuid::Uuid::new_v4().to_string());
        let registry = ServerRegistry::open(&directory).expect("registry should open");
        registry
            .add_server(&registered_profile())
            .expect("profile should save");

        let error = load_start_config(&registry, "unregistered")
            .await
            .expect_err("unregistered IDs cannot start a server");
        assert!(error.contains("not registered"));
        drop(registry);
        std::fs::remove_dir_all(directory).expect("temporary registry should be removed");
    }

    #[tokio::test]
    async fn internal_status_channel_preserves_events_emitted_before_subscription() {
        let manager = ServerManager::default();
        let online = ServerStatusEvent {
            server_id: "server-1".to_string(),
            generation: 1,
            status: ServerStatus::Online,
            expected: false,
        };
        let crashed = ServerStatusEvent {
            server_id: "server-1".to_string(),
            generation: 1,
            status: ServerStatus::Crashed,
            expected: false,
        };

        manager.send_status_event(online.clone());
        manager.send_status_event(crashed.clone());
        let mut receiver = manager
            .take_status_receiver()
            .expect("the automation service should take the receiver once");

        assert_eq!(receiver.recv().await, Some(online));
        assert_eq!(receiver.recv().await, Some(crashed));
        assert!(manager.take_status_receiver().is_none());
    }

    #[test]
    fn status_event_keeps_the_renderer_payload_contract() {
        let value = serde_json::to_value(ServerStatusEvent {
            server_id: "server-1".to_string(),
            generation: 7,
            status: ServerStatus::Crashed,
            expected: true,
        })
        .expect("status event should serialize");

        assert_eq!(
            value,
            serde_json::json!({
                "serverId": "server-1",
                "generation": 7,
                "status": "crashed",
                "expected": true,
            })
        );
    }

    fn running_server(server_id: &str) -> RunningServer {
        let (command_tx, _command_rx) = mpsc::channel(1);
        let (process_control_tx, _process_control_rx) = mpsc::channel(1);
        let (_exit_tx, exit_rx) = watch::channel(None);
        RunningServer {
            command_tx,
            process_control_tx,
            exit_rx,
            java_path: "/app/java/jdk-21/bin/java".to_string(),
            pid: 1,
            generation: 1,
            metrics: Arc::new(Mutex::new(MetricHistory::new(
                server_id.to_owned(),
                1,
                Instant::now(),
            ))),
        }
    }

    #[tokio::test]
    async fn concurrent_different_server_starts_cannot_exceed_the_limit() {
        let manager = Arc::new(ServerManager::default());
        let operations = ServerOperationManager::default();
        {
            let mut servers = manager.servers.lock().await;
            for index in 0..MAX_RUNNING_SERVERS - 1 {
                let server_id = format!("existing-{index}");
                servers.insert(server_id.clone(), running_server(&server_id));
            }
        }

        let (first_reserved_tx, first_reserved_rx) = oneshot::channel();
        let (first_release_tx, first_release_rx) = oneshot::channel();
        let first_manager = manager.clone();
        let first_operations = operations.clone();
        let first = tokio::spawn(async move {
            let guard = first_manager
                .reserve_start(&first_operations, "candidate-a")
                .await
                .expect("the first start should reserve the final slot");
            first_reserved_tx.send(()).unwrap();
            first_release_rx.await.unwrap();
            first_manager
                .servers
                .lock()
                .await
                .insert("candidate-a".into(), running_server("candidate-a"));
            drop(guard);
        });
        first_reserved_rx.await.unwrap();

        let (second_attempted_tx, second_attempted_rx) = oneshot::channel();
        let second_manager = manager.clone();
        let second_operations = operations.clone();
        let second = tokio::spawn(async move {
            second_attempted_tx.send(()).unwrap();
            second_manager
                .reserve_start(&second_operations, "candidate-b")
                .await
                .map(|_| ())
        });
        second_attempted_rx.await.unwrap();

        tokio::task::yield_now().await;
        assert!(
            !second.is_finished(),
            "the second server start must wait for the active capacity reservation"
        );
        first_release_tx.send(()).unwrap();
        first.await.unwrap();

        let result = timeout(Duration::from_secs(1), second)
            .await
            .expect("the second start should resume after the first inserts")
            .expect("the second start task should not panic");
        assert_eq!(result.unwrap_err(), "Too many running servers");
        assert_eq!(manager.servers.lock().await.len(), MAX_RUNNING_SERVERS);
    }

    #[tokio::test]
    async fn same_server_start_waits_then_rejects_the_registered_process() {
        let manager = Arc::new(ServerManager::default());
        let operations = ServerOperationManager::default();
        let first_guard = manager
            .reserve_start(&operations, "same-server")
            .await
            .expect("the first start should reserve the server");

        let (attempted_tx, attempted_rx) = oneshot::channel();
        let contender_manager = manager.clone();
        let contender_operations = operations.clone();
        let contender = tokio::spawn(async move {
            attempted_tx.send(()).unwrap();
            contender_manager
                .reserve_start(&contender_operations, "same-server")
                .await
                .map(|_| ())
        });
        attempted_rx.await.unwrap();
        tokio::task::yield_now().await;
        assert!(
            !contender.is_finished(),
            "the second start for the same server must wait for its per-server lock"
        );

        manager
            .servers
            .lock()
            .await
            .insert("same-server".into(), running_server("same-server"));
        drop(first_guard);

        let result = timeout(Duration::from_secs(1), contender)
            .await
            .expect("the contender should resume after the first start")
            .expect("the contender should not panic");
        assert_eq!(result.unwrap_err(), "Server is already running");
        assert_eq!(manager.servers.lock().await.len(), 1);
    }

    #[tokio::test]
    async fn restart_keeps_server_operation_lock_after_stop_until_start_phase() {
        let manager = ServerManager::default();
        let operations = ServerOperationManager::default();
        let (control_tx, mut control_rx) = mpsc::channel(2);
        let (exit_tx, exit_rx) = watch::channel(None);
        let mut running = running_server("server-1");
        running.process_control_tx = control_tx;
        running.exit_rx = exit_rx;
        manager
            .servers
            .lock()
            .await
            .insert("server-1".into(), running);

        let restart_guard = operations
            .acquire("server-1", OperationKind::Restart)
            .await
            .expect("restart should own the server operation");
        let stop_manager = manager.clone();
        let stop =
            tokio::spawn(async move { stop_server_with_guard(&stop_manager, "server-1").await });
        assert!(matches!(
            control_rx.recv().await,
            Some(ServerProcessControl::Stop)
        ));

        let contender_operations = operations.clone();
        let mut contender = tokio::spawn(async move {
            contender_operations
                .acquire("server-1", OperationKind::Start)
                .await
        });
        assert!(timeout(Duration::from_millis(20), &mut contender)
            .await
            .is_err());

        manager.servers.lock().await.remove("server-1");
        exit_tx
            .send(Some(ServerProcessExit { success: true }))
            .unwrap();
        stop.await.unwrap().unwrap();
        assert!(
            timeout(Duration::from_millis(20), &mut contender)
                .await
                .is_err(),
            "a competing start must remain blocked between stop and the restart's start"
        );

        drop(restart_guard);
        timeout(Duration::from_secs(1), contender)
            .await
            .expect("waiting start should resume after restart releases its lock")
            .expect("contender task should not panic")
            .expect("contender should acquire its operation");
    }

    #[tokio::test]
    async fn running_servers_report_only_the_managed_java_install_they_use() {
        let manager = ServerManager::default();
        manager
            .servers
            .lock()
            .await
            .insert("server-1".into(), running_server("server-1"));

        assert!(
            manager
                .is_java_runtime_in_use(Path::new("/app/java/jdk-21"))
                .await
        );
        assert!(
            !manager
                .is_java_runtime_in_use(Path::new("/app/java/jdk-17"))
                .await
        );
    }

    #[tokio::test]
    async fn graceful_stop_force_kills_and_reaps_a_child_that_ignores_stop() {
        #[cfg(unix)]
        let child = Command::new("sh")
            .args(["-c", "exec sleep 60"])
            .stdin(std::process::Stdio::null())
            .spawn()
            .expect("long-running test child should start");
        #[cfg(windows)]
        let child = Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", "Start-Sleep -Seconds 60"])
            .stdin(std::process::Stdio::null())
            .spawn()
            .expect("long-running test child should start");

        let (control_tx, control_rx) = mpsc::channel(2);
        let (command_tx, _command_rx) = mpsc::channel(2);
        let supervisor = tokio::spawn(supervise_server_child(
            child,
            control_rx,
            command_tx,
            Duration::from_millis(50),
        ));
        control_tx
            .send(ServerProcessControl::Stop)
            .await
            .expect("the supervisor should accept graceful stop");

        let status = timeout(Duration::from_secs(3), supervisor)
            .await
            .expect("force kill and reap should finish within the test bound")
            .expect("the supervisor task should not panic");
        assert!(
            !status.success(),
            "a force-killed child should not exit cleanly"
        );
    }

    #[tokio::test]
    async fn shutdown_force_kills_remaining_servers_after_an_exit_monitor_error() {
        let manager = ServerManager::default();
        let (failed_control_tx, mut failed_control_rx) = mpsc::channel(4);
        let (failed_exit_tx, failed_exit_rx) = watch::channel(None);
        drop(failed_exit_tx);
        let (failed_force_kill_tx, failed_force_kill_rx) = oneshot::channel();
        tokio::spawn(async move {
            while let Some(control) = failed_control_rx.recv().await {
                if matches!(control, ServerProcessControl::ForceKill) {
                    let _ = failed_force_kill_tx.send(());
                    break;
                }
            }
        });

        let (healthy_control_tx, mut healthy_control_rx) = mpsc::channel(4);
        let (healthy_exit_tx, healthy_exit_rx) = watch::channel(None);
        let (healthy_force_kill_tx, healthy_force_kill_rx) = oneshot::channel();
        tokio::spawn(async move {
            while let Some(control) = healthy_control_rx.recv().await {
                if matches!(control, ServerProcessControl::ForceKill) {
                    let _ = healthy_force_kill_tx.send(());
                    let _ = healthy_exit_tx.send(Some(ServerProcessExit { success: false }));
                    break;
                }
            }
        });

        {
            let mut servers = manager.servers.lock().await;
            let mut failed = running_server("failed-monitor");
            failed.process_control_tx = failed_control_tx;
            failed.exit_rx = failed_exit_rx;
            servers.insert("failed-monitor".into(), failed);

            let mut healthy = running_server("healthy-monitor");
            healthy.process_control_tx = healthy_control_tx;
            healthy.exit_rx = healthy_exit_rx;
            servers.insert("healthy-monitor".into(), healthy);
        }

        let result = timeout(Duration::from_secs(1), manager.shutdown_all())
            .await
            .expect("monitor failure must not block shutdown");
        assert!(
            result.is_err(),
            "the broken exit monitor should be reported"
        );
        timeout(Duration::from_secs(1), failed_force_kill_rx)
            .await
            .expect("remaining server should receive force kill")
            .expect("force-kill notification should be delivered");
        timeout(Duration::from_secs(1), healthy_force_kill_rx)
            .await
            .expect("other tracked servers should also receive force kill")
            .expect("force-kill notification should be delivered");
    }
}
