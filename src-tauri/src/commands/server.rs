use std::collections::HashMap;
use std::path::{Component, Path};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};

use super::eula::ensure_server_eula_accepted;
use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use super::java::{validate_java_executable_path, validate_jvm_extra_args};
use crate::metric_history::{should_poll_tps, MetricHistory, MetricHistorySnapshot};
use crate::server_stdout::route_stdout_line;
use crate::state::operation_manager::{OperationKind, ServerOperationManager};

const MAX_RUNNING_SERVERS: usize = 8;
const MIN_MEMORY_MB: u32 = 256;
const MAX_MEMORY_MB: u32 = 65_536;
const COMMAND_MIN_INTERVAL: Duration = Duration::from_millis(100);
const MAX_SERVER_ID_LENGTH: usize = 128;
const COMMAND_QUEUE_CAPACITY: usize = 256;
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

/// 実行中サーバーの情報
pub(crate) struct RunningServer {
    command_tx: mpsc::Sender<String>,
    pub(crate) pid: u32,
    pub(crate) generation: u64,
    pub(crate) metrics: Arc<Mutex<MetricHistory>>,
    // child は tokio::spawn 内で管理されるため、ここには保持しない
}

/// 全サーバーのプロセスを管理する State
#[derive(Default)]
pub struct ServerManager {
    pub servers: Arc<Mutex<HashMap<String, RunningServer>>>,
    next_generation: Arc<std::sync::atomic::AtomicU64>,
}

/// サーバーごとのコマンド送信間隔を制御する State
#[derive(Default)]
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

#[derive(serde::Serialize, Clone)]
struct ServerStatusPayload {
    #[serde(rename = "serverId")]
    server_id: String,
    generation: u64,
    status: String,
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

fn validate_server_id(server_id: &str) -> Result<String, String> {
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

/// サーバーを起動し、stdout/stderr をイベントストリーミングする
#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    java_path: String,
    memory: u32,
    jar_file: String,
    jvm_extra_args: Option<String>,
    software: String,
) -> Result<(), String> {
    let validated_server_id = validate_server_id(&server_id)?;
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
    let validated_java_path =
        validate_java_executable_path(&java_path, &app_data_dir.join("java"))?
            .to_string_lossy()
            .to_string();
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

    let _operation_guard = operations
        .acquire(&validated_server_id, OperationKind::Start)
        .await?;

    // 既に起動中か確認。spawnから登録までoperation guardを保持する。
    {
        let servers = state.servers.lock().await;
        if servers.contains_key(&validated_server_id) {
            return Err("Server is already running".into());
        }
        if servers.len() >= MAX_RUNNING_SERVERS {
            return Err("Too many running servers".into());
        }
    }

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
                pid,
                generation,
                metrics: metrics.clone(),
            },
        );
    }

    // ステータス通知: online
    let _ = app.emit(
        "server-status-change",
        ServerStatusPayload {
            server_id: validated_server_id.clone(),
            generation,
            status: "online".to_string(),
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
    let limiter_ref = limiter.last_command_at.clone();
    let generation_exit = generation;
    let pid_exit = pid;
    tokio::spawn(async move {
        let status = child.wait().await;
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
        let exit_status = match status {
            Ok(s) => {
                if s.success() {
                    "offline"
                } else {
                    "crashed"
                }
            }
            Err(_) => "crashed",
        };
        if should_remove {
            let _ = app_exit.emit(
                "server-status-change",
                ServerStatusPayload {
                    server_id: sid_exit,
                    generation: generation_exit,
                    status: exit_status.to_string(),
                },
            );
        }
    });

    Ok(())
}

/// stdin に "stop\n" を送信してサーバーを停止
#[tauri::command]
pub async fn stop_server(
    state: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<(), String> {
    let validated_server_id = validate_server_id(&server_id)?;
    let _operation_guard = operations
        .acquire(&validated_server_id, OperationKind::Stop)
        .await?;
    let command_tx = {
        let servers = state.servers.lock().await;
        servers
            .get(&validated_server_id)
            .map(|server| server.command_tx.clone())
            .ok_or_else(|| "Server not found or not running".to_string())?
    };

    command_tx
        .send("stop\n".to_string())
        .await
        .map_err(|_| "Server not found or not running".to_string())?;

    audit_server_action("stop_server", &validated_server_id);
    Ok(())
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
