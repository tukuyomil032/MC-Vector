//! Official server jar sources and their installation.
//!
//! [`resolve_artifact`] turns a software name and Minecraft version into the
//! provider's download URL and checksum (Paper, LeafMC, Vanilla, Fabric).
//! Metadata requests are HTTPS only, limited to [`METADATA_HOSTS`], and capped
//! in size. [`install_jar_for_creation`] downloads and verifies the jar into a
//! new server folder; a jar without a published checksum is never installed.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{redirect::Policy, Client, Url};
use serde_json::Value;
use uuid::Uuid;

use crate::download::{
    self, user_agent, CancelFlag, DownloadError, DownloadOptions, ExpectedChecksum,
};
use crate::managed_path::{
    is_link_or_reparse_point, resolve_managed_request, ManagedPathRequest, ManagedRoot,
};

const PAPER_FILL_API: &str = "https://fill.papermc.io/v3";
const PAPER_V2_API: &str = "https://api.papermc.io/v2";
const LEAF_API: &str = "https://api.leafmc.one/v2";
const MOJANG_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META_API: &str = "https://meta.fabricmc.net/v2";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_METADATA_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_JAR_BYTES: u64 = 512 * 1024 * 1024;
/// Hosts a server jar download (and its redirects) may use.
pub const SERVER_JAR_HOSTS: &[&str] = &[
    "api.leafmc.one",
    "api.papermc.io",
    "fill-data.papermc.io",
    "fill.papermc.io",
    "meta.fabricmc.net",
    "piston-data.mojang.com",
];
const METADATA_HOSTS: &[&str] = &[
    "api.leafmc.one",
    "api.papermc.io",
    "fill-data.papermc.io",
    "fill.papermc.io",
    "meta.fabricmc.net",
    "piston-meta.mojang.com",
    "piston-data.mojang.com",
];

/// The provider's download for one server jar.
#[derive(Clone, Debug)]
pub struct ResolvedArtifact {
    /// The version the provider resolved (may differ from the request when `latest`).
    pub version: String,
    pub url: String,
    /// The provider-published checksum, if any.
    pub checksum: Option<ExpectedChecksum>,
}

impl ResolvedArtifact {
    /// The SHA-256 the provider published, when it is well-formed.
    pub fn sha256(&self) -> Option<&str> {
        self.checksum
            .as_ref()
            .filter(|checksum| checksum.algorithm == "sha256" && checksum.is_valid())
            .map(|checksum| checksum.value.as_str())
    }
}

/// Software MC-Vector can download and verify by itself when creating a server.
/// Everything else needs the user to place the jar.
pub fn supports_automatic_install(software: &str) -> bool {
    matches!(software, "Paper" | "LeafMC" | "Vanilla")
}

/// Mojang publishes SHA-1 for server jars; prefer SHA-256 if it ever appears.
fn read_mojang_checksum(server: &Value) -> Option<ExpectedChecksum> {
    let read = |key: &str| {
        server[key]
            .as_str()
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
            .map(str::to_ascii_lowercase)
    };
    read("sha256")
        .map(ExpectedChecksum::sha256)
        .or_else(|| read("sha1").map(ExpectedChecksum::sha1))
}

fn approved_url(url: &Url, hosts: &[&str]) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && url.host_str().is_some_and(|host| hosts.contains(&host))
}

fn metadata_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .user_agent(user_agent())
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                attempt.error("Server metadata exceeded the redirect limit")
            } else if approved_url(attempt.url(), METADATA_HOSTS) {
                attempt.follow()
            } else {
                attempt.error("Server metadata redirect is outside approved HTTPS hosts")
            }
        }))
        .build()
        .map_err(|error| format!("Failed to create server metadata client: {error}"))
}

