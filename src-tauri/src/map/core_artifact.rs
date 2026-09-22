//! MC-Vector Core artifact identity, verification, and atomic materialisation.
//!
//! The renderer never selects a Core artifact source.  This module owns the
//! release identity and only accepts an artifact after the release manifest,
//! JAR descriptor, and byte-level digest all agree.

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use reqwest::{redirect, Client, StatusCode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;
use zip::ZipArchive;

pub(crate) const CORE_JAR_NAME: &str = "mc-vector-core.jar";
pub(crate) const CORE_DISABLED_JAR_NAME: &str = "mc-vector-core.jar.disabled";
pub(crate) const CORE_PROTOCOL_VERSION: u32 = 2;
pub(crate) const CORE_PLUGIN_NAME: &str = "MC-Vector-Core";
pub(crate) const CORE_PLUGIN_MAIN: &str = "com.mcvector.core.MCVectorCorePlugin";
pub(crate) const CORE_MAX_BYTES: u64 = 64 * 1024 * 1024;
const RELEASE_REPOSITORY: &str = "tukuyomil032/MC-Vector";
const RELEASE_PAPER_VERSION: &str = "1.21.10";
const MAX_MANIFEST_BYTES: usize = 64 * 1024;
const MAX_JAR_ENTRIES: usize = 4096;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CoreArtifactStatus {
    pub(crate) state: String,
    pub(crate) version: Option<String>,
    pub(crate) provenance: Option<String>,
    pub(crate) release_tag: Option<String>,
    pub(crate) verification: String,
    pub(crate) error_reason: Option<String>,
}

impl CoreArtifactStatus {
    pub(crate) fn missing(reason: &str) -> Self {
        Self {
            state: "missing".to_string(),
            version: None,
            provenance: None,
            release_tag: None,
            verification: "unverified".to_string(),
            error_reason: Some(reason.to_string()),
        }
    }

    fn failure(state: &str, reason: &str) -> Self {
        Self {
            state: state.to_string(),
            version: None,
            provenance: None,
            release_tag: None,
            verification: "failed".to_string(),
            error_reason: Some(reason.to_string()),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManagedMetadata {
    pub(crate) managed_by: String,
    pub(crate) schema_version: u32,
    pub(crate) artifact_name: String,
    pub(crate) artifact_provenance: String,
    pub(crate) plugin_version: Option<String>,
    pub(crate) protocol_version: Option<u32>,
    pub(crate) sha256: Option<String>,
    pub(crate) byte_length: Option<u64>,
    pub(crate) release_tag: Option<String>,
    pub(crate) source_commit: Option<String>,
    pub(crate) asset_url: Option<String>,
    pub(crate) verified_at: Option<u64>,
    pub(crate) removal_requested: bool,
    #[serde(default)]
    pub(crate) restart_required: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ReleaseManifest {
    pub(crate) release_tag: String,
    pub(crate) app_version: String,
    pub(crate) plugin_version: String,
    pub(crate) artifact_name: String,
    pub(crate) sha256: String,
    pub(crate) byte_length: u64,
    pub(crate) protocol_version: u32,
    pub(crate) paper_compatibility: Vec<String>,
    pub(crate) source_commit: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct PluginDescriptor {
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) main: String,
    pub(crate) protocol_version: u32,
}

#[derive(Clone, Debug)]
pub(crate) struct VerifiedArtifact {
    pub(crate) metadata: ManagedMetadata,
    pub(crate) bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ArtifactError {
    Missing,
    DownloadRequired,
    InvalidManifest,
    ReleaseMismatch,
    VersionMismatch,
    ProtocolMismatch,
    PaperIncompatible,
    PluginIdentityMismatch,
    SizeMismatch,
    ChecksumMismatch,
    NetworkUnavailable,
    ReleaseNotFound,
    Conflict,
    InstallFailed,
    Oversized,
    InvalidJar,
}

impl ArtifactError {
    pub(crate) fn code(&self) -> &'static str {
        match self {
            Self::Missing => "artifact_missing",
            Self::DownloadRequired => "artifact_download_required",
            Self::InvalidManifest => "artifact_invalid_manifest",
            Self::ReleaseMismatch => "artifact_release_mismatch",
            Self::VersionMismatch => "artifact_version_mismatch",
            Self::ProtocolMismatch => "artifact_protocol_mismatch",
            Self::PaperIncompatible => "artifact_paper_incompatible",
            Self::PluginIdentityMismatch | Self::InvalidJar => "artifact_plugin_identity_mismatch",
            Self::SizeMismatch => "artifact_size_mismatch",
            Self::ChecksumMismatch => "artifact_checksum_mismatch",
            Self::NetworkUnavailable => "artifact_network_unavailable",
            Self::ReleaseNotFound => "artifact_release_not_found",
            Self::Conflict => "artifact_conflict",
            Self::Oversized => "artifact_size_mismatch",
            Self::InstallFailed => "artifact_install_failed",
        }
    }
}

impl std::fmt::Display for ArtifactError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for ArtifactError {}

fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn artifact_filename(version: &str) -> String {
    format!("mc-vector-core-{version}.jar")
}

fn manifest_filename(version: &str) -> String {
    format!("mc-vector-core-{version}.manifest.json")
}

fn release_tag(version: &str) -> String {
    format!("v{version}")
}

fn valid_release_tag(value: &str) -> bool {
    let Some(version) = value.strip_prefix('v') else {
        return false;
    };
    let parts = version.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts.iter().all(|part| {
            !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
        })
}

fn release_asset_url(version: &str, filename: &str) -> String {
    format!(
        "https://github.com/{RELEASE_REPOSITORY}/releases/download/{}/{filename}",
        release_tag(version)
    )
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return metadata.file_attributes() & 0x0400 != 0;
    }

    #[cfg(not(windows))]
    false
}

fn normal_file(path: &Path) -> Result<bool, ArtifactError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) {
                return Err(ArtifactError::Conflict);
            }
            Ok(metadata.is_file())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(ArtifactError::InstallFailed),
    }
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, ArtifactError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| ArtifactError::Missing)?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
        return Err(ArtifactError::Conflict);
    }
    if metadata.len() > CORE_MAX_BYTES {
        return Err(ArtifactError::Oversized);
    }
    let mut file = File::open(path).map_err(|_| ArtifactError::Missing)?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|_| ArtifactError::InstallFailed)?;
    if bytes.len() as u64 != metadata.len() {
        return Err(ArtifactError::SizeMismatch);
    }
    Ok(bytes)
}

