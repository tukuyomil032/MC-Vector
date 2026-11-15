//! Tauri adapter for the shared player-list operations.

use tauri::{AppHandle, Manager, State};

use super::server_registry::ServerRegistry;
use crate::state::operation_manager::ServerOperationManager;

pub use mcvector_core::players::{
    PlayerListMutation, PlayerListMutationResult, PlayerListSnapshot,
};

#[tauri::command]
pub async fn get_player_lists(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<PlayerListSnapshot, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    mcvector_core::players::get_player_lists(
        &app_data_dir,
        registry.inner(),
        operations.inner(),
        &server_id,
    )
    .await
    .map_err(|error| error.message)
}

#[tauri::command]
pub async fn mutate_player_list(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    mutation: PlayerListMutation,
) -> Result<PlayerListMutationResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    mcvector_core::players::mutate_player_list(
        &app_data_dir,
        registry.inner(),
        operations.inner(),
        &server_id,
        &mutation,
    )
    .await
    .map_err(|error| error.message)
}
