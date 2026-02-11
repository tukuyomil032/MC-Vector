use std::env;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn can_update_app() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // Get the current executable path
        let exe_path =
            env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

        // Get the app bundle path (should be .app/Contents/MacOS/executable)
        let app_bundle_path = exe_path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .ok_or_else(|| "Failed to determine app bundle path".to_string())?;

        // Check if the app is running from /Volumes (DMG mount point)
        if app_bundle_path.starts_with("/Volumes") {
            return Ok(false);
        }

        // Try to create a temporary file in the parent directory to check write permissions
        if let Some(parent_dir) = app_bundle_path.parent() {
            // Use a unique temporary filename to avoid conflicts
            let test_file =
                parent_dir.join(format!(".mc-vector-update-test-{}", std::process::id()));
            match fs::write(&test_file, b"test") {
                Ok(_) => {
                    // Ensure cleanup even if removal fails
                    let _ = fs::remove_file(&test_file);
                    Ok(true)
                }
                Err(_) => Ok(false),
            }
        } else {
            Ok(false)
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // On other platforms, assume updates are possible
        Ok(true)
    }
}

#[tauri::command]
pub fn get_app_location() -> Result<String, String> {
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
}
