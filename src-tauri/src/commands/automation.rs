use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

use chrono::{Datelike, Local, LocalResult, NaiveTime, TimeZone, Timelike};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Mutex, Notify};

use super::backup::{
    acquire_backup_operation, apply_managed_backup_retention_cancellable_unlocked_inner,
    create_managed_backup_unlocked_inner, ManagedBackupArchive, AUTOMATIC_BACKUP_CANCELLED_ERROR,
};
use super::eula::ensure_server_eula_accepted;
use super::server::{
    start_server_with_config, start_server_with_config_and_guard, stop_server_with_guard_recovery,
    CommandLimiter, ServerManager, ServerStatus, ServerStatusEvent, StopErrorRecoveryState,
    StopServerError,
};
use super::server_registry::{MinecraftServer, ServerRegistry};
use crate::state::operation_manager::{OperationGuard, OperationKind, ServerOperationManager};

const AUTOMATION_TICK: Duration = Duration::from_secs(1);
const BACKUP_RETRY_DELAY: Duration = Duration::from_secs(60);
const MAX_RESTART_ATTEMPTS: u32 = 20;
const MAX_RESTART_DELAY_SECS: u64 = 300;
const MAX_BACKUP_INTERVAL_MINUTES: u64 = 1440;
const EULA_RESTART_CONFIRMATION_TTL: Duration = Duration::from_secs(300);
const STABLE_RUNNING_THRESHOLD: Duration = Duration::from_secs(60);

#[derive(Clone, Default)]
pub struct AutomationManager {
    state: Arc<Mutex<AutomationState>>,
    active_work: Arc<Mutex<()>>,
    shutdown_requested: Arc<AtomicBool>,
    backup_tasks_changed: Arc<Notify>,
}

impl AutomationManager {
    /// Prevents new automation work and waits for the current tick or status
    /// transition to finish before process shutdown begins.
    pub async fn shutdown(&self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
        {
            let state = self.state.lock().await;
            for cancellation in state.active_backups.values() {
                cancellation.store(true, Ordering::SeqCst);
            }
        }
        drop(self.active_work.lock().await);

        loop {
            let notified = self.backup_tasks_changed.notified();
            if self.state.lock().await.active_backups.is_empty() {
                break;
            }
            notified.await;
        }
    }

    fn is_shutting_down(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }
}

