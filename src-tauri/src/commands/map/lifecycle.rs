use super::*;

#[tauri::command]
pub async fn repair_map_bridge(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    super::repair_map_bridge_impl(app, manager, servers, server_id).await
}

#[tauri::command]
pub async fn enable_map(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    super::enable_map_impl(app, manager, servers, server_id).await
}

#[tauri::command]
pub async fn pause_map(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    super::pause_map_impl(app, manager, servers, server_id).await
}

#[tauri::command]
pub async fn restore_map(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    super::restore_map_impl(app, manager, servers, server_id).await
}

#[tauri::command]
pub async fn remove_map_component(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    super::remove_map_component_impl(app, manager, servers, server_id).await
}
