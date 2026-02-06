use futures_util::StreamExt;
use reqwest::Client;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn download_java(
    app: AppHandle,
    download_url: String,
    install_dir: String,
    archive_type: String, // "tar.gz" or "zip"
) -> Result<String, String> {
    // 1. ダウンロード
    let client = Client::new();
    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let temp_file = format!("{}/java_download_temp.{}", &install_dir, &archive_type);

    // インストールディレクトリを作成
    tokio::fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let mut file = tokio::fs::File::create(&temp_file)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        let progress = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0) as u32
        } else {
            0
        };
        let _ = app.emit(
            "java-download-progress",
            serde_json::json!({ "progress": progress }),
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
    drop(file);

    // 2. 展開
    let install = install_dir.clone();
    let temp = temp_file.clone();
    let atype = archive_type.clone();

    let java_home = tokio::task::spawn_blocking(move || {
        if atype == "tar.gz" {
            extract_tar_gz(&temp, &install)
        } else {
            extract_zip_archive(&temp, &install)
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // 一時ファイル削除
    let _ = tokio::fs::remove_file(&temp_file).await;

    Ok(java_home)
}

fn extract_tar_gz(archive_path: &str, dest_dir: &str) -> Result<String, String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {}", e))?;
    let gz = GzDecoder::new(file);
    let mut archive = Archive::new(gz);

    archive
        .unpack(dest_dir)
        .map_err(|e| format!("Failed to extract tar.gz: {}", e))?;

    // 展開されたディレクトリを探す (通常は jdk-* というディレクトリ)
    find_java_home(dest_dir)
}

fn extract_zip_archive(archive_path: &str, dest_dir: &str) -> Result<String, String> {
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

    let dest = Path::new(dest_dir);
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry error: {}", e))?;
        let out_path = dest.join(file.mangled_name());

        if file.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent: {}", e))?;
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract: {}", e))?;
        }
    }

    find_java_home(dest_dir)
}

fn find_java_home(dir: &str) -> Result<String, String> {
    let path = Path::new(dir);
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("jdk") || name.contains("java") || name.contains("temurin") {
                    let contents_home = entry_path.join("Contents").join("Home");
                    if contents_home.exists() {
                        return Ok(contents_home.to_string_lossy().to_string());
                    }
                    return Ok(entry_path.to_string_lossy().to_string());
                }
            }
        }
    }
    Ok(dir.to_string())
}
