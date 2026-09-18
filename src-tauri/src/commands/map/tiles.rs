use super::*;

#[tauri::command]
pub async fn get_map_tile(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
    world_id: String,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
) -> Result<tauri::ipc::Response, String> {
    super::render_map_tile(
        app,
        Arc::new(manager.inner().clone()),
        server_id,
        world_id,
        zoom,
        tile_x,
        tile_y,
        TilePriority::Viewport,
    )
    .await
}

#[tauri::command]
pub async fn request_map_render(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
    world_id: String,
    viewport: MapViewport,
) -> Result<MapRenderRequestResult, String> {
    super::request_map_render_impl(app, manager, server_id, world_id, viewport).await
}