#[derive(Default)]
struct AutomationState {
    restart_attempts: HashMap<String, u32>,
    restart_due: HashMap<String, RestartDue>,
    restart_inflight: HashSet<String>,
    online_since: HashMap<String, OnlineRuntime>,
    eula_restart_pending: HashMap<String, PendingEulaRestart>,
    backup_schedules: HashMap<String, BackupSchedule>,
    active_backups: HashMap<String, Arc<AtomicBool>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct OnlineRuntime {
    generation: u64,
    started_at: Instant,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct RestartDue {
    due_at_ms: i64,
    attempt: u32,
    max_attempts: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RestartReason {
    Crash,
    Backup,
}

#[derive(Clone, Copy, Debug)]
struct PendingEulaRestart {
    reason: RestartReason,
    expires_at_ms: i64,
}

#[derive(Clone, Debug)]
struct BackupSchedule {
    signature: String,
    next_run_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum BackupScheduleType {
    Interval,
    Daily,
    Weekly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RestartScheduleResult {
    Scheduled(RestartDue),
    LimitReached,
    AlreadyScheduled,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AutomationEvent {
    kind: &'static str,
    server_id: String,
    server_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attempt: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    count: Option<u32>,
    #[serde(rename = "catalogError", skip_serializing_if = "Option::is_none")]
    catalog_error: Option<String>,
}

impl AutomationEvent {
    fn new(kind: &'static str, server: &MinecraftServer) -> Self {
        Self {
            kind,
            server_id: server.id.clone(),
            server_name: server.name.clone(),
            seconds: None,
            attempt: None,
            max: None,
            count: None,
            catalog_error: None,
        }
    }
}

fn emit_event(app: &AppHandle, event: AutomationEvent) {
    let _ = app.emit("server-automation-event", event);
}

/// Starts a registry-driven service. Schedule state is intentionally in memory:
/// backup/restart settings survive restarts in SQLite, while any pending delay is
/// recalculated at startup instead of replaying stale work after a crash.
pub fn start_service(
    app: AppHandle,
    manager: AutomationManager,
    registry: ServerRegistry,
    servers: ServerManager,
    limiter: CommandLimiter,
    operations: ServerOperationManager,
) {
    // ServerManager owns this Rust-only channel. Taking its receiver before the
    // scheduler task starts also preserves transitions emitted during setup.
    let Some(mut status_rx) = servers.take_status_receiver() else {
        log::error!(target: "automation", "Automation service status receiver was already taken");
        return;
    };

    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(AUTOMATION_TICK);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    if manager.is_shutting_down() || servers.is_shutting_down() {
                        break;
                    }
                    let _active_work = manager.active_work.lock().await;
                    if manager.is_shutting_down() || servers.is_shutting_down() {
                        break;
                    }
                    if let Err(error) = run_scheduler_tick(
                        &app,
                        &manager,
                        &registry,
                        &servers,
                        &limiter,
                        &operations,
                    ).await {
                        log::error!(target: "automation", "Automation scheduler tick failed: {error}");
                    }
                }
                status = status_rx.recv() => {
                    let Some(status) = status else { break; };
                    if manager.is_shutting_down() || servers.is_shutting_down() {
                        break;
                    }
                    let _active_work = manager.active_work.lock().await;
                    if manager.is_shutting_down() || servers.is_shutting_down() {
                        break;
                    }
                    handle_server_status(
                        &app,
                        &manager,
                        &registry,
                        &status,
                    ).await;
                }
            }
        }
    });
}

async fn read_profiles(registry: &ServerRegistry) -> Result<Vec<MinecraftServer>, String> {
    let registry = registry.clone();
    tauri::async_runtime::spawn_blocking(move || registry.get_servers())
        .await
        .map_err(|error| format!("Server registry task failed: {error}"))?
}

async fn run_scheduler_tick(
    app: &AppHandle,
    manager: &AutomationManager,
    registry: &ServerRegistry,
    servers: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
) -> Result<(), String> {
    let profiles = read_profiles(registry).await?;
    let now_ms = Local::now().timestamp_millis();
    update_backup_schedules(manager, &profiles, now_ms).await;
    reset_stable_restart_attempts(manager, servers, Instant::now()).await;

    let mut due_restarts = Vec::new();
    let mut due_backups = Vec::new();
    {
        let mut state = manager.state.lock().await;
        let restart_candidates = state
            .restart_due
            .iter()
            .filter(|(server_id, due)| {
                due.due_at_ms <= now_ms && !state.restart_inflight.contains(*server_id)
            })
            .map(|(server_id, due)| (server_id.clone(), *due))
            .collect::<Vec<_>>();
        for (server_id, due) in restart_candidates {
            state.restart_inflight.insert(server_id.clone());
            due_restarts.push((server_id, due));
        }
        let candidates = state
            .backup_schedules
            .iter()
            .filter(|(server_id, schedule)| {
                schedule.next_run_at_ms <= now_ms && !state.active_backups.contains_key(*server_id)
            })
            .map(|(server_id, schedule)| (server_id.clone(), schedule.signature.clone()))
            .collect::<Vec<_>>();
        for (server_id, signature) in candidates {
            if let Some(profile) = profiles.iter().find(|profile| profile.id == server_id) {
                if profile.auto_backup_enabled.unwrap_or(false) && !manager.is_shutting_down() {
                    let cancellation = Arc::new(AtomicBool::new(false));
                    state.active_backups.insert(server_id, cancellation.clone());
                    due_backups.push((profile.clone(), signature, cancellation));
                }
            }
        }
    }

    for (server_id, due) in due_restarts {
        manager.state.lock().await.restart_due.remove(&server_id);
        let Some(profile) = profiles.iter().find(|profile| profile.id == server_id) else {
            manager
                .state
                .lock()
                .await
                .restart_inflight
                .remove(&server_id);
            continue;
        };
        if !profile.auto_restart_on_crash.unwrap_or(false)
            || servers.is_server_running(&server_id).await
        {
            manager
                .state
                .lock()
                .await
                .restart_inflight
                .remove(&server_id);
            continue;
        }
        let result = start_profile(app, profile, servers, limiter, operations).await;
        manager
            .state
            .lock()
            .await
            .restart_inflight
            .remove(&server_id);
        match result {
            Ok(()) => {}
            Err(error) if error == super::eula::EULA_REQUIRED_ERROR => {
                let mut event = AutomationEvent::new("auto_restart_eula_required", profile);
                event.attempt = Some(due.attempt);
                event.max = Some(due.max_attempts);
                request_eula_restart(app, manager, profile, RestartReason::Crash, event).await;
            }
            Err(error) => {
                log::error!(target: "automation", "Automatic restart failed for {}: {error}", profile.id);
                let mut event = AutomationEvent::new("auto_restart_failed", profile);
                event.attempt = Some(due.attempt);
                event.max = Some(due.max_attempts);
                emit_event(app, event);
            }
        }
    }

    for (profile, signature, cancellation) in due_backups {
        if manager.is_shutting_down() || cancellation.load(Ordering::SeqCst) {
            finish_cancelled_backup_registration(manager, &profile.id).await;
            continue;
        }
        spawn_automatic_backup(
            app.clone(),
            manager.clone(),
            profile,
            signature,
            cancellation,
            servers.clone(),
            limiter.clone(),
            operations.clone(),
        );
    }
    Ok(())
}

fn spawn_automatic_backup(
    app: AppHandle,
    manager: AutomationManager,
    profile: MinecraftServer,
    signature: String,
    cancellation: Arc<AtomicBool>,
    servers: ServerManager,
    limiter: CommandLimiter,
    operations: ServerOperationManager,
) {
    tauri::async_runtime::spawn(async move {
        let result = run_automatic_backup(
            &app,
            &manager,
            &profile,
            &servers,
            &limiter,
            &operations,
            cancellation.clone(),
        )
        .await;
        let cancelled = manager.is_shutting_down()
            || cancellation.load(Ordering::SeqCst)
            || result
                .as_ref()
                .is_err_and(|error| error == AUTOMATIC_BACKUP_CANCELLED_ERROR);
        if !cancelled {
            match &result {
                Ok(()) => {
                    let now_ms = Local::now().timestamp_millis();
                    let mut state = manager.state.lock().await;
                    if let Some(schedule) = state.backup_schedules.get_mut(&profile.id) {
                        if schedule.signature == signature {
                            schedule.next_run_at_ms = next_backup_run(&profile, now_ms, false);
                        }
                    }
                }
                Err(error) => {
                    log::error!(target: "automation", "Automatic backup failed for {}: {error}", profile.id);
                    emit_event(&app, AutomationEvent::new("auto_backup_failed", &profile));
                    let now_ms = Local::now().timestamp_millis();
                    let mut state = manager.state.lock().await;
                    if let Some(schedule) = state.backup_schedules.get_mut(&profile.id) {
                        if schedule.signature == signature {
                            schedule.next_run_at_ms =
                                now_ms.saturating_add(BACKUP_RETRY_DELAY.as_millis() as i64);
                        }
                    }
                }
            }
        }

        {
            manager
                .state
                .lock()
                .await
                .active_backups
                .remove(&profile.id);
        }
        manager.backup_tasks_changed.notify_one();
    });
}

async fn finish_cancelled_backup_registration(manager: &AutomationManager, server_id: &str) {
    manager.state.lock().await.active_backups.remove(server_id);
    manager.backup_tasks_changed.notify_one();
}

async fn reset_stable_restart_attempts(
    manager: &AutomationManager,
    servers: &ServerManager,
    now: Instant,
) {
    let candidates = manager
        .state
        .lock()
        .await
        .online_since
        .iter()
        .filter(|(_, runtime)| stable_runtime_elapsed(runtime.started_at, now))
        .map(|(server_id, runtime)| (server_id.clone(), *runtime))
        .collect::<Vec<_>>();

    for (server_id, runtime) in candidates {
        let current_generation = servers
            .servers
            .lock()
            .await
            .get(&server_id)
            .map(|server| server.generation);
        let mut state = manager.state.lock().await;
        if current_generation != Some(runtime.generation) {
            if state.online_since.get(&server_id) == Some(&runtime) {
                state.online_since.remove(&server_id);
            }
            continue;
        }
        reset_restart_attempts_after_stable_runtime(
            &mut state,
            &server_id,
            runtime.generation,
            runtime.started_at,
            now,
        );
    }
}

fn stable_runtime_elapsed(started_at: Instant, now: Instant) -> bool {
    now.checked_duration_since(started_at)
        .is_some_and(|elapsed| elapsed >= STABLE_RUNNING_THRESHOLD)
}

fn note_server_online(
    state: &mut AutomationState,
    server_id: &str,
    generation: u64,
    started_at: Instant,
) {
    match state.online_since.get_mut(server_id) {
        Some(runtime) if runtime.generation == generation => {}
        Some(runtime) => {
            *runtime = OnlineRuntime {
                generation,
                started_at,
            };
        }
        None => {
            state.online_since.insert(
                server_id.to_string(),
                OnlineRuntime {
                    generation,
                    started_at,
                },
            );
        }
    }
    state.restart_due.remove(server_id);
    state.restart_inflight.remove(server_id);
    state.eula_restart_pending.remove(server_id);
}

fn reset_restart_attempts_after_stable_runtime(
    state: &mut AutomationState,
    server_id: &str,
    generation: u64,
    started_at: Instant,
    now: Instant,
) -> bool {
    if !stable_runtime_elapsed(started_at, now)
        || state.online_since.get(server_id)
            != Some(&OnlineRuntime {
                generation,
                started_at,
            })
    {
        return false;
    }
    state.restart_attempts.remove(server_id);
    state.online_since.remove(server_id);
    true
}

async fn handle_server_status(
    app: &AppHandle,
    manager: &AutomationManager,
    registry: &ServerRegistry,
    event: &ServerStatusEvent,
) {
    if event.status == ServerStatus::Online {
        let mut state = manager.state.lock().await;
        note_server_online(
            &mut state,
            &event.server_id,
            event.generation,
            Instant::now(),
        );
        return;
    }
    if event.expected {
        let mut state = manager.state.lock().await;
        clear_pending_restart_state(&mut state, &event.server_id);
        return;
    }
    if !matches!(event.status, ServerStatus::Crashed | ServerStatus::Offline) {
        return;
    }

    manager
        .state
        .lock()
        .await
        .online_since
        .remove(&event.server_id);

    let Ok(profiles) = read_profiles(registry).await else {
        return;
    };
    let Some(profile) = profiles
        .iter()
        .find(|profile| profile.id == event.server_id)
    else {
        return;
    };
    if !profile.auto_restart_on_crash.unwrap_or(false) {
        return;
    }

    let max_attempts = bounded_u64(
        profile.max_auto_restarts.as_ref(),
        3,
        MAX_RESTART_ATTEMPTS as u64,
    ) as u32;
    if max_attempts == 0 {
        return;
    }
    let delay_seconds = bounded_u64(
        profile.auto_restart_delay_sec.as_ref(),
        5,
        MAX_RESTART_DELAY_SECS,
    )
    .max(1);
    let scheduling = {
        let mut state = manager.state.lock().await;
        schedule_restart(
            &mut state,
            &event.server_id,
            max_attempts,
            delay_seconds,
            Local::now().timestamp_millis(),
        )
    };
    let due = match scheduling {
        RestartScheduleResult::Scheduled(due) => due,
        RestartScheduleResult::LimitReached => {
            emit_event(
                app,
                AutomationEvent::new("auto_restart_limit_reached", profile),
            );
            return;
        }
        RestartScheduleResult::AlreadyScheduled => return,
    };
    let mut payload = AutomationEvent::new("auto_restart_scheduled", profile);
    payload.seconds = Some(delay_seconds);
    payload.attempt = Some(due.attempt);
    payload.max = Some(due.max_attempts);
    emit_event(app, payload);
}

async fn update_backup_schedules(
    manager: &AutomationManager,
    profiles: &[MinecraftServer],
    now_ms: i64,
) {
    let enabled = profiles
        .iter()
        .filter(|profile| profile.auto_backup_enabled.unwrap_or(false))
        .map(|profile| (profile.id.clone(), profile))
        .collect::<HashMap<_, _>>();
    let mut state = manager.state.lock().await;
    state
        .backup_schedules
        .retain(|server_id, _| enabled.contains_key(server_id));
    for (server_id, profile) in enabled {
        reconcile_backup_schedule(&mut state, &server_id, profile, now_ms);
    }
}

fn reconcile_backup_schedule(
    state: &mut AutomationState,
    server_id: &str,
    profile: &MinecraftServer,
    now_ms: i64,
) {
    if !profile.auto_backup_enabled.unwrap_or(false) {
        state.backup_schedules.remove(server_id);
        return;
    }
    let signature = backup_schedule_signature(profile);
    if state
        .backup_schedules
        .get(server_id)
        .is_some_and(|schedule| schedule.signature == signature)
    {
        return;
    }
    state.backup_schedules.insert(
        server_id.to_string(),
        BackupSchedule {
            signature,
            next_run_at_ms: next_backup_run(profile, now_ms, true),
        },
    );
}

fn schedule_restart(
    state: &mut AutomationState,
    server_id: &str,
    max_attempts: u32,
    delay_seconds: u64,
    now_ms: i64,
) -> RestartScheduleResult {
    if state.restart_due.contains_key(server_id) || state.restart_inflight.contains(server_id) {
        return RestartScheduleResult::AlreadyScheduled;
    }
    if max_attempts == 0 {
        return RestartScheduleResult::LimitReached;
    }
    let attempt = state
        .restart_attempts
        .entry(server_id.to_string())
        .or_default();
    if *attempt >= max_attempts {
        return RestartScheduleResult::LimitReached;
    }
    *attempt += 1;
    let due = RestartDue {
        due_at_ms: now_ms.saturating_add((delay_seconds as i64).saturating_mul(1000)),
        attempt: *attempt,
        max_attempts,
    };
    state.restart_due.insert(server_id.to_string(), due);
    RestartScheduleResult::Scheduled(due)
}

fn clear_pending_restart_state(state: &mut AutomationState, server_id: &str) {
    state.restart_due.remove(server_id);
    state.restart_inflight.remove(server_id);
    state.online_since.remove(server_id);
    state.eula_restart_pending.remove(server_id);
}

fn backup_schedule_type(profile: &MinecraftServer) -> BackupScheduleType {
    match profile.auto_backup_schedule_type.as_deref() {
        Some("daily") => BackupScheduleType::Daily,
        Some("weekly") => BackupScheduleType::Weekly,
        _ => BackupScheduleType::Interval,
    }
}

fn backup_interval_minutes(profile: &MinecraftServer) -> u64 {
    bounded_u64(
        profile.auto_backup_interval_min.as_ref(),
        60,
        MAX_BACKUP_INTERVAL_MINUTES,
    )
    .max(1)
}

fn backup_time(profile: &MinecraftServer) -> NaiveTime {
    profile
        .auto_backup_time
        .as_deref()
        .and_then(|value| NaiveTime::parse_from_str(value.trim(), "%H:%M").ok())
        .unwrap_or_else(|| NaiveTime::from_hms_opt(3, 0, 0).expect("valid default time"))
}

fn backup_weekday(profile: &MinecraftServer) -> u32 {
    bounded_u64(profile.auto_backup_weekday.as_ref(), 0, 6) as u32
}

fn backup_schedule_signature(profile: &MinecraftServer) -> String {
    match backup_schedule_type(profile) {
        BackupScheduleType::Interval => format!("interval:{}", backup_interval_minutes(profile)),
        BackupScheduleType::Daily => format!("daily:{}", backup_time(profile).format("%H:%M")),
        BackupScheduleType::Weekly => format!(
            "weekly:{}:{}",
            backup_weekday(profile),
            backup_time(profile).format("%H:%M")
        ),
    }
}

fn next_backup_run(profile: &MinecraftServer, now_ms: i64, allow_current_minute: bool) -> i64 {
    match backup_schedule_type(profile) {
        BackupScheduleType::Interval => {
            now_ms.saturating_add((backup_interval_minutes(profile) as i64).saturating_mul(60_000))
        }
        schedule => {
            if allow_current_minute {
                if let Some(now) = Local.timestamp_millis_opt(now_ms).single() {
                    let target_time = backup_time(profile);
                    let matches_current_minute = now.hour() == target_time.hour()
                        && now.minute() == target_time.minute()
                        && (schedule != BackupScheduleType::Weekly
                            || now.weekday().num_days_from_sunday() == backup_weekday(profile));
                    if matches_current_minute {
                        return now_ms;
                    }
                }
            }
            next_time_based_backup_run(
                schedule,
                backup_time(profile),
                backup_weekday(profile),
                now_ms,
            )
            .unwrap_or_else(|| now_ms.saturating_add(60_000))
        }
    }
}

fn next_time_based_backup_run(
    schedule: BackupScheduleType,
    time: NaiveTime,
    weekday: u32,
    now_ms: i64,
) -> Option<i64> {
    let now = Local.timestamp_millis_opt(now_ms).single()?;
    let today = now.date_naive();
    for offset in 0..=7 {
        let date = today.checked_add_days(chrono::Days::new(offset))?;
        if schedule == BackupScheduleType::Weekly
            && date.weekday().num_days_from_sunday() != weekday
        {
            continue;
        }
        let candidate = date.and_time(time);
        match Local.from_local_datetime(&candidate) {
            LocalResult::Single(value) if value.timestamp_millis() > now_ms => {
                return Some(value.timestamp_millis());
            }
            LocalResult::Ambiguous(first, second) => {
                let selected = [first, second]
                    .into_iter()
                    .filter(|value| value.timestamp_millis() > now_ms)
                    .min_by_key(|value| value.timestamp_millis());
                if let Some(value) = selected {
                    return Some(value.timestamp_millis());
                }
            }
            LocalResult::None | LocalResult::Single(_) => {}
        }
    }
    None
}

fn bounded_u64(value: Option<&serde_json::Number>, default: u64, maximum: u64) -> u64 {
    let normalized = value
        .and_then(|number| {
            number
                .as_i64()
                .map(|signed| signed.max(0) as u64)
                .or_else(|| number.as_u64())
        })
        .unwrap_or(default);
    normalized.min(maximum)
}

fn sanitize_backup_server_name(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|character| {
            if character.is_control() || "\\/:*?\"<>|".contains(character) {
                '-'
            } else {
                character
            }
        })
        .collect::<String>()
        .replace("..", "-")
        .trim_matches('-')
        .to_string();
    if sanitized.is_empty() {
        "server".to_string()
    } else {
        sanitized
    }
}

