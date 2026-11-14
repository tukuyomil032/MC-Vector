use mcvector_core::managed_path::validate_server_id;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use mcvector_core::external_copy::{
    copy_external_entry, preflight_import_tree, ImportBudget, StagingGuard, MAX_IMPORT_DURATION,
    MAX_IMPORT_TEXT_BYTES,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use super::recovery_journal::{DirectoryMigrationStage, RecoveryOperation, RecoveryRecord};
use super::server_registry::ServerRegistry;
use crate::state::operation_manager::{
    GlobalOperation, OperationKind, OperationScope, ServerOperationManager,
};

pub(crate) use mcvector_core::managed_path::{
    copy_managed_tree, is_link_or_reparse_point, resolve_managed_request,
};
pub use mcvector_core::managed_path::{ManagedPathRequest, ManagedRoot};

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

pub use mcvector_core::server_import::ImportManager as ServerImportManager;

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

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())
}

const MAX_IMPORT_TOP_LEVEL_ENTRIES: usize = 1024;

pub(crate) fn managed_operation_scope(
    request: &ManagedPathRequest,
) -> Result<OperationScope, String> {
    match request.root {
        ManagedRoot::Servers | ManagedRoot::Backups => validate_server_id(
            request
                .server_id
                .as_deref()
                .ok_or_else(|| "This managed path requires a server ID".to_string())?,
        )
        .map(OperationScope::Server),
        ManagedRoot::Java => Ok(OperationScope::Global(GlobalOperation::JavaRuntime)),
        ManagedRoot::Ngrok => Ok(OperationScope::Global(GlobalOperation::NgrokRuntime)),
    }
}

fn managed_text_temp_path(destination: &Path) -> PathBuf {
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("managed-file");
    destination.with_file_name(format!(".{name}.write-{}", Uuid::new_v4()))
}

pub(crate) fn atomic_write_managed_text_file(
    destination: &Path,
    content: &str,
) -> Result<(), String> {
    if content.len() as u64 > MAX_IMPORT_TEXT_BYTES * 16 {
        return Err("Managed text file exceeds the write size limit".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Managed file has no parent".to_string())?;
    let parent_metadata = std::fs::symlink_metadata(parent)
        .map_err(|error| format!("Failed to inspect managed file parent: {error}"))?;
    if is_link_or_reparse_point(&parent_metadata) || !parent_metadata.is_dir() {
        return Err("Managed file parent is not a real directory".to_string());
    }

    let temp = managed_text_temp_path(destination);
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|error| format!("Failed to create managed file staging path: {error}"))?;
    let write_result = (|| {
        file.write_all(content.as_bytes())
            .map_err(|error| format!("Failed to write managed file: {error}"))?;
        file.flush()
            .map_err(|error| format!("Failed to flush managed file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Failed to sync managed file: {error}"))?;
        Ok::<(), String>(())
    })();
    drop(file);
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }

    let rollback = destination.with_file_name(format!(
        ".{}rollback-{}",
        destination
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("managed-file"),
        Uuid::new_v4()
    ));
    let existing = match std::fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
                let _ = std::fs::remove_file(&temp);
                return Err("Managed destination is not a regular file".to_string());
            }
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            return Err(format!("Failed to inspect managed destination: {error}"));
        }
    };

    if existing {
        std::fs::rename(destination, &rollback).map_err(|error| {
            let _ = std::fs::remove_file(&temp);
            format!("Failed to stage existing managed file: {error}")
        })?;
    }
    match std::fs::rename(&temp, destination) {
        Ok(()) => {
            if existing {
                let _ = std::fs::remove_file(rollback);
            }
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            if existing && std::fs::rename(&rollback, destination).is_err() {
                return Err(format!(
                    "Failed to write managed file and restore the previous file; manual recovery required: {error}"
                ));
            }
            Err(format!("Failed to commit managed file: {error}"))
        }
    }
}

