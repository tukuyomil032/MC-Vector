use super::*;
use crate::map::assets as map_assets;
use crate::map::assets::AssetCandidate;

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
pub async fn get_map_asset_candidates(
    app: AppHandle,
    server_id: String,
) -> Result<Vec<AssetCandidate>, String> {
    let app_data = super::app_data_dir(&app)?;
    let root = super::server_dir(&app_data, &server_id)?;
    tokio::task::spawn_blocking(move || map_assets::asset_candidates(&root))
        .await
        .map_err(|error| format!("Map asset discovery worker failed: {error}"))?
}

#[tauri::command]
pub async fn select_map_asset(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
    source_path: Option<String>,
    source_paths: Option<Vec<String>>,
) -> Result<map_assets::AssetStatus, String> {
    let app_data = super::app_data_dir(&app)?;
    let root = super::server_dir(&app_data, &server_id)?;
    let source_paths = source_paths
        .filter(|paths| !paths.is_empty())
        .or_else(|| source_path.map(|path| vec![path]))
        .ok_or_else(|| "At least one map asset source is required".to_string())?;
    let config = map_assets::AssetConfig {
        source_path: source_paths.first().cloned(),
        source_paths,
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