fn scalar_yaml_value(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.starts_with('[') || value.starts_with('{') {
        return None;
    }
    Some(value.trim_matches(['\'', '"']).to_string())
}

fn parse_plugin_yml(bytes: &[u8]) -> Result<PluginDescriptor, ArtifactError> {
    let content = std::str::from_utf8(bytes).map_err(|_| ArtifactError::PluginIdentityMismatch)?;
    let mut values = std::collections::HashMap::<String, String>::new();
    let allowed = [
        "name",
        "version",
        "main",
        "protocol-version",
        "api-version",
        "description",
        "authors",
    ];
    let mut in_authors = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('-') && in_authors {
            continue;
        }
        let Some((key, raw_value)) = line.split_once(':') else {
            return Err(ArtifactError::PluginIdentityMismatch);
        };
        if !key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
            || key.starts_with(char::is_whitespace)
        {
            return Err(ArtifactError::PluginIdentityMismatch);
        }
        let key = key.trim().to_string();
        if !allowed.contains(&key.as_str()) {
            return Err(ArtifactError::PluginIdentityMismatch);
        }
        if values.contains_key(&key) {
            return Err(ArtifactError::PluginIdentityMismatch);
        }
        in_authors = key == "authors";
        if let Some(value) = scalar_yaml_value(raw_value) {
            values.insert(key, value);
        }
    }

    let required = |key: &str| {
        values
            .get(key)
            .cloned()
            .filter(|value| !value.is_empty())
            .ok_or(ArtifactError::PluginIdentityMismatch)
    };
    let protocol_version = values
        .get("protocol-version")
        .ok_or(ArtifactError::PluginIdentityMismatch)?
        .parse::<u32>()
        .map_err(|_| ArtifactError::PluginIdentityMismatch)?;
    Ok(PluginDescriptor {
        name: required("name")?,
        version: required("version")?,
        main: required("main")?,
        protocol_version,
    })
}

pub(crate) fn validate_jar_bytes(
    bytes: &[u8],
    expected_plugin_version: Option<&str>,
) -> Result<PluginDescriptor, ArtifactError> {
    if bytes.is_empty() || bytes.len() as u64 > CORE_MAX_BYTES {
        return Err(ArtifactError::Oversized);
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| ArtifactError::InvalidJar)?;
    if archive.len() > MAX_JAR_ENTRIES {
        return Err(ArtifactError::InvalidJar);
    }
    let mut names = HashSet::new();
    let mut plugin_yml = None;
    let mut main_class = false;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| ArtifactError::InvalidJar)?;
        let name = entry.name().to_string();
        if !names.insert(name.clone()) {
            return Err(ArtifactError::InvalidJar);
        }
        if name == "plugin.yml" {
            let mut descriptor = Vec::new();
            entry
                .take((MAX_MANIFEST_BYTES + 1) as u64)
                .read_to_end(&mut descriptor)
                .map_err(|_| ArtifactError::InvalidJar)?;
            if descriptor.len() > MAX_MANIFEST_BYTES {
                return Err(ArtifactError::InvalidJar);
            }
            plugin_yml = Some(descriptor);
        }
        if name == "com/mcvector/core/MCVectorCorePlugin.class" {
            main_class = true;
        }
    }
    if !main_class {
        return Err(ArtifactError::PluginIdentityMismatch);
    }
    let descriptor = parse_plugin_yml(&plugin_yml.ok_or(ArtifactError::PluginIdentityMismatch)?)?;
    if descriptor.name != CORE_PLUGIN_NAME
        || descriptor.main != CORE_PLUGIN_MAIN
        || descriptor.protocol_version != CORE_PROTOCOL_VERSION
        || expected_plugin_version.is_some_and(|version| descriptor.version != version)
    {
        return Err(ArtifactError::PluginIdentityMismatch);
    }
    Ok(descriptor)
}