/// Selects and analyzes an external server folder without exposing its path to
/// the renderer. The opaque token is the only value the renderer can retain.
/// The analysis and the token live in `mcvector_core::server_import`.
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
    let manager = state.inner().clone();
    let analysis = tokio::task::spawn_blocking(move || manager.begin(&source))
        .await
        .map_err(|error| format!("Server folder analysis task failed: {error}"))?
        .map_err(|error| error.message)?;
    Ok(Some(ServerImportAnalysis {
        token: analysis.token,
        folder_name: analysis.folder_name,
        detected_version: analysis.detected_version.unwrap_or_default(),
        // The React form expects a software; it has always defaulted to Paper.
        detected_software: analysis
            .detected_software
            .unwrap_or_else(|| "Paper".to_string()),
        eula_accepted: analysis.eula_accepted,
        has_server_jar: analysis.jar_name.is_some(),
    }))
}

#[tauri::command]
pub async fn cancel_server_import(
    state: State<'_, ServerImportManager>,
    token: String,
) -> Result<(), String> {
    state.cancel(&token);
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
    operations: State<'_, ServerOperationManager>,
    request: ManagedPathRequest,
    content: String,
) -> Result<(), String> {
    let operation_scope = managed_operation_scope(&request)?;
    let _operation_guards = operations
        .acquire_scopes([operation_scope], OperationKind::FileMutation)
        .await?;
    let app_data_dir = app_data_dir(&app)?;
    let resolved = resolve_managed_request(&app_data_dir, &request, true)?;
    if request.relative_path.trim().is_empty() {
        return Err("Managed path must identify a file".to_string());
    }

    atomic_write_managed_text_file(&resolved, &content)
}

fn rollback_import_entries(committed: &[(PathBuf, PathBuf)]) -> bool {
    let mut success = true;
    for (destination, staged) in committed.iter().rev() {
        if std::fs::rename(destination, staged).is_err() {
            success = false;
        }
    }
    success
}

fn e2e_import_sources() -> Result<Option<Vec<PathBuf>>, String> {
    // This bypass exists solely for real debug E2E: it keeps the source path in
    // the backend while exercising the same preflight, staging, and commit path
    // used after a native picker selection. It is unreachable from release
    // binaries and requires the explicit E2E opt-in as well as a source value.
    if !cfg!(debug_assertions) || std::env::var("MC_VECTOR_E2E").ok().as_deref() != Some("1") {
        return Ok(None);
    }

    let Some(source) = std::env::var_os("MC_VECTOR_E2E_IMPORT_SOURCE") else {
        return Ok(None);
    };
    let source = PathBuf::from(source);
    if source.as_os_str().is_empty() {
        return Err("E2E import source is empty".to_string());
    }
    Ok(Some(vec![source]))
}

