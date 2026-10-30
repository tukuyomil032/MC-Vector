use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use super::file_utils::{
    copy_managed_tree, resolve_managed_request, ManagedPathRequest, ManagedRoot,
};
use super::server::ServerManager;
use super::server_registry::{MinecraftServer, ServerRegistry};
use crate::state::operation_manager::{OperationKind, ServerOperationManager};

fn validate_server_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 128
        || value.chars().any(char::is_control)
        || matches!(value, "." | "..")
        || value
            .chars()
            .any(|character| matches!(character, '/' | '\\' | ':'))
    {
        return Err("Server ID is invalid".to_string());
    }
    Ok(value.to_string())
}

fn validate_server_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err("Server name is invalid".to_string());
    }
    Ok(value.to_string())
}

fn ensure_server_stopped(is_running: bool, operation: &str) -> Result<(), String> {
    if is_running {
        return Err(match operation {
            "clone" => "Cannot clone a running server".to_string(),
            _ => "Cannot delete a running server".to_string(),
        });
    }
    Ok(())
}

fn managed_server_directory(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<(MinecraftServer, PathBuf), String> {
    let server = registry
        .get_servers()?
        .into_iter()
        .find(|server| server.id == server_id)
        .ok_or_else(|| "Server is not registered".to_string())?;
    let directory = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_string()),
            relative_path: String::new(),
        },
        false,
    )?;

    let metadata = fs::symlink_metadata(&directory)
        .map_err(|error| format!("Failed to inspect managed server directory: {error}"))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Managed server directory is not a regular directory".to_string());
    }
    let registered_path = PathBuf::from(&server.path);
    let registered_metadata = fs::symlink_metadata(&registered_path)
        .map_err(|error| format!("Failed to inspect registered server path: {error}"))?;
    if is_link_or_reparse_point(&registered_metadata) || !registered_metadata.is_dir() {
        return Err("Registered server path is not a regular directory".to_string());
    }
    let managed_path = fs::canonicalize(&directory)
        .map_err(|error| format!("Failed to resolve managed server directory: {error}"))?;
    let registered_path = fs::canonicalize(registered_path)
        .map_err(|error| format!("Failed to resolve registered server path: {error}"))?;
    if managed_path != registered_path {
        return Err("Server directory is outside its registered managed location".to_string());
    }
    Ok((server, managed_path))
}

fn clone_registered_server_with<F>(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    source_server_id: &str,
    destination_server_id: &str,
    destination_name: &str,
    register: F,
) -> Result<MinecraftServer, String>
where
    F: FnOnce(&MinecraftServer) -> Result<(), String>,
{
    let (source_profile, source_directory) =
        managed_server_directory(app_data_dir, registry, source_server_id)?;
    let destination = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(destination_server_id.to_string()),
            relative_path: String::new(),
        },
        true,
    )?;
    match fs::symlink_metadata(&destination) {
        Ok(_) => return Err("Destination server directory already exists".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Failed to inspect destination server: {error}")),
    }
    let managed_root = fs::canonicalize(app_data_dir.join("servers"))
        .map_err(|error| format!("Failed to resolve managed servers root: {error}"))?;

    if let Err(error) = copy_managed_tree(&source_directory, &destination, &managed_root) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }

    let mut cloned = source_profile;
    cloned.id = destination_server_id.to_string();
    cloned.name = destination_name.to_string();
    cloned.path = destination.to_string_lossy().into_owned();
    cloned.status = "offline".to_string();
    cloned.created_date = Some(current_iso8601_timestamp());
    cloned.unavailable_reason = None;

    if let Err(error) = register(&cloned) {
        if let Err(cleanup_error) = fs::remove_dir_all(&destination) {
            return Err(format!(
                "Failed to register cloned server ({error}) and failed to remove its copied directory ({cleanup_error})"
            ));
        }
        return Err(error);
    }

    Ok(cloned)
}

fn delete_server_directory_with<F>(target: &Path, delete_registry_entry: F) -> Result<bool, String>
where
    F: FnOnce() -> Result<bool, String>,
{
    let parent = target
        .parent()
        .ok_or_else(|| "Managed server directory has no parent".to_string())?;
    let server_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Managed server directory name is invalid".to_string())?;
    let rollback = parent.join(format!(".{server_name}.deleting-{}", Uuid::new_v4()));
    fs::rename(target, &rollback)
        .map_err(|error| format!("Failed to stage server directory deletion: {error}"))?;

    let delete_result = delete_registry_entry();
    let deleted = match delete_result {
        Ok(true) => true,
        Ok(false) => {
            return restore_deleted_directory(
                target,
                &rollback,
                "Server is not registered".to_string(),
            )
        }
        Err(error) => return restore_deleted_directory(target, &rollback, error),
    };

    if deleted {
        if let Err(error) = fs::remove_dir_all(&rollback) {
            log::warn!(
                "Server registry entry was deleted but backup directory {:?} could not be removed: {error}",
                rollback
            );
        }
    }
    Ok(deleted)
}

fn restore_deleted_directory(
    target: &Path,
    rollback: &Path,
    error: String,
) -> Result<bool, String> {
    match fs::rename(rollback, target) {
        Ok(()) => Err(error),
        Err(restore_error) => Err(format!(
            "{error}; failed to restore the server directory: {restore_error}"
        )),
    }
}

fn current_iso8601_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = seconds.div_euclid(86_400);
    let day_seconds = seconds.rem_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    let hour = day_seconds / 3_600;
    let minute = (day_seconds % 3_600) / 60;
    let second = day_seconds % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

