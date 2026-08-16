use futures_util::StreamExt;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const USER_AGENT: &str = "MC-Vector/2.0.57 (https://github.com/tukuyomil032/MC-Vector)";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS: usize = 2;

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

fn temporary_path(destination: &Path, attempt: usize) -> PathBuf {
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("download");
    destination.with_file_name(format!(
        ".{file_name}.part-{}-{attempt}",
        std::process::id()
    ))
}

async fn replace_destination(temp: &Path, destination: &Path) -> Result<(), String> {
    match tokio::fs::rename(temp, destination).await {
        Ok(()) => Ok(()),
        Err(rename_error) if destination.exists() => {
            tokio::fs::remove_file(destination)
                .await
                .map_err(|error| format!("Failed to replace existing destination: {error}"))?;
            tokio::fs::rename(temp, destination)
                .await
                .map_err(|error| format!("Failed to atomically move downloaded file: {error}; initial error: {rename_error}"))
        }
        Err(error) => Err(format!(
            "Failed to atomically move downloaded file: {error}"
        )),
    }
}

fn verify_sha256(digest: &[u8; 32], expected: &str) -> Result<(), String> {
    let normalized = expected.trim().to_ascii_lowercase();
    if normalized.len() != 64 || !normalized.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid expected SHA-256 checksum".to_string());
    }
    let actual = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != normalized {
        return Err(format!(
            "SHA-256 mismatch: expected {normalized}, got {actual}"
        ));
    }
    Ok(())
}

async fn download_once<F>(
    client: &Client,
    app: &AppHandle,
    url: &str,
    destination: &Path,
    checksum: Option<&str>,
    mut report_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("HTTP request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP error: {status}"));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|error| format!("Failed to create temporary file: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut downloaded = 0_u64;
    let mut hasher = Sha256::new();

    while let Some(chunk) = tokio::time::timeout(INACTIVITY_TIMEOUT, stream.next())
        .await
        .map_err(|_| "Download stalled while waiting for data".to_string())?
        .transpose()
        .map_err(|error| format!("Download stream error: {error}"))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Failed to write temporary file: {error}"))?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        report_progress(downloaded, total)?;
    }

    file.flush()
        .await
        .map_err(|error| format!("Failed to flush temporary file: {error}"))?;
    file.sync_all()
        .await
        .map_err(|error| format!("Failed to sync temporary file: {error}"))?;

    let digest: [u8; 32] = hasher.finalize().into();
    if let Some(expected) = checksum {
        verify_sha256(&digest, expected)?;
    }
    let _ = app;
    Ok(())
}

async fn download_with_retry<F>(
    app: &AppHandle,
    url: String,
    destination: PathBuf,
    checksum: Option<String>,
    mut report_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    let client = http_client()?;
    let mut last_error = "download failed".to_string();

    for attempt in 1..=MAX_ATTEMPTS {
        let temp = temporary_path(&destination, attempt);
        let result = download_once(
            &client,
            app,
            &url,
            &temp,
            checksum.as_deref(),
            &mut report_progress,
        )
        .await;
        match result {
            Ok(()) => {
                let rename_result = replace_destination(&temp, &destination).await;
                if rename_result.is_ok() {
                    return Ok(());
                }
                last_error = rename_result.unwrap_err();
            }
            Err(error) => last_error = error,
        }
        let _ = tokio::fs::remove_file(&temp).await;
        if attempt < MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(250 * attempt as u64)).await;
        }
    }

    Err(last_error)
}

#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    url: String,
    dest: String,
    event_id: String,
) -> Result<(), String> {
    let destination = PathBuf::from(dest);
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Failed to create directory: {error}"))?;
    }
    let event_name = format!("download-progress-{event_id}");
    download_with_retry(&app, url, destination, None, |downloaded, total| {
        app.emit(&event_name, DownloadProgress { downloaded, total })
            .map_err(|error| format!("Failed to emit download progress: {error}"))
    })
    .await
}

#[tauri::command]
pub async fn download_server_jar(
    app: AppHandle,
    url: String,
    dest_path: String,
    server_id: String,
    sha256: Option<String>,
) -> Result<(), String> {
    let destination = PathBuf::from(dest_path);
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Failed to create directory: {error}"))?;
    }
    let progress_app = app.clone();
    let progress_server_id = server_id.clone();
    download_with_retry(&app, url, destination, sha256, move |downloaded, total| {
        let progress = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0) as u32
        } else {
            0
        };
        progress_app
            .emit(
                "download-progress",
                serde_json::json!({
                    "serverId": progress_server_id,
                    "progress": progress,
                    "status": format!("Downloading... {progress}%"),
                }),
            )
            .map_err(|error| format!("Failed to emit download progress: {error}"))
    })
    .await?;

    app.emit(
        "download-progress",
        serde_json::json!({
            "serverId": server_id,
            "progress": 100,
            "status": "Download complete",
        }),
    )
    .map_err(|error| format!("Failed to emit download progress: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::verify_sha256;

    #[test]
    fn verifies_sha256_and_rejects_mismatch() {
        let digest = [0_u8; 32];
        let expected = "00".repeat(32);
        assert!(verify_sha256(&digest, &expected).is_ok());
        assert!(verify_sha256(&digest, &"11".repeat(32)).is_err());
    }
}
