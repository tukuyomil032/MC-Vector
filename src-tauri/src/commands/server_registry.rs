use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::state::operation_manager::{OperationKind, ServerOperationManager};
use tauri::{AppHandle, Manager, State};

pub use mcvector_core::registry::*;

async fn current_running_server_ids(
    server_manager: &super::server::ServerManager,
) -> HashSet<String> {
    server_manager
        .servers
        .lock()
        .await
        .keys()
        .cloned()
        .collect()
}

#[tauri::command]
pub async fn get_servers(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    server_manager: State<'_, super::server::ServerManager>,
    operations: State<'_, ServerOperationManager>,
) -> Result<Vec<MinecraftServer>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let registry = registry.inner().clone();
    let registry_for_load = registry.clone();
    let mut servers = tauri::async_runtime::spawn_blocking(move || registry_for_load.get_servers())
        .await
        .map_err(|error| error.to_string())??;

    for server in &mut servers {
        let Some(legacy_directory_name) =
            legacy_server_directory_name(&server.path, &app_data_dir, &server.id)
        else {
            continue;
        };

        let migration_result = async {
            let _operation_guards = operations
                .acquire_many(
                    [legacy_directory_name.as_str(), server.id.as_str()],
                    OperationKind::FileMutation,
                )
                .await?;
            if server_manager.is_server_running(&server.id).await {
                return Err("Cannot migrate a running server directory".to_string());
            }

            let app_data_dir = app_data_dir.clone();
            let registry = registry.clone();
            let profile = server.clone();
            let server_id = profile.id.clone();
            tauri::async_runtime::spawn_blocking(move || {
                super::file_utils::migrate_managed_server_directory_with(
                    &app_data_dir,
                    legacy_directory_name,
                    server_id,
                    &registry,
                    |new_path| {
                        let mut updated_profile = profile;
                        updated_profile.path = new_path.to_string();
                        updated_profile.unavailable_reason = None;
                        if registry.update_server(&updated_profile)? {
                            Ok(())
                        } else {
                            Err("Server profile disappeared during directory migration".into())
                        }
                    },
                )
            })
            .await
            .map_err(|error| format!("Server directory migration task failed: {error}"))?
        }
        .await;

        match migration_result {
            Ok(path) => {
                server.path = path;
                server.unavailable_reason = None;
            }
            Err(error) => {
                server.unavailable_reason =
                    Some(format!("Server directory migration failed: {error}"));
            }
        }
    }

    let running_server_ids = current_running_server_ids(server_manager.inner()).await;
    apply_runtime_statuses(&mut servers, &running_server_ids);
    Ok(servers)
}

fn legacy_server_directory_name(
    server_path: &str,
    app_data_dir: &Path,
    server_id: &str,
) -> Option<String> {
    let servers_root = app_data_dir.join("servers");
    let path = PathBuf::from(server_path);
    if path.parent() != Some(servers_root.as_path()) {
        return None;
    }
    let directory_name = path.file_name()?.to_str()?;
    if directory_name.is_empty() || directory_name == server_id {
        return None;
    }
    Some(directory_name.to_owned())
}

#[tauri::command]
pub async fn update_server(
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server: MinecraftServer,
) -> Result<bool, String> {
    let _guard = operations
        .acquire(&server.id, OperationKind::FileMutation)
        .await?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || registry.update_server(&server))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_server_templates(
    registry: State<'_, ServerRegistry>,
) -> Result<Vec<ServerTemplate>, String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || registry.get_server_templates())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_server_template(
    registry: State<'_, ServerRegistry>,
    template: ServerTemplate,
) -> Result<ServerTemplate, String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        registry.save_server_template(&template)?;
        Ok(template)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_server_template(
    registry: State<'_, ServerRegistry>,
    template_id: String,
) -> Result<(), String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || registry.delete_server_template(&template_id))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::legacy_server_directory_name;
    use crate::test_support::test_temp_dir;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let path = test_temp_dir("mc-vector-registry-tests").join(Uuid::new_v4().to_string());
            fs::create_dir_all(&path).expect("create temporary registry directory");
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

    #[test]
    fn legacy_directory_detection_only_accepts_direct_managed_children() {
        let app_data = TempDirectory::new();
        let root = app_data.path();
        assert_eq!(
            legacy_server_directory_name(
                root.join("servers/legacy-name").to_str().unwrap(),
                root,
                "server-id"
            )
            .as_deref(),
            Some("legacy-name")
        );
        for path in [
            root.join("servers/server-id"),
            root.join("outside/legacy-name"),
            root.join("servers/nested/legacy-name"),
            root.join("servers/../outside"),
        ] {
            assert_eq!(
                legacy_server_directory_name(path.to_str().unwrap(), root, "server-id"),
                None,
                "unexpected legacy migration candidate: {}",
                path.display()
            );
        }
    }
}
