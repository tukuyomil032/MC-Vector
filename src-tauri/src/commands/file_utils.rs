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

fn validate_managed_server_dir_for_delete(
    servers_root: &Path,
    server_path: &str,
) -> Result<PathBuf, String> {
    let normalized_input = normalize_path_string(server_path.trim());
    if normalized_input.is_empty() || normalized_input.contains('\0') {
        return Err("Invalid server path".to_string());
    }
    if has_traversal_segment(&normalized_input) {
        return Err("Path traversal is not allowed".to_string());
    }

    let target_path = PathBuf::from(&normalized_input);
    if !target_path.is_absolute() {
        return Err("Server path must be absolute".to_string());
    }
    if target_path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err("Path traversal is not allowed".to_string());
    }

    if target_path.parent() != Some(servers_root) {
        return Err("Only direct managed server folders can be deleted".to_string());
    }

    Ok(target_path)
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

#[tauri::command]
pub async fn delete_managed_server_dir(app: AppHandle, server_path: String) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let servers_root = app_data_dir.join("servers");
    let requested_target = validate_managed_server_dir_for_delete(&servers_root, &server_path)?;

    let servers_root_metadata = std::fs::symlink_metadata(&servers_root)
        .map_err(|e| format!("Failed to inspect managed servers root: {}", e))?;
    if servers_root_metadata.file_type().is_symlink() {
        return Err("Refusing to delete through a symbolic-link managed root".to_string());
    }
    let canonical_servers_root = std::fs::canonicalize(&servers_root)
        .map_err(|e| format!("Failed to resolve managed servers root: {}", e))?;

    // Resolve the requested directory by enumerating the already trusted
    // managed root. The user-provided path is used only for an exact match;
    // filesystem operations below use the path returned by read_dir.
    let target = std::fs::read_dir(&servers_root)
        .map_err(|e| format!("Failed to inspect managed server folders: {}", e))?
        .map(|entry| entry.map(|entry| entry.path()))
        .find_map(|entry| match entry {
            Ok(entry_path) if entry_path == requested_target => Some(Ok(entry_path)),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .transpose()
        .map_err(|e| format!("Failed to inspect managed server folder: {}", e))?
        .ok_or_else(|| "Server folder is not a direct managed server folder".to_string())?;

    let target_metadata = std::fs::symlink_metadata(&target)
        .map_err(|e| format!("Failed to inspect server folder: {}", e))?;
    if target_metadata.file_type().is_symlink() {
        return Err("Refusing to delete a symbolic link".to_string());
    }
    if !target_metadata.is_dir() {
        return Err("Server path is not a directory".to_string());
    }

    let canonical_target = std::fs::canonicalize(&target)
        .map_err(|e| format!("Failed to resolve server folder: {}", e))?;
    if canonical_target == canonical_servers_root
        || canonical_target.parent() != Some(canonical_servers_root.as_path())
    {
        return Err("Server folder is outside the managed servers root".to_string());
    }

    tokio::fs::remove_dir_all(&target)
        .await
        .map_err(|e| format!("Failed to delete managed server folder: {}", e))
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

#[cfg(test)]
mod tests {
    use super::validate_managed_server_dir_for_delete;
    use std::path::PathBuf;

    fn servers_root() -> PathBuf {
        #[cfg(windows)]
        {
            PathBuf::from(r"C:\mc-vector-file-utils-tests\servers")
        }

        #[cfg(not(windows))]
        {
            PathBuf::from("/tmp/mc-vector-file-utils-tests/servers")
        }
    }

    #[test]
    fn delete_validation_allows_direct_managed_server_folder() {
        let servers_root = servers_root();
        let server_dir = servers_root.join("alpha");

        let result = validate_managed_server_dir_for_delete(
            &servers_root,
            server_dir.to_string_lossy().as_ref(),
        )
        .expect("direct managed server folder should be allowed");

        assert_eq!(result, server_dir);
    }

    #[test]
    fn delete_validation_rejects_managed_servers_root() {
        let servers_root = servers_root();

        let result = validate_managed_server_dir_for_delete(
            &servers_root,
            servers_root.to_string_lossy().as_ref(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn delete_validation_rejects_app_data_parent() {
        let servers_root = servers_root();
        let app_data = servers_root.parent().unwrap();

        let result = validate_managed_server_dir_for_delete(
            &servers_root,
            app_data.to_string_lossy().as_ref(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn delete_validation_rejects_path_traversal() {
        let servers_root = servers_root();
        let traversal = servers_root.join("..").join("outside");

        let result = validate_managed_server_dir_for_delete(
            &servers_root,
            traversal.to_string_lossy().as_ref(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn delete_validation_rejects_nested_paths_inside_server_folder() {
        let servers_root = servers_root();
        let nested = servers_root.join("alpha").join("world");

        let result = validate_managed_server_dir_for_delete(
            &servers_root,
            nested.to_string_lossy().as_ref(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn delete_validation_rejects_external_folder() {
        let servers_root = servers_root();
        let external = servers_root.parent().unwrap().join("external-server");

        let result = validate_managed_server_dir_for_delete(
            &servers_root,
            external.to_string_lossy().as_ref(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn delete_validation_rejects_empty_server_name() {
        let servers_root = servers_root();
        let empty_name = servers_root.to_string_lossy().to_string() + "/";

        let result = validate_managed_server_dir_for_delete(&servers_root, &empty_name);

        assert!(result.is_err());
    }
}