async fn fetch_json(client: &Client, url: Url) -> Result<Value, String> {
    if !approved_url(&url, METADATA_HOSTS) {
        return Err("Server metadata endpoint is not approved".into());
    }
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("Server metadata request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Server metadata request failed: {error}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_METADATA_BYTES as u64)
    {
        return Err("Server metadata response exceeds the size limit".into());
    }

    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Failed to read server metadata: {error}"))?;
        if body.len().saturating_add(chunk.len()) > MAX_METADATA_BYTES {
            return Err("Server metadata response exceeds the size limit".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body)
        .map_err(|error| format!("Server metadata response is invalid JSON: {error}"))
}

fn endpoint(base: &str, segments: &[&str]) -> Result<Url, String> {
    let mut url = Url::parse(base).map_err(|error| error.to_string())?;
    if !approved_url(&url, METADATA_HOSTS) {
        return Err("Server metadata endpoint is not approved".into());
    }
    let mut path = url
        .path_segments_mut()
        .map_err(|_| "Server metadata endpoint cannot accept path segments")?;
    path.pop_if_empty();
    for segment in segments {
        if segment.trim().is_empty()
            || segment.len() > 256
            || segment.chars().any(|character| {
                character.is_control() || matches!(character, '/' | '\\' | '?' | '#')
            })
            || matches!(*segment, "." | "..")
        {
            return Err("Server metadata path segment is invalid".into());
        }
        path.push(segment);
    }
    drop(path);
    Ok(url)
}

fn string(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

fn read_sha256(downloads: &Value) -> Option<String> {
    [
        downloads.get("server:default"),
        downloads.get("application"),
    ]
    .into_iter()
    .flatten()
    .filter_map(|candidate| candidate.get("checksums"))
    .filter_map(|checksums| checksums.get("sha256"))
    .filter_map(Value::as_str)
    .map(str::trim)
    .find(|hash| !hash.is_empty())
    .map(str::to_ascii_lowercase)
}

fn read_download_name(downloads: &Value) -> Option<String> {
    [
        downloads.get("application"),
        downloads.get("server:default"),
    ]
    .into_iter()
    .flatten()
    .map(|download| string(&download["name"]).trim())
    .find(|name| !name.is_empty())
    .map(str::to_owned)
}

fn read_download_url(downloads: &Value) -> Option<String> {
    [
        downloads.get("server:default"),
        downloads.get("application"),
    ]
    .into_iter()
    .flatten()
    .map(|download| string(&download["url"]).trim())
    .find(|url| !url.is_empty())
    .map(str::to_owned)
}

fn select_v2_build(builds: &Value, stable_only: bool) -> Option<&Value> {
    let builds = builds.as_array()?;
    builds.iter().rev().find(|build| {
        if !stable_only {
            return true;
        }
        match build.get("promoted").and_then(Value::as_bool) {
            Some(true) => true,
            _ => match build.get("channel").and_then(Value::as_str) {
                Some(channel) => {
                    matches!(channel.to_ascii_lowercase().as_str(), "stable" | "default")
                }
                None => true,
            },
        }
    })
}

fn read_build_number(build: &Value) -> Option<String> {
    [build.get("build"), build.get("id")]
        .into_iter()
        .flatten()
        .find_map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .or_else(|| value.as_i64().map(|number| number.to_string()))
        })
}

async fn resolve_v2_style(
    client: &Client,
    api_base: &str,
    project: &str,
    version: &str,
    latest: bool,
    file_prefix: &str,
    stable_only: bool,
) -> Result<Option<ResolvedArtifact>, String> {
    let requested = version.trim();
    let mut versions = if requested.is_empty() {
        Vec::new()
    } else {
        vec![requested.to_owned()]
    };
    if latest || versions.is_empty() {
        let project_data = fetch_json(client, endpoint(api_base, &["projects", project])?).await?;
        versions = strings(&project_data["versions"]);
        if latest {
            versions.reverse();
        }
    }

    for version in versions {
        let build_url = endpoint(
            api_base,
            &["projects", project, "versions", &version, "builds"],
        )?;
        let build_data = fetch_json(client, build_url).await?;
        let builds = build_data
            .as_array()
            .cloned()
            .or_else(|| build_data.get("builds").and_then(Value::as_array).cloned())
            .unwrap_or_default();
        let builds = Value::Array(builds);
        let Some(build) = select_v2_build(&builds, stable_only) else {
            continue;
        };
        let Some(build_number) = read_build_number(build) else {
            continue;
        };
        let file_name = read_download_name(&build["downloads"])
            .unwrap_or_else(|| format!("{file_prefix}-{version}-{build_number}.jar"));
        let download_url = endpoint(
            api_base,
            &[
                "projects",
                project,
                "versions",
                &version,
                "builds",
                &build_number,
                "downloads",
                &file_name,
            ],
        )?;
        return Ok(Some(ResolvedArtifact {
            version,
            url: download_url.to_string(),
            checksum: read_sha256(&build["downloads"]).map(ExpectedChecksum::sha256),
        }));
    }
    Ok(None)
}

fn read_paper_fill_versions(project: &Value) -> Vec<String> {
    if project["versions"].is_array() {
        return strings(&project["versions"]);
    }
    project["versions"]
        .as_object()
        .into_iter()
        .flat_map(|groups| groups.values())
        .flat_map(strings)
        .collect()
}

fn select_paper_fill_build(builds: &Value) -> Option<&Value> {
    let builds = builds.as_array().or_else(|| builds["builds"].as_array())?;
    builds
        .iter()
        .find(|build| build["channel"].as_str() == Some("STABLE"))
}

fn validate_artifact_url(url: &str, hosts: &[&str]) -> Result<String, String> {
    let parsed = Url::parse(url).map_err(|_| "Server artifact URL is invalid".to_string())?;
    if !approved_url(&parsed, hosts) {
        return Err("Server artifact URL is outside the official source allowlist".into());
    }
    Ok(parsed.to_string())
}

async fn resolve_paper_fill(
    client: &Client,
    version: &str,
    latest: bool,
) -> Result<Option<ResolvedArtifact>, String> {
    let requested = version.trim();
    let mut versions = if requested.is_empty() {
        Vec::new()
    } else {
        vec![requested.to_owned()]
    };
    if latest || versions.is_empty() {
        let project = fetch_json(client, endpoint(PAPER_FILL_API, &["projects", "paper"])?).await?;
        versions = read_paper_fill_versions(&project);
    }

    for version in versions {
        let builds = fetch_json(
            client,
            endpoint(
                PAPER_FILL_API,
                &["projects", "paper", "versions", &version, "builds"],
            )?,
        )
        .await?;
        let Some(build) = select_paper_fill_build(&builds) else {
            continue;
        };
        let Some(raw_url) = read_download_url(&build["downloads"]) else {
            continue;
        };
        let url = validate_artifact_url(&raw_url, &["fill.papermc.io", "fill-data.papermc.io"])?;
        return Ok(Some(ResolvedArtifact {
            version,
            url,
            checksum: read_sha256(&build["downloads"]).map(ExpectedChecksum::sha256),
        }));
    }
    Ok(None)
}

async fn resolve_paper(
    client: &Client,
    version: &str,
    latest: bool,
) -> Result<Option<ResolvedArtifact>, String> {
    match resolve_paper_fill(client, version, latest).await {
        Ok(result) => Ok(result),
        Err(error) => {
            log::warn!("Paper Fill API resolution failed; trying official v2 fallback: {error}");
            resolve_v2_style(
                client,
                PAPER_V2_API,
                "paper",
                version,
                latest,
                "paper",
                true,
            )
            .await
        }
    }
}

fn select_vanilla_version(
    manifest: &Value,
    version: &str,
    latest: bool,
) -> Option<(String, String)> {
    let versions = manifest["versions"].as_array()?;
    if !latest && !version.trim().is_empty() {
        return versions
            .iter()
            .find(|entry| entry["id"].as_str() == Some(version.trim()))
            .and_then(|entry| {
                Some((
                    entry["id"].as_str()?.to_owned(),
                    entry["url"].as_str()?.to_owned(),
                ))
            });
    }
    versions
        .iter()
        .find(|entry| entry["type"].as_str() == Some("release"))
        .and_then(|entry| {
            Some((
                entry["id"].as_str()?.to_owned(),
                entry["url"].as_str()?.to_owned(),
            ))
        })
}

fn select_fabric_loader(loaders: &Value) -> Option<String> {
    let entries = loaders.as_array()?;
    entries
        .iter()
        .find(|entry| entry["loader"]["stable"].as_bool() == Some(true))
        .or_else(|| entries.first())
        .and_then(|entry| entry["loader"]["version"].as_str())
        .map(str::to_owned)
}

fn select_fabric_installer(installers: &Value) -> Option<String> {
    let entries = installers.as_array()?;
    entries
        .iter()
        .find(|entry| entry["stable"].as_bool() == Some(true))
        .or_else(|| entries.first())
        .and_then(|entry| entry["version"].as_str())
        .map(str::to_owned)
}

/// Finds the official download for `software` at `version` (or the newest
/// version when `latest`). `Ok(None)` means MC-Vector cannot download that
/// software automatically.
pub async fn resolve_artifact(
    software: &str,
    version: &str,
    latest: bool,
) -> Result<Option<ResolvedArtifact>, String> {
    let client = metadata_client()?;
    match software {
        "Paper" => resolve_paper(&client, version, latest).await,
        "LeafMC" => {
            resolve_v2_style(&client, LEAF_API, "leaf", version, latest, "leaf", false).await
        }
        "Vanilla" => {
            let manifest = fetch_json(&client, Url::parse(MOJANG_MANIFEST_URL).unwrap()).await?;
            let Some((version, detail_url)) = select_vanilla_version(&manifest, version, latest)
            else {
                return Ok(None);
            };
            let detail_url = validate_artifact_url(&detail_url, &["piston-meta.mojang.com"])?;
            let detail = fetch_json(&client, Url::parse(&detail_url).unwrap()).await?;
            let Some(raw_url) = detail["downloads"]["server"]["url"].as_str() else {
                return Ok(None);
            };
            let url = validate_artifact_url(raw_url, &["piston-data.mojang.com"])?;
            Ok(Some(ResolvedArtifact {
                version,
                url,
                checksum: read_mojang_checksum(&detail["downloads"]["server"]),
            }))
        }
        "Fabric" => {
            let version = version.trim();
            if version.is_empty() {
                return Ok(None);
            }
            let loaders = fetch_json(
                &client,
                endpoint(FABRIC_META_API, &["versions", "loader", version])?,
            )
            .await?;
            let Some(loader) = select_fabric_loader(&loaders) else {
                return Ok(None);
            };
            let installers = fetch_json(
                &client,
                endpoint(FABRIC_META_API, &["versions", "installer"])?,
            )
            .await?;
            let Some(installer) = select_fabric_installer(&installers) else {
                return Ok(None);
            };
            let url = endpoint(
                FABRIC_META_API,
                &[
                    "versions", "loader", version, &loader, &installer, "server", "jar",
                ],
            )?;
            Ok(Some(ResolvedArtifact {
                version: version.to_owned(),
                url: url.to_string(),
                // Fabric publishes no checksum for its server launcher jar.
                checksum: None,
            }))
        }
        _ => Ok(None),
    }
}

/// `servers/<serverId>/server.jar` and the canonical `servers` root.
pub fn server_jar_path(app_data_dir: &Path, server_id: &str) -> Result<(PathBuf, PathBuf), String> {
    let destination = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_owned()),
            relative_path: "server.jar".to_owned(),
        },
        true,
    )?;
    let root = app_data_dir.join("servers");
    let canonical_root = fs::canonicalize(&root)
        .map_err(|error| format!("Failed to resolve managed servers directory: {error}"))?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Server jar destination has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Failed to resolve server jar directory: {error}"))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Server jar directory must remain inside managed storage".into());
    }
    Ok((destination, canonical_root))
}

