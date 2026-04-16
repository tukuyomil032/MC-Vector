use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
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

fn validate_ngrok_path(ngrok_path: &str, allowed_dir: &std::path::Path) -> Result<String, String> {
    let normalized = ngrok_path.trim();
    if normalized.is_empty() {
        return Err("ngrok path is empty".to_string());
    }

    let canonical = std::path::Path::new(normalized)
        .canonicalize()
        .map_err(|e| format!("Invalid ngrok path: {}", e))?;

    if !canonical.is_file() {
        return Err("ngrok path is not a file".to_string());
    }

    if !canonical.starts_with(allowed_dir) {
        return Err("ngrok binary must be located in the app-managed ngrok directory.".to_string());
    }

    let file_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase())
        .ok_or_else(|| "Invalid ngrok path".to_string())?;
    if file_name != "ngrok" && file_name != "ngrok.exe" {
        return Err("ngrok binary name must be ngrok".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&canonical)
            .map_err(|e| format!("Failed to read ngrok file metadata: {}", e))?;
        let mode = metadata.permissions().mode();
        if mode & 0o111 == 0 {
            return Err("ngrok binary is not executable".to_string());
        }
    }

    Ok(canonical.to_string_lossy().to_string())
}

fn validate_protocol(protocol: &str) -> Result<String, String> {
    let normalized = protocol.trim().to_ascii_lowercase();
    if normalized == "tcp" {
        Ok(normalized)
    } else {
        Err("Unsupported ngrok protocol".to_string())
    }
}

fn extract_ngrok_url(log_line: &str) -> Option<String> {
    let marker = "url=";
    let start = log_line.find(marker)? + marker.len();
    let candidate = log_line[start..]
        .split_whitespace()
        .next()
        .map(|value| value.trim().trim_matches('"'))?;
    if candidate.is_empty() || candidate.len() > 2048 {
        return None;
    }
    if !candidate.starts_with("tcp://") {
        return None;
    }
    Some(candidate.to_string())
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
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let allowed_dir = app_data_dir.join("ngrok");

    let validated_ngrok_path = validate_ngrok_path(&ngrok_path, &allowed_dir)?;
    let validated_protocol = validate_protocol(&protocol)?;
    let normalized_token = authtoken.trim().to_string();
    if normalized_token.is_empty() {
        return Err("ngrok auth token is required".to_string());
    }

    // 既存プロセスがあれば停止
    {
        let mut proc = state.process.lock().await;
        if let Some(mut child) = proc.take() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
    }

    let port_value = port.to_string();
    let mut child = Command::new(&validated_ngrok_path)
        .args([&validated_protocol, &port_value, "--log", "stdout"])
        .env("NGROK_AUTHTOKEN", &normalized_token)
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
                if let Some(url) = extract_ngrok_url(&line) {
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
        child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait ngrok process: {}", e))?;
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

#[cfg(test)]
mod tests {
    use super::extract_ngrok_url;

    #[test]
    fn extract_ngrok_url_accepts_tcp_url() {
        let line = "lvl=info msg=tunnel url=tcp://1.tcp.ngrok.io:12345";
        assert_eq!(
            extract_ngrok_url(line).as_deref(),
            Some("tcp://1.tcp.ngrok.io:12345")
        );
    }

    #[test]
    fn extract_ngrok_url_rejects_non_tcp_scheme() {
        let line = "lvl=info msg=tunnel url=https://example.ngrok.io";
        assert!(extract_ngrok_url(line).is_none());
    }

    #[test]
    fn extract_ngrok_url_rejects_missing_marker() {
        assert!(extract_ngrok_url("lvl=info msg=no-url").is_none());
    }
}
