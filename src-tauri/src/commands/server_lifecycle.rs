use tauri::{AppHandle, Manager, State};

use super::server::ServerManager;
use super::server_registry::{MinecraftServer, ServerRegistry};
use crate::state::operation_manager::ServerOperationManager;
use mcvector_core::lifecycle;

#[tauri::command]
pub async fn clone_server_profile(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    server_manager: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    source_server_id: String,
    name: String,
) -> Result<MinecraftServer, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    lifecycle::clone_server(
        &app_data_dir,
        registry.inner(),
        operations.inner(),
        async |server_id: String| server_manager.servers.lock().await.contains_key(&server_id),
        &source_server_id,
        &name,
    )
    .await
}

#[tauri::command]
pub async fn delete_managed_server(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    server_manager: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    lifecycle::delete_server(
        &app_data_dir,
        registry.inner(),
        operations.inner(),
        async |server_id: String| server_manager.servers.lock().await.contains_key(&server_id),
        &server_id,
    )
    .await
}
