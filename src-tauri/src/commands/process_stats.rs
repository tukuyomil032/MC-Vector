use sysinfo::{Pid, System};
use tauri::State;

use super::server::ServerManager;

#[derive(serde::Serialize)]
pub struct ProcessStats {
    pub cpu: f32,
    pub memory: u64,
}

async fn stats_for_pid(pid: u32) -> Result<ProcessStats, String> {
    if pid == 0 {
        return Err("Invalid server process ID".to_string());
    }
    let mut sys = System::new_all();
    let pid = Pid::from_u32(pid);

    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);

    if let Some(process) = sys.process(pid) {
        let raw_cpu = process.cpu_usage();
        Ok(ProcessStats {
            cpu: if raw_cpu.is_finite() {
                raw_cpu.max(0.0)
            } else {
                0.0
            },
            memory: process.memory(),
        })
    } else {
        Err("Process not found".into())
    }
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
    let pid = {
        let servers = state.servers.lock().await;
        servers
            .get(normalized)
            .map(|server| server.pid)
            .ok_or_else(|| "Server not found or not running".to_string())?
    };
    stats_for_pid(pid).await
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn rejects_zero_pid_without_probing_processes() {
        assert!(matches!(
            super::stats_for_pid(0).await,
            Err(message) if message == "Invalid server process ID"
        ));
    }
}
