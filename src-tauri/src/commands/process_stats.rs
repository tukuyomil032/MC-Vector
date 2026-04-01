use sysinfo::{Pid, System};

#[derive(serde::Serialize)]
pub struct ProcessStats {
    pub cpu: f32,
    pub memory: u64,
}

#[tauri::command]
pub async fn get_server_stats(pid: u32) -> Result<ProcessStats, String> {
    let mut sys = System::new_all();
    let pid = Pid::from_u32(pid);

    // 最初のリフレッシュで CPU 使用率のベースラインを取得
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    // 少し待ってから再度リフレッシュして CPU 使用率を取得
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);

    if let Some(process) = sys.process(pid) {
        let raw_cpu = process.cpu_usage();
        let cpu_usage = if raw_cpu.is_finite() {
            raw_cpu.max(0.0)
        } else {
            0.0
        };

        Ok(ProcessStats {
            cpu: cpu_usage,
            memory: process.memory(), // bytes
        })
    } else {
        Err("Process not found".into())
    }
}