pub(crate) fn validate_manifest(
    manifest: &ReleaseManifest,
    jar_bytes: &[u8],
    expected_version: &str,
) -> Result<PluginDescriptor, ArtifactError> {
    validate_manifest_identity(manifest, expected_version)?;
    if manifest.byte_length != jar_bytes.len() as u64 {
        return Err(ArtifactError::SizeMismatch);
    }
    if manifest.sha256 != sha256_hex(jar_bytes) {
        return Err(ArtifactError::ChecksumMismatch);
    }
    validate_jar_bytes(jar_bytes, Some(&manifest.plugin_version))
}

fn validate_manifest_identity(
    manifest: &ReleaseManifest,
    expected_version: &str,
) -> Result<(), ArtifactError> {
    if manifest.release_tag != release_tag(expected_version)
        || manifest.artifact_name != artifact_filename(expected_version)
        || manifest.source_commit.len() != 40
        || !manifest
            .source_commit
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(ArtifactError::ReleaseMismatch);
    }
    if manifest.app_version != expected_version || manifest.plugin_version != expected_version {
        return Err(ArtifactError::VersionMismatch);
    }
    if manifest.protocol_version != CORE_PROTOCOL_VERSION {
        return Err(ArtifactError::ProtocolMismatch);
    }
    if manifest.paper_compatibility.len() > 16
        || manifest
            .paper_compatibility
            .iter()
            .any(|version| version.trim().is_empty() || version.len() > 64)
    {
        return Err(ArtifactError::InvalidManifest);
    }
    if !manifest
        .paper_compatibility
        .iter()
        .any(|version| version == RELEASE_PAPER_VERSION)
    {
        return Err(ArtifactError::PaperIncompatible);
    }
    Ok(())
}

pub(crate) fn validate_metadata(metadata: &ManagedMetadata) -> Result<(), ArtifactError> {
    if metadata.managed_by != "MC-Vector"
        || metadata.artifact_name != CORE_JAR_NAME
        || !matches!(metadata.schema_version, 1 | 2)
    {
        return Err(ArtifactError::Conflict);
    }
    if metadata.schema_version != 2 {
        return Err(ArtifactError::InvalidManifest);
    }
    if !matches!(
        metadata.artifact_provenance.as_str(),
        "development" | "bundled" | "github_release"
    ) {
        return Err(ArtifactError::InvalidManifest);
    }
    if metadata.plugin_version.is_none()
        || metadata.protocol_version != Some(CORE_PROTOCOL_VERSION)
        || metadata.sha256.is_none()
        || metadata.byte_length.is_none()
        || metadata.verified_at.is_none()
    {
        return Err(ArtifactError::InvalidManifest);
    }
    if matches!(
        metadata.artifact_provenance.as_str(),
        "bundled" | "github_release"
    ) && (metadata
        .release_tag
        .as_deref()
        .map_or(true, |tag| !valid_release_tag(tag))
        || metadata.source_commit.as_deref().map_or(true, |commit| {
            commit.len() != 40
                || !commit
                    .chars()
                    .all(|character| character.is_ascii_hexdigit())
        }))
    {
        return Err(ArtifactError::InvalidManifest);
    }
    Ok(())
}

pub(crate) fn verify_metadata_bytes(
    metadata: &ManagedMetadata,
    bytes: &[u8],
) -> Result<PluginDescriptor, ArtifactError> {
    validate_metadata(metadata)?;
    if metadata.byte_length != Some(bytes.len() as u64) {
        return Err(ArtifactError::SizeMismatch);
    }
    if metadata.sha256.as_deref() != Some(sha256_hex(bytes).as_str()) {
        return Err(ArtifactError::ChecksumMismatch);
    }
    validate_jar_bytes(bytes, metadata.plugin_version.as_deref())
}

