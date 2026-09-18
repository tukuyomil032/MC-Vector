use super::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapWorldInfo {
    pub world_id: String,
    pub has_terrain: bool,
    pub generated_chunk_count: usize,
    pub min_chunk_x: Option<i64>,
    pub max_chunk_x: Option<i64>,
    pub min_chunk_z: Option<i64>,
    pub max_chunk_z: Option<i64>,
    pub center_x: i64,
    pub center_z: i64,
    pub spawn_x: Option<i64>,
    pub spawn_y: Option<i64>,
    pub spawn_z: Option<i64>,
    pub data_version: Option<i64>,
    pub recommended_zoom: u8,
}

#[tauri::command]
pub async fn get_map_world_info(
    app: AppHandle,
    server_id: String,
    world_id: String,
) -> Result<MapWorldInfo, String> {
    let app_data = super::app_data_dir(&app)?;
    let server_root = super::server_dir(&app_data, &server_id)?;
    let world_root = super::resolve_world_directory(&server_root, &world_id)?;
    tokio::task::spawn_blocking(move || super::inspect_world_info(&world_root, &world_id))
        .await
        .map_err(|error| format!("Map world inspection worker failed: {error}"))?
}