/// Moves a verified staging jar to `destination`. Returns the rollback file
/// holding the previous jar, if there was one.
pub fn commit_download(
    staging: &Path,
    destination: &Path,
    managed_root: &Path,
) -> Result<Option<PathBuf>, String> {
    let canonical_staging = staging
        .canonicalize()
        .map_err(|error| format!("Failed to resolve verified server jar: {error}"))?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Server jar destination has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Failed to resolve server jar directory: {error}"))?;
    if !canonical_staging.starts_with(managed_root)
        || !canonical_parent.starts_with(managed_root)
        || canonical_staging.parent() != Some(canonical_parent.as_path())
    {
        return Err("Server jar files must remain inside the same managed directory".into());
    }
    match fs::symlink_metadata(destination) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_file() => {
            Err("Server jar destination is not a regular file".into())
        }
        Ok(_) => {
            let name = destination
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("server.jar");
            let rollback =
                destination.with_file_name(format!(".{name}.rollback-{}", Uuid::new_v4()));
            fs::rename(destination, &rollback)
                .map_err(|error| format!("Failed to stage existing server jar: {error}"))?;
            match fs::rename(staging, destination) {
                Ok(()) => Ok(Some(rollback)),
                Err(error) => match fs::rename(&rollback, destination) {
                    Ok(()) => Err(format!(
                        "Failed to install server jar; previous jar restored: {error}"
                    )),
                    Err(restore_error) => Err(format!(
                        "Failed to install server jar ({error}) and restore previous jar ({restore_error})"
                    )),
                },
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::rename(staging, destination)
                .map(|()| None)
                .map_err(|error| format!("Failed to publish verified server jar: {error}"))
        }
        Err(error) => Err(format!("Failed to inspect server jar destination: {error}")),
    }
}