fn automatic_backup_name(profile: &MinecraftServer) -> String {
    format!(
        "AutoBackup {} {}.zip",
        sanitize_backup_server_name(&profile.name),
        Local::now().format("%Y-%m-%d-%H-%M-%S-%3f")
    )
}

enum AutomaticBackupStopRecovery {
    StillRunning,
    RestartSkipped,
    Restarted,
    RestartFailed(String),
}

enum AutomaticBackupAttempt {
    StopFailed {
        error: String,
        recovery: AutomaticBackupStopRecovery,
    },
    Backup {
        result: Result<ManagedBackupArchive, String>,
        operation: OperationGuard,
    },
}

async fn perform_automatic_backup_attempt<
    Stop,
    StopFuture,
    ShouldRestart,
    Create,
    CreateFuture,
    Restart,
    RestartFuture,
>(
    operation: OperationGuard,
    stop: Stop,
    should_restart: ShouldRestart,
    create: Create,
    restart: Restart,
) -> AutomaticBackupAttempt
where
    Stop: FnOnce() -> StopFuture,
    StopFuture: Future<Output = Result<(), StopServerError>>,
    ShouldRestart: FnOnce() -> bool,
    Create: FnOnce() -> CreateFuture,
    CreateFuture: Future<Output = Result<ManagedBackupArchive, String>>,
    Restart: FnOnce(OperationGuard) -> RestartFuture,
    RestartFuture: Future<Output = Result<(), String>>,
{
    if let Err(error) = stop().await {
        let recovery = match error.recovery_state {
            StopErrorRecoveryState::Stopped => {
                if should_restart() {
                    match restart(operation).await {
                        Ok(()) => AutomaticBackupStopRecovery::Restarted,
                        Err(error) => AutomaticBackupStopRecovery::RestartFailed(error),
                    }
                } else {
                    drop(operation);
                    AutomaticBackupStopRecovery::RestartSkipped
                }
            }
            StopErrorRecoveryState::Cancelled => {
                drop(operation);
                AutomaticBackupStopRecovery::RestartSkipped
            }
            StopErrorRecoveryState::RunningOrUnconfirmed => {
                drop(operation);
                AutomaticBackupStopRecovery::StillRunning
            }
        };
        return AutomaticBackupAttempt::StopFailed {
            error: error.message,
            recovery,
        };
    }

    AutomaticBackupAttempt::Backup {
        result: create().await,
        operation,
    }
}