/// Opens the native picker and copies the user-selected entries into a
/// managed directory. Source paths never cross the renderer IPC boundary.
#[tauri::command]
pub async fn import_managed_files(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    request: ManagedPathRequest,
) -> Result<Vec<ImportedManagedFile>, String> {
    let operation_scope = managed_operation_scope(&request)?;
    let _operation_guards = operations
        .acquire_scopes([operation_scope], OperationKind::FileMutation)
        .await?;
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

    let selected = match e2e_import_sources()? {
        Some(paths) => paths,
        None => {
            let selected = tokio::task::spawn_blocking({
                let app = app.clone();
                move || app.dialog().file().blocking_pick_files()
            })
            .await
            .map_err(|error| format!("File picker task failed: {error}"))?;
            let Some(selected) = selected else {
                return Ok(Vec::new());
            };
            selected
                .into_iter()
                .map(|selected_path| {
                    selected_path
                        .into_path()
                        .map_err(|error| format!("Failed to resolve selected source: {error}"))
                })
                .collect::<Result<Vec<_>, _>>()?
        }
    };
    if selected.len() > MAX_IMPORT_TOP_LEVEL_ENTRIES {
        return Err("Import exceeds the selected-entry limit".to_string());
    }

    tokio::task::spawn_blocking(move || {
        let staging = destination.with_file_name(format!(".import-{}", Uuid::new_v4()));
        std::fs::create_dir(&staging)
            .map_err(|error| format!("Failed to create import staging directory: {error}"))?;
        let mut staging_guard = StagingGuard::new(staging.clone());
        let mut imported = Vec::with_capacity(selected.len());
        let import_deadline = Instant::now() + MAX_IMPORT_DURATION;
        let mut budget = ImportBudget::with_deadline(import_deadline);
        let mut staged_entries = Vec::with_capacity(selected.len());
        for source in selected {
            budget.check_deadline()?;
            let name = source
                .file_name()
                .ok_or_else(|| "Selected source has no file name".to_string())?;
            preflight_import_tree(&source, &mut ImportBudget::with_deadline(import_deadline))?;
            let name = name.to_os_string();
            let staged_path = staging.join(&name);
            let (is_directory, size, _) = copy_external_entry(
                &source,
                &staged_path,
                &managed_root,
                &mut budget,
            )?;
            let name = name.to_string_lossy().to_string();
            let relative_path = if request.relative_path.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", request.relative_path, name)
            };
            imported.push(ImportedManagedFile {
                server_id: request.server_id.clone(),
                relative_path,
                is_directory,
                size,
            });
            staged_entries.push((name, staged_path));
        }

        let mut committed = Vec::with_capacity(staged_entries.len());
        for (name, staged_path) in staged_entries {
            budget.check_deadline()?;
            let destination_path = destination.join(&name);
            if std::fs::symlink_metadata(&destination_path).is_ok() {
                if !rollback_import_entries(&committed) {
                    staging_guard.disarm();
                    return Err(
                        "Import destination changed and rollback failed; manual recovery required"
                            .to_string(),
                    );
                }
                return Err(format!(
                    "An item with the same name already exists: {}",
                    destination_path.display()
                ));
            }
            if let Err(error) = std::fs::rename(&staged_path, &destination_path) {
                let rollback_ok = rollback_import_entries(&committed);
                if !rollback_ok {
                    staging_guard.disarm();
                    return Err(format!(
                        "Import commit failed and rollback also failed; manual recovery required: {error}"
                    ));
                }
                return Err(format!("Failed to commit imported entry: {error}"));
            }
            committed.push((destination_path, staged_path));
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
    operations: State<'_, ServerOperationManager>,
    request: ManagedPathRequest,
) -> Result<(), String> {
    let operation_scope = managed_operation_scope(&request)?;
    let _operation_guards = operations
        .acquire_scopes([operation_scope], OperationKind::FileMutation)
        .await?;
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
    operations: State<'_, ServerOperationManager>,
    request: ManagedPathRequest,
) -> Result<(), String> {
    let operation_scope = managed_operation_scope(&request)?;
    let _operation_guards = operations
        .acquire_scopes([operation_scope], OperationKind::FileMutation)
        .await?;
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
    operations: State<'_, ServerOperationManager>,
    from: ManagedPathRequest,
    to: ManagedPathRequest,
) -> Result<(), String> {
    let from_scope = managed_operation_scope(&from)?;
    let to_scope = managed_operation_scope(&to)?;
    let _operation_guards = operations
        .acquire_scopes([from_scope, to_scope], OperationKind::FileMutation)
        .await?;
    let app_data_dir = app_data_dir(&app)?;
    let source = resolve_managed_request(&app_data_dir, &from, false)?;
    let destination = resolve_managed_request(&app_data_dir, &to, true)?;
    reject_managed_root_target(&app_data_dir, &from, &source)?;
    reject_managed_root_target(&app_data_dir, &to, &destination)?;

    move_managed_entry(&source, &destination).await
}

async fn move_managed_entry(source: &Path, destination: &Path) -> Result<(), String> {
    let source_metadata = std::fs::symlink_metadata(source)
        .map_err(|error| format!("Failed to inspect managed source: {error}"))?;
    if is_link_or_reparse_point(&source_metadata) {
        return Err("Refusing to move a symbolic link or reparse point".to_string());
    }
    if let Ok(destination_metadata) = std::fs::symlink_metadata(destination) {
        if is_link_or_reparse_point(&destination_metadata) {
            return Err("Refusing to replace a symbolic link or reparse point".to_string());
        }
    }

    tokio::fs::rename(source, destination)
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

/// Longest a folder-size walk may run. A walk that runs out of time reports the bytes it counted, marked incomplete.
const DIRECTORY_SIZE_BUDGET: Duration = Duration::from_secs(3);

#[derive(serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedDirectorySize {
    pub bytes: u64,
    /// False when the time budget ran out or part of the tree could not be read.
    pub complete: bool,
}

/// Sums the regular files under a server folder. Symbolic links and reparse points are skipped, never followed,
/// so a link cannot pull in data from outside the managed root.
#[tauri::command]
pub async fn get_managed_directory_size(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<ManagedDirectorySize, String> {
    if request.root != ManagedRoot::Servers {
        return Err("Directory size is only available for server folders".to_string());
    }
    let app_data_dir = app_data_dir(&app)?;
    let target = resolve_managed_request(&app_data_dir, &request, false)?;
    tokio::task::spawn_blocking(move || directory_size_within(&target, DIRECTORY_SIZE_BUDGET))
        .await
        .map_err(|error| format!("Failed to measure managed directory: {error}"))?
}

fn directory_size_within(root: &Path, budget: Duration) -> Result<ManagedDirectorySize, String> {
    let metadata =
        std::fs::symlink_metadata(root).map_err(|error| directory_metadata_error(&error))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Refusing to measure a symbolic link or reparse point".to_string());
    }
    if !metadata.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let deadline = Instant::now() + budget;
    let mut bytes = 0_u64;
    let mut complete = true;
    let mut pending = vec![root.to_path_buf()];
    'walk: while let Some(directory) = pending.pop() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if directory.as_path() == root => {
                return Err(format!("Failed to read directory: {error}"));
            }
            Err(_) => {
                complete = false;
                continue;
            }
        };
        for entry in entries {
            if Instant::now() >= deadline {
                complete = false;
                break 'walk;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    complete = false;
                    continue;
                }
            };
            // DirEntry::metadata never follows a symbolic link, the same as symlink_metadata, and needs no path.
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => {
                    complete = false;
                    continue;
                }
            };
            if is_link_or_reparse_point(&metadata) {
                continue;
            }
            if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                bytes = bytes.saturating_add(metadata.len());
            }
        }
    }

    Ok(ManagedDirectorySize { bytes, complete })
}

