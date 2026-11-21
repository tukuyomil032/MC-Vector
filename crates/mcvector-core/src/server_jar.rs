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
    /// The provider's file name for the jar (it is always installed as `server.jar`).
    pub file_name: String,
    /// The size the provider published, when it did.
    pub size: Option<u64>,
    /// Normalized provider channel (for example, `stable`, `beta` or `alpha`).
    pub channel: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VersionAvailability {
    Stable,
    Unstable { channel: String },
    None { reason: String },
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
    matches!(software, "Paper" | "LeafMC" | "Leaf" | "Vanilla")
}

/// Software [`resolve_artifact`] and [`available_versions`] know. Fabric is
/// resolvable but publishes no checksum, so it is not installed automatically.
pub fn has_resolver(software: &str) -> bool {
    supports_automatic_install(software) || software == "Fabric"
}

/// The installed software first, followed by automatically installable
/// alternatives within its server family. Proxies and vanilla stand alone.
pub fn target_software_candidates(software: &str) -> Vec<String> {
    let mut targets = vec![software.to_owned()];
    let (current, family) = match software {
        "Leaf" | "LeafMC" => ("LeafMC", &["Paper", "LeafMC"][..]),
        "Paper" | "Purpur" | "Folia" | "Spigot" | "CraftBukkit" | "Pufferfish" | "Bukkit" => {
            (software, &["Paper", "LeafMC"][..])
        }
        "Fabric" | "Forge" | "NeoForge" => (software, &["Fabric", "Forge", "NeoForge"][..]),
        _ => return targets,
    };
    targets.extend(
        family
            .iter()
            .copied()
            .filter(|target| *target != current && supports_automatic_install(target))
            .map(str::to_owned),
    );
    targets
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
    fetch_json_if_present(client, url)
        .await?
        .ok_or_else(|| "Server metadata endpoint was not found (HTTP 404)".into())
}

