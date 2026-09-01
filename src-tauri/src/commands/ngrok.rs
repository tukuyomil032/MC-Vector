use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

const MAX_NGROK_ARCHIVE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_NGROK_ARCHIVE_ENTRIES: usize = 32;
const MAX_NGROK_EXTRACTED_BYTES: u64 = 200 * 1024 * 1024;
const MAX_NGROK_ENTRY_NAME_BYTES: usize = 255;
const MAX_NGROK_ENTRY_DEPTH: usize = 32;
const MAX_NGROK_COMPRESSION_RATIO: u64 = 100;
const COPY_BUFFER_SIZE: usize = 64 * 1024;

struct DownloadTempGuard {
    path: PathBuf,
    armed: bool,
}

impl DownloadTempGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for DownloadTempGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}
const NGROK_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);
const NGROK_INACTIVITY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

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

fn validate_ngrok_path(
    ngrok_path: &std::path::Path,
    allowed_dir: &std::path::Path,
) -> Result<String, String> {
    if ngrok_path.as_os_str().is_empty() {
        return Err("ngrok path is empty".to_string());
    }

    let metadata =
        std::fs::symlink_metadata(ngrok_path).map_err(|e| format!("Invalid ngrok path: {}", e))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("ngrok binary must not be a symbolic link or reparse point".to_string());
    }

    let canonical = ngrok_path
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

fn safe_ngrok_entry_name(name: &str) -> Result<PathBuf, String> {
    let normalized = name.trim_end_matches('/');
    if normalized.is_empty()
        || normalized.len() > MAX_NGROK_ENTRY_NAME_BYTES
        || normalized.contains('\\')
        || normalized.contains('\0')
        || normalized.contains(':')
    {
        return Err("ngrok archive contains an unsafe entry name".to_string());
    }
    let path = Path::new(normalized);
    let mut depth = 0;
    for component in path.components() {
        let Component::Normal(component) = component else {
            return Err("ngrok archive entry must be a strict relative path".to_string());
        };
        if component.to_string_lossy().len() > MAX_NGROK_ENTRY_NAME_BYTES {
            return Err("ngrok archive entry component is too long".to_string());
        }
        depth += 1;
    }
    if depth == 0 || depth > MAX_NGROK_ENTRY_DEPTH {
        return Err("ngrok archive entry depth exceeds the limit".to_string());
    }
    Ok(path.to_path_buf())
}

fn ensure_ngrok_directory(root: &Path, relative: Option<&Path>) -> Result<PathBuf, String> {
    let root_metadata = std::fs::symlink_metadata(root)
        .map_err(|error| format!("Failed to inspect ngrok destination: {error}"))?;
    if is_link_or_reparse_point(&root_metadata) || !root_metadata.is_dir() {
        return Err("ngrok destination root must be a real directory".to_string());
    }
    let mut current = root.to_path_buf();
    if let Some(relative) = relative {
        for component in relative.components() {
            let Component::Normal(component) = component else {
                return Err("ngrok destination path is not relative".to_string());
            };
            current.push(component);
            match std::fs::symlink_metadata(&current) {
                Ok(metadata) if is_link_or_reparse_point(&metadata) => {
                    return Err(
                        "ngrok destination contains a symbolic link or reparse point".to_string(),
                    );
                }
                Ok(metadata) if !metadata.is_dir() => {
                    return Err("ngrok destination component is not a directory".to_string());
                }
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    std::fs::create_dir(&current)
                        .map_err(|error| format!("Failed to create ngrok destination: {error}"))?;
                }
                Err(error) => return Err(format!("Failed to inspect ngrok destination: {error}")),
            }
        }
    }
    Ok(current)
}

