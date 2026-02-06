use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(serde::Serialize, Clone)]
struct BackupProgress {
    #[serde(rename = "serverId")]
    server_id: String,
    progress: f32,
}

#[tauri::command]
pub async fn create_backup(
    app: AppHandle,
    server_id: String,
    source_dir: String,
    backup_dir: String,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
) -> Result<String, String> {
    let source = source_dir.clone();
    let backup = backup_dir.clone();
    let sid = server_id.clone();
    let app_clone = app.clone();

    tokio::task::spawn_blocking(move || {
        let source_path = Path::new(&source);
        if !source_path.exists() {
            return Err("Source directory does not exist".to_string());
        }

        // バックアップディレクトリを作成
        let backup_path = Path::new(&backup);
        std::fs::create_dir_all(backup_path)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;

        // フロントエンドから渡された名前を使用
        let zip_name = if sid.ends_with(".zip") {
            sid.clone()
        } else {
            format!("{}.zip", sid)
        };
        let zip_path = backup_path.join(&zip_name);

        // 圧縮レベル設定
        let level = compression_level.unwrap_or(5);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .compression_level(Some(level));

        // ファイル一覧を収集 (選択パスがあればフィルタ)
        let entries = if let Some(ref selected) = sources {
            let mut files = Vec::new();
            for rel in selected {
                let full_path = source_path.join(rel);
                if full_path.is_dir() {
                    files.push(full_path.clone());
                    files.extend(
                        collect_files(&full_path)
                            .map_err(|e| format!("Failed to collect files: {}", e))?,
                    );
                } else if full_path.exists() {
                    files.push(full_path);
                }
            }
            files
        } else {
            collect_files(source_path).map_err(|e| format!("Failed to collect files: {}", e))?
        };

        let total = entries.len() as f32;

        let file =
            File::create(&zip_path).map_err(|e| format!("Failed to create zip file: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);

        for (i, entry) in entries.iter().enumerate() {
            let rel_path = entry
                .strip_prefix(source_path)
                .unwrap_or(entry)
                .to_string_lossy()
                .replace('\\', "/");

            if entry.is_dir() {
                zip.add_directory(&rel_path, options)
                    .map_err(|e| format!("Failed to add directory: {}", e))?;
            } else {
                zip.start_file(&rel_path, options)
                    .map_err(|e| format!("Failed to start file in zip: {}", e))?;
                let mut f = File::open(entry).map_err(|e| format!("Failed to open file: {}", e))?;
                let mut buf = Vec::new();
                f.read_to_end(&mut buf)
                    .map_err(|e| format!("Failed to read file: {}", e))?;
                zip.write_all(&buf)
                    .map_err(|e| format!("Failed to write to zip: {}", e))?;
            }

            let progress = ((i + 1) as f32 / total) * 100.0;
            let _ = app_clone.emit(
                "backup-progress",
                BackupProgress {
                    server_id: sid.clone(),
                    progress,
                },
            );
        }

        zip.finish()
            .map_err(|e| format!("Failed to finish zip: {}", e))?;

        Ok(zip_name)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn restore_backup(
    _app: AppHandle,
    backup_path: String,
    target_dir: String,
) -> Result<(), String> {
    let backup = backup_path.clone();
    let target = target_dir.clone();

    tokio::task::spawn_blocking(move || {
        let file = File::open(&backup).map_err(|e| format!("Failed to open backup: {}", e))?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

        let target_path = Path::new(&target);
        std::fs::create_dir_all(target_path)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;

            let out_path = target_path.join(file.mangled_name());

            if file.is_dir() {
                std::fs::create_dir_all(&out_path)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir: {}", e))?;
                }
                let mut outfile =
                    File::create(&out_path).map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn compress_item(sources: Vec<String>, dest: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let zip_path = dest;

        let file = File::create(&zip_path).map_err(|e| format!("Failed to create zip: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);

        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for source in &sources {
            let source_path = Path::new(source);
            if source_path.is_dir() {
                let entries = collect_files(source_path)
                    .map_err(|e| format!("Failed to collect files: {}", e))?;
                let base = source_path.parent().unwrap_or(source_path);
                for entry in &entries {
                    let rel_path = entry
                        .strip_prefix(base)
                        .unwrap_or(entry)
                        .to_string_lossy()
                        .replace('\\', "/");
                    if entry.is_dir() {
                        zip.add_directory(&rel_path, options)
                            .map_err(|e| format!("Zip error: {}", e))?;
                    } else {
                        zip.start_file(&rel_path, options)
                            .map_err(|e| format!("Zip error: {}", e))?;
                        let mut f =
                            File::open(entry).map_err(|e| format!("Failed to open: {}", e))?;
                        let mut buf = Vec::new();
                        f.read_to_end(&mut buf)
                            .map_err(|e| format!("Failed to read: {}", e))?;
                        zip.write_all(&buf)
                            .map_err(|e| format!("Failed to write: {}", e))?;
                    }
                }
            } else {
                let file_name = source_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                zip.start_file(&file_name, options)
                    .map_err(|e| format!("Zip error: {}", e))?;
                let mut f =
                    File::open(source_path).map_err(|e| format!("Failed to open: {}", e))?;
                let mut buf = Vec::new();
                f.read_to_end(&mut buf)
                    .map_err(|e| format!("Failed to read: {}", e))?;
                zip.write_all(&buf)
                    .map_err(|e| format!("Failed to write: {}", e))?;
            }
        }

        zip.finish()
            .map_err(|e| format!("Failed to finish zip: {}", e))?;
        Ok(zip_path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn extract_item(archive: String, dest: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let file = File::open(&archive).map_err(|e| format!("Failed to open archive: {}", e))?;
        let mut zip_archive =
            zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

        let dest_path = Path::new(&dest);
        std::fs::create_dir_all(dest_path)
            .map_err(|e| format!("Failed to create destination: {}", e))?;

        for i in 0..zip_archive.len() {
            let mut file = zip_archive
                .by_index(i)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;

            let out_path = dest_path.join(file.mangled_name());

            if file.is_dir() {
                std::fs::create_dir_all(&out_path)
                    .map_err(|e| format!("Failed to create dir: {}", e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent: {}", e))?;
                }
                let mut outfile =
                    File::create(&out_path).map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract: {}", e))?;
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// ディレクトリ内のファイルを再帰的に収集
fn collect_files(dir: &Path) -> std::io::Result<Vec<std::path::PathBuf>> {
    let mut files = Vec::new();
    if dir.is_dir() {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                files.push(path.clone());
                files.extend(collect_files(&path)?);
            } else {
                files.push(path);
            }
        }
    }
    Ok(files)
}