pub(crate) fn status_for_files(
    active_path: &Path,
    disabled_path: &Path,
    metadata: Option<&ManagedMetadata>,
) -> CoreArtifactStatus {
    let active = match normal_file(active_path) {
        Ok(value) => value,
        Err(error) => return CoreArtifactStatus::failure("conflict", error.code()),
    };
    let disabled = match normal_file(disabled_path) {
        Ok(value) => value,
        Err(error) => return CoreArtifactStatus::failure("conflict", error.code()),
    };
    if active && disabled {
        return CoreArtifactStatus::failure("conflict", ArtifactError::Conflict.code());
    }
    if !active && !disabled {
        return CoreArtifactStatus::missing(ArtifactError::DownloadRequired.code());
    }
    let Some(metadata) = metadata else {
        return CoreArtifactStatus::failure("conflict", ArtifactError::Conflict.code());
    };
    let path = if active { active_path } else { disabled_path };
    let bytes = match read_bounded(path) {
        Ok(bytes) => bytes,
        Err(error) => return CoreArtifactStatus::failure("invalid", error.code()),
    };
    if let Err(error) = verify_metadata_bytes(metadata, &bytes) {
        return CoreArtifactStatus::failure("invalid", error.code());
    }
    if metadata.artifact_provenance != "development"
        && metadata.plugin_version.as_deref() != Some(app_version())
    {
        return CoreArtifactStatus {
            state: "outdated".to_string(),
            version: metadata.plugin_version.clone(),
            provenance: Some(metadata.artifact_provenance.clone()),
            release_tag: metadata.release_tag.clone(),
            verification: "verified".to_string(),
            error_reason: Some(ArtifactError::VersionMismatch.code().to_string()),
        };
    }
    CoreArtifactStatus {
        state: "installed".to_string(),
        version: metadata.plugin_version.clone(),
        provenance: Some(metadata.artifact_provenance.clone()),
        release_tag: metadata.release_tag.clone(),
        verification: "verified".to_string(),
        error_reason: None,
    }
}

pub(crate) fn metadata_is_verified(metadata: &ManagedMetadata) -> bool {
    validate_metadata(metadata).is_ok()
}

fn metadata_from_verified(
    provenance: &str,
    plugin_version: String,
    sha256: String,
    byte_length: u64,
    release_tag: Option<String>,
    source_commit: Option<String>,
    asset_url: Option<String>,
) -> ManagedMetadata {
    ManagedMetadata {
        managed_by: "MC-Vector".to_string(),
        schema_version: 2,
        artifact_name: CORE_JAR_NAME.to_string(),
        artifact_provenance: provenance.to_string(),
        plugin_version: Some(plugin_version),
        protocol_version: Some(CORE_PROTOCOL_VERSION),
        sha256: Some(sha256),
        byte_length: Some(byte_length),
        release_tag,
        source_commit,
        asset_url,
        verified_at: Some(current_timestamp()),
        removal_requested: false,
        restart_required: false,
    }
}

fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn emit_progress(
    app: &AppHandle,
    server_id: &str,
    state: &str,
    downloaded: u64,
    total: Option<u64>,
) {
    let _ = app.emit(
        "map-core-artifact-progress",
        serde_json::json!({
            "serverId": server_id,
            "state": state,
            "downloadedBytes": downloaded,
            "totalBytes": total,
        }),
    );
}

pub(crate) fn emit_failure_progress(app: &AppHandle, server_id: &str, error: &ArtifactError) {
    emit_progress(app, server_id, "error", 0, None);
    log::warn!(
        "Core artifact operation failed for {}: {}",
        server_id,
        error
    );
}

fn cache_paths(
    app: &AppHandle,
    version: &str,
) -> Result<(PathBuf, PathBuf, PathBuf), ArtifactError> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| ArtifactError::InstallFailed)?
        .join("map-core")
        .join(version);
    Ok((
        root.clone(),
        root.join(artifact_filename(version)),
        root.join(manifest_filename(version)),
    ))
}

fn parse_manifest(bytes: &[u8]) -> Result<ReleaseManifest, ArtifactError> {
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(ArtifactError::InvalidManifest);
    }
    serde_json::from_slice(bytes).map_err(|_| ArtifactError::InvalidManifest)
}

fn load_manifest_and_jar(
    jar_path: &Path,
    manifest_path: &Path,
    expected_version: &str,
) -> Result<(ReleaseManifest, Vec<u8>, PluginDescriptor), ArtifactError> {
    let manifest_bytes = fs::read(manifest_path).map_err(|_| ArtifactError::Missing)?;
    let manifest = parse_manifest(&manifest_bytes)?;
    let jar = read_bounded(jar_path)?;
    let descriptor = validate_manifest(&manifest, &jar, expected_version)?;
    Ok((manifest, jar, descriptor))
}

fn bundled_paths(app: &AppHandle, version: &str) -> Result<Vec<(PathBuf, PathBuf)>, ArtifactError> {
    let resource = app
        .path()
        .resource_dir()
        .map_err(|_| ArtifactError::Missing)?;
    let jar_name = artifact_filename(version);
    let manifest_name = manifest_filename(version);
    Ok(vec![
        (resource.join(&jar_name), resource.join(&manifest_name)),
        (
            resource.join("map-core").join(&jar_name),
            resource.join("map-core").join(&manifest_name),
        ),
    ])
}

