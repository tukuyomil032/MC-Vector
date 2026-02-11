use std::env;
use std::fs;

#[derive(serde::Serialize)]
pub struct UpdateCheckResult {
    can_update: bool,
    reason: Option<String>,
}

#[tauri::command]
pub async fn can_update_app() -> Result<UpdateCheckResult, String> {
    #[cfg(target_os = "macos")]
    {
        tokio::task::spawn_blocking(|| {
            // Get the current executable path
            let exe_path =
                env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

            // Get the app bundle path (should be .app/Contents/MacOS/executable)
            let app_bundle_path = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or_else(|| "Failed to determine app bundle path".to_string())?;

            // Try to create a temporary file in the parent directory to check write permissions
            if let Some(parent_dir) = app_bundle_path.parent() {
                // Use a unique temporary filename to avoid conflicts
                let test_file =
                    parent_dir.join(format!(".mc-vector-update-test-{}", std::process::id()));
                match fs::write(&test_file, b"test") {
                    Ok(_) => {
                        // Ensure cleanup even if removal fails
                        let _ = fs::remove_file(&test_file);
                        Ok(UpdateCheckResult {
                            can_update: true,
                            reason: None,
                        })
                    }
                    Err(e) => {
                        // Check if this is a read-only filesystem error (error 30 on macOS)
                        let is_read_only = e.raw_os_error() == Some(30);
                        Ok(UpdateCheckResult {
                            can_update: false,
                            reason: Some(if is_read_only {
                                "read_only".to_string()
                            } else {
                                "permission_denied".to_string()
                            }),
                        })
                    }
                }
            } else {
                Ok(UpdateCheckResult {
                    can_update: false,
                    reason: Some("invalid_path".to_string()),
                })
            }
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?
    }

    #[cfg(not(target_os = "macos"))]
    {
        // On other platforms, assume updates are possible
        Ok(UpdateCheckResult {
            can_update: true,
            reason: None,
        })
    }
}

#[tauri::command]
pub async fn get_app_location() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let exe_path =
            env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

        #[cfg(target_os = "macos")]
        {
            // Get the app bundle path
            if let Some(app_bundle_path) = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
            {
                return Ok(app_bundle_path.to_string_lossy().to_string());
            }
        }

        Ok(exe_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
