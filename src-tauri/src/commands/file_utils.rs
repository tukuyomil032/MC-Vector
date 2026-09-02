use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub struct FileEntryInfo {
    pub name: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub size: u64,
    /// Unix timestamp in seconds (modification time)
    pub modified: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedManagedFile {
    pub server_id: Option<String>,
    pub relative_path: String,
    pub is_directory: bool,
    pub size: u64,
}

#[derive(Default)]
pub struct ServerImportManager {
    pending: Mutex<HashMap<String, PathBuf>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerImportAnalysis {
    pub token: String,
    pub folder_name: String,
    pub detected_version: String,
    pub detected_software: String,
    pub eula_accepted: bool,
    pub has_server_jar: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedServerImport {
    pub server_id: String,
    pub relative_path: String,
    pub file_count: u64,
    pub byte_size: u64,
}

/// The only storage roots this command module may access.
///
/// `Servers` requires a server ID and resolves below `servers/<serverId>`.
/// The other roots are application-managed shared storage locations.
#[derive(Clone, Copy, Debug, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ManagedRoot {
    Servers,
    Java,
    Ngrok,
    Backups,
}

/// An IPC-safe location. No command in this module accepts a caller-provided
/// absolute filesystem path.
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPathRequest {
    pub root: ManagedRoot,
    #[serde(default)]
    pub server_id: Option<String>,
    pub relative_path: String,
}

fn is_link_or_reparse_point(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }

    #[cfg(not(windows))]
    false
}

fn validate_server_id(server_id: &str) -> Result<String, String> {
    let normalized = server_id.trim();
    if normalized.is_empty() {
        return Err("Server ID is empty".to_string());
    }
    if normalized.len() > 128 {
        return Err("Server ID is too long".to_string());
    }
    if normalized.chars().any(char::is_control) {
        return Err("Server ID contains control characters".to_string());
    }
    if matches!(normalized, "." | "..")
        || normalized.contains('/')
        || normalized.contains('\\')
        || normalized.contains(':')
    {
        return Err("Server ID must not contain path separators".to_string());
    }

    Ok(normalized.to_string())
}

fn is_absolute_like(path: &str) -> bool {
    let bytes = path.as_bytes();
    path.starts_with('/')
        || path.starts_with('\\')
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
}

fn validated_relative_path(path: &str) -> Result<PathBuf, String> {
    if path.chars().any(char::is_control) {
        return Err("Relative path contains control characters".to_string());
    }
    if is_absolute_like(path) {
        return Err("Absolute paths are not allowed".to_string());
    }

    let mut relative = PathBuf::new();
    for segment in path
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
    {
        if matches!(segment, "." | "..") {
            return Err("Path traversal is not allowed".to_string());
        }
        relative.push(segment);
    }

    Ok(relative)
}

pub(crate) fn resolve_managed_request(
    app_data_dir: &Path,
    request: &ManagedPathRequest,
    create_root: bool,
) -> Result<PathBuf, String> {
    let root = request.root;
    let managed_root = match root {
        ManagedRoot::Servers => app_data_dir.join("servers"),
        ManagedRoot::Java => app_data_dir.join("java"),
        ManagedRoot::Ngrok => app_data_dir.join("ngrok"),
        ManagedRoot::Backups => app_data_dir.join("backups"),
    };

    let mut components = Vec::new();
    match root {
        ManagedRoot::Servers | ManagedRoot::Backups => {
            let server_id = request
                .server_id
                .as_deref()
                .ok_or_else(|| "This managed path requires a server ID".to_string())?;
            let server_id = server_id.trim();
            if server_id.is_empty() {
                return Err("Server ID is empty".to_string());
            }
            if server_id.len() > 128 {
                return Err("Server ID is too long".to_string());
            }
            if server_id.chars().any(char::is_control)
                || server_id == "."
                || server_id == ".."
                || server_id.contains('/')
                || server_id.contains('\\')
                || server_id.contains(':')
            {
                return Err("Server ID must be a single safe path component".to_string());
            }
            components.push(server_id.to_string());
        }
        _ => {
            if request.server_id.is_some() {
                return Err("Only server paths may include a server ID".to_string());
            }
        }
    }

    let relative_path = request.relative_path.trim();
    if relative_path.chars().any(char::is_control) {
        return Err("Relative path contains control characters".to_string());
    }
    if is_absolute_like(relative_path) {
        return Err("Absolute paths are not allowed".to_string());
    }
    for segment in relative_path
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
    {
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment.contains('/')
            || segment.contains('\\')
            || segment.chars().any(char::is_control)
        {
            return Err("Managed path contains an unsafe component".to_string());
        }
        components.push(segment.to_string());
    }

    if create_root {
        std::fs::create_dir_all(&managed_root)
            .map_err(|error| format!("Failed to prepare managed root: {error}"))?;
    }

    let metadata = std::fs::symlink_metadata(&managed_root)
        .map_err(|error| format!("Failed to inspect managed root: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Refusing to access a symbolic-link or reparse-point managed root".to_string());
    }
    if !metadata.is_dir() {
        return Err("Managed root is not a directory".to_string());
    }

    let canonical_root = std::fs::canonicalize(&managed_root)
        .map_err(|error| format!("Failed to resolve managed root: {error}"))?;

    let mut current = canonical_root.clone();
    for (index, component) in components.iter().enumerate() {
        let is_final = index + 1 == components.len();
        let entry = std::fs::read_dir(&current)
            .map_err(|error| format!("Failed to inspect managed path parent: {error}"))?
            .find_map(|entry| {
                let entry = entry.ok()?;
                (entry.file_name() == component.as_str()).then_some(entry)
            });

        if let Some(entry) = entry {
            let metadata = entry
                .metadata()
                .map_err(|error| format!("Failed to inspect managed path component: {error}"))?;
            if is_link_or_reparse_point(&metadata) {
                return Err("Managed path contains a symbolic link or reparse point".to_string());
            }
            if !is_final && !metadata.is_dir() {
                return Err("Managed path parent is not a directory".to_string());
            }
            current = entry.path();
            continue;
        }

        if !is_final {
            return Err("Managed path parent does not exist".to_string());
        }

        // A missing final component is returned for the caller to create. The
        // parent came from a trusted directory entry (or the fixed root), and
        // the component was checked above as one normal path component.
        let candidate = current.join(component);
        if !candidate.starts_with(&canonical_root) {
            return Err("Path is outside the managed root".to_string());
        }
        return Ok(candidate);
    }

    if !current.starts_with(&canonical_root) {
        return Err("Path is outside the managed root".to_string());
    }
    Ok(current)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())
}