fn copy_ngrok_entry<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    expected_size: u64,
    total: &mut u64,
) -> Result<(), String> {
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    let mut copied = 0_u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read ngrok archive entry: {error}"))?;
        if read == 0 {
            break;
        }
        copied = copied
            .checked_add(read as u64)
            .ok_or_else(|| "ngrok entry size overflow".to_string())?;
        *total = total
            .checked_add(read as u64)
            .ok_or_else(|| "ngrok archive size overflow".to_string())?;
        if copied > expected_size || *total > MAX_NGROK_EXTRACTED_BYTES {
            return Err("ngrok archive expands beyond the extraction limit".to_string());
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|error| format!("Failed to extract ngrok archive entry: {error}"))?;
    }
    if copied != expected_size {
        return Err("ngrok archive entry size changed while extracting".to_string());
    }
    Ok(())
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

    let validated_ngrok_path = validate_ngrok_path(
        &allowed_dir.join(if cfg!(windows) { "ngrok.exe" } else { "ngrok" }),
        &allowed_dir,
    )?;
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
pub async fn download_ngrok(app: AppHandle) -> Result<String, String> {
    // OS/arch に応じた URL を決定
    let (url, file_name) =
        get_ngrok_download_url().ok_or_else(|| "Unsupported platform".to_string())?;
    let url = validate_ngrok_download_url(&url)?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let managed_dir = app_data_dir.join("ngrok");
    if let Ok(metadata) = std::fs::symlink_metadata(&managed_dir) {
        if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
            return Err("Managed ngrok directory is not a real directory".to_string());
        }
    }
    let dest_dir = managed_dir.to_string_lossy().to_string();
    let dest_archive = managed_dir.join(format!(".{file_name}"));

    // ディレクトリ作成
    tokio::fs::create_dir_all(&dest_dir)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // ダウンロード
    let client = reqwest::Client::builder()
        .connect_timeout(NGROK_CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Failed to create ngrok download client: {e}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);
    if total > MAX_NGROK_ARCHIVE_BYTES {
        return Err("ngrok archive exceeds the download size limit".to_string());
    }
    if tokio::fs::symlink_metadata(&dest_archive).await.is_ok() {
        return Err("ngrok temporary archive already exists".to_string());
    }
    let mut file = tokio::fs::File::create(&dest_archive)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;
    let mut archive_guard = DownloadTempGuard::new(dest_archive.clone());

    let mut downloaded: u64 = 0;
    let mut stream = futures_util::StreamExt::fuse(response.bytes_stream());

    use futures_util::StreamExt as _;
    while let Some(chunk) = tokio::time::timeout(NGROK_INACTIVITY_TIMEOUT, stream.next())
        .await
        .map_err(|_| "ngrok download stalled while waiting for data".to_string())?
    {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        if downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "ngrok download size overflow".to_string())?
            > MAX_NGROK_ARCHIVE_BYTES
        {
            return Err("ngrok archive exceeds the download size limit".to_string());
        }
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
    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
    file.sync_all()
        .await
        .map_err(|e| format!("Sync error: {}", e))?;

    // ZIP を展開
    let dest = managed_dir.clone();
    let archive = dest_archive.clone();
    let extraction_result = tokio::task::spawn_blocking(move || {
        let file =
            std::fs::File::open(&archive).map_err(|e| format!("Failed to open zip: {}", e))?;
        let compressed_size = file
            .metadata()
            .map_err(|e| format!("Failed to inspect zip: {}", e))?
            .len();
        if compressed_size > MAX_NGROK_ARCHIVE_BYTES {
            return Err("ngrok archive exceeds the download size limit".to_string());
        }
        let mut zip =
            zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

        if zip.len() > MAX_NGROK_ARCHIVE_ENTRIES {
            return Err("ngrok archive contains too many entries".to_string());
        }
        let mut declared_bytes = 0_u64;
        let mut paths = HashSet::with_capacity(zip.len());
        for i in 0..zip.len() {
            let file = zip
                .by_index(i)
                .map_err(|e| format!("Zip entry error: {}", e))?;
            let relative = safe_ngrok_entry_name(file.name())?;
            if file.is_symlink()
                || paths.iter().any(|existing: &PathBuf| {
                    relative.starts_with(existing) || existing.starts_with(&relative)
                })
            {
                return Err("ngrok archive contains a link or colliding entry".to_string());
            }
            paths.insert(relative);
            declared_bytes = declared_bytes
                .checked_add(file.size())
                .ok_or_else(|| "ngrok archive size overflow".to_string())?;
            if declared_bytes > MAX_NGROK_EXTRACTED_BYTES {
                return Err("ngrok archive expands beyond the extraction limit".to_string());
            }
        }
        if declared_bytes > compressed_size.saturating_mul(MAX_NGROK_COMPRESSION_RATIO) {
            return Err("ngrok archive compression ratio exceeds the limit".to_string());
        }

        let mut extracted_bytes = 0_u64;
        for i in 0..zip.len() {
            let mut file = zip
                .by_index(i)
                .map_err(|e| format!("Zip entry error: {}", e))?;
            let relative = safe_ngrok_entry_name(file.name())?;
            if file.is_dir() {
                ensure_ngrok_directory(&dest, Some(&relative))?;
                continue;
            }
            let parent = ensure_ngrok_directory(&dest, relative.parent())?;
            let output_path = parent.join(
                relative
                    .file_name()
                    .ok_or_else(|| "ngrok archive entry has no file name".to_string())?,
            );
            if let Ok(metadata) = std::fs::symlink_metadata(&output_path) {
                if is_link_or_reparse_point(&metadata) || metadata.is_dir() {
                    return Err("ngrok archive destination is unsafe".to_string());
                }
            }
            let mut outfile = std::fs::File::create(&output_path)
                .map_err(|e| format!("Failed to create: {}", e))?;
            let expected_size = file.size();
            copy_ngrok_entry(&mut file, &mut outfile, expected_size, &mut extracted_bytes)?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?;

    // アーカイブを削除
    if extraction_result.is_ok() {
        if tokio::fs::remove_file(&dest_archive).await.is_ok() {
            archive_guard.disarm();
        }
    }
    extraction_result?;

    // macOS/Linux の場合、実行権限を付与
    let ngrok_binary = managed_dir.join(if cfg!(windows) { "ngrok.exe" } else { "ngrok" });
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&ngrok_binary) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&ngrok_binary, perms);
        }
    }

    validate_ngrok_path(&ngrok_binary, &managed_dir)
}

