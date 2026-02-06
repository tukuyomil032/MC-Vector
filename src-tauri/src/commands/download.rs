use futures_util::StreamExt;
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    url: String,
    dest: String,
    event_id: String,
) -> Result<(), String> {
    let client = Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write file: {}", e))?;
        downloaded += chunk.len() as u64;

        let _ = app.emit(
            &format!("download-progress-{}", event_id),
            DownloadProgress { downloaded, total },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn download_server_jar(
    app: AppHandle,
    url: String,
    dest_path: String,
    server_id: String,
) -> Result<(), String> {
    let client = Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&dest_path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let mut file = tokio::fs::File::create(&dest_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write file: {}", e))?;
        downloaded += chunk.len() as u64;

        let progress = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0) as u32
        } else {
            0
        };

        let _ = app.emit(
            "download-progress",
            serde_json::json!({
                "serverId": server_id,
                "progress": progress,
                "status": format!("Downloading... {}%", progress),
            }),
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "serverId": server_id,
            "progress": 100,
            "status": "Download complete",
        }),
    );

    Ok(())
}