const MAX_IMPORT_TEXT_BYTES: u64 = 1024 * 1024;

fn read_import_text(path: &Path) -> Option<String> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if is_link_or_reparse_point(&metadata)
        || !metadata.is_file()
        || metadata.len() > MAX_IMPORT_TEXT_BYTES
    {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

fn detect_import_software(jar_name: &str) -> &'static str {
    [
        ("paper", "Paper"),
        ("purpur", "Purpur"),
        ("spigot", "Spigot"),
        ("craftbukkit", "CraftBukkit"),
        ("neoforge", "NeoForge"),
        ("fabric", "Fabric"),
        ("forge", "Forge"),
        ("velocity", "Velocity"),
        ("waterfall", "Waterfall"),
        ("vanilla", "Vanilla"),
        ("minecraft_server", "Vanilla"),
    ]
    .iter()
    .find(|(pattern, _)| jar_name.to_ascii_lowercase().contains(pattern))
    .map(|(_, software)| *software)
    .unwrap_or("Paper")
}

fn detect_import_version(value: &str) -> String {
    let bytes = value.as_bytes();
    for start in 0..bytes.len().saturating_sub(2) {
        if bytes[start] != b'1' || bytes[start + 1] != b'.' {
            continue;
        }
        let mut end = start + 2;
        while end < bytes.len() && bytes[end].is_ascii_digit() {
            end += 1;
        }
        if end > start + 2 {
            if end < bytes.len() && bytes[end] == b'.' {
                let second_start = end + 1;
                let mut second_end = second_start;
                while second_end < bytes.len() && bytes[second_end].is_ascii_digit() {
                    second_end += 1;
                }
                if second_end > second_start {
                    end = second_end;
                }
            }
            return value[start..end].to_string();
        }
    }
    String::new()
}