async fn apply_automatic_backup_retention_if_catalog_ready<Apply, ApplyFuture>(
    catalog_error: Option<&str>,
    apply: Apply,
) -> Option<ApplyFuture::Output>
where
    Apply: FnOnce() -> ApplyFuture,
    ApplyFuture: Future,
{
    if catalog_error.is_some() {
        return None;
    }
    Some(apply().await)
}

async fn run_automatic_backup(
    app: &AppHandle,
    manager: &AutomationManager,
    profile: &MinecraftServer,
    servers: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    cancellation: Arc<AtomicBool>,
) -> Result<(), String> {
    if is_automatic_backup_cancelled(manager, &cancellation) {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    let operation = acquire_backup_operation(
        operations,
        &profile.id,
        OperationKind::BackupCreate,
        Some(cancellation.clone()),
    )
    .await?;
    if is_automatic_backup_cancelled(manager, &cancellation) {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    if !servers.is_server_running(&profile.id).await {
        return Err("Automatic backup waits for the server to be running".to_string());
    }

    let attempt = perform_automatic_backup_attempt(
        operation,
        || stop_server_with_guard_recovery(servers, &profile.id, Some(&cancellation)),
        || should_restart_after_automatic_backup(manager, profile, &cancellation),
        || async {
            if is_automatic_backup_cancelled(manager, &cancellation) {
                return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
            }
            create_managed_backup_unlocked_inner(
                app.clone(),
                profile.id.clone(),
                automatic_backup_name(profile),
                None,
                None,
                Some("automatic".to_string()),
                Some(cancellation.clone()),
            )
            .await
        },
        |operation| start_profile_with_guard(app, profile, servers, limiter, operations, operation),
    )
    .await;
    let (backup_result, operation) = match attempt {
        AutomaticBackupAttempt::StopFailed { error, recovery } => {
            if is_automatic_backup_cancelled(manager, &cancellation) {
                return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
            }
            match recovery {
                AutomaticBackupStopRecovery::StillRunning
                | AutomaticBackupStopRecovery::RestartSkipped
                | AutomaticBackupStopRecovery::Restarted => {}
                AutomaticBackupStopRecovery::RestartFailed(restart_error)
                    if restart_error == super::eula::EULA_REQUIRED_ERROR =>
                {
                    request_eula_restart(
                        app,
                        manager,
                        profile,
                        RestartReason::Backup,
                        AutomationEvent::new("auto_restart_eula_required", profile),
                    )
                    .await;
                }
                AutomaticBackupStopRecovery::RestartFailed(restart_error) => {
                    log::error!(target: "automation", "Server {} stayed stopped after failed automatic backup stop: {restart_error}", profile.id);
                    emit_event(app, AutomationEvent::new("auto_restart_failed", profile));
                }
            }
            return Err(error);
        }
        AutomaticBackupAttempt::Backup { result, operation } => (result, operation),
    };
    let archive = match backup_result {
        Ok(archive) => archive,
        Err(backup_error) => {
            if is_automatic_backup_cancelled(manager, &cancellation)
                || backup_error == AUTOMATIC_BACKUP_CANCELLED_ERROR
            {
                return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
            }
            if should_restart_after_automatic_backup(manager, profile, &cancellation) {
                match start_profile_with_guard(
                    app, profile, servers, limiter, operations, operation,
                )
                .await
                {
                    Ok(()) => {}
                    Err(error) if error == super::eula::EULA_REQUIRED_ERROR => {
                        request_eula_restart(
                            app,
                            manager,
                            profile,
                            RestartReason::Backup,
                            AutomationEvent::new("auto_restart_eula_required", profile),
                        )
                        .await;
                    }
                    Err(restart_error) => {
                        log::error!(target: "automation", "Server {} stayed stopped after failed automatic backup: {restart_error}", profile.id);
                        emit_event(app, AutomationEvent::new("auto_restart_failed", profile));
                    }
                }
            } else {
                drop(operation);
            }
            return Err(backup_error);
        }
    };
    if is_automatic_backup_cancelled(manager, &cancellation) {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    let mut created_event = AutomationEvent::new("auto_backup_created", profile);
    created_event.catalog_error = archive.catalog_error.clone();
    emit_event(app, created_event);
    if let Some(error) = archive.catalog_error.as_deref() {
        log::warn!(target: "automation", "Automatic backup archive created for {} but its catalog could not be rebuilt: {error}", profile.id);
    }

    let retain_count = bounded_u64(
        profile.auto_backup_retain_count.as_ref(),
        0,
        u32::MAX as u64,
    ) as u32;
    let retain_days =
        bounded_u64(profile.auto_backup_retain_days.as_ref(), 0, u32::MAX as u64) as u32;
    if let Some(retention_result) =
        apply_automatic_backup_retention_if_catalog_ready(archive.catalog_error.as_deref(), || {
            apply_managed_backup_retention_cancellable_unlocked_inner(
                app.clone(),
                profile.id.clone(),
                retain_count,
                retain_days,
                cancellation.clone(),
            )
        })
        .await
    {
        match retention_result {
            Ok(report) if report.failed_delete_count > 0 => {
                let mut event =
                    AutomationEvent::new("auto_backup_retention_delete_failed", profile);
                event.count = Some(report.failed_delete_count);
                emit_event(app, event);
            }
            Err(error) => {
                if error == AUTOMATIC_BACKUP_CANCELLED_ERROR
                    || is_automatic_backup_cancelled(manager, &cancellation)
                {
                    return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
                }
                log::error!(target: "automation", "Automatic backup retention failed for {}: {error}", profile.id);
                emit_event(
                    app,
                    AutomationEvent::new("auto_backup_retention_list_failed", profile),
                );
            }
            _ => {}
        }
    }

    if is_automatic_backup_cancelled(manager, &cancellation) {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    if should_restart_after_automatic_backup(manager, profile, &cancellation) {
        match start_profile_with_guard(app, profile, servers, limiter, operations, operation).await
        {
            Ok(()) => {}
            Err(error) if error == super::eula::EULA_REQUIRED_ERROR => {
                request_eula_restart(
                    app,
                    manager,
                    profile,
                    RestartReason::Backup,
                    AutomationEvent::new("auto_restart_eula_required", profile),
                )
                .await;
            }
            Err(error) => {
                log::error!(target: "automation", "Server {} did not restart after automatic backup: {error}", profile.id);
                emit_event(app, AutomationEvent::new("auto_restart_failed", profile));
            }
        }
    } else {
        drop(operation);
    }
    Ok(())
}

fn is_automatic_backup_cancelled(manager: &AutomationManager, cancellation: &AtomicBool) -> bool {
    manager.is_shutting_down() || cancellation.load(Ordering::SeqCst)
}

fn should_restart_after_automatic_backup(
    manager: &AutomationManager,
    profile: &MinecraftServer,
    cancellation: &AtomicBool,
) -> bool {
    profile.backup_restart_after_safe_backup != Some(false)
        && !is_automatic_backup_cancelled(manager, cancellation)
}

async fn request_eula_restart(
    app: &AppHandle,
    manager: &AutomationManager,
    profile: &MinecraftServer,
    reason: RestartReason,
    event: AutomationEvent,
) {
    let expires_at_ms = Local::now()
        .timestamp_millis()
        .saturating_add(EULA_RESTART_CONFIRMATION_TTL.as_millis() as i64);
    manager.state.lock().await.eula_restart_pending.insert(
        profile.id.clone(),
        PendingEulaRestart {
            reason,
            expires_at_ms,
        },
    );
    emit_event(app, event);
}

async fn start_profile(
    app: &AppHandle,
    profile: &MinecraftServer,
    servers: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
) -> Result<(), String> {
    let (java_path, memory, jar_file, jvm_extra_args, software) =
        start_settings_for_profile(app, profile)?;
    start_server_with_config(
        app.clone(),
        servers,
        limiter,
        operations,
        profile.id.clone(),
        java_path,
        memory,
        jar_file,
        jvm_extra_args,
        software,
    )
    .await
}

async fn start_profile_with_guard(
    app: &AppHandle,
    profile: &MinecraftServer,
    servers: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    operation: OperationGuard,
) -> Result<(), String> {
    let (java_path, memory, jar_file, jvm_extra_args, software) =
        start_settings_for_profile(app, profile)?;
    start_server_with_config_and_guard(
        app.clone(),
        servers,
        limiter,
        operations,
        profile.id.clone(),
        java_path,
        memory,
        jar_file,
        jvm_extra_args,
        software,
        operation,
    )
    .await
}

fn start_settings_for_profile(
    app: &AppHandle,
    profile: &MinecraftServer,
) -> Result<(String, u32, String, Option<String>, String), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    ensure_server_eula_accepted(&app_data_dir, &profile.id)?;
    let memory = profile
        .memory
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| "Server memory setting is invalid".to_string())?;
    let java_path = profile
        .java_path
        .clone()
        .filter(|path| !path.trim().is_empty())
        .unwrap_or_else(|| "java".to_string());
    let jar_file = if profile.software.eq_ignore_ascii_case("forge") {
        "forge-server.jar"
    } else {
        "server.jar"
    };
    Ok((
        java_path,
        memory,
        jar_file.to_string(),
        profile.jvm_args.clone(),
        profile.software.clone(),
    ))
}

#[tauri::command]
pub async fn cancel_auto_restart(
    manager: State<'_, AutomationManager>,
    server_id: String,
    reset_attempts: Option<bool>,
) -> Result<(), String> {
    let server_id = server_id.trim();
    if server_id.is_empty() || server_id.len() > 128 || server_id.chars().any(char::is_control) {
        return Err("Invalid server ID".to_string());
    }
    let mut state = manager.state.lock().await;
    state.restart_due.remove(server_id);
    state.restart_inflight.remove(server_id);
    state.eula_restart_pending.remove(server_id);
    if reset_attempts.unwrap_or(false) {
        state.restart_attempts.remove(server_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_auto_restart_after_eula(
    app: AppHandle,
    automation: State<'_, AutomationManager>,
    registry: State<'_, ServerRegistry>,
    servers: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<(), String> {
    let profile = read_profiles(registry.inner())
        .await?
        .into_iter()
        .find(|profile| profile.id == server_id)
        .ok_or_else(|| "Server profile not found".to_string())?;
    let pending = {
        let mut state = automation.state.lock().await;
        state.eula_restart_pending.remove(&profile.id)
    };
    let pending = pending.ok_or_else(|| "No confirmed automatic restart is pending".to_string())?;
    if pending.expires_at_ms < Local::now().timestamp_millis() {
        return Err("Automatic restart confirmation expired".to_string());
    }
    if !restart_reason_enabled(pending.reason, &profile) {
        return Err("Automatic restart was disabled before EULA confirmation".to_string());
    }
    start_profile(
        &app,
        &profile,
        servers.inner(),
        limiter.inner(),
        operations.inner(),
    )
    .await
}

fn restart_reason_enabled(reason: RestartReason, profile: &MinecraftServer) -> bool {
    match reason {
        RestartReason::Crash => profile.auto_restart_on_crash.unwrap_or(false),
        RestartReason::Backup => profile.backup_restart_after_safe_backup != Some(false),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_automatic_backup_retention_if_catalog_ready, backup_schedule_signature,
        clear_pending_restart_state, next_backup_run, next_time_based_backup_run,
        note_server_online, perform_automatic_backup_attempt, reconcile_backup_schedule,
        reset_restart_attempts_after_stable_runtime, restart_reason_enabled, schedule_restart,
        should_restart_after_automatic_backup, AutomaticBackupAttempt, AutomaticBackupStopRecovery,
        AutomationEvent, AutomationManager, AutomationState, BackupScheduleType,
        PendingEulaRestart, RestartReason, RestartScheduleResult, STABLE_RUNNING_THRESHOLD,
    };
    use crate::commands::backup::ManagedBackupArchive;
    use crate::commands::server::{ServerManager, ServerStatus, ServerStatusEvent};
    use crate::commands::server_registry::MinecraftServer;
    use crate::state::operation_manager::{OperationKind, ServerOperationManager};
    use chrono::{Datelike, TimeZone};
    use serde_json::Number;
    use std::collections::HashMap;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::{Duration, Instant};

    fn server() -> MinecraftServer {
        MinecraftServer {
            id: "server-1".to_string(),
            name: "My Server".to_string(),
            profile_name: None,
            group_name: None,
            version: "1.21.1".to_string(),
            software: "Paper".to_string(),
            port: Number::from(25565),
            memory: Number::from(2048),
            path: "servers/server-1".to_string(),
            status: "offline".to_string(),
            java_path: None,
            auto_restart_on_crash: Some(true),
            max_auto_restarts: Some(Number::from(4)),
            auto_restart_delay_sec: Some(Number::from(8)),
            auto_backup_enabled: Some(true),
            auto_backup_interval_min: Some(Number::from(30)),
            auto_backup_schedule_type: Some("interval".to_string()),
            auto_backup_time: Some("03:00".to_string()),
            auto_backup_weekday: Some(Number::from(0)),
            auto_backup_retain_count: Some(Number::from(5)),
            auto_backup_retain_days: Some(Number::from(30)),
            backup_restart_after_safe_backup: Some(true),
            created_date: None,
            jvm_args: None,
            notify_on_crash: None,
            notify_on_start: None,
            notify_on_high_cpu: None,
            notify_high_cpu_threshold: None,
            unavailable_reason: None,
            extra: HashMap::new(),
        }
    }

    #[test]
    fn interval_backup_is_scheduled_from_current_time() {
        let profile = server();
        assert_eq!(next_backup_run(&profile, 1_000, false), 1_801_000);
    }

    #[test]
    fn interval_is_clamped_to_a_day_and_signature_tracks_setting() {
        let mut profile = server();
        profile.auto_backup_interval_min = Some(Number::from(9_000));
        assert!(backup_schedule_signature(&profile).ends_with("1440"));
        profile.auto_backup_interval_min = Some(Number::from(45));
        assert!(backup_schedule_signature(&profile).ends_with("45"));
    }

    #[test]
    fn daily_schedule_uses_local_time_and_skips_the_current_minute() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 29).expect("date");
        let time = chrono::NaiveTime::from_hms_opt(3, 0, 0).expect("time");
        let now = chrono::Local
            .from_local_datetime(&date.and_hms_opt(4, 0, 0).expect("datetime"))
            .single()
            .expect("local time");
        let next =
            next_time_based_backup_run(BackupScheduleType::Daily, time, 0, now.timestamp_millis())
                .expect("next run");
        let next_local = chrono::Local
            .timestamp_millis_opt(next)
            .single()
            .expect("next local");
        assert!(next > now.timestamp_millis());
        assert_eq!(next_local.date_naive(), date.succ_opt().expect("tomorrow"));
        assert_eq!(next_local.time(), time);
    }

    #[test]
    fn initial_daily_schedule_runs_in_the_current_configured_minute() {
        let mut profile = server();
        profile.auto_backup_schedule_type = Some("daily".to_string());
        let date = chrono::NaiveDate::from_ymd_opt(2026, 10, 29).expect("date");
        let now = chrono::Local
            .from_local_datetime(&date.and_hms_opt(3, 0, 30).expect("datetime"))
            .single()
            .expect("local time");

        assert_eq!(
            next_backup_run(&profile, now.timestamp_millis(), true),
            now.timestamp_millis()
        );
        assert!(next_backup_run(&profile, now.timestamp_millis(), false) > now.timestamp_millis());
    }

    #[test]
    fn weekly_schedule_uses_sunday_zero_and_moves_forward() {
        let sunday = chrono::NaiveDate::from_ymd_opt(2026, 10, 25).expect("date");
        let sunday_evening = chrono::NaiveTime::from_hms_opt(22, 0, 0).expect("time");
        let now = chrono::Local
            .from_local_datetime(&sunday.and_time(sunday_evening))
            .single()
            .expect("local time");
        let next = next_time_based_backup_run(
            BackupScheduleType::Weekly,
            chrono::NaiveTime::from_hms_opt(3, 0, 0).expect("time"),
            0,
            now.timestamp_millis(),
        )
        .expect("next run");
        assert!(next > now.timestamp_millis());
        assert_eq!(
            chrono::Local
                .timestamp_millis_opt(next)
                .single()
                .unwrap()
                .weekday()
                .num_days_from_sunday(),
            0
        );
    }

    #[test]
    fn unchanged_ui_schedule_refresh_keeps_due_time_and_changed_setting_reschedules() {
        let mut state = AutomationState::default();
        let mut profile = server();

        reconcile_backup_schedule(&mut state, &profile.id, &profile, 1_000);
        let first_due = state.backup_schedules[&profile.id].next_run_at_ms;
        reconcile_backup_schedule(&mut state, &profile.id, &profile, 5_000);
        assert_eq!(
            state.backup_schedules[&profile.id].next_run_at_ms,
            first_due
        );

        profile.auto_backup_interval_min = Some(Number::from(45));
        reconcile_backup_schedule(&mut state, &profile.id, &profile, 5_000);
        assert_eq!(
            state.backup_schedules[&profile.id].next_run_at_ms,
            2_705_000
        );
    }

    #[test]
    fn startup_rebuilds_schedule_from_saved_settings_without_replaying_past_due_work() {
        let profile = server();
        let mut prior_run = AutomationState::default();
        reconcile_backup_schedule(&mut prior_run, &profile.id, &profile, 1_000);
        let mut relaunched = AutomationState::default();
        reconcile_backup_schedule(&mut relaunched, &profile.id, &profile, 7_200_000);

        assert_eq!(
            relaunched.backup_schedules[&profile.id].next_run_at_ms,
            9_000_000
        );
        assert_ne!(
            relaunched.backup_schedules[&profile.id].next_run_at_ms,
            prior_run.backup_schedules[&profile.id].next_run_at_ms,
        );
    }

    #[test]
    fn duplicate_crash_events_do_not_queue_duplicate_restart_attempts() {
        let mut state = AutomationState::default();
        let first = schedule_restart(&mut state, "server-1", 2, 5, 1_000);
        assert!(matches!(first, RestartScheduleResult::Scheduled(_)));
        assert_eq!(
            schedule_restart(&mut state, "server-1", 2, 5, 1_001),
            RestartScheduleResult::AlreadyScheduled,
        );
        state.restart_due.remove("server-1");
        state.restart_inflight.insert("server-1".to_string());
        assert_eq!(
            schedule_restart(&mut state, "server-1", 2, 5, 1_002),
            RestartScheduleResult::AlreadyScheduled,
        );
        state.restart_inflight.remove("server-1");
        assert!(matches!(
            schedule_restart(&mut state, "server-1", 2, 5, 1_003),
            RestartScheduleResult::Scheduled(_)
        ));
        state.restart_due.remove("server-1");
        assert_eq!(
            schedule_restart(&mut state, "server-1", 2, 5, 1_004),
            RestartScheduleResult::LimitReached,
        );
    }

    #[tokio::test]
    async fn queued_internal_crash_status_drives_restart_scheduling() {
        let servers = ServerManager::default();
        servers.send_status_event(ServerStatusEvent {
            server_id: "server-1".to_string(),
            generation: 3,
            status: ServerStatus::Crashed,
            expected: false,
        });

        // The scheduler receiver remains available even if status transitions
        // arrive before its background task is first polled.
        let mut status_rx = servers
            .take_status_receiver()
            .expect("automation should subscribe to the internal status channel");
        let event = status_rx
            .recv()
            .await
            .expect("the queued crash must reach automation");
        assert_eq!(event.status, ServerStatus::Crashed);
        assert!(!event.expected);

        let mut automation = AutomationState::default();
        assert_eq!(
            schedule_restart(&mut automation, &event.server_id, 2, 5, 1_000),
            RestartScheduleResult::Scheduled(super::RestartDue {
                due_at_ms: 6_000,
                attempt: 1,
                max_attempts: 2,
            })
        );
    }

    #[test]
    fn eula_resume_requires_the_same_automation_setting_to_remain_enabled() {
        let mut profile = server();
        assert!(restart_reason_enabled(RestartReason::Crash, &profile));
        assert!(restart_reason_enabled(RestartReason::Backup, &profile));
        profile.auto_restart_on_crash = Some(false);
        profile.backup_restart_after_safe_backup = Some(false);
        assert!(!restart_reason_enabled(RestartReason::Crash, &profile));
        assert!(!restart_reason_enabled(RestartReason::Backup, &profile));
    }

    #[test]
    fn expected_stop_clears_pending_restart_state() {
        let mut state = AutomationState::default();
        state.restart_attempts.insert("server-1".to_string(), 2);
        state.restart_due.insert(
            "server-1".to_string(),
            super::RestartDue {
                due_at_ms: 3_000,
                attempt: 2,
                max_attempts: 4,
            },
        );
        state.restart_inflight.insert("server-1".to_string());
        state.eula_restart_pending.insert(
            "server-1".to_string(),
            PendingEulaRestart {
                reason: RestartReason::Crash,
                expires_at_ms: 10_000,
            },
        );

        clear_pending_restart_state(&mut state, "server-1");

        assert_eq!(state.restart_attempts.get("server-1"), Some(&2));
        assert!(!state.restart_due.contains_key("server-1"));
        assert!(!state.restart_inflight.contains("server-1"));
        assert!(!state.eula_restart_pending.contains_key("server-1"));
        assert!(!state.online_since.contains_key("server-1"));
    }

    #[test]
    fn online_spawn_does_not_reset_restart_attempts_until_stable_runtime() {
        let mut state = AutomationState::default();
        state.restart_attempts.insert("server-1".to_string(), 2);
        let started_at = Instant::now();
        note_server_online(&mut state, "server-1", 7, started_at);

        assert_eq!(state.restart_attempts.get("server-1"), Some(&2));
        assert!(!reset_restart_attempts_after_stable_runtime(
            &mut state,
            "server-1",
            7,
            started_at,
            started_at + STABLE_RUNNING_THRESHOLD - Duration::from_millis(1),
        ));
        assert_eq!(state.restart_attempts.get("server-1"), Some(&2));

        assert!(reset_restart_attempts_after_stable_runtime(
            &mut state,
            "server-1",
            7,
            started_at,
            started_at + STABLE_RUNNING_THRESHOLD,
        ));
        assert!(!state.restart_attempts.contains_key("server-1"));
        assert!(!state.online_since.contains_key("server-1"));
    }

    #[test]
    fn repeated_fast_crashes_reach_the_restart_limit() {
        let mut state = AutomationState::default();
        for attempt in 1..=3 {
            assert!(matches!(
                schedule_restart(&mut state, "server-1", 3, 1, attempt * 1_000),
                RestartScheduleResult::Scheduled(_)
            ));
            state.restart_due.remove("server-1");
            note_server_online(&mut state, "server-1", 9, Instant::now());
            assert_eq!(
                state.restart_attempts.get("server-1"),
                Some(&(attempt as u32))
            );
            state.online_since.remove("server-1");
        }
        assert_eq!(
            schedule_restart(&mut state, "server-1", 3, 1, 4_000),
            RestartScheduleResult::LimitReached
        );
    }

    #[test]
    fn stable_runtime_reset_does_not_apply_to_a_newer_online_generation() {
        let mut state = AutomationState::default();
        state.restart_attempts.insert("server-1".to_string(), 1);
        let old_start = Instant::now();
        note_server_online(&mut state, "server-1", 11, old_start);
        let new_start = old_start + Duration::from_secs(1);
        note_server_online(&mut state, "server-1", 12, new_start);

        assert!(!reset_restart_attempts_after_stable_runtime(
            &mut state,
            "server-1",
            11,
            old_start,
            old_start + STABLE_RUNNING_THRESHOLD,
        ));
        assert_eq!(state.restart_attempts.get("server-1"), Some(&1));
        assert_eq!(
            state.online_since.get("server-1"),
            Some(&super::OnlineRuntime {
                generation: 12,
                started_at: new_start,
            })
        );
    }

    #[test]
    fn automatic_backup_restart_is_skipped_after_cancellation() {
        let manager = AutomationManager::default();
        let profile = server();
        let cancellation = AtomicBool::new(false);
        assert!(should_restart_after_automatic_backup(
            &manager,
            &profile,
            &cancellation
        ));

        cancellation.store(true, Ordering::SeqCst);
        assert!(!should_restart_after_automatic_backup(
            &manager,
            &profile,
            &cancellation
        ));
    }

    #[test]
    fn automatic_backup_restart_policy_still_honors_profile_setting() {
        let manager = AutomationManager::default();
        let cancellation = AtomicBool::new(false);
        let mut profile = server();
        profile.backup_restart_after_safe_backup = None;
        assert!(should_restart_after_automatic_backup(
            &manager,
            &profile,
            &cancellation
        ));

        profile.backup_restart_after_safe_backup = Some(false);
        assert!(!should_restart_after_automatic_backup(
            &manager,
            &profile,
            &cancellation
        ));
    }

    #[tokio::test]
    async fn failed_automatic_stop_restarts_if_the_server_is_already_stopped() {
        let servers = ServerManager::default();
        let signal_exit = servers
            .install_test_running_server_for_stop_recovery("server-1")
            .await;
        let cleanup_signal = signal_exit.clone();
        let cleanup_servers = servers.clone();
        let (removed_tx, removed_rx) = tokio::sync::oneshot::channel();
        let (continue_cleanup_tx, continue_cleanup_rx) = tokio::sync::oneshot::channel();
        let cleanup = tokio::spawn(async move {
            cleanup_signal
                .wait_until_expected_stop_registered(&cleanup_servers)
                .await;
            cleanup_signal
                .remove_from_server_map(&cleanup_servers)
                .await;
            let _ = removed_tx.send(());
            let _ = continue_cleanup_rx.await;
            cleanup_signal.finish_cleanup(&cleanup_servers).await;
        });
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let archive = std::env::temp_dir().join(format!(
            "mc-vector-auto-stop-failure-{}.zip",
            uuid::Uuid::new_v4()
        ));
        let archive_in_closure = archive.clone();
        let backup_attempted = Arc::new(AtomicBool::new(false));
        let backup_attempted_in_closure = backup_attempted.clone();
        let restart_attempted = Arc::new(AtomicBool::new(false));
        let restart_attempted_in_closure = restart_attempted.clone();

        let stop_servers = servers.clone();
        let backup = tokio::spawn(async move {
            perform_automatic_backup_attempt(
                operation,
                move || async move {
                    crate::commands::server::stop_server_with_guard_recovery(
                        &stop_servers,
                        "server-1",
                        None,
                    )
                    .await
                },
                || true,
                move || async move {
                    backup_attempted_in_closure.store(true, Ordering::SeqCst);
                    std::fs::write(&archive_in_closure, b"archive").expect("write archive marker");
                    Ok(ManagedBackupArchive {
                        backup_name: "backup.zip".to_string(),
                        catalog_error: None,
                    })
                },
                move |operation| async move {
                    restart_attempted_in_closure.store(true, Ordering::SeqCst);
                    drop(operation);
                    Ok(())
                },
            )
            .await
        });
        removed_rx
            .await
            .expect("cleanup should remove the server map entry");
        assert!(!servers.is_server_running("server-1").await);
        assert!(
            !restart_attempted.load(Ordering::SeqCst),
            "map removal alone must not permit automatic restart"
        );
        assert!(!backup_attempted.load(Ordering::SeqCst));
        let mut backup = backup;
        assert!(
            tokio::time::timeout(Duration::from_millis(50), &mut backup)
                .await
                .is_err(),
            "automatic stop recovery must wait for the exit watch"
        );
        continue_cleanup_tx
            .send(())
            .expect("release old process cleanup");
        let result = backup
            .await
            .expect("automatic backup attempt should finish");
        cleanup.await.expect("exit cleanup task should finish");

        match result {
            AutomaticBackupAttempt::StopFailed { error, recovery } => {
                assert_eq!(error, "Server not found or not running");
                assert!(matches!(recovery, AutomaticBackupStopRecovery::Restarted));
            }
            AutomaticBackupAttempt::Backup { .. } => {
                panic!("a failed stop must not reach backup creation")
            }
        }
        assert!(restart_attempted.load(Ordering::SeqCst));
        assert!(!backup_attempted.load(Ordering::SeqCst));
        assert!(!archive.exists());
        assert!(!servers.is_server_running("server-1").await);
    }

    #[tokio::test]
    async fn failed_automatic_stop_does_not_restart_a_server_still_running() {
        let servers = ServerManager::default();
        let hold_exit_sender = servers
            .install_test_running_server_for_stop_recovery("server-1")
            .await;
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let backup_attempted = Arc::new(AtomicBool::new(false));
        let backup_attempted_in_closure = backup_attempted.clone();
        let restart_attempted = Arc::new(AtomicBool::new(false));
        let restart_attempted_in_closure = restart_attempted.clone();

        let stop_servers = servers.clone();
        let result = perform_automatic_backup_attempt(
            operation,
            move || async move {
                crate::commands::server::stop_server_with_guard_recovery(
                    &stop_servers,
                    "server-1",
                    None,
                )
                .await
            },
            || true,
            move || async move {
                backup_attempted_in_closure.store(true, Ordering::SeqCst);
                Ok(ManagedBackupArchive {
                    backup_name: "backup.zip".to_string(),
                    catalog_error: None,
                })
            },
            move |operation| async move {
                restart_attempted_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Ok(())
            },
        )
        .await;

        match result {
            AutomaticBackupAttempt::StopFailed { error, recovery } => {
                assert_eq!(error, "Server not found or not running");
                assert!(matches!(
                    recovery,
                    AutomaticBackupStopRecovery::StillRunning
                ));
            }
            AutomaticBackupAttempt::Backup { .. } => {
                panic!("a failed stop must not reach backup creation")
            }
        }
        assert!(!restart_attempted.load(Ordering::SeqCst));
        assert!(!backup_attempted.load(Ordering::SeqCst));
        assert!(servers.is_server_running("server-1").await);
        hold_exit_sender.remove_from_server_map(&servers).await;
        hold_exit_sender.finish_cleanup(&servers).await;
    }

    #[tokio::test]
    async fn cancelled_automatic_stop_recovery_skips_wait_and_restart() {
        let servers = ServerManager::default();
        let hold_exit_sender = servers
            .install_test_running_server_for_stop_recovery("server-1")
            .await;
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let cancellation = Arc::new(AtomicBool::new(true));
        let restart_attempted = Arc::new(AtomicBool::new(false));
        let restart_attempted_in_closure = restart_attempted.clone();
        let started_at = Instant::now();

        let stop_servers = servers.clone();
        let result = perform_automatic_backup_attempt(
            operation,
            move || async move {
                crate::commands::server::stop_server_with_guard_recovery(
                    &stop_servers,
                    "server-1",
                    Some(&cancellation),
                )
                .await
            },
            || true,
            || async {
                Ok(ManagedBackupArchive {
                    backup_name: "backup.zip".to_string(),
                    catalog_error: None,
                })
            },
            move |operation| async move {
                restart_attempted_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Ok(())
            },
        )
        .await;

        assert!(matches!(
            result,
            AutomaticBackupAttempt::StopFailed {
                error,
                recovery: AutomaticBackupStopRecovery::RestartSkipped,
            } if error == "Server not found or not running"
        ));
        assert!(started_at.elapsed() < Duration::from_millis(250));
        assert!(!restart_attempted.load(Ordering::SeqCst));
        hold_exit_sender.remove_from_server_map(&servers).await;
        hold_exit_sender.finish_cleanup(&servers).await;
    }

    #[test]
    fn automatic_backup_created_event_can_carry_catalog_warning() {
        let mut event = AutomationEvent::new("auto_backup_created", &server());
        event.catalog_error = Some("catalog update failed".to_string());

        assert_eq!(
            serde_json::to_value(event).expect("serialize automatic backup event"),
            serde_json::json!({
                "kind": "auto_backup_created",
                "serverId": "server-1",
                "serverName": "My Server",
                "catalogError": "catalog update failed"
            })
        );
    }

    #[tokio::test]
    async fn catalog_warning_skips_automatic_retention_for_that_run() {
        let catalog_error = Some("catalog rebuild failed".to_string());
        let retention_called = Arc::new(AtomicBool::new(false));
        let retention_called_in_closure = retention_called.clone();

        let result = apply_automatic_backup_retention_if_catalog_ready(
            catalog_error.as_deref(),
            move || async move {
                retention_called_in_closure.store(true, Ordering::SeqCst);
                Ok::<(), String>(())
            },
        )
        .await;

        assert!(result.is_none());
        assert!(!retention_called.load(Ordering::SeqCst));
    }

    #[test]
    fn disabling_backups_removes_only_that_server_schedule() {
        let mut state = AutomationState::default();
        let enabled = server();
        let mut disabled = server();
        disabled.id = "server-2".to_string();
        disabled.auto_backup_enabled = Some(false);
        reconcile_backup_schedule(&mut state, &enabled.id, &enabled, 1_000);
        reconcile_backup_schedule(&mut state, &disabled.id, &disabled, 1_000);

        assert!(state.backup_schedules.contains_key(&enabled.id));
        assert!(!state.backup_schedules.contains_key(&disabled.id));
    }

    #[tokio::test]
    async fn shutdown_waits_for_active_automation_work_and_blocks_future_ticks() {
        let manager = AutomationManager::default();
        let active_work = manager.active_work.clone().lock_owned().await;
        let shutdown_manager = manager.clone();
        let shutdown = tokio::spawn(async move {
            shutdown_manager.shutdown().await;
        });

        tokio::task::yield_now().await;
        assert!(manager.is_shutting_down());
        assert!(!shutdown.is_finished());

        drop(active_work);
        shutdown.await.expect("shutdown should complete");
        assert!(manager.is_shutting_down());
    }

    #[tokio::test]
    async fn shutdown_cancels_and_waits_for_inflight_automatic_backups() {
        let manager = AutomationManager::default();
        let cancellation = Arc::new(AtomicBool::new(false));
        manager
            .state
            .lock()
            .await
            .active_backups
            .insert("server-1".to_string(), cancellation.clone());

        let shutdown_manager = manager.clone();
        let shutdown = tokio::spawn(async move { shutdown_manager.shutdown().await });

        tokio::task::yield_now().await;
        assert!(cancellation.load(Ordering::SeqCst));
        assert!(!shutdown.is_finished());

        manager.state.lock().await.active_backups.remove("server-1");
        manager.backup_tasks_changed.notify_one();
        shutdown
            .await
            .expect("shutdown should wait for backup cleanup");
    }
}
