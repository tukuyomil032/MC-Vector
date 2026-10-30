use futures_util::StreamExt;
use reqwest::{redirect, Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

const USER_AGENT: &str = "MC-Vector/2.0.64 (https://github.com/tukuyomil032/MC-Vector)";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const RESPONSE_HEADERS_TIMEOUT: Duration = Duration::from_secs(30);
const INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS: usize = 2;
const MAX_REDIRECTS: usize = 5;
const MAX_PLUGIN_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

fn is_link_or_reparse_point(metadata: &std::fs::Metadata) -> bool {
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExpectedChecksum {
    pub algorithm: String,
    pub value: String,
}

#[derive(Clone, Debug)]
pub struct VerifiedArtifact {
    pub path: PathBuf,
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ChecksumAlgorithm {
    Sha1,
    Sha256,
    Sha512,
}

impl ChecksumAlgorithm {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "sha1" => Ok(Self::Sha1),
            "sha256" => Ok(Self::Sha256),
            "sha512" => Ok(Self::Sha512),
            _ => {
                Err("Unsupported checksum algorithm; expected sha1, sha256, or sha512".to_string())
            }
        }
    }
    fn hex_length(self) -> usize {
        match self {
            Self::Sha1 => 40,
            Self::Sha256 => 64,
            Self::Sha512 => 128,
        }
    }
}

// SHA-1 remains necessary for Modrinth metadata. It is used only for integrity
// comparison of a provider-supplied digest, never as a signing primitive.
struct Sha1Digest {
    state: [u32; 5],
    pending: Vec<u8>,
    bit_len: u64,
}
impl Sha1Digest {
    fn new() -> Self {
        Self {
            state: [
                0x6745_2301,
                0xEFCD_AB89,
                0x98BA_DCFE,
                0x1032_5476,
                0xC3D2_E1F0,
            ],
            pending: Vec::new(),
            bit_len: 0,
        }
    }
    fn process_block(&mut self, block: &[u8]) {
        let mut words = [0_u32; 80];
        for (index, bytes) in block.chunks_exact(4).take(16).enumerate() {
            words[index] = u32::from_be_bytes(bytes.try_into().expect("aligned SHA-1 block"));
        }
        for index in 16..80 {
            words[index] =
                (words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16])
                    .rotate_left(1);
        }
        let (mut a, mut b, mut c, mut d, mut e) = (
            self.state[0],
            self.state[1],
            self.state[2],
            self.state[3],
            self.state[4],
        );
        for (index, word) in words.into_iter().enumerate() {
            let (f, k) = match index {
                0..=19 => ((b & c) | ((!b) & d), 0x5A82_7999),
                20..=39 => (b ^ c ^ d, 0x6ED9_EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1B_BCDC),
                _ => (b ^ c ^ d, 0xCA62_C1D6),
            };
            let next = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(word);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = next;
        }
        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
    }
    fn update(&mut self, bytes: &[u8]) {
        self.bit_len = self
            .bit_len
            .wrapping_add((bytes.len() as u64).wrapping_mul(8));
        self.pending.extend_from_slice(bytes);
        while self.pending.len() >= 64 {
            let block: Vec<u8> = self.pending.drain(..64).collect();
            self.process_block(&block);
        }
    }
    fn finalize(mut self) -> [u8; 20] {
        let length = self.bit_len;
        self.pending.push(0x80);
        while self.pending.len() % 64 != 56 {
            self.pending.push(0);
        }
        self.pending.extend_from_slice(&length.to_be_bytes());
        while !self.pending.is_empty() {
            let block: Vec<u8> = self.pending.drain(..64).collect();
            self.process_block(&block);
        }
        let mut output = [0_u8; 20];
        for (index, word) in self.state.into_iter().enumerate() {
            output[index * 4..index * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        output
    }
}

enum ChecksumHasher {
    Sha1(Sha1Digest),
    Sha256(Sha256),
    Sha512(Sha512),
}
impl ChecksumHasher {
    fn new(algorithm: ChecksumAlgorithm) -> Self {
        match algorithm {
            ChecksumAlgorithm::Sha1 => Self::Sha1(Sha1Digest::new()),
            ChecksumAlgorithm::Sha256 => Self::Sha256(Sha256::new()),
            ChecksumAlgorithm::Sha512 => Self::Sha512(Sha512::new()),
        }
    }
    fn update(&mut self, bytes: &[u8]) {
        match self {
            Self::Sha1(hasher) => hasher.update(bytes),
            Self::Sha256(hasher) => hasher.update(bytes),
            Self::Sha512(hasher) => hasher.update(bytes),
        }
    }
    fn finalize(self) -> String {
        match self {
            Self::Sha1(hasher) => hex_encode(&hasher.finalize()),
            Self::Sha256(hasher) => hex_encode(&hasher.finalize()),
            Self::Sha512(hasher) => hex_encode(&hasher.finalize()),
        }
    }
}
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
fn validated_checksum(checksum: &ExpectedChecksum) -> Result<(ChecksumAlgorithm, String), String> {
    let algorithm = ChecksumAlgorithm::parse(&checksum.algorithm)?;
    let value = checksum.value.trim().to_ascii_lowercase();
    if value.len() != algorithm.hex_length() || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(format!(
            "Invalid {} checksum",
            checksum.algorithm.trim().to_ascii_uppercase()
        ));
    }
    Ok((algorithm, value))
}

pub(crate) fn required_sha256(checksum: Option<ExpectedChecksum>) -> Result<String, String> {
    let checksum = checksum
        .ok_or_else(|| "Verified artifact installation requires a SHA-256 checksum".to_string())?;
    if !checksum.algorithm.trim().eq_ignore_ascii_case("sha256") {
        return Err("Verified artifact installation requires a SHA-256 checksum".to_string());
    }
    let (_, value) = validated_checksum(&checksum)?;
    Ok(value)
}

fn is_e2e_fixture_url(parsed: &Url) -> bool {
    // A loopback HTTP fixture is intentionally available only to an explicitly
    // opted-in debug process. Release binaries retain the HTTPS/provider-host
    // policy below, including for redirects.
    cfg!(debug_assertions)
        && std::env::var("MC_VECTOR_E2E").ok().as_deref() == Some("1")
        && parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost"))
        && parsed.port().is_some()
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.fragment().is_none()
}

fn validate_https_url(url: &str, allowed_hosts: Option<&[&str]>) -> Result<Url, String> {
    if url.chars().any(char::is_control) {
        return Err("Download URL contains control characters".to_string());
    }
    let parsed = Url::parse(url.trim()).map_err(|_| "Invalid download URL".to_string())?;
    if is_e2e_fixture_url(&parsed) {
        return Ok(parsed);
    }
    if parsed.scheme() != "https" {
        return Err("Download URL must use HTTPS".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Download URL must not contain userinfo".to_string());
    }
    if parsed.port().is_some() || parsed.fragment().is_some() {
        return Err("Download URL contains an unsupported port or fragment".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Download URL host is missing".to_string())?;
    if host.parse::<std::net::IpAddr>().is_ok() {
        return Err("Download URL must use a provider hostname, not an IP address".to_string());
    }
    if let Some(allowed_hosts) = allowed_hosts {
        if !allowed_hosts
            .iter()
            .any(|allowed| host.eq_ignore_ascii_case(allowed))
        {
            return Err("Download URL host is not approved for this provider".to_string());
        }
    }
    Ok(parsed)
}

fn validate_download_redirect(
    url: &Url,
    allowed_hosts: Option<&[&str]>,
    previous_count: usize,
) -> Result<(), String> {
    if previous_count >= MAX_REDIRECTS {
        return Err("Download exceeded the redirect limit".into());
    }
    validate_https_url(url.as_str(), allowed_hosts).map(|_| ())
}

fn http_client(allowed_hosts: Option<&[&str]>) -> Result<Client, String> {
    let hosts = allowed_hosts.map(|items| {
        items
            .iter()
            .map(|item| (*item).to_string())
            .collect::<Vec<_>>()
    });
    Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .redirect(redirect::Policy::custom(move |attempt| {
            let allowed = hosts
                .as_ref()
                .map(|items| items.iter().map(String::as_str).collect::<Vec<_>>());
            match validate_download_redirect(
                attempt.url(),
                allowed.as_deref(),
                attempt.previous().len(),
            ) {
                Ok(()) => attempt.follow(),
                Err(error) => attempt.error(error),
            }
        }))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

/// Bound the wait for response headers without imposing a short total duration
/// on large artifact bodies. Body streams are bounded separately by the
/// inactivity and byte limits below.
pub(crate) async fn send_request_with_timeout(
    request: reqwest::RequestBuilder,
    timeout: Duration,
    context: &str,
) -> Result<reqwest::Response, String> {
    match tokio::time::timeout(timeout, request.send()).await {
        Ok(Ok(response)) => Ok(response),
        Ok(Err(error)) => Err(format!("{context}: {error}")),
        Err(_) => Err(format!("{context}: response headers timed out")),
    }
}

/// Read a small metadata response without trusting Content-Length. Streaming
/// bodies are stopped as soon as their actual size exceeds the configured cap.
pub(crate) async fn read_limited_response_body(
    response: reqwest::Response,
    max_bytes: u64,
    context: &str,
) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes)
    {
        return Err(format!("{context} exceeds the size limit"));
    }

    let initial_capacity = response
        .content_length()
        .and_then(|length| usize::try_from(length.min(max_bytes)).ok())
        .unwrap_or_default();
    let mut body = Vec::with_capacity(initial_capacity);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = tokio::time::timeout(INACTIVITY_TIMEOUT, stream.next())
        .await
        .map_err(|_| format!("{context} stalled while waiting for data"))?
        .transpose()
        .map_err(|error| format!("Failed to read {context}: {error}"))?
    {
        if (body.len() as u64).saturating_add(chunk.len() as u64) > max_bytes {
            return Err(format!("{context} exceeds the size limit"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn temporary_path(destination: &Path, attempt: usize) -> PathBuf {
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("download");
    destination.with_file_name(format!(
        ".{name}.part-{}-{attempt}-{}",
        std::process::id(),
        Uuid::new_v4()
    ))
}

async fn replace_destination(
    temp: &Path,
    destination: &Path,
    managed_root: &Path,
) -> Result<(), String> {
    if !temp.is_absolute()
        || !destination.is_absolute()
        || !temp.starts_with(managed_root)
        || !destination.starts_with(managed_root)
        || temp
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        || destination
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Download paths must remain inside managed storage".to_string());
    }
    let temp_parent = temp
        .parent()
        .ok_or_else(|| "Temporary download path has no parent".to_string())?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| "Download destination has no parent".to_string())?;
    let canonical_temp_parent = tokio::fs::canonicalize(temp_parent)
        .await
        .map_err(|error| format!("Failed to resolve temporary download directory: {error}"))?;
    let canonical_destination_parent = tokio::fs::canonicalize(destination_parent)
        .await
        .map_err(|error| format!("Failed to resolve download directory: {error}"))?;
    if !canonical_temp_parent.starts_with(managed_root)
        || !canonical_destination_parent.starts_with(managed_root)
        || canonical_temp_parent != canonical_destination_parent
    {
        return Err("Download directories must remain inside managed storage".to_string());
    }
    match tokio::fs::symlink_metadata(destination).await {
        Ok(metadata) if is_link_or_reparse_point(&metadata) => {
            return Err(
                "Download destination must not be a symbolic link or reparse point".to_string(),
            )
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err("Download destination is not a regular file".to_string())
        }
        Ok(_) => {
            let destination_name = destination
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("download");
            let rollback = destination
                .with_file_name(format!(".{destination_name}.rollback-{}", Uuid::new_v4()));
            tokio::fs::rename(destination, &rollback)
                .await
                .map_err(|error| {
                    format!("Failed to stage existing download destination: {error}")
                })?;
            match tokio::fs::rename(temp, destination).await {
                Ok(()) => {
                    // Keeping the rollback file is safe if cleanup fails: the new verified
                    // artifact is already installed and the previous bytes remain recoverable.
                    let _ = tokio::fs::remove_file(&rollback).await;
                    Ok(())
                }
                Err(install_error) => {
                    let recovery = tokio::fs::rename(&rollback, destination).await;
                    if recovery.is_ok() {
                        Err(format!(
                            "Failed to install verified artifact; existing destination restored: {install_error}"
                        ))
                    } else {
                        Err(format!(
                            "Failed to install verified artifact and restore existing destination; manual recovery required: {install_error}"
                        ))
                    }
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            tokio::fs::rename(temp, destination)
                .await
                .map_err(|error| format!("Failed to atomically move downloaded file: {error}"))
        }
        Err(error) => Err(format!(
            "Failed to inspect existing download destination: {error}"
        )),
    }
}

async fn download_once<F>(
    client: &Client,
    url: &Url,
    destination: &Path,
    managed_root: &Path,
    checksum: Option<&ExpectedChecksum>,
    expected_size: Option<u64>,
    max_bytes: u64,
    mut report: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    if !destination.is_absolute()
        || !destination.starts_with(managed_root)
        || destination
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Temporary download path must remain inside managed storage".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Temporary download path has no parent".to_string())?;
    let canonical_parent = tokio::fs::canonicalize(parent)
        .await
        .map_err(|error| format!("Failed to resolve temporary download directory: {error}"))?;
    if !canonical_parent.starts_with(managed_root) {
        return Err("Temporary download directory must remain inside managed storage".to_string());
    }
    let response = send_request_with_timeout(
        client.get(url.clone()),
        RESPONSE_HEADERS_TIMEOUT,
        "HTTP request failed",
    )
    .await?;
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);
    if total > max_bytes {
        return Err(format!("Download exceeds the {max_bytes}-byte limit"));
    }
    if let Some(expected_size) = expected_size {
        if total != 0 && total != expected_size {
            return Err(format!(
                "Download size mismatch: expected {expected_size} bytes, got {total}"
            ));
        }
    }
    let mut hasher = checksum
        .map(validated_checksum)
        .transpose()?
        .map(|(algorithm, _)| ChecksumHasher::new(algorithm));
    if let Ok(metadata) = tokio::fs::symlink_metadata(destination).await {
        if is_link_or_reparse_point(&metadata) {
            return Err(
                "Temporary download path must not be a symbolic link or reparse point".to_string(),
            );
        }
    }
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .await
        .map_err(|error| format!("Failed to create temporary file: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut downloaded = 0_u64;
    while let Some(chunk) = tokio::time::timeout(INACTIVITY_TIMEOUT, stream.next())
        .await
        .map_err(|_| "Download stalled while waiting for data".to_string())?
        .transpose()
        .map_err(|error| format!("Download stream error: {error}"))?
    {
        downloaded = downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "Download size overflow".to_string())?;
        if downloaded > max_bytes {
            return Err(format!("Download exceeds the {max_bytes}-byte limit"));
        }
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Failed to write temporary file: {error}"))?;
        if let Some(hasher) = &mut hasher {
            hasher.update(&chunk);
        }
        report(downloaded, total)?;
    }
    file.flush()
        .await
        .map_err(|error| format!("Failed to flush temporary file: {error}"))?;
    file.sync_all()
        .await
        .map_err(|error| format!("Failed to sync temporary file: {error}"))?;
    if let Some(expected_size) = expected_size {
        if downloaded != expected_size {
            return Err(format!(
                "Download size mismatch: expected {expected_size} bytes, got {downloaded}"
            ));
        }
    }
    if let (Some(checksum), Some(hasher)) = (checksum, hasher) {
        let (_, expected) = validated_checksum(checksum)?;
        let actual = hasher.finalize();
        if actual != expected {
            return Err(format!(
                "{} checksum mismatch: expected {expected}, got {actual}",
                checksum.algorithm.trim().to_ascii_uppercase()
            ));
        }
    }
    Ok(())
}
async fn download_with_retry<F>(
    url: Url,
    destination: PathBuf,
    managed_root: &Path,
    checksum: Option<ExpectedChecksum>,
    expected_size: Option<u64>,
    max_bytes: u64,
    allowed_hosts: Option<&[&str]>,
    mut report: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    if !destination.is_absolute()
        || !destination.starts_with(managed_root)
        || destination
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Download destination must remain inside managed storage".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Download destination has no parent".to_string())?;
    let canonical_parent = tokio::fs::canonicalize(parent)
        .await
        .map_err(|error| format!("Failed to resolve download directory: {error}"))?;
    if !canonical_parent.starts_with(managed_root) {
        return Err("Download directory must remain inside managed storage".to_string());
    }
    let client = http_client(allowed_hosts)?;
    let mut last_error = "download failed".to_string();
    for attempt in 1..=MAX_ATTEMPTS {
        let temp = temporary_path(&destination, attempt);
        match download_once(
            &client,
            &url,
            &temp,
            managed_root,
            checksum.as_ref(),
            expected_size,
            max_bytes,
            &mut report,
        )
        .await
        {
            Ok(()) => match replace_destination(&temp, &destination, managed_root).await {
                Ok(()) => return Ok(()),
                Err(error) => last_error = error,
            },
            Err(error) => last_error = error,
        };
        if temp.is_absolute()
            && temp.starts_with(managed_root)
            && !temp
                .components()
                .any(|component| matches!(component, Component::ParentDir))
        {
            let _ = tokio::fs::remove_file(&temp).await;
        }
        if attempt < MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(250 * attempt as u64)).await;
        }
    }
    Err(last_error)
}

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
    let url = validate_https_url(url, allowed_hosts)?;
    let checksum = ExpectedChecksum {
        algorithm: "sha256".to_string(),
        value: expected_sha256.to_string(),
    };
    let (_, normalized_sha256) = validated_checksum(&checksum)?;
    let staging = staging_hint.with_file_name(format!(
        ".{}-verified-{}.part",
        staging_hint
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("artifact"),
        Uuid::new_v4()
    ));

    let downloaded = download_with_retry(
        url,
        staging.clone(),
        managed_root,
        Some(checksum),
        expected_size,
        max_bytes,
        allowed_hosts,
        report,
    )
    .await;
    if let Err(error) = downloaded {
        let _ = tokio::fs::remove_file(&staging).await;
        return Err(error);
    }

    let size = tokio::fs::metadata(&staging)
        .await
        .map_err(|error| format!("Failed to inspect verified artifact: {error}"))?
        .len();
    Ok(VerifiedArtifact {
        path: staging,
        sha256: normalized_sha256,
        size,
    })
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
    let url = validate_https_url(url, Some(hosts))?;
    download_with_retry(
        url,
        destination,
        managed_root,
        checksum,
        None,
        MAX_PLUGIN_DOWNLOAD_BYTES,
        Some(hosts),
        report,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc;
    use std::thread;

    static TEST_DIRECTORY_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let root = std::fs::canonicalize("target").expect("cargo should provide target");
            let sequence = TEST_DIRECTORY_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = root
                .join("mc-vector-download")
                .join(format!("{}-{sequence}", std::process::id()));
            std::fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn plugins_example(&self) -> PathBuf {
            let directory = self.path().join("plugins");
            std::fs::create_dir_all(&directory).expect("plugin directory should be created");
            directory.join("example.jar")
        }

        fn mods_example(&self) -> PathBuf {
            let directory = self.path().join("mods");
            std::fs::create_dir_all(&directory).expect("mod directory should be created");
            directory.join("example.jar")
        }

        fn plugins_content_length(&self) -> PathBuf {
            let directory = self.path().join("plugins");
            std::fs::create_dir_all(&directory).expect("plugin directory should be created");
            directory.join("content-length.jar")
        }

        fn plugins_stream_limit(&self) -> PathBuf {
            let directory = self.path().join("plugins");
            std::fs::create_dir_all(&directory).expect("plugin directory should be created");
            directory.join("stream-limit.jar")
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    struct TestHttpServer {
        url: Url,
        thread: Option<thread::JoinHandle<()>>,
    }

    impl TestHttpServer {
        fn new(body: &[u8], include_content_length: bool, requests: usize) -> Self {
            let content_length = if include_content_length {
                format!("Content-Length: {}\r\n", body.len())
            } else {
                String::new()
            };
            let mut response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\n{content_length}Connection: close\r\n\r\n"
            )
            .into_bytes();
            response.extend_from_slice(body);
            Self::with_response(&response, requests)
        }

        fn with_response(response: &[u8], requests: usize) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
            let address = listener
                .local_addr()
                .expect("loopback listener should have an address");
            let response = response.to_vec();
            let (ready_sender, ready_receiver) = mpsc::channel();
            let thread = thread::spawn(move || {
                ready_sender
                    .send(())
                    .expect("test server should signal readiness");
                for _ in 0..requests {
                    let (mut stream, _) = listener.accept().expect("test request should connect");
                    let mut request = [0_u8; 4096];
                    let _ = stream.read(&mut request);
                    stream
                        .write_all(&response)
                        .expect("test response should be written");
                    stream.flush().expect("test response should be flushed");
                }
            });
            ready_receiver
                .recv()
                .expect("test server should become ready");
            Self {
                url: Url::parse(&format!("http://{address}/plugin.jar"))
                    .expect("test server URL should parse"),
                thread: Some(thread),
            }
        }
    }

    impl Drop for TestHttpServer {
        fn drop(&mut self) {
            if let Some(thread) = self.thread.take() {
                thread.join().expect("test server should stop cleanly");
            }
        }
    }

    fn test_checksum(algorithm: &str, body: &[u8]) -> ExpectedChecksum {
        let algorithm_value =
            ChecksumAlgorithm::parse(algorithm).expect("test algorithm should parse");
        let mut hasher = ChecksumHasher::new(algorithm_value);
        hasher.update(body);
        ExpectedChecksum {
            algorithm: algorithm.to_string(),
            value: hasher.finalize(),
        }
    }

    fn assert_no_temporary_files(directory: &Path, destination: &Path) {
        let destination_name = destination
            .file_name()
            .expect("destination should have a filename")
            .to_string_lossy();
        let temporary_prefix = format!(".{destination_name}.part-");
        let leftovers = std::fs::read_dir(directory)
            .expect("test directory should be readable")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(&temporary_prefix)
            })
            .collect::<Vec<_>>();
        assert!(
            leftovers.is_empty(),
            "temporary files remain: {leftovers:?}"
        );
    }

    async fn download_from_test_server(
        server: &TestHttpServer,
        managed_root: &Path,
        destination: PathBuf,
        checksum: Option<ExpectedChecksum>,
        max_bytes: u64,
    ) -> Result<(), String> {
        download_with_retry(
            server.url.clone(),
            destination,
            managed_root,
            checksum,
            None,
            max_bytes,
            None,
            |_, _| Ok(()),
        )
        .await
    }

    #[tokio::test]
    async fn response_header_timeout_stops_a_stalled_server() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let address = listener
            .local_addr()
            .expect("loopback listener should have an address");
        let server_thread = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test request should connect");
            let mut request = [0_u8; 4096];
            let _ = stream.read(&mut request);
            thread::sleep(Duration::from_millis(250));
        });

        let url = Url::parse(&format!("http://{address}/metadata")).unwrap();
        let error = send_request_with_timeout(
            Client::new().get(url),
            Duration::from_millis(50),
            "test metadata request",
        )
        .await
        .expect_err("request without response headers should time out");

        assert!(error.contains("response headers timed out"), "{error}");
        server_thread
            .join()
            .expect("test server should stop cleanly");
    }

    #[tokio::test]
    async fn bounded_metadata_reader_rejects_oversized_chunked_and_unknown_length_bodies() {
        let responses = [
            b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n012345".as_slice(),
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n6\r\n012345\r\n0\r\n\r\n".as_slice(),
        ];

        for response_bytes in responses {
            let server = TestHttpServer::with_response(response_bytes, 1);
            let response = Client::new()
                .get(server.url.clone())
                .send()
                .await
                .expect("metadata response should arrive");
            let error = read_limited_response_body(response, 5, "test metadata")
                .await
                .expect_err("metadata body over cap should be rejected");
            assert!(error.contains("exceeds the size limit"), "{error}");
        }
    }

    #[test]
    fn verifies_all_supported_checksum_algorithms() {
        for (algorithm, input, expected) in [("sha1", "abc", "a9993e364706816aba3e25717850c26c9cd0d89d"), ("sha256", "abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), ("sha512", "abc", "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f")] { let (parsed, _) = validated_checksum(&ExpectedChecksum { algorithm: algorithm.to_string(), value: expected.to_string() }).unwrap(); let mut hasher = ChecksumHasher::new(parsed); hasher.update(input.as_bytes()); assert_eq!(hasher.finalize(), expected); }
    }
    #[test]
    fn rejects_invalid_checksum_and_unapproved_urls() {
        assert!(validated_checksum(&ExpectedChecksum {
            algorithm: "sha1".to_string(),
            value: "0".repeat(64)
        })
        .is_err());
        assert!(validate_https_url(
            "http://cdn.modrinth.com/file.jar",
            Some(&["cdn.modrinth.com"])
        )
        .is_err());
        assert!(
            validate_https_url("https://127.0.0.1/file.jar", Some(&["cdn.modrinth.com"])).is_err()
        );
        assert!(
            validate_https_url("https://evil.example/file.jar", Some(&["cdn.modrinth.com"]))
                .is_err()
        );
        assert!(validate_https_url(
            "https://user@cdn.modrinth.com/file.jar",
            Some(&["cdn.modrinth.com"])
        )
        .is_err());
    }
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

    #[tokio::test]
    async fn downloads_plugins_and_mods_to_the_final_jar_path() {
        for destination in [TestDirectory::plugins_example, TestDirectory::mods_example] {
            let test_dir = TestDirectory::new();
            let destination = destination(&test_dir);
            let server = TestHttpServer::new(b"plugin bytes", true, 1);

            download_from_test_server(&server, test_dir.path(), destination.clone(), None, 1024)
                .await
                .expect("plugin should download");

            assert_eq!(std::fs::read(&destination).unwrap(), b"plugin bytes");
            assert_no_temporary_files(destination.parent().unwrap(), &destination);
        }
    }

    #[tokio::test]
    async fn verifies_sha1_sha256_and_sha512_during_real_downloads() {
        let body = b"plugin bytes with a checksum";
        for algorithm in ["sha1", "sha256", "sha512"] {
            let test_dir = TestDirectory::new();
            let destination = test_dir.plugins_example();
            let server = TestHttpServer::new(body, true, 1);

            download_from_test_server(
                &server,
                test_dir.path(),
                destination.clone(),
                Some(test_checksum(algorithm, body)),
                1024,
            )
            .await
            .expect("checksum should match downloaded bytes");

            assert_eq!(std::fs::read(destination).unwrap(), body);
        }
    }

    #[tokio::test]
    async fn rejects_checksum_mismatch_and_cleans_up_without_touching_final_file() {
        let test_dir = TestDirectory::new();
        let destination = test_dir.plugins_example();
        std::fs::write(&destination, b"existing plugin")
            .expect("existing plugin should be written");
        let server = TestHttpServer::new(b"new plugin", true, MAX_ATTEMPTS);
        let checksum = ExpectedChecksum {
            algorithm: "sha256".to_string(),
            value: "0".repeat(64),
        };

        let error = download_from_test_server(
            &server,
            test_dir.path(),
            destination.clone(),
            Some(checksum),
            1024,
        )
        .await
        .expect_err("checksum mismatch should reject the download");

        assert!(error.contains("checksum mismatch"));
        assert_eq!(std::fs::read(&destination).unwrap(), b"existing plugin");
        assert_no_temporary_files(destination.parent().unwrap(), &destination);
    }

    #[tokio::test]
    async fn rejects_content_length_and_stream_size_limits_without_final_file() {
        let test_dir = TestDirectory::new();
        let content_length_destination = test_dir.plugins_content_length();
        let content_length_server = TestHttpServer::new(b"012345", true, MAX_ATTEMPTS);
        let content_length_error = download_from_test_server(
            &content_length_server,
            test_dir.path(),
            content_length_destination.clone(),
            None,
            5,
        )
        .await
        .expect_err("content-length over limit should reject");
        assert!(content_length_error.contains("Download exceeds the 5-byte limit"));
        assert!(!content_length_destination.exists());
        assert_no_temporary_files(
            content_length_destination.parent().unwrap(),
            &content_length_destination,
        );

        let stream_destination = test_dir.plugins_stream_limit();
        let stream_server = TestHttpServer::new(b"012345", false, MAX_ATTEMPTS);
        let stream_error = download_from_test_server(
            &stream_server,
            test_dir.path(),
            stream_destination.clone(),
            None,
            5,
        )
        .await
        .expect_err("stream size over limit should reject");
        assert!(stream_error.contains("Download exceeds the 5-byte limit"));
        assert!(!stream_destination.exists());
        assert_no_temporary_files(stream_destination.parent().unwrap(), &stream_destination);
    }

    #[tokio::test]
    async fn atomically_replaces_an_existing_destination_only_after_success() {
        let test_dir = TestDirectory::new();
        let destination = test_dir.plugins_example();
        std::fs::write(&destination, b"old plugin").expect("old plugin should be written");
        let server = TestHttpServer::new(b"new plugin", true, 1);

        download_from_test_server(&server, test_dir.path(), destination.clone(), None, 1024)
            .await
            .expect("new plugin should download");

        assert_eq!(std::fs::read(&destination).unwrap(), b"new plugin");
        assert_no_temporary_files(destination.parent().unwrap(), &destination);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_a_symlink_destination_before_replacement() {
        use std::os::unix::fs::symlink;

        let test_dir = TestDirectory::new();
        let outside = TestDirectory::new();
        let destination = test_dir.plugins_example();
        symlink(outside.path().join("outside.jar"), &destination)
            .expect("destination symlink should be created");
        let server = TestHttpServer::new(b"plugin bytes", true, MAX_ATTEMPTS);

        let error =
            download_from_test_server(&server, test_dir.path(), destination.clone(), None, 1024)
                .await
                .expect_err("symlink destination should be rejected");

        assert!(error.contains("symbolic link"));
        assert!(std::fs::symlink_metadata(&destination)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_no_temporary_files(destination.parent().unwrap(), &destination);
    }

    #[test]
    fn rejects_malformed_checksum_values_before_download() {
        for (algorithm, value) in [
            ("sha1", "0".repeat(39)),
            ("sha256", "0".repeat(63)),
            ("sha512", "0".repeat(127)),
            ("sha256", format!("{}g", "0".repeat(63))),
        ] {
            assert!(validated_checksum(&ExpectedChecksum {
                algorithm: algorithm.to_string(),
                value,
            })
            .is_err());
        }
        assert!(ChecksumAlgorithm::parse("md5").is_err());
    }

    #[test]
    fn executable_artifacts_require_sha256() {
        assert!(required_sha256(None).is_err());
        assert!(required_sha256(Some(ExpectedChecksum {
            algorithm: "sha1".to_string(),
            value: "0".repeat(40),
        }))
        .is_err());
        let checksum = test_checksum("sha256", b"artifact");
        let expected = checksum.value.clone();
        assert_eq!(required_sha256(Some(checksum)).unwrap(), expected);
    }

    #[test]
    fn redirect_validation_keeps_provider_allowlists_strict() {
        assert!(validate_https_url(
            "https://cdn.modrinth.com/plugin.jar",
            Some(&["cdn.modrinth.com"])
        )
        .is_ok());
        assert!(validate_https_url(
            "https://evil.example/plugin.jar",
            Some(&["cdn.modrinth.com"])
        )
        .is_err());
        assert!(
            validate_https_url("https://127.0.0.1/plugin.jar", Some(&["cdn.modrinth.com"]))
                .is_err()
        );
    }
    #[test]
    fn excessive_redirects_are_rejected_even_for_an_approved_provider_host() {
        let url = Url::parse("https://cdn.modrinth.com/repeating.jar").unwrap();
        for previous_count in 0..MAX_REDIRECTS {
            assert!(
                validate_download_redirect(&url, Some(&["cdn.modrinth.com"]), previous_count)
                    .is_ok()
            );
        }
        assert!(
            validate_download_redirect(&url, Some(&["cdn.modrinth.com"]), MAX_REDIRECTS)
                .unwrap_err()
                .contains("redirect limit")
        );
        assert!(validate_download_redirect(&url, Some(&["cdn.modrinth.com"]), usize::MAX).is_err());
        assert!(validate_download_redirect(
            &Url::parse("https://evil.test/a.jar").unwrap(),
            Some(&["cdn.modrinth.com"]),
            1
        )
        .is_err());
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