#[tauri::command]
pub async fn clone_server_profile(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    server_manager: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    source_server_id: String,
    name: String,
) -> Result<MinecraftServer, String> {
    let source_server_id = validate_server_id(&source_server_id)?;
    let name = validate_server_name(&name)?;
    let destination_server_id = Uuid::new_v4().to_string();
    let _operation_guards = operations
        .acquire_many(
            [source_server_id.as_str(), destination_server_id.as_str()],
            OperationKind::FileMutation,
        )
        .await?;
    let is_running = server_manager
        .servers
        .lock()
        .await
        .contains_key(&source_server_id);
    ensure_server_stopped(is_running, "clone")?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        clone_registered_server_with(
            &app_data_dir,
            &registry,
            &source_server_id,
            &destination_server_id,
            &name,
            |server| registry.add_server(server),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_managed_server(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    server_manager: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<bool, String> {
    let server_id = validate_server_id(&server_id)?;
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await?;
    let is_running = server_manager.servers.lock().await.contains_key(&server_id);
    ensure_server_stopped(is_running, "delete")?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (_, directory) = managed_server_directory(&app_data_dir, &registry, &server_id)?;
        delete_server_directory_with(&directory, || registry.delete_server(&server_id))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
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

#[cfg(test)]
mod tests {
    use super::{
        clone_registered_server_with, current_iso8601_timestamp, delete_server_directory_with,
        ensure_server_stopped,
    };
    use crate::commands::server_registry::{JsonNumber, MinecraftServer, ServerRegistry};
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("mc-vector-server-lifecycle-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TempDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn server(id: &str, path: &str) -> MinecraftServer {
        MinecraftServer {
            id: id.to_string(),
            name: format!("Server {id}"),
            profile_name: None,
            group_name: None,
            version: "1.21.4".to_string(),
            software: "Paper".to_string(),
            port: JsonNumber::from(25565),
            memory: JsonNumber::from(4096),
            path: path.to_string(),
            status: "offline".to_string(),
            java_path: None,
            auto_restart_on_crash: Some(false),
            max_auto_restarts: None,
            auto_restart_delay_sec: None,
            auto_backup_enabled: Some(false),
            auto_backup_interval_min: None,
            auto_backup_schedule_type: None,
            auto_backup_time: None,
            auto_backup_weekday: None,
            auto_backup_retain_count: None,
            auto_backup_retain_days: None,
            backup_restart_after_safe_backup: None,
            created_date: Some("2026-01-01T00:00:00.000Z".to_string()),
            jvm_args: None,
            notify_on_crash: None,
            notify_on_start: None,
            notify_on_high_cpu: None,
            notify_high_cpu_threshold: None,
            unavailable_reason: None,
            extra: HashMap::new(),
        }
    }

    fn registered_source(directory: &TempDirectory, id: &str) -> ServerRegistry {
        let app_data = directory.path();
        let source = app_data.join("servers").join(id);
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("server.properties"), "server-port=25565\n").unwrap();
        let registry = ServerRegistry::open(app_data).unwrap();
        registry
            .add_server(&server(id, source.to_str().unwrap()))
            .unwrap();
        registry
    }

    #[test]
    fn clone_copies_managed_files_and_registers_the_profile() {
        let directory = TempDirectory::new();
        let registry = registered_source(&directory, "source");

        let cloned = clone_registered_server_with(
            directory.path(),
            &registry,
            "source",
            "destination",
            "Source copy",
            |server| registry.add_server(server),
        )
        .unwrap();

        assert_eq!(cloned.id, "destination");
        assert_eq!(cloned.name, "Source copy");
        assert_eq!(cloned.status, "offline");
        assert_eq!(
            fs::read_to_string(PathBuf::from(&cloned.path).join("server.properties")).unwrap(),
            "server-port=25565\n"
        );
        assert!(registry
            .get_servers()
            .unwrap()
            .iter()
            .any(|server| server.id == "destination"));
    }

    #[test]
    fn clone_removes_the_copied_tree_when_registry_insert_fails() {
        let directory = TempDirectory::new();
        let registry = registered_source(&directory, "source");
        let destination = directory.path().join("servers").join("destination");

        let result = clone_registered_server_with(
            directory.path(),
            &registry,
            "source",
            "destination",
            "Source copy",
            |_| Err("database unavailable".to_string()),
        );

        assert!(result.unwrap_err().contains("database unavailable"));
        assert!(!destination.exists());
        assert!(!registry
            .get_servers()
            .unwrap()
            .iter()
            .any(|server| server.id == "destination"));
    }

    #[test]
    fn delete_restores_the_original_tree_when_registry_update_fails() {
        let directory = TempDirectory::new();
        let _registry = registered_source(&directory, "server-a");
        let target = directory.path().join("servers").join("server-a");

        let result = delete_server_directory_with(&target, || Err("database unavailable".into()));

        assert!(result.unwrap_err().contains("database unavailable"));
        assert!(target.join("server.properties").exists());
    }

    #[test]
    fn delete_removes_the_directory_after_registry_removal() {
        let directory = TempDirectory::new();
        let registry = registered_source(&directory, "server-a");
        let target = directory.path().join("servers").join("server-a");

        assert!(
            delete_server_directory_with(&target, || registry.delete_server("server-a")).unwrap()
        );
        assert!(!target.exists());
        assert!(!registry
            .get_servers()
            .unwrap()
            .iter()
            .any(|server| server.id == "server-a"));
    }

    #[test]
    fn running_servers_are_refused_and_clone_timestamp_is_iso8601_utc() {
        assert!(ensure_server_stopped(true, "delete")
            .unwrap_err()
            .contains("running"));
        assert!(ensure_server_stopped(true, "clone")
            .unwrap_err()
            .contains("running"));
        let timestamp = current_iso8601_timestamp();
        assert!(timestamp.ends_with('Z'));
        assert_eq!(timestamp.len(), 24);
    }
}