fn explicit_development_path() -> Option<PathBuf> {
    if !cfg!(debug_assertions)
        || std::env::var("MC_VECTOR_ALLOW_DEVELOPMENT_CORE")
            .ok()
            .as_deref()
            != Some("1")
    {
        return None;
    }
    std::env::var_os("MC_VECTOR_DEVELOPMENT_CORE_PATH").map(PathBuf::from)
}

fn release_client() -> Result<Client, ArtifactError> {
    Client::builder()
        .redirect(redirect::Policy::custom(|attempt| {
            let host = attempt.url().host_str().unwrap_or_default();
            if matches!(
                host,
                "github.com"
                    | "www.github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
                    | "github-releases.githubusercontent.com"
            ) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| ArtifactError::NetworkUnavailable)
}

async fn download_manifest(client: &Client, url: &str) -> Result<ReleaseManifest, ArtifactError> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| ArtifactError::NetworkUnavailable)?;
    if response.status() == StatusCode::NOT_FOUND {
        return Err(ArtifactError::ReleaseNotFound);
    }
    if !response.status().is_success() {
        return Err(ArtifactError::NetworkUnavailable);
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| ArtifactError::NetworkUnavailable)?;
    let manifest = parse_manifest(&bytes)?;
    validate_manifest_identity(&manifest, app_version())?;
    Ok(manifest)
}

async fn download_jar(
    client: &Client,
    url: &str,
    part_path: &Path,
    app: &AppHandle,
    server_id: &str,
) -> Result<Vec<u8>, ArtifactError> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| ArtifactError::NetworkUnavailable)?;
    if response.status() == StatusCode::NOT_FOUND {
        return Err(ArtifactError::ReleaseNotFound);
    }
    if !response.status().is_success() {
        return Err(ArtifactError::NetworkUnavailable);
    }
    let total = response.content_length();
    if total.is_some_and(|size| size > CORE_MAX_BYTES) {
        return Err(ArtifactError::Oversized);
    }
    if let Some(parent) = part_path.parent() {
        fs::create_dir_all(parent).map_err(|_| ArtifactError::InstallFailed)?;
    }
    let mut file = tokio::fs::File::create(part_path)
        .await
        .map_err(|_| ArtifactError::InstallFailed)?;
    let mut downloaded = 0_u64;
    emit_progress(app, server_id, "downloading", downloaded, total);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| ArtifactError::NetworkUnavailable)?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > CORE_MAX_BYTES {
            let _ = tokio::fs::remove_file(part_path).await;
            return Err(ArtifactError::Oversized);
        }
        file.write_all(&chunk)
            .await
            .map_err(|_| ArtifactError::InstallFailed)?;
        emit_progress(app, server_id, "downloading", downloaded, total);
    }
    file.sync_all()
        .await
        .map_err(|_| ArtifactError::InstallFailed)?;
    drop(file);
    let bytes = read_bounded(part_path)?;
    Ok(bytes)
}

fn write_sync(path: &Path, bytes: &[u8]) -> Result<(), ArtifactError> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|_| ArtifactError::InstallFailed)?;
    file.write_all(bytes)
        .map_err(|_| ArtifactError::InstallFailed)?;
    file.sync_all().map_err(|_| ArtifactError::InstallFailed)
}