/// Safely migrates a legacy `servers/<name>` directory to `servers/<id>` and
/// commits the new profile path. The caller must hold both server operation
/// locks. If the registry update fails, the directory is moved back.
pub(crate) fn migrate_managed_server_directory_with<F>(
    app_data_dir: &Path,
    legacy_directory_name: String,
    server_id: String,
    registry: &ServerRegistry,
    update_profile_path: F,
) -> Result<String, String>
where
    F: FnOnce(&str) -> Result<(), String>,
{
    migrate_managed_server_directory_with_fault(
        app_data_dir,
        legacy_directory_name,
        server_id,
        registry,
        update_profile_path,
        false,
        |_| Ok(()),
    )
}

fn migrate_managed_server_directory_with_fault<F, H>(
    app_data_dir: &Path,
    legacy_directory_name: String,
    server_id: String,
    registry: &ServerRegistry,
    update_profile_path: F,
    force_copy_fallback: bool,
    mut after_persist: H,
) -> Result<String, String>
where
    F: FnOnce(&str) -> Result<(), String>,
    H: FnMut(DirectoryMigrationStage) -> Result<(), String>,
{
    let legacy_directory_name = validate_server_id(&legacy_directory_name)?;
    let server_id = validate_server_id(&server_id)?;
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
    let destination = resolve_managed_request(app_data_dir, &destination_request, true)?;
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
        let destination = destination.to_string_lossy().to_string();
        update_profile_path(&destination)?;
        return Ok(destination);
    }

    match std::fs::symlink_metadata(&destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                return Err("Migration destination is not a safe directory".to_string());
            }
            return Err("Migration destination already exists".to_string());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!("Failed to inspect migration destination: {error}"));
        }
    }

    let source = match resolve_managed_request(app_data_dir, &source_request, false) {
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

    let record_id = Uuid::new_v4().to_string();
    let mut record = RecoveryRecord {
        id: record_id.clone(),
        operation: RecoveryOperation::ServerDirectoryMigration {
            server_id: server_id.clone(),
            legacy_directory_name: legacy_directory_name.clone(),
            stage: DirectoryMigrationStage::Prepared,
        },
    };
    registry.save_recovery_record(&record)?;
    after_persist(DirectoryMigrationStage::Prepared)?;

    let rename_result = if force_copy_fallback {
        Err(std::io::Error::other(
            "simulated cross-device rename failure",
        ))
    } else {
        std::fs::rename(&source, &destination)
    };
    match rename_result {
        Ok(()) => {}
        Err(rename_error) => {
            if let Err(copy_error) = copy_managed_tree(&source, &destination, &destination_root) {
                let _ = std::fs::remove_dir_all(&destination);
                return Err(format!(
                    "Failed to migrate legacy server directory: {copy_error}; rename error: {rename_error}"
                ));
            }
            record.operation = RecoveryOperation::ServerDirectoryMigration {
                server_id: server_id.clone(),
                legacy_directory_name: legacy_directory_name.clone(),
                stage: DirectoryMigrationStage::DirectoryCopied,
            };
            registry.save_recovery_record(&record)?;
            after_persist(DirectoryMigrationStage::DirectoryCopied)?;
            if let Err(error) = std::fs::remove_dir_all(&source) {
                return Err(format!(
                    "Failed to remove the legacy directory after copying it: {error}"
                ));
            }
        }
    }

    record.operation = RecoveryOperation::ServerDirectoryMigration {
        server_id: server_id.clone(),
        legacy_directory_name: legacy_directory_name.clone(),
        stage: DirectoryMigrationStage::DirectoryMoved,
    };
    registry.save_recovery_record(&record)?;
    after_persist(DirectoryMigrationStage::DirectoryMoved)?;

    let destination_string = destination.to_string_lossy().to_string();
    if let Err(error) = update_profile_path(&destination_string) {
        // Both paths are below the same managed root, so rename restores the
        // original directory atomically after either the rename or copy path.
        let rollback = std::fs::rename(&destination, &source);
        return match rollback {
            Ok(()) => {
                let _ = registry.delete_recovery_record(&record_id);
                Err(error)
            }
            Err(rollback_error) => Err(format!(
                "{error}; failed to restore the legacy server directory: {rollback_error}"
            )),
        };
    }

    record.operation = RecoveryOperation::ServerDirectoryMigration {
        server_id,
        legacy_directory_name,
        stage: DirectoryMigrationStage::RegistryUpdated,
    };
    registry.save_recovery_record(&record)?;
    after_persist(DirectoryMigrationStage::RegistryUpdated)?;
    registry.delete_recovery_record(&record_id)?;

    Ok(destination_string)
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
    list_directory_entries(&dir_path)
}

