use sysinfo::{Pid, System};

#[derive(serde::Serialize)]
pub struct ProcessStats {
    pub cpu: f32,
    pub memory: u64,
}

#[tauri::command]
pub async fn get_server_stats(pid: u32) -> Result<ProcessStats, String> {
    let mut sys = System::new();
    let pid = Pid::from_u32(pid);

    // 最初のリフレッシュで CPU 使用率のベースラインを取得
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    // 少し待ってから再度リフレッシュして正確な CPU 使用率を取得
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);

    if let Some(process) = sys.process(pid) {
        Ok(ProcessStats {
            cpu: process.cpu_usage(),
            memory: process.memory(), // bytes
        })
    } else {
        Err("Process not found".into())
    }
}