fn cache_verified_artifact(
    cache_root: &Path,
    cache_jar: &Path,
    cache_manifest: &Path,
    manifest_bytes: &[u8],
    jar_bytes: &[u8],
) -> Result<(), ArtifactError> {
    let parent = cache_root.parent().ok_or(ArtifactError::InstallFailed)?;
    fs::create_dir_all(parent).map_err(|_| ArtifactError::InstallFailed)?;
    let root_name = cache_root
        .file_name()
        .ok_or(ArtifactError::InstallFailed)?
        .to_string_lossy();
    let staging_root = parent.join(format!(".{root_name}.part-{}", Uuid::new_v4()));
    let backup_root = parent.join(format!(".{root_name}.backup-{}", Uuid::new_v4()));
    let jar_name = cache_jar.file_name().ok_or(ArtifactError::InstallFailed)?;
    let manifest_name = cache_manifest
        .file_name()
        .ok_or(ArtifactError::InstallFailed)?;
    let result = (|| {
        fs::create_dir_all(&staging_root).map_err(|_| ArtifactError::InstallFailed)?;
        write_sync(&staging_root.join(jar_name), jar_bytes)?;
        write_sync(&staging_root.join(manifest_name), manifest_bytes)?;

        let existing_root = match fs::symlink_metadata(cache_root) {
            Ok(metadata) => {
                if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                    return Err(ArtifactError::Conflict);
                }
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(_) => return Err(ArtifactError::InstallFailed),
        };
        if existing_root {
            fs::rename(cache_root, &backup_root).map_err(|_| ArtifactError::InstallFailed)?;
        }
        if let Err(error) = fs::rename(&staging_root, cache_root) {
            if existing_root {
                let _ = fs::rename(&backup_root, cache_root);
            }
            return Err(if error.kind() == std::io::ErrorKind::AlreadyExists {
                ArtifactError::Conflict
            } else {
                ArtifactError::InstallFailed
            });
        }
        if existing_root {
            let _ = fs::remove_dir_all(&backup_root);
        }
        Ok::<(), ArtifactError>(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging_root);
        if !cache_root.exists() && backup_root.exists() {
            let _ = fs::rename(&backup_root, cache_root);
        }
    }
    result
}

fn install_server_artifact(jar_bytes: &[u8], destination: &Path) -> Result<(), ArtifactError> {
    if normal_file(destination)? {
        return Err(ArtifactError::Conflict);
    }
    let part = destination.with_extension("jar.part");
    let _ = fs::remove_file(&part);
    let result = (|| {
        write_sync(&part, jar_bytes)?;
        fs::rename(&part, destination).map_err(|_| ArtifactError::InstallFailed)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&part);
    }
    result
}

fn read_manifest_bytes(manifest: &ReleaseManifest) -> Result<Vec<u8>, ArtifactError> {
    serde_json::to_vec_pretty(manifest).map_err(|_| ArtifactError::InvalidManifest)
}

fn source_commit_from_manifest(manifest: &ReleaseManifest) -> Option<String> {
    Some(manifest.source_commit.clone())
}

async fn acquire_source(
    app: &AppHandle,
    server_id: &str,
) -> Result<VerifiedArtifact, ArtifactError> {
    let version = app_version();
    let (cache_root, cache_jar, cache_manifest) = cache_paths(app, version)?;
    emit_progress(app, server_id, "verifying", 0, None);

    if normal_file(&cache_jar).unwrap_or(false) && normal_file(&cache_manifest).unwrap_or(false) {
        if let Ok((manifest, jar, descriptor)) =
            load_manifest_and_jar(&cache_jar, &cache_manifest, version)
        {
            return Ok(VerifiedArtifact {
                metadata: metadata_from_verified(
                    "github_release",
                    descriptor.version,
                    manifest.sha256.clone(),
                    manifest.byte_length,
                    Some(manifest.release_tag.clone()),
                    source_commit_from_manifest(&manifest),
                    Some(release_asset_url(version, &manifest.artifact_name)),
                ),
                bytes: jar,
            });
        }
    }

    for (jar_path, manifest_path) in bundled_paths(app, version)? {
        if normal_file(&jar_path).unwrap_or(false) && normal_file(&manifest_path).unwrap_or(false) {
            if let Ok((manifest, jar, descriptor)) =
                load_manifest_and_jar(&jar_path, &manifest_path, version)
            {
                return Ok(VerifiedArtifact {
                    metadata: metadata_from_verified(
                        "bundled",
                        descriptor.version,
                        manifest.sha256.clone(),
                        manifest.byte_length,
                        Some(manifest.release_tag.clone()),
                        source_commit_from_manifest(&manifest),
                        None,
                    ),
                    bytes: jar,
                });
            }
        }
    }

    if let Some(path) = explicit_development_path() {
        let bytes = read_bounded(&path)?;
        let descriptor = validate_jar_bytes(&bytes, None)?;
        return Ok(VerifiedArtifact {
            metadata: metadata_from_verified(
                "development",
                descriptor.version,
                sha256_hex(&bytes),
                bytes.len() as u64,
                None,
                None,
                None,
            ),
            bytes,
        });
    }

    let client = release_client()?;
    let manifest_url = release_asset_url(version, &manifest_filename(version));
    let manifest = download_manifest(&client, &manifest_url).await?;
    let manifest_bytes = read_manifest_bytes(&manifest)?;
    let jar_url = release_asset_url(version, &manifest.artifact_name);
    let part_path = cache_root.join(format!("{}.part", manifest.artifact_name));
    let jar = download_jar(&client, &jar_url, &part_path, app, server_id).await?;
    emit_progress(
        app,
        server_id,
        "verifying",
        jar.len() as u64,
        Some(jar.len() as u64),
    );
    let descriptor = match validate_manifest(&manifest, &jar, version) {
        Ok(descriptor) => descriptor,
        Err(error) => {
            let _ = fs::remove_file(&part_path);
            return Err(error);
        }
    };
    if let Err(error) = cache_verified_artifact(
        &cache_root,
        &cache_jar,
        &cache_manifest,
        &manifest_bytes,
        &jar,
    ) {
        let _ = fs::remove_file(&part_path);
        return Err(error);
    }
    let _ = fs::remove_file(&part_path);
    Ok(VerifiedArtifact {
        metadata: metadata_from_verified(
            "github_release",
            descriptor.version,
            manifest.sha256.clone(),
            manifest.byte_length,
            Some(manifest.release_tag.clone()),
            source_commit_from_manifest(&manifest),
            Some(jar_url),
        ),
        bytes: jar,
    })
}

pub(crate) async fn ensure_installed(
    app: &AppHandle,
    server_id: &str,
    active_path: &Path,
    disabled_path: &Path,
    metadata_path: &Path,
) -> Result<ManagedMetadata, ArtifactError> {
    let active = normal_file(active_path)?;
    let disabled = normal_file(disabled_path)?;
    if active && disabled {
        return Err(ArtifactError::Conflict);
    }

    let metadata = if normal_file(metadata_path)? {
        let bytes = fs::read(metadata_path).map_err(|_| ArtifactError::InstallFailed)?;
        Some(
            serde_json::from_slice::<ManagedMetadata>(&bytes)
                .map_err(|_| ArtifactError::InvalidManifest)?,
        )
    } else {
        None
    };

    if active || disabled {
        let metadata = metadata.ok_or(ArtifactError::Conflict)?;
        let path = if active { active_path } else { disabled_path };
        let bytes = read_bounded(path)?;
        verify_metadata_bytes(&metadata, &bytes)?;
        if metadata.artifact_provenance != "development"
            && metadata.plugin_version.as_deref() != Some(app_version())
        {
            return Err(ArtifactError::VersionMismatch);
        }
        if disabled {
            fs::rename(disabled_path, active_path).map_err(|_| ArtifactError::InstallFailed)?;
        }
        return Ok(metadata);
    }

    let artifact = acquire_source(app, server_id).await?;
    install_server_artifact(&artifact.bytes, active_path)?;
    let metadata_bytes =
        serde_json::to_vec_pretty(&artifact.metadata).map_err(|_| ArtifactError::InstallFailed)?;
    let metadata_part = metadata_path.with_extension(format!("json.part-{}", Uuid::new_v4()));
    let metadata_result = (|| {
        write_sync(&metadata_part, &metadata_bytes)?;
        if normal_file(metadata_path)? {
            fs::remove_file(metadata_path).map_err(|_| ArtifactError::InstallFailed)?;
        }
        fs::rename(&metadata_part, metadata_path).map_err(|_| ArtifactError::InstallFailed)
    })();
    if metadata_result.is_err() {
        let _ = fs::remove_file(&metadata_part);
        let _ = fs::remove_file(active_path);
    }
    metadata_result?;
    emit_progress(
        app,
        server_id,
        "installed",
        artifact.bytes.len() as u64,
        Some(artifact.bytes.len() as u64),
    );
    Ok(artifact.metadata)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::{SimpleFileOptions, ZipWriter};

    fn valid_jar(version: &str) -> Vec<u8> {
        let mut output = Cursor::new(Vec::new());
        let mut zip = ZipWriter::new(&mut output);
        let options = SimpleFileOptions::default();
        zip.start_file("plugin.yml", options).unwrap();
        write!(
            zip,
            "name: MC-Vector-Core\nversion: {version}\nmain: com.mcvector.core.MCVectorCorePlugin\napi-version: '1.21'\nprotocol-version: 2\nauthors:\n  - MC-Vector\n"
        )
        .unwrap();
        zip.start_file("com/mcvector/core/MCVectorCorePlugin.class", options)
            .unwrap();
        zip.write_all(b"class").unwrap();
        zip.finish().unwrap();
        output.into_inner()
    }

    fn manifest(version: &str, jar: &[u8]) -> ReleaseManifest {
        ReleaseManifest {
            release_tag: release_tag(version),
            app_version: version.to_string(),
            plugin_version: version.to_string(),
            artifact_name: artifact_filename(version),
            sha256: sha256_hex(jar),
            byte_length: jar.len() as u64,
            protocol_version: CORE_PROTOCOL_VERSION,
            paper_compatibility: vec![RELEASE_PAPER_VERSION.to_string()],
            source_commit: "0123456789abcdef0123456789abcdef01234567".to_string(),
        }
    }

    #[test]
    fn valid_manifest_and_core_jar_are_accepted() {
        let jar = valid_jar("2.0.63");
        let manifest = manifest("2.0.63", &jar);
        let descriptor = validate_manifest(&manifest, &jar, "2.0.63").unwrap();
        assert_eq!(descriptor.name, CORE_PLUGIN_NAME);
        assert_eq!(descriptor.main, CORE_PLUGIN_MAIN);
        assert_eq!(descriptor.protocol_version, CORE_PROTOCOL_VERSION);
    }

    #[test]
    fn plugin_identity_and_jar_shape_are_verified() {
        let mut jar = valid_jar("2.0.63");
        jar.truncate(jar.len() - 2);
        assert_eq!(
            validate_jar_bytes(&jar, Some("2.0.63")).unwrap_err(),
            ArtifactError::InvalidJar
        );

        let mut no_main = Cursor::new(Vec::new());
        let mut zip = ZipWriter::new(&mut no_main);
        zip.start_file("plugin.yml", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(
            b"name: MC-Vector-Core\nversion: 2.0.63\nmain: com.mcvector.core.MCVectorCorePlugin\nprotocol-version: 2\n",
        )
        .unwrap();
        zip.finish().unwrap();
        assert_eq!(
            validate_jar_bytes(&no_main.into_inner(), Some("2.0.63")).unwrap_err(),
            ArtifactError::PluginIdentityMismatch
        );
    }

    #[test]
    fn manifest_size_and_checksum_failures_are_distinct() {
        let jar = valid_jar("2.0.63");
        let mut wrong_size = manifest("2.0.63", &jar);
        wrong_size.byte_length += 1;
        assert_eq!(
            validate_manifest(&wrong_size, &jar, "2.0.63").unwrap_err(),
            ArtifactError::SizeMismatch
        );
        let mut wrong_hash = manifest("2.0.63", &jar);
        wrong_hash.sha256 = "0".repeat(64);
        assert_eq!(
            validate_manifest(&wrong_hash, &jar, "2.0.63").unwrap_err(),
            ArtifactError::ChecksumMismatch
        );
    }

    #[test]
    fn invalid_manifest_is_redacted_to_stable_code() {
        let manifest = manifest("2.0.63", b"not-a-jar");
        assert_eq!(
            validate_manifest(&manifest, b"different", "2.0.63").unwrap_err(),
            ArtifactError::ChecksumMismatch
        );
        assert!(!ArtifactError::ChecksumMismatch.code().contains('/'));
    }

    #[test]
    fn manifest_identity_mismatches_are_rejected() {
        let jar = b"jar";
        let mut value = manifest("2.0.63", jar);
        value.release_tag = "latest".to_string();
        assert_eq!(
            validate_manifest(&value, jar, "2.0.63").unwrap_err(),
            ArtifactError::ReleaseMismatch
        );
        let mut value = manifest("2.0.63", jar);
        value.protocol_version = 1;
        assert_eq!(
            validate_manifest(&value, jar, "2.0.63").unwrap_err(),
            ArtifactError::ProtocolMismatch
        );
    }

    #[test]
    fn legacy_metadata_is_not_trusted() {
        let metadata = ManagedMetadata {
            managed_by: "MC-Vector".to_string(),
            schema_version: 1,
            artifact_name: CORE_JAR_NAME.to_string(),
            artifact_provenance: "managed".to_string(),
            plugin_version: None,
            protocol_version: None,
            sha256: None,
            byte_length: None,
            release_tag: None,
            source_commit: None,
            asset_url: None,
            verified_at: None,
            removal_requested: false,
            restart_required: false,
        };
        assert!(!metadata_is_verified(&metadata));
        assert_eq!(
            validate_metadata(&metadata),
            Err(ArtifactError::InvalidManifest)
        );
    }

    #[test]
    fn status_does_not_accept_unknown_file_without_verified_metadata() {
        let root = std::env::temp_dir().join(format!("mc-vector-core-status-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let active = root.join(CORE_JAR_NAME);
        let disabled = root.join(CORE_DISABLED_JAR_NAME);
        fs::write(&active, b"unknown").unwrap();
        let status = status_for_files(&active, &disabled, None);
        assert_eq!(status.state, "conflict");
        assert_eq!(status.error_reason.as_deref(), Some("artifact_conflict"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unknown_disabled_file_is_also_a_conflict() {
        let root = std::env::temp_dir().join(format!("mc-vector-core-disabled-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let active = root.join(CORE_JAR_NAME);
        let disabled = root.join(CORE_DISABLED_JAR_NAME);
        fs::write(&disabled, b"unknown").unwrap();
        let status = status_for_files(&active, &disabled, None);
        assert_eq!(status.state, "conflict");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn verified_previous_release_is_reported_as_outdated() {
        let root = std::env::temp_dir().join(format!("mc-vector-core-outdated-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let active = root.join(CORE_JAR_NAME);
        let disabled = root.join(CORE_DISABLED_JAR_NAME);
        let bytes = valid_jar("2.0.62");
        fs::write(&active, &bytes).unwrap();
        let metadata = ManagedMetadata {
            managed_by: "MC-Vector".to_string(),
            schema_version: 2,
            artifact_name: CORE_JAR_NAME.to_string(),
            artifact_provenance: "github_release".to_string(),
            plugin_version: Some("2.0.62".to_string()),
            protocol_version: Some(CORE_PROTOCOL_VERSION),
            sha256: Some(sha256_hex(&bytes)),
            byte_length: Some(bytes.len() as u64),
            release_tag: Some("v2.0.62".to_string()),
            source_commit: Some("0123456789abcdef0123456789abcdef01234567".to_string()),
            asset_url: Some("https://github.com/tukuyomil032/MC-Vector/releases/download/v2.0.62/mc-vector-core-2.0.62.jar".to_string()),
            verified_at: Some(1),
            removal_requested: false,
            restart_required: false,
        };
        let status = status_for_files(&active, &disabled, Some(&metadata));
        assert_eq!(status.state, "outdated");
        assert_eq!(
            status.error_reason.as_deref(),
            Some("artifact_version_mismatch")
        );
        fs::remove_dir_all(root).unwrap();
    }
}