fn list_directory_entries(dir_path: &Path) -> Result<Vec<FileEntryInfo>, String> {
    let metadata =
        std::fs::symlink_metadata(&dir_path).map_err(|error| directory_metadata_error(&error))?;
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

fn directory_metadata_error(error: &std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        "Directory does not exist".to_string()
    } else {
        format!("Failed to inspect directory metadata: {error}")
    }
}

#[cfg(test)]
mod tests {
    use super::super::recovery_journal::{self, DirectoryMigrationStage};
    use super::super::server_registry::ServerRegistry;
    use super::{
        atomic_write_managed_text_file, directory_metadata_error, directory_size_within,
        list_directory_entries, migrate_managed_server_directory_with,
        migrate_managed_server_directory_with_fault, move_managed_entry, resolve_managed_request,
        ManagedDirectorySize, ManagedPathRequest, ManagedRoot,
    };
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

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

    #[test]
    fn directory_size_sums_regular_files_recursively() {
        let dir = TestDirectory::new();
        std::fs::create_dir_all(dir.path().join("world").join("region"))
            .expect("nested directory should be created");
        std::fs::write(dir.path().join("server.properties"), vec![0_u8; 10])
            .expect("file should be written");
        std::fs::write(
            dir.path().join("world").join("region").join("r.0.0.mca"),
            vec![0_u8; 100],
        )
        .expect("nested file should be written");

        let size = directory_size_within(dir.path(), Duration::from_secs(30))
            .expect("size should be measured");
        assert_eq!(
            size,
            ManagedDirectorySize {
                bytes: 110,
                complete: true,
            }
        );
    }