async fn fetch_json_if_present(client: &Client, url: Url) -> Result<Option<Value>, String> {
    if !approved_url(&url, METADATA_HOSTS) {
        return Err("Server metadata endpoint is not approved".into());
    }
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("Server metadata request failed: {error}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let response = response
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
        .map(Some)
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
    .flat_map(|candidate| [&candidate["checksums"]["sha256"], &candidate["sha256"]])
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

fn read_download_size(downloads: &Value) -> Option<u64> {
    [
        downloads.get("server:default"),
        downloads.get("application"),
    ]
    .into_iter()
    .flatten()
    .find_map(|download| download["size"].as_u64())
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

#[derive(Clone, Copy)]
enum BuildPolicy {
    StableOnly,
    PreferStable,
    /// The existing Leaf creation resolver accepts the newest build.
    Latest,
}

fn v2_channel(build: &Value) -> String {
    let channel = build["channel"]
        .as_str()
        .unwrap_or("default")
        .to_ascii_lowercase();
    if build["promoted"].as_bool() == Some(true) || matches!(channel.as_str(), "default" | "stable")
    {
        "stable".into()
    } else {
        channel
    }
}

fn select_build<'a>(
    builds: impl Iterator<Item = &'a Value>,
    policy: BuildPolicy,
    channel_for: impl Fn(&Value) -> String,
) -> Option<(&'a Value, String)> {
    builds
        .filter_map(|build| {
            let channel = channel_for(build);
            let stable = channel == "stable";
            if channel.is_empty() || (!stable && matches!(policy, BuildPolicy::StableOnly)) {
                return None;
            }
            let stable_rank = stable && matches!(policy, BuildPolicy::PreferStable);
            let number = read_build_number(build).and_then(|number| number.parse::<u64>().ok());
            Some(((stable_rank, number), (build, channel)))
        })
        .max_by_key(|(rank, _)| *rank)
        .map(|(_, selected)| selected)
}

fn select_v2_build(builds: &Value, policy: BuildPolicy) -> Option<(&Value, String)> {
    let builds = builds.as_array().or_else(|| builds["builds"].as_array())?;
    select_build(
        builds
            .iter()
            .filter(|build| read_build_number(build).is_some()),
        policy,
        v2_channel,
    )
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

async fn resolve_v2_style<F, Fut>(
    fetch: &F,
    api_base: &str,
    project: &str,
    version: &str,
    latest: bool,
    file_prefix: &str,
    policy: BuildPolicy,
) -> Result<Option<ResolvedArtifact>, String>
where
    F: Fn(Url) -> Fut,
    Fut: std::future::Future<Output = Result<Option<Value>, String>>,
{
    let requested = version.trim();
    let mut versions = if requested.is_empty() {
        Vec::new()
    } else {
        vec![requested.to_owned()]
    };
    if latest || versions.is_empty() {
        let project_data = fetch(endpoint(api_base, &["projects", project])?)
            .await?
            .ok_or("Server project metadata was not found")?;
        versions = strings(&project_data["versions"]);
        if latest {
            versions = crate::server_upgrade::newer_releases("", &versions);
        }
    }

    for version in versions {
        let build_url = endpoint(
            api_base,
            &["projects", project, "versions", &version, "builds"],
        )?;
        let Some(builds) = fetch(build_url).await? else {
            continue;
        };
        let Some((build, channel)) = select_v2_build(&builds, policy) else {
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
            size: read_download_size(&build["downloads"]),
            file_name,
            channel,
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

fn select_paper_fill_build(builds: &Value, policy: BuildPolicy) -> Option<(&Value, String)> {
    let builds = builds.as_array().or_else(|| builds["builds"].as_array())?;
    select_build(
        builds
            .iter()
            .rev()
            .filter(|build| read_download_url(&build["downloads"]).is_some()),
        policy,
        |build| string(&build["channel"]).to_ascii_lowercase(),
    )
}

fn validate_artifact_url(url: &str, hosts: &[&str]) -> Result<String, String> {
    let parsed = Url::parse(url).map_err(|_| "Server artifact URL is invalid".to_string())?;
    if !approved_url(&parsed, hosts) {
        return Err("Server artifact URL is outside the official source allowlist".into());
    }
    Ok(parsed.to_string())
}

async fn resolve_paper_fill<F, Fut>(
    fetch: &F,
    version: &str,
    latest: bool,
    policy: BuildPolicy,
) -> Result<Option<ResolvedArtifact>, String>
where
    F: Fn(Url) -> Fut,
    Fut: std::future::Future<Output = Result<Option<Value>, String>>,
{
    let requested = version.trim();
    let mut versions = if requested.is_empty() {
        Vec::new()
    } else {
        vec![requested.to_owned()]
    };
    if latest || versions.is_empty() {
        let project = fetch(endpoint(PAPER_FILL_API, &["projects", "paper"])?)
            .await?
            .ok_or("Paper Fill project metadata was not found")?;
        versions = read_paper_fill_versions(&project);
        if latest {
            versions = crate::server_upgrade::newer_releases("", &versions);
        }
    }

    for version in versions {
        let Some(builds) = fetch(endpoint(
            PAPER_FILL_API,
            &["projects", "paper", "versions", &version, "builds"],
        )?)
        .await?
        else {
            continue;
        };
        let Some((build, channel)) = select_paper_fill_build(&builds, policy) else {
            continue;
        };
        let Some(raw_url) = read_download_url(&build["downloads"]) else {
            continue;
        };
        let url = validate_artifact_url(&raw_url, &["fill.papermc.io", "fill-data.papermc.io"])?;
        let file_name = read_download_name(&build["downloads"])
            .unwrap_or_else(|| format!("paper-{version}.jar"));
        return Ok(Some(ResolvedArtifact {
            version,
            url,
            checksum: read_sha256(&build["downloads"]).map(ExpectedChecksum::sha256),
            size: read_download_size(&build["downloads"]),
            file_name,
            channel,
        }));
    }
    Ok(None)
}

async fn resolve_paper<F, Fut>(
    fetch: &F,
    version: &str,
    latest: bool,
    policy: BuildPolicy,
) -> Result<Option<ResolvedArtifact>, String>
where
    F: Fn(Url) -> Fut,
    Fut: std::future::Future<Output = Result<Option<Value>, String>>,
{
    match resolve_paper_fill(fetch, version, latest, policy).await {
        Ok(result) => Ok(result),
        Err(error) => {
            log::warn!("Paper Fill API resolution failed; trying official v2 fallback: {error}");
            resolve_v2_style(
                fetch,
                PAPER_V2_API,
                "paper",
                version,
                latest,
                "paper",
                policy,
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

fn select_fabric_component<'a>(
    entries: impl Iterator<Item = &'a Value>,
) -> Option<(&'a str, bool)> {
    let mut fallback = None;
    for entry in entries {
        if let Some(version) = entry["version"].as_str() {
            if entry["stable"].as_bool() == Some(true) {
                return Some((version, true));
            }
            fallback.get_or_insert((version, false));
        }
    }
    fallback
}

/// Finds the official download for `software` at `version` (or the newest
/// version when `latest`). `Ok(None)` means MC-Vector cannot download that
/// software automatically.
pub async fn resolve_artifact(
    software: &str,
    version: &str,
    latest: bool,
) -> Result<Option<ResolvedArtifact>, String> {
    let policy = match software {
        "Leaf" | "LeafMC" => BuildPolicy::Latest,
        "Fabric" => BuildPolicy::PreferStable,
        _ => BuildPolicy::StableOnly,
    };
    resolve_artifact_with_metadata(software, version, latest, policy).await
}

/// Resolves a version for an in-place change. A stable build takes precedence
/// over newer unstable builds for the same version.
pub async fn resolve_artifact_with_policy(
    software: &str,
    version: &str,
    latest: bool,
    allow_unstable: bool,
) -> Result<Option<ResolvedArtifact>, String> {
    let policy = if allow_unstable {
        BuildPolicy::PreferStable
    } else {
        BuildPolicy::StableOnly
    };
    resolve_artifact_with_metadata(software, version, latest, policy).await
}

async fn resolve_artifact_with_metadata(
    software: &str,
    version: &str,
    latest: bool,
    policy: BuildPolicy,
) -> Result<Option<ResolvedArtifact>, String> {
    let client = metadata_client()?;
    resolve_artifact_with(software, version, latest, policy, &|url| {
        let client = client.clone();
        async move { fetch_json_if_present(&client, url).await }
    })
    .await
}

async fn resolve_artifact_with<F, Fut>(
    software: &str,
    version: &str,
    latest: bool,
    policy: BuildPolicy,
    fetch: &F,
) -> Result<Option<ResolvedArtifact>, String>
where
    F: Fn(Url) -> Fut,
    Fut: std::future::Future<Output = Result<Option<Value>, String>>,
{
    match software {
        "Paper" => resolve_paper(fetch, version, latest, policy).await,
        "Leaf" | "LeafMC" => {
            resolve_v2_style(fetch, LEAF_API, "leaf", version, latest, "leaf", policy).await
        }
        "Vanilla" => {
            let manifest = fetch(Url::parse(MOJANG_MANIFEST_URL).unwrap())
                .await?
                .ok_or("Minecraft version manifest was not found")?;
            let Some((version, detail_url)) = select_vanilla_version(&manifest, version, latest)
            else {
                return Ok(None);
            };
            let detail_url = validate_artifact_url(&detail_url, &["piston-meta.mojang.com"])?;
            let Some(detail) = fetch(Url::parse(&detail_url).unwrap()).await? else {
                return Ok(None);
            };
            let Some(raw_url) = detail["downloads"]["server"]["url"].as_str() else {
                return Ok(None);
            };
            let url = validate_artifact_url(raw_url, &["piston-data.mojang.com"])?;
            Ok(Some(ResolvedArtifact {
                file_name: format!("minecraft_server.{version}.jar"),
                version,
                url,
                checksum: read_mojang_checksum(&detail["downloads"]["server"]),
                size: detail["downloads"]["server"]["size"].as_u64(),
                channel: "stable".into(),
            }))
        }
        "Fabric" => {
            let version = version.trim();
            if version.is_empty() {
                return Ok(None);
            }
            let loaders = fetch(endpoint(FABRIC_META_API, &["versions", "loader", version])?)
                .await?
                .unwrap_or_default();
            let Some((loader, loader_stable)) = select_fabric_component(
                loaders
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|entry| &entry["loader"]),
            ) else {
                return Ok(None);
            };
            let installers = fetch(endpoint(FABRIC_META_API, &["versions", "installer"])?)
                .await?
                .unwrap_or_default();
            let Some((installer, installer_stable)) =
                select_fabric_component(installers.as_array().into_iter().flatten())
            else {
                return Ok(None);
            };
            let channel = if loader_stable && installer_stable {
                "stable"
            } else if matches!(policy, BuildPolicy::StableOnly) {
                return Ok(None);
            } else {
                "experimental"
            };
            let url = endpoint(
                FABRIC_META_API,
                &[
                    "versions", "loader", version, loader, installer, "server", "jar",
                ],
            )?;
            Ok(Some(ResolvedArtifact {
                version: version.to_owned(),
                url: url.to_string(),
                // Fabric publishes no checksum for its server launcher jar.
                checksum: None,
                size: None,
                file_name: format!(
                    "fabric-server-mc.{version}-loader.{loader}-launcher.{installer}.jar"
                ),
                channel: channel.into(),
            }))
        }
        _ => Ok(None),
    }
}

/// Reports the provider channel for a version without downloading its JAR.
/// Missing versions are distinguished from provider and transport failures.
pub async fn version_availability(
    software: &str,
    version: &str,
) -> Result<VersionAvailability, String> {
    let client = metadata_client()?;
    version_availability_with(software, version, &|url| {
        let client = client.clone();
        async move { fetch_json_if_present(&client, url).await }
    })
    .await
}

async fn version_availability_with<F, Fut>(
    software: &str,
    version: &str,
    fetch: &F,
) -> Result<VersionAvailability, String>
where
    F: Fn(Url) -> Fut,
    Fut: std::future::Future<Output = Result<Option<Value>, String>>,
{
    let version = version.trim();
    let missing = || VersionAvailability::None {
        reason: format!("No server build is available for {software} {version}"),
    };
    if !has_resolver(software) {
        return Ok(VersionAvailability::None {
            reason: format!("No official JAR source is supported for {software}"),
        });
    }
    if version.is_empty() {
        return Ok(missing());
    }
    if software == "Vanilla" {
        let manifest = fetch(Url::parse(MOJANG_MANIFEST_URL).unwrap())
            .await?
            .ok_or("Minecraft version manifest was not found")?;
        return Ok(
            if read_vanilla_releases(&manifest)
                .iter()
                .any(|id| id == version)
            {
                VersionAvailability::Stable
            } else {
                missing()
            },
        );
    }
    let artifact =
        resolve_artifact_with(software, version, false, BuildPolicy::PreferStable, fetch).await?;
    Ok(match artifact {
        Some(artifact) if artifact.channel == "stable" => VersionAvailability::Stable,
        Some(artifact) => VersionAvailability::Unstable {
            channel: artifact.channel,
        },
        None => missing(),
    })
}

/// Every version the provider lists for `software` (unordered, may include
/// snapshots or pre-releases). `Ok(None)` when MC-Vector has no resolver for
/// that software.
pub async fn available_versions(software: &str) -> Result<Option<Vec<String>>, String> {
    let client = metadata_client()?;
    available_versions_with(software, |url| {
        let client = client.clone();
        async move { fetch_json(&client, url).await }
    })
    .await
}

/// [`available_versions`] with the metadata fetch supplied by the caller, so
/// tests can serve the provider responses from a loopback server.
pub(crate) async fn available_versions_with<F, Fut>(
    software: &str,
    fetch: F,
) -> Result<Option<Vec<String>>, String>
where
    F: Fn(Url) -> Fut,
    Fut: std::future::Future<Output = Result<Value, String>>,
{
    match software {
        "Paper" => match fetch(endpoint(PAPER_FILL_API, &["projects", "paper"])?).await {
            Ok(project) => Ok(Some(read_paper_fill_versions(&project))),
            Err(error) => {
                log::warn!("Paper Fill API version list failed; trying official v2: {error}");
                let project = fetch(endpoint(PAPER_V2_API, &["projects", "paper"])?).await?;
                Ok(Some(strings(&project["versions"])))
            }
        },
        "Leaf" | "LeafMC" => {
            let project = fetch(endpoint(LEAF_API, &["projects", "leaf"])?).await?;
            Ok(Some(strings(&project["versions"])))
        }
        "Vanilla" => {
            let manifest =
                fetch(Url::parse(MOJANG_MANIFEST_URL).map_err(|e| e.to_string())?).await?;
            Ok(Some(read_vanilla_releases(&manifest)))
        }
        "Fabric" => {
            let games = fetch(endpoint(FABRIC_META_API, &["versions", "game"])?).await?;
            Ok(Some(read_fabric_stable_games(&games)))
        }
        _ => Ok(None),
    }
}

fn read_vanilla_releases(manifest: &Value) -> Vec<String> {
    manifest["versions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| entry["type"].as_str() == Some("release"))
        .filter_map(|entry| entry["id"].as_str())
        .map(str::to_owned)
        .collect()
}

fn read_fabric_stable_games(games: &Value) -> Vec<String> {
    games
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| entry["stable"].as_bool() == Some(true))
        .filter_map(|entry| entry["version"].as_str())
        .map(str::to_owned)
        .collect()
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
            {"channel":"EXPERIMENTAL", "id": 1, "downloads": {
                "server:default": {"url": "https://fill-data.papermc.io/experimental.jar"}
            }},
            {"channel":"STABLE", "id": 2, "downloads": {
                "server:default": {"url": "https://fill-data.papermc.io/stable.jar"}
            }},
            {"channel":"STABLE", "id": 3, "downloads": {}}
        ]);
        assert_eq!(
            select_paper_fill_build(&builds, BuildPolicy::StableOnly)
                .unwrap()
                .0["id"],
            2
        );
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
            read_build_number(select_v2_build(&builds, BuildPolicy::Latest).unwrap().0).as_deref(),
            Some("4")
        );
        assert_eq!(
            read_build_number(select_v2_build(&builds, BuildPolicy::StableOnly).unwrap().0)
                .as_deref(),
            Some("4")
        );
    }

    #[tokio::test]
    async fn availability_and_policy_share_provider_build_selection() {
        use serde_json::json;

        let paper_build = |id: u64, channel: &str| {
            json!({
                "id": id,
                "channel": channel,
                "downloads": {
                    "server:default": {
                        "url": format!("https://fill-data.papermc.io/paper-{id}.jar"),
                        "checksums": {"sha256": "a".repeat(64)}
                    }
                }
            })
        };
        let stable = json!([paper_build(6, "BETA"), paper_build(2, "STABLE")]);
        let unstable = json!([paper_build(1, "BETA"), paper_build(3, "ALPHA")]);
        let leaf = json!({"builds": [
            {"build": 8, "channel": "experimental"},
            {"build": 4, "channel": "default", "downloads": {
                "application": {"sha256": "a".repeat(64)}
            }}
        ]});
        let leaf_unstable = json!([{"build": 3, "channel": "experimental"}]);
        let manifest = json!({"versions": [
            {"id": "1.21.1", "type": "release"},
            {"id": "24w12a", "type": "snapshot"}
        ]});
        let fetch = |url: Url| {
            let response = match (url.host_str().unwrap(), url.path()) {
                ("fill.papermc.io", "/v3/projects/paper") => {
                    Some(json!({"versions": {"1.21": ["1.21.1"], "26.1": ["26.1.1"]}}))
                }
                ("fill.papermc.io", "/v3/projects/paper/versions/1.21.1/builds") => {
                    Some(stable.clone())
                }
                ("fill.papermc.io", "/v3/projects/paper/versions/26.1.1/builds") => {
                    Some(unstable.clone())
                }
                ("api.leafmc.one", "/v2/projects/leaf/versions/1.21.1/builds") => {
                    Some(leaf.clone())
                }
                ("api.leafmc.one", "/v2/projects/leaf/versions/1.21.2/builds") => {
                    Some(leaf_unstable.clone())
                }
                ("piston-meta.mojang.com", _) => Some(manifest.clone()),
                _ => None,
            };
            std::future::ready(Ok(response))
        };
        for software in ["Paper", "LeafMC", "Vanilla"] {
            assert_eq!(
                version_availability_with(software, "1.21.1", &fetch)
                    .await
                    .unwrap(),
                VersionAvailability::Stable
            );
        }
        assert_eq!(
            version_availability_with("Paper", "26.1.1", &fetch)
                .await
                .unwrap(),
            VersionAvailability::Unstable {
                channel: "alpha".into()
            }
        );
        assert_eq!(
            version_availability_with("LeafMC", "1.21.2", &fetch)
                .await
                .unwrap(),
            VersionAvailability::Unstable {
                channel: "experimental".into()
            }
        );
        for (software, version) in [
            ("Paper", "1.99"),
            ("Vanilla", "24w12a"),
            ("Forge", "1.21.1"),
        ] {
            assert!(matches!(
                version_availability_with(software, version, &fetch)
                    .await
                    .unwrap(),
                VersionAvailability::None { .. }
            ));
        }
        assert!(
            resolve_artifact_with("Paper", "26.1.1", false, BuildPolicy::StableOnly, &fetch)
                .await
                .unwrap()
                .is_none()
        );
        for (version, file, channel) in [
            ("26.1.1", "paper-3.jar", "alpha"),
            ("1.21.1", "paper-2.jar", "stable"),
        ] {
            let artifact =
                resolve_artifact_with("Paper", version, false, BuildPolicy::PreferStable, &fetch)
                    .await
                    .unwrap()
                    .unwrap();
            assert!(artifact.url.ends_with(file));
            assert_eq!(artifact.channel, channel);
        }
        let leaf_stable =
            resolve_artifact_with("LeafMC", "1.21.1", false, BuildPolicy::PreferStable, &fetch)
                .await
                .unwrap()
                .unwrap();
        assert_eq!(leaf_stable.sha256(), Some("a".repeat(64).as_str()));

        for (policy, expected) in [
            (BuildPolicy::StableOnly, "1.21.1"),
            (BuildPolicy::PreferStable, "26.1.1"),
        ] {
            let latest = resolve_artifact_with("Paper", "", true, policy, &fetch)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(latest.version, expected);
        }
    }

    #[test]
    fn software_targets_keep_current_and_only_installable_family_alternatives() {
        assert_eq!(target_software_candidates("Paper"), ["Paper", "LeafMC"]);
        assert_eq!(target_software_candidates("Leaf"), ["Leaf", "Paper"]);
        for software in ["Folia", "Purpur", "Spigot"] {
            assert_eq!(
                target_software_candidates(software),
                [software, "Paper", "LeafMC"]
            );
        }
        for software in ["Vanilla", "Fabric", "Forge", "NeoForge", "Velocity"] {
            assert_eq!(target_software_candidates(software), [software]);
        }
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
        assert_eq!(
            select_fabric_component(
                loaders
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|entry| &entry["loader"])
            ),
            Some(("0.16.5", true))
        );
        assert_eq!(
            select_fabric_component(installers.as_array().unwrap().iter()),
            Some(("1.0.1", true))
        );
        assert_eq!(
            select_fabric_component([serde_json::json!({"version":"fallback"})].iter()),
            Some(("fallback", false))
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
