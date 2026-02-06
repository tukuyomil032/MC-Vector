use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

/// 実行中サーバーの情報
pub(crate) struct RunningServer {
    stdin: tokio::process::ChildStdin,
    pid: u32,
    // child は tokio::spawn 内で管理されるため、ここには保持しない
}

/// 全サーバーのプロセスを管理する State
#[derive(Default)]
pub struct ServerManager {
    pub servers: Arc<Mutex<HashMap<String, RunningServer>>>,
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

/// サーバーを起動し、stdout/stderr をイベントストリーミングする
#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
    server_id: String,
    java_path: String,
    server_path: String,
    memory: u32,
    jar_file: String,
) -> Result<(), String> {
    // 既に起動中か確認
    {
        let servers = state.servers.lock().await;
        if servers.contains_key(&server_id) {
            return Err("Server is already running".into());
        }
    }

    let mut child = Command::new(&java_path)
        .args([
            &format!("-Xmx{}M", memory),
            &format!("-Xms{}M", memory),
            "-jar",
            &jar_file,
            "nogui",
        ])
        .current_dir(&server_path)
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

    // サーバーを管理マップに登録
    {
        let mut servers = state.servers.lock().await;
        servers.insert(server_id.clone(), RunningServer { stdin, pid });
    }

    // ステータス通知: online
    let _ = app.emit(
        "server-status-change",
        ServerStatusPayload {
            server_id: server_id.clone(),
            status: "online".to_string(),
        },
    );

    // stdout ストリーミング
    let app_stdout = app.clone();
    let sid_stdout = server_id.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_stdout.emit(
                "server-log",
                ServerLogPayload {
                    server_id: sid_stdout.clone(),
                    line,
                    stream: "stdout".to_string(),
                },
            );
        }
    });

    // stderr ストリーミング (エラーのみを別イベント名で)
    let _app_stderr = app.clone();
    let _sid_stderr = server_id.clone();
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
    let sid_stats = server_id.clone();
    let servers_stats_ref = state.servers.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            // サーバーが管理マップに存在するか確認
            {
                let servers = servers_stats_ref.lock().await;
                if !servers.contains_key(&sid_stats) {
                    break;
                }
            }
            let mut sys = sysinfo::System::new();
            let spid = sysinfo::Pid::from_u32(pid);
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[spid]), true);
            if let Some(process) = sys.process(spid) {
                let _ = app_stats.emit(
                    "server-stats",
                    serde_json::json!({
                        "serverId": sid_stats,
                        "cpu": process.cpu_usage(),
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
    let sid_exit = server_id.clone();
    let servers_ref = state.servers.clone();
    tokio::spawn(async move {
        let status = child.wait().await;
        // 管理マップから削除
        {
            let mut servers = servers_ref.lock().await;
            servers.remove(&sid_exit);
        }
        let exit_status = match status {
            Ok(s) => {
                if s.success() {
                    "offline"
                } else {
                    "offline"
                }
            }
            Err(_) => "offline",
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
    let mut servers = state.servers.lock().await;
    if let Some(server) = servers.get_mut(&server_id) {
        server
            .stdin
            .write_all(b"stop\n")
            .await
            .map_err(|e| format!("Failed to send stop command: {}", e))?;
        server
            .stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        Ok(())
    } else {
        Err("Server not found or not running".into())
    }
}

/// 任意のコマンドを stdin に送信
#[tauri::command]
pub async fn send_command(
    state: State<'_, ServerManager>,
    server_id: String,
    command: String,
) -> Result<(), String> {
    let mut servers = state.servers.lock().await;
    if let Some(server) = servers.get_mut(&server_id) {
        server
            .stdin
            .write_all(format!("{}\n", command).as_bytes())
            .await
            .map_err(|e| format!("Failed to send command: {}", e))?;
        server
            .stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        Ok(())
    } else {
        Err("Server not found or not running".into())
    }
}

/// サーバーが実行中かどうかを返す
#[tauri::command]
pub async fn is_server_running(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<bool, String> {
    let servers = state.servers.lock().await;
    Ok(servers.contains_key(&server_id))
}

/// サーバーの PID を返す
#[tauri::command]
pub async fn get_server_pid(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<u32, String> {
    let servers = state.servers.lock().await;
    servers
        .get(&server_id)
        .map(|s| s.pid)
        .ok_or_else(|| "Server not found or not running".into())
}
