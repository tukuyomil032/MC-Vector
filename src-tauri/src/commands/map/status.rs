use super::*;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapStatus {
    pub server_id: String,
    pub component: String,
    pub artifact: Option<String>,
    pub core_artifact: crate::map::core_artifact::CoreArtifactStatus,
    pub restart_required: bool,
    pub bridge: String,
    pub config_state: String,
    pub config_reason: Option<String>,
    pub protocol_version: u32,
    pub plugin_version: Option<String>,
    pub configured_port: Option<u16>,
    pub last_heartbeat: Option<u64>,
    pub asset_state: String,
    pub asset_source: Option<String>,
    pub asset_identity: Option<String>,
    pub asset_message: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn get_map_status(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    super::build_status(&app, &manager, &server_id).await
}