fn analyze_import_folder(source: &Path, token: String) -> Result<ServerImportAnalysis, String> {
    let source_metadata = std::fs::symlink_metadata(source)
        .map_err(|error| format!("Failed to inspect selected server folder: {error}"))?;
    if is_link_or_reparse_point(&source_metadata) || !source_metadata.is_dir() {
        return Err("Selected server folder must be a real directory".to_string());
    }

    let folder_name = source
        .file_name()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| "Selected server folder has no usable name".to_string())?;

    let mut jar_name = None;
    for entry in std::fs::read_dir(source)
        .map_err(|error| format!("Failed to read selected server folder: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read selected entry: {error}"))?;
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Failed to inspect selected entry: {error}"))?;
        if is_link_or_reparse_point(&metadata) {
            return Err(
                "Selected server folder contains a symbolic link or reparse point".to_string(),
            );
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if metadata.is_file()
            && name.to_ascii_lowercase().ends_with(".jar")
            && name != "bundler.jar"
        {
            jar_name = Some(name);
        }
    }

    let mut detected_version = jar_name
        .as_deref()
        .map(detect_import_version)
        .unwrap_or_default();
    if detected_version.is_empty() {
        if let Some(content) = read_import_text(&source.join("server.properties")) {
            detected_version = detect_import_version(&content);
        }
    }

    let eula_accepted = read_import_text(&source.join("eula.txt"))
        .map(|content| {
            content.lines().any(|line| {
                let mut fields = line.splitn(2, '=');
                matches!(fields.next().map(str::trim), Some("eula"))
                    && matches!(fields.next().map(str::trim), Some(value) if value.eq_ignore_ascii_case("true"))
            })
        })
        .unwrap_or(false);

    Ok(ServerImportAnalysis {
        token,
        folder_name,
        detected_version,
        detected_software: jar_name
            .as_deref()
            .map(detect_import_software)
            .unwrap_or("Paper")
            .to_string(),
        eula_accepted,
        has_server_jar: jar_name.is_some(),
    })
}

