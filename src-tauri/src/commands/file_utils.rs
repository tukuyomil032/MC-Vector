use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
pub struct FileEntryInfo {
    pub name: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub size: u64,
    /// Unix timestamp in seconds (modification time)
    pub modified: u64,
}

const ALLOWED_APPDATA_SUBDIRS: [&str; 3] = ["servers", "java", "ngrok"];

fn is_windows_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() == 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/'
}

fn is_absolute_path(path: &str) -> bool {
    if path.starts_with('/') {
        return true;
    }
    let bytes = path.as_bytes();
    bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/'
}

fn has_traversal_segment(path: &str) -> bool {
    path == ".." || path.starts_with("../") || path.contains("/../") || path.ends_with("/..")
}

fn normalize_path_string(input: &str) -> String {
    let mut normalized = String::with_capacity(input.len());
    let mut previous_was_slash = false;
    for ch in input.chars() {
        let current = if ch == '\\' { '/' } else { ch };
        if current == '/' {
            if previous_was_slash {
                continue;
            }
            previous_was_slash = true;
        } else {
            previous_was_slash = false;
        }
        normalized.push(current);
    }

    if normalized.len() > 1 && normalized.ends_with('/') && !is_windows_drive_root(&normalized) {
        normalized.pop();
    }

    normalized
}

fn normalize_managed_input_path(app: &AppHandle, path: &str) -> Result<String, String> {
    let normalized = normalize_path_string(path.trim());
    if normalized.is_empty() || normalized.contains('\0') {
        return Err("Invalid path".to_string());
    }
    if has_traversal_segment(&normalized) {
        return Err("Path traversal is not allowed".to_string());
    }

    if is_absolute_path(&normalized) {
        return Ok(normalized);
    }

    let mut relative_path = normalized.as_str();
    if let Some(rest) = relative_path.strip_prefix('.') {
        if rest.starts_with('/') {
            relative_path = rest.trim_start_matches('/');
        }
    }
    relative_path = relative_path.trim_start_matches('/');

    if relative_path.is_empty() {
        return Err("Invalid path".to_string());
    }
    if has_traversal_segment(relative_path) {
        return Err("Path traversal is not allowed".to_string());
    }

    let managed_relative = if ALLOWED_APPDATA_SUBDIRS.iter().any(|segment| {
        relative_path == *segment || relative_path.starts_with(&format!("{}/", segment))
    }) {
        relative_path.to_string()
    } else {
        format!("servers/{}", relative_path)
    };

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;

    Ok(normalize_path_string(&format!(
        "{}/{}",
        app_data_dir.to_string_lossy(),
        managed_relative
    )))
}

fn canonicalize_with_existing_ancestor(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return std::fs::canonicalize(path).map_err(|e| format!("Failed to resolve path: {}", e));
    }

    let mut existing_ancestor = path.to_path_buf();
    let mut missing_segments: Vec<OsString> = Vec::new();

    while !existing_ancestor.exists() {
        let segment = existing_ancestor
            .file_name()
            .ok_or_else(|| "Path has no existing parent".to_string())?;
        missing_segments.push(segment.to_os_string());
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or_else(|| "Path has no existing parent".to_string())?
            .to_path_buf();
    }

    let mut canonical = std::fs::canonicalize(&existing_ancestor)
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    for segment in missing_segments.iter().rev() {
        canonical.push(segment);
    }
    Ok(canonical)
}

fn is_within_root(target_path: &Path, root_path: &Path) -> bool {
    target_path == root_path || target_path.starts_with(root_path)
}

#[tauri::command]
pub async fn resolve_managed_path(app: AppHandle, path: String) -> Result<String, String> {
    let normalized_input = normalize_managed_input_path(&app, &path)?;
    let target_path = PathBuf::from(&normalized_input);
    if !target_path.is_absolute() {
        return Err("Path must be absolute".to_string());
    }
    if target_path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err("Path traversal is not allowed".to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to prepare app data directory: {}", e))?;

    let canonical_app_data = canonicalize_with_existing_ancestor(&app_data_dir)?;
    let canonical_target = canonicalize_with_existing_ancestor(&target_path)?;

    let is_allowed = ALLOWED_APPDATA_SUBDIRS.iter().any(|segment| {
        let root_path = canonical_app_data.join(segment);
        is_within_root(&canonical_target, &root_path)
    });

    if !is_allowed {
        return Err("Path is outside allowed scope".to_string());
    }

    Ok(normalize_path_string(&canonical_target.to_string_lossy()))
}

#[tauri::command]
pub async fn write_managed_text_file(
    app: AppHandle,
    path: String,
    content: String,
) -> Result<(), String> {
    let resolved = resolve_managed_path(app, path).await?;
    std::fs::write(&resolved, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub async fn read_managed_text_file(app: AppHandle, path: String) -> Result<String, String> {
    let resolved = resolve_managed_path(app, path).await?;
    tokio::fs::read_to_string(&resolved)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// ディレクトリの内容をメタデータ付きで一括取得
#[tauri::command]
pub async fn list_dir_with_metadata(path: String) -> Result<Vec<FileEntryInfo>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err("Directory does not exist".to_string());
    }
    if !dir_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    let read_dir =
        std::fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to get metadata: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        entries.push(FileEntryInfo {
            name,
            is_directory: metadata.is_dir(),
            size: if metadata.is_dir() { 0 } else { metadata.len() },
            modified,
        });
    }

    // フォルダ優先、名前順でソート
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
