//! EULA commands. The file handling lives in `mcvector_core::eula`.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub use mcvector_core::eula::{ensure_server_eula_accepted, ServerEulaStatus, EULA_REQUIRED_ERROR};

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())
}

#[tauri::command]
pub async fn get_server_eula_status(
    app: AppHandle,
    server_id: String,
) -> Result<ServerEulaStatus, String> {
    mcvector_core::eula::eula_status(&app_data_dir(&app)?, &server_id)
}

#[tauri::command]
pub async fn accept_server_eula(app: AppHandle, server_id: String) -> Result<(), String> {
    mcvector_core::eula::accept_eula(&app_data_dir(&app)?, &server_id)
}