    #[cfg(unix)]
    #[test]
    fn directory_size_does_not_follow_symbolic_links() {
        let dir = TestDirectory::new();
        let outside = TestDirectory::new();
        std::fs::write(outside.path().join("secret.bin"), vec![0_u8; 500])
            .expect("outside file should be written");
        std::fs::write(dir.path().join("own.txt"), vec![0_u8; 7]).expect("file should be written");
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link"))
            .expect("symlink should be created");

        let size = directory_size_within(dir.path(), Duration::from_secs(30))
            .expect("size should be measured");
        assert_eq!(
            size,
            ManagedDirectorySize {
                bytes: 7,
                complete: true,
            }
        );
    }

    #[test]
    fn directory_size_reports_incomplete_when_the_budget_is_spent() {
        let dir = TestDirectory::new();
        std::fs::write(dir.path().join("a.bin"), vec![0_u8; 5]).expect("file should be written");

        let size = directory_size_within(dir.path(), Duration::ZERO)
            .expect("an exhausted budget is not an error");
        assert!(!size.complete);
    }

    #[test]
    fn directory_size_rejects_a_file_path() {
        let dir = TestDirectory::new();
        let file = dir.path().join("file.txt");
        std::fs::write(&file, b"x").expect("file should be written");

        let error = directory_size_within(&file, Duration::from_secs(1))
            .expect_err("a file is not a directory");
        assert_eq!(error, "Path is not a directory");
    }