/// Selects and analyzes an external server folder without exposing its path to
/// the renderer. The opaque token is the only value the renderer can retain.
#[tauri::command]
pub async fn pick_server_import(
    app: AppHandle,
    state: State<'_, ServerImportManager>,
) -> Result<Option<ServerImportAnalysis>, String> {
    let selected = tokio::task::spawn_blocking({
        let app = app.clone();
        move || app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|error| format!("Folder picker task failed: {error}"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let source = selected
        .into_path()
        .map_err(|error| format!("Failed to resolve selected server folder: {error}"))?;
    let token = Uuid::new_v4().to_string();
    let analysis = tokio::task::spawn_blocking({
        let source_for_analysis = source.clone();
        let token = token.clone();
        move || analyze_import_folder(&source_for_analysis, token)
    })
    .await
    .map_err(|error| format!("Server folder analysis task failed: {error}"))??;

    state
        .pending
        .lock()
        .map_err(|_| "Server import state is unavailable".to_string())?
        .insert(analysis.token.clone(), source);
    Ok(Some(analysis))
}

/// Copies the selected server folder's contents into an already-created
/// managed server directory. Tokens are one-shot and source paths remain Rust-only.
#[tauri::command]
pub async fn complete_server_import(
    app: AppHandle,
    state: State<'_, ServerImportManager>,
    token: String,
    server_id: String,
) -> Result<CompletedServerImport, String> {
    let source = state
        .pending
        .lock()
        .map_err(|_| "Server import state is unavailable".to_string())?
        .remove(token.trim())
        .ok_or_else(|| "Server import session is missing or expired".to_string())?;

    let app_data_dir = app_data_dir(&app)?;
    let destination_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let destination = resolve_managed_request(&app_data_dir, &destination_request, false)?;
    let managed_root = std::fs::canonicalize(app_data_dir.join("servers"))
        .map_err(|error| format!("Failed to resolve managed servers root: {error}"))?;
    let destination_metadata = std::fs::symlink_metadata(&destination)
        .map_err(|error| format!("Failed to inspect managed import destination: {error}"))?;
    if is_link_or_reparse_point(&destination_metadata) || !destination_metadata.is_dir() {
        return Err("Managed import destination must be a real directory".to_string());
    }
    if std::fs::read_dir(&destination)
        .map_err(|error| format!("Failed to inspect managed import destination: {error}"))?
        .next()
        .is_some()
    {
        return Err("Managed import destination must be empty".to_string());
    }

    let source_metadata = std::fs::symlink_metadata(&source)
        .map_err(|error| format!("Failed to inspect selected server folder: {error}"))?;
    if is_link_or_reparse_point(&source_metadata) || !source_metadata.is_dir() {
        return Err("Selected server folder is no longer safe to import".to_string());
    }

    let mut entry_count = 0;
    let mut byte_size: u64 = 0;
    for entry in std::fs::read_dir(&source)
        .map_err(|error| format!("Failed to read selected server folder: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read selected entry: {error}"))?;
        let destination_entry = destination.join(entry.file_name());
        let (_, size) = copy_external_entry(&entry.path(), &destination_entry, &managed_root)?;
        entry_count += 1;
        byte_size = byte_size.saturating_add(size);
    }

    Ok(CompletedServerImport {
        server_id,
        relative_path: String::new(),
        file_count: entry_count,
        byte_size,
    })
}

#[tauri::command]
pub async fn cancel_server_import(
    state: State<'_, ServerImportManager>,
    token: String,
) -> Result<(), String> {
    state
        .pending
        .lock()
        .map_err(|_| "Server import state is unavailable".to_string())?
        .remove(token.trim());
    Ok(())
}

#[tauri::command]
pub async fn resolve_managed_path(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<String, String> {
    let app_data_dir = app_data_dir(&app)?;
    let resolved = resolve_managed_request(&app_data_dir, &request, true)?;
    Ok(resolved.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn write_managed_text_file(
    app: AppHandle,
    request: ManagedPathRequest,
    content: String,
) -> Result<(), String> {
    let app_data_dir = app_data_dir(&app)?;
    let resolved = resolve_managed_request(&app_data_dir, &request, true)?;
    let managed_root = match request.root {
        ManagedRoot::Servers => app_data_dir.join("servers"),
        ManagedRoot::Java => app_data_dir.join("java"),
        ManagedRoot::Ngrok => app_data_dir.join("ngrok"),
        ManagedRoot::Backups => app_data_dir.join("backups"),
    };
    if resolved == managed_root {
        return Err("Managed path must identify a file".to_string());
    }

    std::fs::write(&resolved, content).map_err(|error| format!("Failed to write file: {error}"))
}

fn copy_external_entry(
    source: &Path,
    destination: &Path,
    managed_root: &Path,
) -> Result<(bool, u64), String> {
    if !source.is_absolute()
        || source.components().any(|component| {
            matches!(
                component,
                std::path::Component::CurDir | std::path::Component::ParentDir
            )
        })
    {
        return Err("Selected source must be an absolute, normalized path".to_string());
    }
    if !destination.is_absolute() || !destination.starts_with(managed_root) {
        return Err("Import destination is outside the managed root".to_string());
    }
    let destination_parent = destination
        .parent()
        .ok_or_else(|| "Import destination has no parent".to_string())?;
    if !destination_parent.starts_with(managed_root) {
        return Err("Import destination parent is outside the managed root".to_string());
    }

    let metadata = std::fs::symlink_metadata(source)
        .map_err(|error| format!("Failed to inspect selected source: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Selected source must not be a symbolic link or reparse point".to_string());
    }
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("Selected source must be a file or directory".to_string());
    }
    let canonical_source = std::fs::canonicalize(source)
        .map_err(|error| format!("Failed to resolve selected source: {error}"))?;
    if !canonical_source.is_absolute()
        || canonical_source.components().any(|component| {
            matches!(
                component,
                std::path::Component::CurDir | std::path::Component::ParentDir
            )
        })
    {
        return Err("Selected source resolved to an unsafe path".to_string());
    }
    if std::fs::symlink_metadata(destination).is_ok() {
        return Err(format!(
            "An item with the same name already exists: {}",
            destination.display()
        ));
    }

    if metadata.is_dir() {
        std::fs::create_dir(destination)
            .map_err(|error| format!("Failed to create imported directory: {error}"))?;
        for entry in std::fs::read_dir(&canonical_source)
            .map_err(|error| format!("Failed to read selected directory: {error}"))?
        {
            let entry = entry.map_err(|error| format!("Failed to read selected entry: {error}"))?;
            let name = entry.file_name();
            let child_destination = destination.join(&name);
            let child_source = canonical_source.join(&name);
            copy_external_entry(&child_source, &child_destination, managed_root)?;
        }
        Ok((true, 0))
    } else {
        std::fs::copy(&canonical_source, destination)
            .map_err(|error| format!("Failed to copy selected file: {error}"))?;
        let destination_metadata = std::fs::symlink_metadata(destination)
            .map_err(|error| format!("Failed to verify imported file: {error}"))?;
        if is_link_or_reparse_point(&destination_metadata) || !destination_metadata.is_file() {
            let _ = std::fs::remove_file(destination);
            return Err("Imported file is not a regular file".to_string());
        }
        Ok((false, destination_metadata.len()))
    }
}

/// Opens the native picker and copies the user-selected entries into a
/// managed directory. Source paths never cross the renderer IPC boundary.
#[tauri::command]
pub async fn import_managed_files(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<Vec<ImportedManagedFile>, String> {
    let app_data_dir = app_data_dir(&app)?;
    let destination = resolve_managed_request(&app_data_dir, &request, true)?;
    let managed_root = match request.root {
        ManagedRoot::Servers => app_data_dir.join("servers"),
        ManagedRoot::Java => app_data_dir.join("java"),
        ManagedRoot::Ngrok => app_data_dir.join("ngrok"),
        ManagedRoot::Backups => app_data_dir.join("backups"),
    };
    let managed_root = std::fs::canonicalize(&managed_root)
        .map_err(|error| format!("Failed to resolve import managed root: {error}"))?;
    let destination_metadata = std::fs::symlink_metadata(&destination)
        .map_err(|error| format!("Failed to inspect import destination: {error}"))?;
    if is_link_or_reparse_point(&destination_metadata) || !destination_metadata.is_dir() {
        return Err("Import destination must be a managed directory".to_string());
    }

    let selected = tokio::task::spawn_blocking({
        let app = app.clone();
        move || app.dialog().file().blocking_pick_files()
    })
    .await
    .map_err(|error| format!("File picker task failed: {error}"))?;
    let Some(selected) = selected else {
        return Ok(Vec::new());
    };

    tokio::task::spawn_blocking(move || {
        let mut imported = Vec::with_capacity(selected.len());
        for selected_path in selected {
            let source = selected_path
                .into_path()
                .map_err(|error| format!("Failed to resolve selected source: {error}"))?;
            let name = source
                .file_name()
                .ok_or_else(|| "Selected source has no file name".to_string())?;
            let destination_path = destination.join(name);
            let (is_directory, size) =
                copy_external_entry(&source, &destination_path, &managed_root)?;
            let name = name.to_string_lossy().to_string();
            let relative_path = if request.relative_path.is_empty() {
                name
            } else {
                format!("{}/{}", request.relative_path, name)
            };
            imported.push(ImportedManagedFile {
                server_id: request.server_id.clone(),
                relative_path,
                is_directory,
                size,
            });
        }
        Ok(imported)
    })
    .await
    .map_err(|error| format!("Import task failed: {error}"))?
}

#[tauri::command]
pub async fn export_text_file(
    app: AppHandle,
    content: String,
    suggested_name: String,
) -> Result<bool, String> {
    let suggested_name = suggested_name
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .collect::<String>();
    let selected = tokio::task::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_file_name(suggested_name)
                .blocking_save_file()
        }
    })
    .await
    .map_err(|error| format!("Save picker task failed: {error}"))?;
    let Some(selected) = selected else {
        return Ok(false);
    };
    let path = selected
        .into_path()
        .map_err(|error| format!("Failed to resolve save destination: {error}"))?;
    std::fs::write(path, content)
        .map_err(|error| format!("Failed to export text file: {error}"))?;
    Ok(true)
}

fn reject_managed_root_target(
    app_data_dir: &Path,
    request: &ManagedPathRequest,
    target: &Path,
) -> Result<(), String> {
    let root = match request.root {
        ManagedRoot::Servers => app_data_dir.join("servers"),
        ManagedRoot::Java => app_data_dir.join("java"),
        ManagedRoot::Ngrok => app_data_dir.join("ngrok"),
        ManagedRoot::Backups => app_data_dir.join("backups"),
    };
    if target == root {
        return Err("Managed path must identify a child entry".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn create_managed_directory(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<(), String> {
    let app_data_dir = app_data_dir(&app)?;
    let target = resolve_managed_request(&app_data_dir, &request, true)?;
    reject_managed_root_target(&app_data_dir, &request, &target)?;
    tokio::fs::create_dir_all(&target)
        .await
        .map_err(|error| format!("Failed to create managed directory: {error}"))
}

#[tauri::command]
pub async fn delete_managed_path(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<(), String> {
    let app_data_dir = app_data_dir(&app)?;
    let target = resolve_managed_request(&app_data_dir, &request, false)?;
    reject_managed_root_target(&app_data_dir, &request, &target)?;
    let metadata = std::fs::symlink_metadata(&target)
        .map_err(|error| format!("Failed to inspect managed path: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Refusing to delete a symbolic link or reparse point".to_string());
    }
    if metadata.is_dir() {
        tokio::fs::remove_dir_all(&target)
            .await
            .map_err(|error| format!("Failed to delete managed directory: {error}"))
    } else {
        tokio::fs::remove_file(&target)
            .await
            .map_err(|error| format!("Failed to delete managed file: {error}"))
    }
}

#[tauri::command]
pub async fn move_managed_path(
    app: AppHandle,
    from: ManagedPathRequest,
    to: ManagedPathRequest,
) -> Result<(), String> {
    let app_data_dir = app_data_dir(&app)?;
    let source = resolve_managed_request(&app_data_dir, &from, false)?;
    let destination = resolve_managed_request(&app_data_dir, &to, true)?;
    reject_managed_root_target(&app_data_dir, &from, &source)?;
    reject_managed_root_target(&app_data_dir, &to, &destination)?;

    let source_metadata = std::fs::symlink_metadata(&source)
        .map_err(|error| format!("Failed to inspect managed source: {error}"))?;
    if is_link_or_reparse_point(&source_metadata) {
        return Err("Refusing to move a symbolic link or reparse point".to_string());
    }
    if let Ok(destination_metadata) = std::fs::symlink_metadata(&destination) {
        if is_link_or_reparse_point(&destination_metadata) {
            return Err("Refusing to replace a symbolic link or reparse point".to_string());
        }
    }

    tokio::fs::rename(&source, &destination)
        .await
        .map_err(|error| format!("Failed to move managed path: {error}"))
}

#[tauri::command]
pub async fn read_managed_text_file(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<String, String> {
    let app_data_dir = app_data_dir(&app)?;
    let resolved = resolve_managed_request(&app_data_dir, &request, false)?;
    tokio::fs::read_to_string(&resolved)
        .await
        .map_err(|error| format!("Failed to read file: {error}"))
}

#[tauri::command]
pub async fn delete_managed_server_dir(app: AppHandle, server_id: String) -> Result<(), String> {
    let server_id = validate_server_id(&server_id)?;
    let app_data_dir = app_data_dir(&app)?;
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id),
        relative_path: String::new(),
    };
    let target = resolve_managed_request(&app_data_dir, &request, false)?;
    let servers_root = std::fs::canonicalize(app_data_dir.join("servers"))
        .map_err(|error| format!("Failed to resolve managed servers root: {error}"))?;

    if target == servers_root || target.parent() != Some(servers_root.as_path()) {
        return Err("Server folder is outside the managed servers root".to_string());
    }

    let metadata = std::fs::symlink_metadata(&target)
        .map_err(|error| format!("Failed to inspect server folder: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Refusing to delete a symbolic link or reparse point".to_string());
    }
    if !metadata.is_dir() {
        return Err("Server path is not a directory".to_string());
    }

    tokio::fs::remove_dir_all(&target)
        .await
        .map_err(|error| format!("Failed to delete managed server folder: {error}"))
}

fn copy_managed_tree(source: &Path, destination: &Path, managed_root: &Path) -> Result<(), String> {
    if !source.is_absolute()
        || !destination.is_absolute()
        || !source.starts_with(managed_root)
        || !destination.starts_with(managed_root)
    {
        return Err("Managed copy path is outside the managed root".to_string());
    }
    if source.components().any(|component| {
        matches!(
            component,
            std::path::Component::CurDir | std::path::Component::ParentDir
        )
    }) || destination.components().any(|component| {
        matches!(
            component,
            std::path::Component::CurDir | std::path::Component::ParentDir
        )
    }) {
        return Err("Managed copy path is not normalized".to_string());
    }
    let metadata = std::fs::symlink_metadata(source)
        .map_err(|error| format!("Failed to inspect source entry: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Managed source must not contain a symbolic link or reparse point".to_string());
    }
    if metadata.is_dir() {
        std::fs::create_dir(destination)
            .map_err(|error| format!("Failed to create copied directory: {error}"))?;
        for entry in std::fs::read_dir(source)
            .map_err(|error| format!("Failed to read source directory: {error}"))?
        {
            let entry = entry.map_err(|error| format!("Failed to read source entry: {error}"))?;
            let child_destination = destination.join(entry.file_name());
            if !child_destination.is_absolute()
                || child_destination.components().any(|component| {
                    matches!(
                        component,
                        std::path::Component::CurDir | std::path::Component::ParentDir
                    )
                })
                || !child_destination.starts_with(managed_root)
            {
                return Err("Managed copy destination is outside the managed root".to_string());
            }
            let child_source = source.join(entry.file_name());
            copy_managed_tree(&child_source, &child_destination, managed_root)?;
        }
    } else if metadata.is_file() {
        std::fs::copy(source, destination)
            .map_err(|error| format!("Failed to copy managed file: {error}"))?;
    } else {
        return Err("Managed source must be a regular file or directory".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn clone_managed_server(
    app: AppHandle,
    source_server_id: String,
    destination_server_id: String,
) -> Result<(), String> {
    let app_data_dir = app_data_dir(&app)?;
    let source_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(source_server_id),
        relative_path: String::new(),
    };
    let destination_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(destination_server_id),
        relative_path: String::new(),
    };
    let source = resolve_managed_request(&app_data_dir, &source_request, false)?;
    let destination = resolve_managed_request(&app_data_dir, &destination_request, true)?;
    let managed_root = std::fs::canonicalize(app_data_dir.join("servers"))
        .map_err(|error| format!("Failed to resolve managed servers root: {error}"))?;
    let source_metadata = std::fs::symlink_metadata(&source)
        .map_err(|error| format!("Failed to inspect source server: {error}"))?;
    if is_link_or_reparse_point(&source_metadata) || !source_metadata.is_dir() {
        return Err("Source server directory is not safe".to_string());
    }
    if std::fs::symlink_metadata(&destination).is_ok() {
        return Err("Destination server directory already exists".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Destination server has no parent".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create managed server root: {error}"))?;
    copy_managed_tree(&source, &destination, &managed_root)
}

/// Safely migrates a legacy `servers/<name>` directory to `servers/<id>`.
/// The legacy name is a single directory component; no external path can be
/// supplied and a failed migration never falls back to that external path.
#[tauri::command]
pub async fn migrate_managed_server_directory(
    app: AppHandle,
    legacy_directory_name: String,
    server_id: String,
) -> Result<String, String> {
    let legacy_directory_name = validate_server_id(&legacy_directory_name)?;
    let server_id = validate_server_id(&server_id)?;
    let app_data_dir = app_data_dir(&app)?;
    let source_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(legacy_directory_name.clone()),
        relative_path: String::new(),
    };
    let destination_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let destination = resolve_managed_request(&app_data_dir, &destination_request, true)?;
    let destination_root = std::fs::canonicalize(app_data_dir.join("servers"))
        .map_err(|error| format!("Failed to resolve managed servers root: {error}"))?;
    if destination.parent() != Some(destination_root.as_path()) {
        return Err("Migrated server destination is outside the managed root".to_string());
    }
    if legacy_directory_name == server_id {
        let metadata = std::fs::symlink_metadata(&destination)
            .map_err(|error| format!("Failed to inspect managed server directory: {error}"))?;
        if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
            return Err("Managed server directory is not a real directory".to_string());
        }
        return Ok(destination.to_string_lossy().to_string());
    }

    if let Ok(metadata) = std::fs::symlink_metadata(&destination) {
        if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
            return Err("Migration destination is not a safe directory".to_string());
        }
        return Err("Migration destination already exists".to_string());
    }

    let source = match resolve_managed_request(&app_data_dir, &source_request, false) {
        Ok(path) => path,
        Err(error) => {
            return Err(format!(
                "Legacy server directory is unavailable; migration was not performed: {error}"
            ));
        }
    };
    let source_metadata = std::fs::symlink_metadata(&source)
        .map_err(|error| format!("Failed to inspect legacy server directory: {error}"))?;
    if is_link_or_reparse_point(&source_metadata) || !source_metadata.is_dir() {
        return Err("Legacy server directory is not a safe directory".to_string());
    }

    if let Err(rename_error) = std::fs::rename(&source, &destination) {
        if let Err(copy_error) = copy_managed_tree(&source, &destination, &destination_root) {
            let _ = std::fs::remove_dir_all(&destination);
            return Err(format!(
                "Failed to migrate legacy server directory: {copy_error}; rename error: {rename_error}"
            ));
        }
        std::fs::remove_dir_all(&source)
            .map_err(|error| format!("Failed to remove migrated legacy directory: {error}"))?;
    }

    Ok(destination.to_string_lossy().to_string())
}

/// Returns metadata for a managed directory only. The caller supplies a root,
/// optional server ID, and relative path; arbitrary absolute paths are rejected.
#[tauri::command]
pub async fn list_dir_with_metadata(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<Vec<FileEntryInfo>, String> {
    let app_data_dir = app_data_dir(&app)?;
    let dir_path = resolve_managed_request(&app_data_dir, &request, false)?;
    let metadata =
        std::fs::symlink_metadata(&dir_path).map_err(|_| "Directory does not exist".to_string())?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Refusing to list a symbolic link or reparse point".to_string());
    }
    if !metadata.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(&dir_path)
        .map_err(|error| format!("Failed to read directory: {error}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|error| format!("Failed to read entry: {error}"))?;
        let metadata = entry
            .path()
            .symlink_metadata()
            .map_err(|error| format!("Failed to get metadata: {error}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_directory = metadata.is_dir() && !is_link_or_reparse_point(&metadata);
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);

        entries.push(FileEntryInfo {
            name,
            is_directory,
            size: if is_directory { 0 } else { metadata.len() },
            modified,
        });
    }

    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::{
        resolve_managed_request, validated_relative_path, ManagedPathRequest, ManagedRoot,
    };
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let sequence = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let path = PathBuf::from("target")
                .join("mc-vector-file-utils")
                .join(format!("{}-{sequence}", std::process::id()));
            std::fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn server_request(server_id: &str, relative_path: &str) -> ManagedPathRequest {
        ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_string()),
            relative_path: relative_path.to_string(),
        }
    }

    #[test]
    fn resolves_server_relative_path_below_server_id() {
        let app_data = TestDirectory::new();
        std::fs::create_dir_all(app_data.path().join("servers/alpha/world"))
            .expect("managed server parent should be created");
        let resolved = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "world/level.dat"),
            true,
        )
        .expect("managed server path should resolve");

        let canonical_app_data = std::fs::canonicalize(app_data.path()).unwrap();
        assert_eq!(
            resolved,
            canonical_app_data.join("servers/alpha/world/level.dat")
        );
    }

    #[test]
    fn resolves_each_shared_managed_root() {
        let app_data = TestDirectory::new();
        for root in [ManagedRoot::Java, ManagedRoot::Ngrok] {
            let request = ManagedPathRequest {
                root,
                server_id: None,
                relative_path: "artifact.bin".to_string(),
            };
            let resolved = resolve_managed_request(app_data.path(), &request, true)
                .expect("shared managed root should resolve");
            assert!(resolved.starts_with(std::fs::canonicalize(app_data.path()).unwrap()));
        }
        let request = ManagedPathRequest {
            root: ManagedRoot::Backups,
            server_id: Some("alpha".to_string()),
            relative_path: "artifact.bin".to_string(),
        };
        std::fs::create_dir_all(app_data.path().join("backups/alpha"))
            .expect("managed backup parent should be created");
        let resolved = resolve_managed_request(app_data.path(), &request, true)
            .expect("backup managed root should resolve");
        assert!(resolved.starts_with(std::fs::canonicalize(app_data.path()).unwrap()));
    }

    #[test]
    fn server_root_requires_server_id() {
        let request = ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: None,
            relative_path: "server.properties".to_string(),
        };
        let test_dir = TestDirectory::new();
        let error = resolve_managed_request(test_dir.path(), &request, true)
            .expect_err("server path without ID must fail");
        assert_eq!(error, "This managed path requires a server ID");
    }

    #[test]
    fn shared_roots_reject_server_id() {
        let request = ManagedPathRequest {
            root: ManagedRoot::Java,
            server_id: Some("alpha".to_string()),
            relative_path: "bin/java".to_string(),
        };
        let test_dir = TestDirectory::new();
        let error = resolve_managed_request(test_dir.path(), &request, true)
            .expect_err("shared root with server ID must fail");
        assert_eq!(error, "Only server paths may include a server ID");
    }

    #[test]
    fn rejects_absolute_paths_and_traversal_in_both_separator_styles() {
        for input in [
            "/etc/passwd",
            r"C:\\Windows\\System32",
            "../outside",
            r"..\\outside",
        ] {
            assert!(
                validated_relative_path(input).is_err(),
                "{input} should be rejected"
            );
        }
    }

    #[test]
    fn rejects_control_characters_and_unsafe_server_ids() {
        assert!(validated_relative_path("world/level\u{0000}.dat").is_err());
        let test_dir = TestDirectory::new();
        assert!(resolve_managed_request(
            test_dir.path(),
            &server_request("alpha/../outside", "server.properties"),
            true,
        )
        .is_err());
    }

    #[test]
    fn rejects_missing_non_final_component() {
        let app_data = TestDirectory::new();
        let error = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "missing/level.dat"),
            true,
        )
        .expect_err("only the final managed path component may be new");

        assert_eq!(error, "Managed path parent does not exist");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_link_managed_root() {
        use std::os::unix::fs::symlink;

        let app_data = TestDirectory::new();
        let outside = TestDirectory::new();
        symlink(outside.path(), app_data.path().join("servers"))
            .expect("test symlink should be created");

        let error = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "server.properties"),
            false,
        )
        .expect_err("symlink managed root must fail");
        assert_eq!(
            error,
            "Refusing to access a symbolic-link or reparse-point managed root"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_link_path_component() {
        use std::os::unix::fs::symlink;

        let app_data = TestDirectory::new();
        let server_root = app_data.path().join("servers/alpha");
        let outside = TestDirectory::new();
        std::fs::create_dir_all(&server_root).expect("managed server should be created");
        symlink(outside.path(), server_root.join("link"))
            .expect("test symlink component should be created");

        let error = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "link/server.properties"),
            false,
        )
        .expect_err("symlink path component must fail");
        assert_eq!(
            error,
            "Managed path contains a symbolic link or reparse point"
        );
    }
}
