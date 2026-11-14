use mcvector_core::managed_path::validate_server_id;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use super::recovery_journal::{DirectoryMigrationStage, RecoveryOperation, RecoveryRecord};
use super::server_registry::ServerRegistry;
use crate::state::operation_manager::{
    GlobalOperation, OperationKind, OperationScope, ServerOperationManager,
};

use mcvector_core::managed_files;
pub(crate) use mcvector_core::managed_path::{
    copy_managed_tree, is_link_or_reparse_point, resolve_managed_request,
};
pub use mcvector_core::managed_path::{ManagedPathRequest, ManagedRoot};

pub use mcvector_core::managed_files::FileEntry as FileEntryInfo;

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

pub(crate) fn atomic_write_managed_text_file(
    destination: &Path,
    content: &str,
) -> Result<(), String> {
    managed_files::atomic_write(destination, content.as_bytes()).map_err(String::from)
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
    let relative_base = request.relative_path.clone();
    let server_id = request.server_id.clone();
    let imported = tokio::task::spawn_blocking(move || {
        managed_files::import_entries(&destination, &managed_root, selected)
    })
    .await
    .map_err(|error| format!("Import task failed: {error}"))??;
    Ok(imported
        .into_iter()
        .map(|entry| ImportedManagedFile {
            server_id: server_id.clone(),
            relative_path: if relative_base.is_empty() {
                entry.name
            } else {
                format!("{relative_base}/{}", entry.name)
            },
            is_directory: entry.is_directory,
            size: entry.size,
        })
        .collect())
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
    managed_files::reject_managed_root_target(app_data_dir, request, target).map_err(String::from)
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
    tokio::task::spawn_blocking(move || managed_files::create_directory(&target, false))
        .await
        .map_err(|error| format!("Directory task failed: {error}"))?
        .map_err(String::from)
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
    tokio::task::spawn_blocking(move || managed_files::delete_entry(&target))
        .await
        .map_err(|error| format!("Delete task failed: {error}"))?
        .map_err(String::from)
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

/// Never replaces an existing destination (see `managed_files::move_entry`).
async fn move_managed_entry(source: &Path, destination: &Path) -> Result<(), String> {
    managed_files::move_entry(source, destination).map_err(String::from)
}

#[tauri::command]
pub async fn read_managed_text_file(
    app: AppHandle,
    request: ManagedPathRequest,
) -> Result<String, String> {
    let app_data_dir = app_data_dir(&app)?;
    let resolved = resolve_managed_request(&app_data_dir, &request, false)?;
    tokio::task::spawn_blocking(move || managed_files::read_text_file(&resolved))
        .await
        .map_err(|error| format!("Read task failed: {error}"))?
        .map_err(String::from)
}

pub use mcvector_core::managed_files::DirectorySize as ManagedDirectorySize;
use mcvector_core::managed_files::DIRECTORY_SIZE_BUDGET;

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
    managed_files::directory_size_within(root, budget).map_err(String::from)
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
    managed_files::list_directory(dir_path).map_err(String::from)
}

#[cfg(test)]
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
