use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct NgrokManager {
    pub process: Arc<Mutex<Option<tokio::process::Child>>>,
}

#[derive(serde::Serialize, Clone)]
struct NgrokStatusPayload {
    status: String,
    url: Option<String>,
    #[serde(rename = "serverId")]
    server_id: Option<String>,
}

#[tauri::command]
pub async fn start_ngrok(
    app: AppHandle,
    state: State<'_, NgrokManager>,
    ngrok_path: String,
    protocol: String,
    port: u16,
    authtoken: String,
    server_id: String,
) -> Result<(), String> {
    // 既存プロセスがあれば停止
    {
        let mut proc = state.process.lock().await;
        if let Some(mut child) = proc.take() {
            let _ = child.kill().await;
        }
    }

    let mut child = Command::new(&ngrok_path)
        .args([
            &protocol,
            &format!("{}", port),
            "--authtoken",
            &authtoken,
            "--log",
            "stdout",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ngrok: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture ngrok stdout".to_string())?;

    // プロセスを管理マップに保存
    {
        let mut proc = state.process.lock().await;
        *proc = Some(child);
    }

    let _ = app.emit(
        "ngrok-status-change",
        NgrokStatusPayload {
            status: "connecting".to_string(),
            url: None,
            server_id: Some(server_id.clone()),
        },
    );

    // stdout をパースしてトンネル URL を検出
    let app_clone = app.clone();
    let sid = server_id.clone();
    let process_ref = state.process.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            // ngrok ログを転送
            let _ = app_clone.emit(
                "ngrok-log",
                serde_json::json!({ "line": &line, "serverId": &sid }),
            );

            // トンネル URL を検出 (ngrok の stdout ログ形式)
            if line.contains("url=") {
                if let Some(url_start) = line.find("url=") {
                    let url = line[url_start + 4..].trim().to_string();
                    let _ = app_clone.emit(
                        "ngrok-status-change",
                        NgrokStatusPayload {
                            status: "connected".to_string(),
                            url: Some(url),
                            server_id: Some(sid.clone()),
                        },
                    );
                }
            }

            // 接続エラーを検出
            if line.contains("err=") || line.contains("lvl=eror") || line.contains("lvl=crit") {
                let _ = app_clone.emit(
                    "ngrok-status-change",
                    NgrokStatusPayload {
                        status: "error".to_string(),
                        url: None,
                        server_id: Some(sid.clone()),
                    },
                );
            }
        }

        // プロセスが終了した場合
        {
            let mut proc = process_ref.lock().await;
            *proc = None;
        }
        let _ = app_clone.emit(
            "ngrok-status-change",
            NgrokStatusPayload {
                status: "stopped".to_string(),
                url: None,
                server_id: Some(sid),
            },
        );
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_ngrok(state: State<'_, NgrokManager>) -> Result<(), String> {
    let mut proc = state.process.lock().await;
    if let Some(mut child) = proc.take() {
        child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill ngrok: {}", e))?;
        Ok(())
    } else {
        Err("ngrok is not running".into())
    }
}

#[tauri::command]
pub async fn download_ngrok(app: AppHandle, dest_dir: String) -> Result<String, String> {
    // OS/arch に応じた URL を決定
    let (url, file_name) =
        get_ngrok_download_url().ok_or_else(|| "Unsupported platform".to_string())?;

    let dest_archive = format!("{}/{}", &dest_dir, file_name);

    // ディレクトリ作成
    tokio::fs::create_dir_all(&dest_dir)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // ダウンロード
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&dest_archive)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = futures_util::StreamExt::fuse(response.bytes_stream());

    use futures_util::StreamExt as _;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        let progress = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0) as u32
        } else {
            0
        };
        let _ = app.emit(
            "ngrok-download-progress",
            serde_json::json!({ "progress": progress }),
        );
    }

    // ZIP を展開
    let dest = dest_dir.clone();
    let archive = dest_archive.clone();
    tokio::task::spawn_blocking(move || {
        let file =
            std::fs::File::open(&archive).map_err(|e| format!("Failed to open zip: {}", e))?;
        let mut zip =
            zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

        for i in 0..zip.len() {
            let mut file = zip
                .by_index(i)
                .map_err(|e| format!("Zip entry error: {}", e))?;
            let out_path = std::path::Path::new(&dest).join(file.mangled_name());

            if file.is_dir() {
                std::fs::create_dir_all(&out_path).ok();
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                let mut outfile = std::fs::File::create(&out_path)
                    .map_err(|e| format!("Failed to create: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract: {}", e))?;
            }
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))??;

    // アーカイブを削除
    let _ = tokio::fs::remove_file(&dest_archive).await;

    // macOS/Linux の場合、実行権限を付与
    let ngrok_binary = format!("{}/ngrok", &dest_dir);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&ngrok_binary) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&ngrok_binary, perms);
        }
    }

    Ok(ngrok_binary)
}

#[tauri::command]
pub async fn is_ngrok_installed(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

fn get_ngrok_download_url() -> Option<(String, String)> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let platform = match (os, arch) {
        ("macos", "aarch64") => "darwin-arm64",
        ("macos", "x86_64") => "darwin-amd64",
        ("windows", "x86_64") => "windows-amd64",
        ("linux", "x86_64") => "linux-amd64",
        ("linux", "aarch64") => "linux-arm64",
        _ => return None,
    };

    let url = format!(
        "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-{}.zip",
        platform
    );
    let file_name = format!("ngrok-v3-stable-{}.zip", platform);

    Some((url, file_name))
}
