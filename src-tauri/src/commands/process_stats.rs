use tauri::State;

use super::server::ServerManager;

#[derive(serde::Serialize)]
pub struct ProcessStats {
    pub cpu: f32,
    /// Process memory in bytes.
    pub memory: u64,
}

#[tauri::command]
pub async fn get_server_stats(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<ProcessStats, String> {
    let normalized = server_id.trim();
    if normalized.is_empty()
        || normalized.len() > 128
        || normalized.chars().any(char::is_control)
        || normalized.contains(['/', '\\', ':'])
    {
        return Err("Invalid server ID".to_string());
    }

    let servers = state.servers.lock().await;
    let server = servers
        .get(normalized)
        .ok_or_else(|| "Server not found or not running".to_string())?;
    let metrics = server.metrics.lock().await;
    let latest = metrics
        .latest_resource()
        .ok_or_else(|| "Server stats are not available yet".to_string())?;

    Ok(ProcessStats {
        cpu: latest.cpu,
        memory: latest.memory,
    })
}
