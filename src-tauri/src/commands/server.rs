use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};

const MAX_RUNNING_SERVERS: usize = 8;
const MIN_MEMORY_MB: u32 = 256;
const MAX_MEMORY_MB: u32 = 65_536;
const COMMAND_MIN_INTERVAL: Duration = Duration::from_millis(100);
const MAX_SERVER_ID_LENGTH: usize = 128;
const COMMAND_QUEUE_CAPACITY: usize = 256;
const LOG_BUFFER_CAPACITY: usize = 4096;
const LOG_EMIT_INTERVAL: Duration = Duration::from_millis(50);
const LOG_EMIT_LINES_PER_TICK: usize = 200;

/// 実行中サーバーの情報
pub(crate) struct RunningServer {
    command_tx: mpsc::Sender<String>,
    pid: u32,
    // child は tokio::spawn 内で管理されるため、ここには保持しない
}

/// 全サーバーのプロセスを管理する State
#[derive(Default)]
pub struct ServerManager {
    pub servers: Arc<Mutex<HashMap<String, RunningServer>>>,
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
    line: String,
    stream: String,
}

#[derive(serde::Serialize, Clone)]
struct ServerStatusPayload {
    #[serde(rename = "serverId")]
    server_id: String,
    status: String,
}

fn validate_java_path(java_path: &str) -> Result<String, String> {
    let normalized = java_path.trim();
    if normalized.is_empty() {
        return Err("Java path is empty".to_string());
    }

    let java_name = Path::new(normalized)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase())
        .ok_or_else(|| "Invalid java path".to_string())?;

    if java_name != "java" && java_name != "java.exe" {
        return Err("Java path must point to java executable".to_string());
    }

    if normalized.contains('/') || normalized.contains('\\') {
        let canonical = PathBuf::from(normalized)
            .canonicalize()
            .map_err(|e| format!("Invalid java path: {}", e))?;
        if !canonical.is_file() {
            return Err("Java path is not a file".to_string());
        }
        return Ok(canonical.to_string_lossy().to_string());
    }

    Ok(normalized.to_string())
}

fn validate_server_dir(server_path: &str) -> Result<PathBuf, String> {
    let canonical = PathBuf::from(server_path)
        .canonicalize()
        .map_err(|e| format!("Invalid server path: {}", e))?;
    if !canonical.is_dir() {
        return Err("Server path is not a directory".to_string());
    }
    Ok(canonical)
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
    server_id: String,
    java_path: String,
    server_path: String,
    memory: u32,
    jar_file: String,
) -> Result<(), String> {
    let validated_server_id = validate_server_id(&server_id)?;
    let validated_java_path = validate_java_path(&java_path)?;
    let validated_server_dir = validate_server_dir(&server_path)?;
    let validated_jar_file = validate_jar_file_name(&jar_file)?;
    if !(MIN_MEMORY_MB..=MAX_MEMORY_MB).contains(&memory) {
        return Err(format!(
            "Memory must be between {}MB and {}MB",
            MIN_MEMORY_MB, MAX_MEMORY_MB
        ));
    }

    let jar_path = validated_server_dir.join(&validated_jar_file);
    if !jar_path.exists() || !jar_path.is_file() {
        return Err(format!("Jar file not found: {}", validated_jar_file));
    }

    // 既に起動中か確認
    {
        let servers = state.servers.lock().await;
        if servers.contains_key(&validated_server_id) {
            return Err("Server is already running".into());
        }
        if servers.len() >= MAX_RUNNING_SERVERS {
            return Err("Too many running servers".into());
        }
    }

    let mut child = Command::new(&validated_java_path)
        .args([
            &format!("-Xmx{}M", memory),
            &format!("-Xms{}M", memory),
            "-jar",
            &validated_jar_file,
            "nogui",
        ])
        .current_dir(&validated_server_dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    let pid = child.id().unwrap_or(0);

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
        servers.insert(validated_server_id.clone(), RunningServer { command_tx, pid });
    }

    // ステータス通知: online
    let _ = app.emit(
        "server-status-change",
        ServerStatusPayload {
            server_id: validated_server_id.clone(),
            status: "online".to_string(),
        },
    );
    audit_server_action("start_server", &validated_server_id);

    // stdout ストリーミング (Rust 側でバッファ上限・送信レートを制御)
    let (stdout_log_tx, mut stdout_log_rx) = mpsc::channel::<String>(LOG_BUFFER_CAPACITY);
    let app_stdout_emit = app.clone();
    let sid_stdout_emit = validated_server_id.clone();
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
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut dropped_lines = 0usize;
        while let Ok(Some(line)) = lines.next_line().await {
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

    // プロセス統計を定期的に emit (CPU / メモリ)
    let app_stats = app.clone();
    let sid_stats = validated_server_id.clone();
    let servers_stats_ref = state.servers.clone();
    tokio::spawn(async move {
        let mut sys = sysinfo::System::new_all();
        let spid = sysinfo::Pid::from_u32(pid);
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            // サーバーが管理マップに存在するか確認
            {
                let servers = servers_stats_ref.lock().await;
                if !servers.contains_key(&sid_stats) {
                    break;
                }
            }
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);
            if let Some(process) = sys.process(spid) {
                let raw_cpu = process.cpu_usage();
                let cpu_usage = if raw_cpu.is_finite() {
                    raw_cpu.max(0.0)
                } else {
                    0.0
                };

                let _ = app_stats.emit(
                    "server-stats",
                    serde_json::json!({
                        "serverId": sid_stats,
                        "cpu": cpu_usage,
                        "memory": process.memory(),
                    }),
                );
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
    tokio::spawn(async move {
        let status = child.wait().await;
        // 管理マップから削除
        {
            let mut servers = servers_ref.lock().await;
            servers.remove(&sid_exit);
        }
        {
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
        let _ = app_exit.emit(
            "server-status-change",
            ServerStatusPayload {
                server_id: sid_exit,
                status: exit_status.to_string(),
            },
        );
    });

    Ok(())
}

/// stdin に "stop\n" を送信してサーバーを停止
#[tauri::command]
pub async fn stop_server(state: State<'_, ServerManager>, server_id: String) -> Result<(), String> {
    let validated_server_id = validate_server_id(&server_id)?;
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