    fn server_request(server_id: &str, relative_path: &str) -> ManagedPathRequest {
        ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_string()),
            relative_path: relative_path.to_string(),
        }
    }

    fn registry_with_legacy_server(
        app_data_dir: &Path,
        server_id: &str,
        legacy_directory_name: &str,
    ) -> ServerRegistry {
        let canonical_app_data = app_data_dir
            .canonicalize()
            .expect("app data directory should resolve");
        std::fs::write(
            app_data_dir.join("servers.json"),
            serde_json::to_vec(&serde_json::json!({
                "servers": [{
                    "id": server_id,
                    "name": "Legacy server",
                    "version": "1.21",
                    "software": "Paper",
                    "port": 25565,
                    "memory": 2048,
                    "path": canonical_app_data
                        .join("servers")
                        .join(legacy_directory_name)
                        .to_string_lossy()
                }]
            }))
            .unwrap(),
        )
        .expect("legacy server registry should be written");
        ServerRegistry::open(app_data_dir).expect("server registry should open")
    }

    #[test]
    fn migration_rolls_back_directory_when_registry_path_update_fails() {
        let app_data = TestDirectory::new();
        let legacy_dir = app_data.path().join("servers/legacy-name");
        std::fs::create_dir_all(&legacy_dir).expect("legacy server directory should exist");
        std::fs::write(legacy_dir.join("server.properties"), "motd=legacy")
            .expect("legacy server file should be written");
        let registry = registry_with_legacy_server(app_data.path(), "server-id", "legacy-name");

        let error = migrate_managed_server_directory_with(
            app_data.path(),
            "legacy-name".to_string(),
            "server-id".to_string(),
            &registry,
            |_| Err("database is unavailable".to_string()),
        )
        .expect_err("registry failure should reject migration");

        assert_eq!(error, "database is unavailable");
        assert_eq!(
            std::fs::read_to_string(legacy_dir.join("server.properties")).unwrap(),
            "motd=legacy"
        );
        assert!(!app_data.path().join("servers/server-id").exists());
    }

    #[test]
    fn migration_keeps_new_directory_when_registry_path_update_succeeds() {
        let app_data = TestDirectory::new();
        let legacy_dir = app_data.path().join("servers/legacy-name");
        std::fs::create_dir_all(&legacy_dir).expect("legacy server directory should exist");
        std::fs::write(legacy_dir.join("server.properties"), "motd=legacy")
            .expect("legacy server file should be written");
        let registry = registry_with_legacy_server(app_data.path(), "server-id", "legacy-name");
        let mut committed_path = None;

        let migrated_path = migrate_managed_server_directory_with(
            app_data.path(),
            "legacy-name".to_string(),
            "server-id".to_string(),
            &registry,
            |new_path| {
                committed_path = Some(new_path.to_string());
                let mut profile = registry.get_servers()?.remove(0);
                profile.path = new_path.to_string();
                if registry.update_server(&profile)? {
                    Ok(())
                } else {
                    Err("Server profile disappeared during directory migration".into())
                }
            },
        )
        .expect("migration should succeed when registry update succeeds");

        assert_eq!(committed_path.as_deref(), Some(migrated_path.as_str()));
        assert!(!legacy_dir.exists());
        assert_eq!(
            std::fs::read_to_string(app_data.path().join("servers/server-id/server.properties"))
                .unwrap(),
            "motd=legacy"
        );
    }

    #[test]
    fn directory_migration_recovers_each_persisted_stage_after_simulated_crash() {
        for interrupted_stage in [
            DirectoryMigrationStage::Prepared,
            DirectoryMigrationStage::DirectoryCopied,
            DirectoryMigrationStage::DirectoryMoved,
            DirectoryMigrationStage::RegistryUpdated,
        ] {
            let app_data = TestDirectory::new();
            std::fs::create_dir_all(app_data.path().join("servers/legacy-name"))
                .expect("legacy server directory should exist");
            std::fs::write(
                app_data
                    .path()
                    .join("servers/legacy-name/server.properties"),
                "motd=legacy",
            )
            .expect("legacy server file should be written");
            let registry = registry_with_legacy_server(app_data.path(), "server-id", "legacy-name");

            let error = migrate_managed_server_directory_with_fault(
                app_data.path(),
                "legacy-name".to_string(),
                "server-id".to_string(),
                &registry,
                |new_path| {
                    let mut profile = registry.get_servers()?.remove(0);
                    profile.path = new_path.to_string();
                    if registry.update_server(&profile)? {
                        Ok(())
                    } else {
                        Err("Server profile disappeared during directory migration".into())
                    }
                },
                interrupted_stage == DirectoryMigrationStage::DirectoryCopied,
                |persisted_stage| {
                    if persisted_stage == interrupted_stage {
                        Err(format!("simulated crash after {persisted_stage:?}"))
                    } else {
                        Ok(())
                    }
                },
            )
            .expect_err("fault injection should interrupt migration");
            assert!(error.contains("simulated crash"));
            assert_eq!(registry.recovery_records().unwrap().len(), 1);

            assert!(recovery_journal::recover_startup(app_data.path(), &registry).is_empty());
            assert!(registry.recovery_records().unwrap().is_empty());
            let profile = registry.get_servers().unwrap().remove(0);
            let canonical_app_data = app_data.path().canonicalize().unwrap();
            match interrupted_stage {
                DirectoryMigrationStage::RegistryUpdated
                | DirectoryMigrationStage::DirectoryCopied => {
                    assert_eq!(
                        profile.path,
                        canonical_app_data
                            .join("servers/server-id")
                            .to_string_lossy()
                            .to_string()
                    );
                    if interrupted_stage == DirectoryMigrationStage::RegistryUpdated {
                        assert!(!app_data.path().join("servers/legacy-name").exists());
                    } else {
                        assert!(app_data.path().join("servers/legacy-name").exists());
                    }
                    assert!(app_data
                        .path()
                        .join("servers/server-id/server.properties")
                        .exists());
                }
                DirectoryMigrationStage::Prepared | DirectoryMigrationStage::DirectoryMoved => {
                    assert_eq!(
                        profile.path,
                        canonical_app_data
                            .join("servers/legacy-name")
                            .to_string_lossy()
                            .to_string()
                    );
                    assert!(app_data
                        .path()
                        .join("servers/legacy-name/server.properties")
                        .exists());
                    assert!(!app_data.path().join("servers/server-id").exists());
                }
            }
        }
    }

    #[test]
    fn atomic_managed_text_write_replaces_without_partial_content() {
        let directory = TestDirectory::new();
        let destination = directory.path().join("server.properties");
        atomic_write_managed_text_file(&destination, "first=value")
            .expect("initial managed write should succeed");
        atomic_write_managed_text_file(&destination, "second=value")
            .expect("replacement managed write should succeed");

        assert_eq!(
            std::fs::read_to_string(&destination).unwrap(),
            "second=value"
        );
        let leftover_names = std::fs::read_dir(directory.path())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains("write-") || name.contains("rollback-"))
            .collect::<Vec<_>>();
        assert!(
            leftover_names.is_empty(),
            "temporary files: {leftover_names:?}"
        );
    }

    #[tokio::test]
    async fn moves_a_downloaded_jar_within_the_managed_server_root() {
        let app_data = TestDirectory::new();
        std::fs::create_dir_all(app_data.path().join("servers/server-1/plugins"))
            .expect("managed plugin directory should be created");
        let source_request = server_request("server-1", "plugins/example.jar.part-valid.jar");
        let destination_request = server_request("server-1", "plugins/example.jar");
        let source = resolve_managed_request(app_data.path(), &source_request, true)
            .expect("managed source should resolve");
        let destination = resolve_managed_request(app_data.path(), &destination_request, true)
            .expect("managed destination should resolve");
        std::fs::create_dir_all(source.parent().expect("source should have a parent"))
            .expect("managed plugin directory should be created");
        std::fs::write(&source, b"downloaded plugin").expect("temporary plugin should be written");

        move_managed_entry(&source, &destination)
            .await
            .expect("managed jar should move");

        assert!(!source.exists());
        assert_eq!(std::fs::read(&destination).unwrap(), b"downloaded plugin");
        let plugins_dir = destination.parent().expect("jar should have a parent");
        let entries = list_directory_entries(plugins_dir).expect("plugins directory should list");
        assert!(entries.iter().any(|entry| entry.name == "example.jar"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_symlink_source_and_destination_for_managed_move() {
        use std::os::unix::fs::symlink;

        let app_data = TestDirectory::new();
        let outside = TestDirectory::new();
        std::fs::create_dir_all(app_data.path().join("servers/server-1/plugins"))
            .expect("managed plugin directory should be created");
        let source = resolve_managed_request(
            app_data.path(),
            &server_request("server-1", "plugins/example.jar.part-valid.jar"),
            true,
        )
        .expect("source should resolve");
        let destination = resolve_managed_request(
            app_data.path(),
            &server_request("server-1", "plugins/example.jar"),
            true,
        )
        .expect("destination should resolve");
        std::fs::create_dir_all(source.parent().expect("source should have a parent"))
            .expect("managed plugin directory should be created");
        symlink(outside.path(), &source).expect("source symlink should be created");
        assert!(move_managed_entry(&source, &destination).await.is_err());

        std::fs::remove_file(&source).expect("source symlink should be removed");
        std::fs::write(&source, b"safe source").expect("safe source should be written");
        symlink(outside.path(), &destination).expect("destination symlink should be created");
        assert!(move_managed_entry(&source, &destination).await.is_err());
        assert!(source.exists());
    }

    #[test]
    fn maps_only_not_found_directory_metadata_errors_to_missing() {
        let missing = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert_eq!(
            directory_metadata_error(&missing),
            "Directory does not exist"
        );

        let permission_denied =
            std::io::Error::new(std::io::ErrorKind::PermissionDenied, "permission denied");
        assert_eq!(
            directory_metadata_error(&permission_denied),
            "Failed to inspect directory metadata: permission denied"
        );
    }

    #[test]
    fn reports_a_missing_directory_as_missing() {
        let app_data = TestDirectory::new();
        let error = match list_directory_entries(&app_data.path().join("missing")) {
            Ok(_) => panic!("missing directory should return an error"),
            Err(error) => error,
        };

        assert_eq!(error, "Directory does not exist");
    }
}