#[tauri::command]
pub async fn is_ngrok_installed(app: AppHandle) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let binary = app_data_dir
        .join("ngrok")
        .join(if cfg!(windows) { "ngrok.exe" } else { "ngrok" });
    Ok(validate_ngrok_path(&binary, &app_data_dir.join("ngrok")).is_ok())
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

fn validate_ngrok_download_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|error| format!("Invalid ngrok download URL: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "ngrok download URL host is missing".to_string())?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.fragment().is_some()
        || host.parse::<std::net::IpAddr>().is_ok()
        || !host.eq_ignore_ascii_case("bin.equinox.io")
    {
        return Err("ngrok download URL is not an approved HTTPS URL".to_string());
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::{extract_ngrok_url, MAX_NGROK_ARCHIVE_BYTES};

    #[test]
    fn extract_ngrok_url_accepts_tcp_url() {
        let line = "lvl=info msg=tunnel url=tcp://1.tcp.ngrok.io:12345";
        assert_eq!(
            extract_ngrok_url(line).as_deref(),
            Some("tcp://1.tcp.ngrok.io:12345")
        );
    }

    #[test]
    fn extract_ngrok_url_trims_surrounding_quotes() {
        let line = "lvl=info msg=tunnel url=\"tcp://1.tcp.ngrok.io:12345\"";
        assert_eq!(
            extract_ngrok_url(line).as_deref(),
            Some("tcp://1.tcp.ngrok.io:12345")
        );
    }

    #[test]
    fn extract_ngrok_url_rejects_url_over_2048_characters() {
        let oversized = format!("tcp://{}", "a".repeat(2050));
        let line = format!("lvl=info msg=tunnel url={oversized}");
        assert!(extract_ngrok_url(&line).is_none());
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

    #[test]
    fn ngrok_download_limit_is_reasonable_and_fixed() {
        assert_eq!(MAX_NGROK_ARCHIVE_BYTES, 100 * 1024 * 1024);
    }
}