pub fn cleanup_rollback(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        log::warn!("Failed to remove previous server jar {:?}: {error}", path);
    }
}

/// Why a jar could not be installed during server creation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JarInstallError {
    /// The provider metadata could not be read.
    Unavailable(String),
    /// The download failed (network, checksum, size, cancellation).
    Download(DownloadError),
    /// A local file operation failed.
    Io(String),
}

impl std::fmt::Display for JarInstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(message) | Self::Io(message) => f.write_str(message),
            Self::Download(error) => f.write_str(&error.message),
        }
    }
}

impl From<JarInstallError> for String {
    fn from(error: JarInstallError) -> Self {
        error.to_string()
    }
}

/// Resolves and installs the server jar for a server being created. The
/// caller has created `servers/<serverId>` and holds that server's operation
/// lock. `progress` receives 0–100, or `None` while the size is unknown, and
/// always ends with `Some(100)` after a successful install.
///
/// Returns the resolved version, or `Ok(None)` when the jar must be placed by
/// hand (no automatic source, or the source publishes no checksum).
pub async fn install_jar_for_creation<F>(
    data_dir: &Path,
    server_id: &str,
    software: &str,
    version: &str,
    cancel: Option<&CancelFlag>,
    mut progress: F,
) -> Result<Option<String>, JarInstallError>
where
    F: FnMut(Option<u32>),
{
    if !supports_automatic_install(software) {
        return Ok(None);
    }
    let Some(artifact) = resolve_artifact(software, version, false)
        .await
        .map_err(JarInstallError::Unavailable)?
    else {
        return Ok(None);
    };
    let Some(checksum) = artifact.checksum.clone().filter(ExpectedChecksum::is_valid) else {
        log::info!("{software} {version} has no published checksum; the jar is not installed");
        return Ok(None);
    };

    let data_dir_for_path = data_dir.to_owned();
    let server_id_for_path = server_id.to_owned();
    let (destination, managed_root) = tokio::task::spawn_blocking(move || {
        server_jar_path(&data_dir_for_path, &server_id_for_path)
    })
    .await
    .map_err(|error| {
        JarInstallError::Io(format!("Server directory validation task failed: {error}"))
    })?
    .map_err(JarInstallError::Io)?;

    let verified = download::download_verified_artifact(
        &artifact.url,
        &destination,
        &managed_root,
        &checksum,
        MAX_JAR_BYTES,
        DownloadOptions {
            expected_size: None,
            allowed_hosts: Some(SERVER_JAR_HOSTS),
            cancel,
        },
        |downloaded, total| progress(download::percent(downloaded, total)),
    )
    .await
    .map_err(JarInstallError::Download)?;

    let staging = verified.path;
    let rollback = tokio::task::spawn_blocking(move || {
        let committed = commit_download(&staging, &destination, &managed_root);
        if committed.is_err() {
            let _ = fs::remove_file(&staging);
        }
        committed
    })
    .await
    .map_err(|error| JarInstallError::Io(format!("Server jar commit task failed: {error}")))?
    .map_err(JarInstallError::Io)?;
    if let Some(rollback) = rollback {
        let _ = tokio::task::spawn_blocking(move || cleanup_rollback(&rollback)).await;
    }
    progress(Some(100));
    Ok(Some(artifact.version))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolver_accepts_only_exact_approved_https_sources() {
        for raw in [
            "https://fill-data.papermc.io/v1/server.jar",
            "https://api.papermc.io/v2/server.jar",
            "https://api.leafmc.one/v2/server.jar",
            "https://piston-data.mojang.com/v1/server.jar",
            "https://meta.fabricmc.net/v2/server.jar",
        ] {
            assert!(
                approved_url(&Url::parse(raw).unwrap(), SERVER_JAR_HOSTS),
                "{raw}"
            );
        }
        for raw in [
            "http://api.papermc.io/v2/server.jar",
            "https://api.papermc.io.evil.test/server.jar",
            "https://piston-meta.mojang.com/server.jar",
            "https://meta.fabricmc.net:444/v2/server.jar",
        ] {
            assert!(
                !approved_url(&Url::parse(raw).unwrap(), SERVER_JAR_HOSTS),
                "{raw}"
            );
        }
    }

    #[test]
    fn endpoints_encode_segments_and_reject_traversal() {
        assert_eq!(
            endpoint(
                PAPER_V2_API,
                &["projects", "paper", "versions", "1.21 test"]
            )
            .unwrap()
            .as_str(),
            "https://api.papermc.io/v2/projects/paper/versions/1.21%20test"
        );
        assert!(endpoint(PAPER_V2_API, &["projects", "..", "versions"]).is_err());
        assert!(endpoint(PAPER_V2_API, &["projects/paper"]).is_err());
    }

    #[test]
    fn paper_fill_version_groups_and_stable_builds_are_selected() {
        assert_eq!(
            read_paper_fill_versions(&serde_json::json!({
                "versions": {"1.20": ["1.20.6"], "1.21": ["1.21.1", "1.21.2"]}
            })),
            ["1.20.6", "1.21.1", "1.21.2"]
        );
        let builds = serde_json::json!([
            {"channel":"EXPERIMENTAL", "id": 1},
            {"channel":"STABLE", "id": 2}
        ]);
        assert_eq!(select_paper_fill_build(&builds).unwrap()["id"], 2);
    }

    #[test]
    fn v2_stable_filter_preserves_promoted_and_default_rules() {
        let builds = serde_json::json!([
            {"build": 1, "channel": "experimental"},
            {"build": 2, "channel": "default"},
            {"build": 3, "channel": "experimental", "promoted": true},
            {"build": 4, "channel": "stable", "promoted": false}
        ]);
        assert_eq!(
            read_build_number(select_v2_build(&builds, false).unwrap()).as_deref(),
            Some("4")
        );
        assert_eq!(
            read_build_number(select_v2_build(&builds, true).unwrap()).as_deref(),
            Some("4")
        );
    }

    #[test]
    fn malformed_primary_checksum_is_preserved_to_fail_closed() {
        assert_eq!(
            read_sha256(&serde_json::json!({"application":{"checksums":{"sha256":"a"}}})),
            Some("a".to_string())
        );
        assert_eq!(
            read_sha256(
                &serde_json::json!({"application":{"checksums":{"sha256":"B".repeat(64)}}})
            ),
            Some("b".repeat(64))
        );
        assert_eq!(
            read_sha256(&serde_json::json!({
                "server:default":{"checksums":{"sha256":" "}},
                "application":{"checksums":{"sha256":"B".repeat(64)}}
            })),
            Some("b".repeat(64))
        );
    }

    #[test]
    fn vanilla_selects_release_for_latest_and_exact_requested_id_otherwise() {
        let manifest = serde_json::json!({"versions":[
            {"id":"snapshot", "type":"snapshot", "url":"https://piston-meta.mojang.com/s.json"},
            {"id":"1.21.1", "type":"release", "url":"https://piston-meta.mojang.com/r.json"}
        ]});
        assert_eq!(
            select_vanilla_version(&manifest, "", true).unwrap().0,
            "1.21.1"
        );
        assert_eq!(
            select_vanilla_version(&manifest, "snapshot", false)
                .unwrap()
                .0,
            "snapshot"
        );
        assert!(select_vanilla_version(&manifest, "missing", false).is_none());
    }

    #[test]
    fn fabric_chooses_stable_loader_and_installer_but_retains_fallback() {
        let loaders = serde_json::json!([
            {"loader":{"version":"0.16.4", "stable":false}},
            {"loader":{"version":"0.16.5", "stable":true}}
        ]);
        let installers = serde_json::json!([
            {"version":"1.0.0", "stable":false},
            {"version":"1.0.1", "stable":true}
        ]);
        assert_eq!(select_fabric_loader(&loaders).as_deref(), Some("0.16.5"));
        assert_eq!(
            select_fabric_installer(&installers).as_deref(),
            Some("1.0.1")
        );
        assert_eq!(
            select_fabric_loader(&serde_json::json!([{"loader":{"version":"fallback"}}]))
                .as_deref(),
            Some("fallback")
        );
    }

    #[test]
    fn vanilla_uses_the_published_sha1_and_prefers_sha256() {
        let sha1 = "A".repeat(40);
        let only_sha1 = read_mojang_checksum(&serde_json::json!({"sha1": sha1}));
        assert_eq!(only_sha1, Some(ExpectedChecksum::sha1("a".repeat(40))));
        assert!(only_sha1.unwrap().is_valid());
        let both = read_mojang_checksum(
            &serde_json::json!({"sha1": "a".repeat(40), "sha256": "b".repeat(64)}),
        );
        assert_eq!(both, Some(ExpectedChecksum::sha256("b".repeat(64))));
        assert_eq!(read_mojang_checksum(&serde_json::json!({})), None);
    }

    #[test]
    fn only_checksummed_sources_install_automatically() {
        for software in ["Paper", "LeafMC", "Vanilla"] {
            assert!(supports_automatic_install(software), "{software}");
        }
        for software in ["Fabric", "Spigot", "Forge", "Velocity", "paper"] {
            assert!(!supports_automatic_install(software), "{software}");
        }
    }

    #[tokio::test]
    async fn fabric_creation_needs_a_manual_jar_without_network_access() {
        let dir = tempfile::tempdir().unwrap();
        let mut reported = Vec::new();
        let installed = install_jar_for_creation(
            dir.path(),
            "server-id",
            "Fabric",
            "1.21.1",
            None,
            |progress| reported.push(progress),
        )
        .await
        .unwrap();
        assert_eq!(installed, None);
        assert!(reported.is_empty());
    }
}
