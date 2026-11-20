//! Tauri-side download helpers. The verified-download engine lives in
//! `mcvector_core::download`; this module keeps the Tauri wrappers (progress
//! callbacks that emit events) and the plugin download policy stored through
//! `tauri-plugin-store`.

use std::path::Path;

use mcvector_core::download::{self as core_download, DownloadOptions};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub use mcvector_core::download::{
    read_limited_response_body, required_sha256, send_request_with_timeout, ExpectedChecksum,
    VerifiedArtifact,
};

/// Wraps a progress callback that may fail (event emission) so a failed emit
/// is logged instead of aborting the download.
fn infallible_report<F>(mut report: F) -> impl FnMut(u64, u64)
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    move |downloaded, total| {
        if let Err(error) = report(downloaded, total) {
            log::debug!("Download progress was not delivered: {error}");
        }
    }
}

/// Downloads an executable artifact that the provider publishes with SHA-256.
#[allow(clippy::too_many_arguments)]
pub async fn download_verified_artifact<F>(
    url: &str,
    staging_hint: &Path,
    managed_root: &Path,
    expected_sha256: &str,
    expected_size: Option<u64>,
    max_bytes: u64,
    allowed_hosts: Option<&[&str]>,
    report: F,
) -> Result<VerifiedArtifact, String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    core_download::download_verified_artifact(
        url,
        staging_hint,
        managed_root,
        &ExpectedChecksum::sha256(expected_sha256),
        max_bytes,
        DownloadOptions {
            expected_size,
            allowed_hosts,
            cancel: None,
        },
        infallible_report(report),
    )
    .await
    .map_err(String::from)
}

fn hashless_plugin_download_is_allowed(config_value: Option<&serde_json::Value>) -> bool {
    matches!(config_value, Some(serde_json::Value::Bool(true)))
}

pub(crate) fn allows_unverified_plugin_downloads(app: &AppHandle) -> bool {
    let value = app
        .store("config.json")
        .ok()
        .and_then(|store| store.get("allowUnverifiedPluginDownloads"));
    hashless_plugin_download_is_allowed(value.as_ref())
}

#[tauri::command]
pub fn get_allow_unverified_plugin_downloads(app: AppHandle) -> bool {
    allows_unverified_plugin_downloads(&app)
}

#[tauri::command]
pub fn set_allow_unverified_plugin_downloads(app: AppHandle, enabled: bool) -> Result<(), String> {
    let store = app
        .store("config.json")
        .map_err(|error| format!("Failed to open application settings: {error}"))?;
    store.set(
        "allowUnverifiedPluginDownloads",
        serde_json::Value::Bool(enabled),
    );
    store
        .save()
        .map_err(|error| format!("Failed to save plugin download policy: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashless_download_policy_defaults_to_reject() {
        assert!(!hashless_plugin_download_is_allowed(None));
        assert!(!hashless_plugin_download_is_allowed(Some(
            &serde_json::json!("true")
        )));
        assert!(!hashless_plugin_download_is_allowed(Some(
            &serde_json::json!(false)
        )));
        assert!(hashless_plugin_download_is_allowed(Some(
            &serde_json::json!(true)
        )));
    }
}
