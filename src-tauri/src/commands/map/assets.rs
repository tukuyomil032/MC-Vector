use super::*;

#[tauri::command]
pub async fn get_map_asset_status(
    app: AppHandle,
    server_id: String,
) -> Result<map_assets::AssetStatus, String> {
    let app_data = super::app_data_dir(&app)?;
    let root = super::server_dir(&app_data, &server_id)?;
    tokio::task::spawn_blocking(move || map_assets::source_status(&root))
        .await
        .map_err(|error| format!("Map asset status worker failed: {error}"))?
}

#[tauri::command]
pub async fn select_map_asset(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
    source_path: String,
) -> Result<map_assets::AssetStatus, String> {
    let app_data = super::app_data_dir(&app)?;
    let root = super::server_dir(&app_data, &server_id)?;
    let config = map_assets::AssetConfig {
        source_path: Some(source_path),
    };
    map_assets::write_config(&root, &config)?;
    manager
        .asset_cache
        .lock()
        .map_err(|_| "Map asset cache is poisoned".to_string())?
        .remove(&server_id);
    manager
        .tile_cache
        .lock()
        .await
        .remove_where(|key| key.server_id == server_id);
    tokio::task::spawn_blocking(move || map_assets::source_status(&root))
        .await
        .map_err(|error| format!("Map asset status worker failed: {error}"))?
}
