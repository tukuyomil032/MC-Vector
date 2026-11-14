//! Tauri-side download helpers. The verified-download engine lives in
//! `mcvector_core::download`; this module keeps the Tauri wrappers (progress
//! callbacks that emit events) and the plugin download policy stored through
//! `tauri-plugin-store`.

use std::path::{Path, PathBuf};

use mcvector_core::download::{self as core_download, DownloadOptions};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub use mcvector_core::download::{
    read_limited_response_body, required_sha256, send_request_with_timeout, ExpectedChecksum,
    VerifiedArtifact,
};

const MAX_PLUGIN_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

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

fn provider_hosts(provider: &str) -> Result<&'static [&'static str], String> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "modrinth" => Ok(&["cdn.modrinth.com"]),
        "hangar" => Ok(&["hangar.papermc.io", "hangarcdn.papermc.io", "dl.hangar.io"]),
        "spiget" => Ok(&["api.spiget.org", "cdn.spiget.org"]),
        _ => Err("Unsupported plugin download provider".to_string()),
    }
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

/// Internal transport for Rust-owned install plans. Destinations must be private
/// staging files; the transaction service owns all publication and rollback.
pub(crate) async fn stage_plugin_artifact<F>(
    provider: &str,
    url: &str,
    destination: PathBuf,
    managed_root: &Path,
    checksum: Option<ExpectedChecksum>,
    report: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    let hosts = provider_hosts(provider)?;
    let url = core_download::validate_https_url(url, Some(hosts))?;
    core_download::download_to_destination(
        &url,
        destination,
        managed_root,
        checksum,
        MAX_PLUGIN_DOWNLOAD_BYTES,
        DownloadOptions {
            expected_size: None,
            allowed_hosts: Some(hosts),
            cancel: None,
        },
        infallible_report(report),
    )
    .await
    .map_err(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_download::validate_download_redirect;
    use reqwest::Url;

    #[test]
    fn provider_allowlists_are_exact() {
        assert_eq!(provider_hosts("modrinth").unwrap(), ["cdn.modrinth.com"]);
        assert!(provider_hosts("hangar")
            .unwrap()
            .contains(&"hangarcdn.papermc.io"));
        assert!(provider_hosts("modrinth.evil.example").is_err());
    }

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

    #[test]
    fn spiget_download_redirects_allow_only_its_api_and_official_cdn() {
        let hosts = provider_hosts("spiget").unwrap();
        for url in [
            "https://api.spiget.org/v2/resources/123/download",
            "https://cdn.spiget.org/file/123.jar",
        ] {
            assert!(
                validate_download_redirect(&Url::parse(url).unwrap(), Some(hosts), 1).is_ok(),
                "{url}"
            );
        }
        for url in [
            "https://external.example/plugin.jar",
            "https://cdn.spiget.org.evil.test/plugin.jar",
            "https://sub.cdn.spiget.org/plugin.jar",
            "http://cdn.spiget.org/plugin.jar",
        ] {
            assert!(
                validate_download_redirect(&Url::parse(url).unwrap(), Some(hosts), 1).is_err(),
                "{url}"
            );
        }
        assert!(validate_download_redirect(
            &Url::parse("https://cdn.spiget.org/plugin.jar").unwrap(),
            Some(provider_hosts("modrinth").unwrap()),
            1
        )
        .is_err());
    }
}
