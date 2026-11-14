//! Verified downloads into managed storage.
//!
//! Every artifact that MC-Vector executes or installs (server jars, Java
//! runtimes, ngrok, plugins) is downloaded through this module:
//!
//! - URLs must be HTTPS, use a hostname (not an IP literal), carry no userinfo,
//!   port or fragment, and match the caller's host allowlist. Redirects are
//!   re-checked against the same rules and capped at [`MAX_REDIRECTS`].
//! - Bytes go to a fresh temporary file next to the destination, are limited
//!   by both Content-Length and the streamed size, flushed and `sync_all`ed,
//!   checked against the expected checksum, and only then renamed into place.
//! - A [`CancelFlag`] stops the transfer between chunks; the temporary file is
//!   removed and [`DownloadErrorKind::Cancelled`] is returned.
//!
//! Progress callbacks cannot fail: a UI that stops listening never aborts a
//! download.

use std::fmt;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{redirect, Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::managed_path::is_link_or_reparse_point;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const RESPONSE_HEADERS_TIMEOUT: Duration = Duration::from_secs(30);
const INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60);
pub const MAX_ATTEMPTS: usize = 2;
pub const MAX_REDIRECTS: usize = 5;

const DEFAULT_USER_AGENT: &str = "MC-Vector (https://github.com/tukuyomil032/MC-Vector)";
static USER_AGENT: OnceLock<String> = OnceLock::new();

/// Sets the User-Agent for every request this crate makes, for example
/// `MC-Vector/2.1.0 (https://github.com/tukuyomil032/MC-Vector)`. Call once at
/// startup; later calls are ignored.
pub fn set_user_agent(value: impl Into<String>) {
    let _ = USER_AGENT.set(value.into());
}

/// The User-Agent for requests made by this crate.
pub fn user_agent() -> &'static str {
    USER_AGENT
        .get()
        .map(String::as_str)
        .unwrap_or(DEFAULT_USER_AGENT)
}

/// A cancellation request shared between the caller and a running download.
#[derive(Clone, Debug, Default)]
pub struct CancelFlag(Arc<AtomicBool>);

impl CancelFlag {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Why a download failed. Callers map these to user-facing error codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadErrorKind {
    /// The URL or a redirect broke the download policy.
    Policy,
    /// The request, the response or the byte stream failed.
    Network,
    /// The bytes did not match the expected checksum or size.
    ChecksumMismatch,
    /// The artifact is larger than the allowed size.
    TooLarge,
    /// The caller cancelled the download.
    Cancelled,
    /// A local file operation failed, or a path left managed storage.
    Io,
}

/// A failed download. The message is English, has no absolute paths, and may
/// be logged or shown as a detail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadError {
    pub kind: DownloadErrorKind,
    pub message: String,
}

impl DownloadError {
    fn new(kind: DownloadErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
    fn policy(message: impl Into<String>) -> Self {
        Self::new(DownloadErrorKind::Policy, message)
    }
    fn network(message: impl Into<String>) -> Self {
        Self::new(DownloadErrorKind::Network, message)
    }
    fn io(message: impl Into<String>) -> Self {
        Self::new(DownloadErrorKind::Io, message)
    }
    fn cancelled() -> Self {
        Self::new(DownloadErrorKind::Cancelled, "Download was cancelled")
    }
}

impl fmt::Display for DownloadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for DownloadError {}

impl From<DownloadError> for String {
    fn from(error: DownloadError) -> Self {
        error.message
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExpectedChecksum {
    pub algorithm: String,
    pub value: String,
}

impl ExpectedChecksum {
    pub fn sha1(value: impl Into<String>) -> Self {
        Self {
            algorithm: "sha1".to_string(),
            value: value.into(),
        }
    }

    pub fn sha256(value: impl Into<String>) -> Self {
        Self {
            algorithm: "sha256".to_string(),
            value: value.into(),
        }
    }

    /// True when the algorithm is known and the value is well-formed hex.
    pub fn is_valid(&self) -> bool {
        validated_checksum(self).is_ok()
    }
}

/// A downloaded file whose bytes matched the expected checksum.
#[derive(Clone, Debug)]
pub struct VerifiedArtifact {
    /// The private staging file; the caller moves it into place.
    pub path: PathBuf,
    /// The normalized (lowercase) checksum the bytes matched.
    pub checksum: String,
    pub size: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ChecksumAlgorithm {
    Sha1,
    Sha256,
    Sha512,
}

impl ChecksumAlgorithm {
    fn parse(value: &str) -> Result<Self, DownloadError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "sha1" => Ok(Self::Sha1),
            "sha256" => Ok(Self::Sha256),
            "sha512" => Ok(Self::Sha512),
            _ => Err(DownloadError::policy(
                "Unsupported checksum algorithm; expected sha1, sha256, or sha512",
            )),
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

// SHA-1 is needed for Modrinth and Mojang metadata. It is used only to compare
// a provider-supplied digest, never as a signing primitive.
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
fn validated_checksum(
    checksum: &ExpectedChecksum,
) -> Result<(ChecksumAlgorithm, String), DownloadError> {
    let algorithm = ChecksumAlgorithm::parse(&checksum.algorithm)?;
    let value = checksum.value.trim().to_ascii_lowercase();
    if value.len() != algorithm.hex_length() || !value.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(DownloadError::policy(format!(
            "Invalid {} checksum",
            checksum.algorithm.trim().to_ascii_uppercase()
        )));
    }
    Ok((algorithm, value))
}

/// Executable artifacts installed from plugin providers must carry SHA-256.
pub fn required_sha256(checksum: Option<ExpectedChecksum>) -> Result<String, String> {
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
    // opted-in debug process. Release binaries keep the HTTPS/provider-host
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

/// Parses `url` and checks it against the download policy and `allowed_hosts`.
pub fn validate_https_url(url: &str, allowed_hosts: Option<&[&str]>) -> Result<Url, String> {
    validate_url(url, allowed_hosts).map_err(String::from)
}

fn validate_url(url: &str, allowed_hosts: Option<&[&str]>) -> Result<Url, DownloadError> {
    if url.chars().any(char::is_control) {
        return Err(DownloadError::policy(
            "Download URL contains control characters",
        ));
    }
    let parsed =
        Url::parse(url.trim()).map_err(|_| DownloadError::policy("Invalid download URL"))?;
    if is_e2e_fixture_url(&parsed) {
        return Ok(parsed);
    }
    if parsed.scheme() != "https" {
        return Err(DownloadError::policy("Download URL must use HTTPS"));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(DownloadError::policy(
            "Download URL must not contain userinfo",
        ));
    }
    if parsed.port().is_some() || parsed.fragment().is_some() {
        return Err(DownloadError::policy(
            "Download URL contains an unsupported port or fragment",
        ));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| DownloadError::policy("Download URL host is missing"))?;
    if host.parse::<std::net::IpAddr>().is_ok() {
        return Err(DownloadError::policy(
            "Download URL must use a provider hostname, not an IP address",
        ));
    }
    if let Some(allowed_hosts) = allowed_hosts {
        if !allowed_hosts
            .iter()
            .any(|allowed| host.eq_ignore_ascii_case(allowed))
        {
            return Err(DownloadError::policy(
                "Download URL host is not approved for this provider",
            ));
        }
    }
    Ok(parsed)
}

/// Checks one redirect hop: the hop count and the same URL policy.
pub fn validate_download_redirect(
    url: &Url,
    allowed_hosts: Option<&[&str]>,
    previous_count: usize,
) -> Result<(), String> {
    if previous_count >= MAX_REDIRECTS {
        return Err("Download exceeded the redirect limit".into());
    }
    validate_https_url(url.as_str(), allowed_hosts).map(|_| ())
}

fn http_client(allowed_hosts: Option<&[&str]>) -> Result<Client, DownloadError> {
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
        .user_agent(user_agent())
        .build()
        .map_err(|error| DownloadError::network(format!("Failed to create HTTP client: {error}")))
}

/// Bounds the wait for response headers without imposing a short total
/// duration on large bodies. Bodies are bounded separately by the inactivity
/// and byte limits.
pub async fn send_request_with_timeout(
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

/// Reads a small metadata response without trusting Content-Length. The
/// stream stops as soon as its actual size exceeds `max_bytes`.
pub async fn read_limited_response_body(
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

fn has_parent_component(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
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
) -> Result<(), DownloadError> {
    if !temp.is_absolute()
        || !destination.is_absolute()
        || !temp.starts_with(managed_root)
        || !destination.starts_with(managed_root)
        || has_parent_component(temp)
        || has_parent_component(destination)
    {
        return Err(DownloadError::io(
            "Download paths must remain inside managed storage",
        ));
    }
    let temp_parent = temp
        .parent()
        .ok_or_else(|| DownloadError::io("Temporary download path has no parent"))?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| DownloadError::io("Download destination has no parent"))?;
    let canonical_temp_parent = tokio::fs::canonicalize(temp_parent)
        .await
        .map_err(|error| {
            DownloadError::io(format!(
                "Failed to resolve temporary download directory: {error}"
            ))
        })?;
    let canonical_destination_parent =
        tokio::fs::canonicalize(destination_parent)
            .await
            .map_err(|error| {
                DownloadError::io(format!("Failed to resolve download directory: {error}"))
            })?;
    if !canonical_temp_parent.starts_with(managed_root)
        || !canonical_destination_parent.starts_with(managed_root)
        || canonical_temp_parent != canonical_destination_parent
    {
        return Err(DownloadError::io(
            "Download directories must remain inside managed storage",
        ));
    }
    match tokio::fs::symlink_metadata(destination).await {
        Ok(metadata) if is_link_or_reparse_point(&metadata) => Err(DownloadError::io(
            "Download destination must not be a symbolic link or reparse point",
        )),
        Ok(metadata) if !metadata.is_file() => Err(DownloadError::io(
            "Download destination is not a regular file",
        )),
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
                    DownloadError::io(format!(
                        "Failed to stage existing download destination: {error}"
                    ))
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
                        Err(DownloadError::io(format!(
                            "Failed to install verified artifact; existing destination restored: {install_error}"
                        )))
                    } else {
                        Err(DownloadError::io(format!(
                            "Failed to install verified artifact and restore existing destination; manual recovery required: {install_error}"
                        )))
                    }
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            tokio::fs::rename(temp, destination).await.map_err(|error| {
                DownloadError::io(format!(
                    "Failed to atomically move downloaded file: {error}"
                ))
            })
        }
        Err(error) => Err(DownloadError::io(format!(
            "Failed to inspect existing download destination: {error}"
        ))),
    }
}

/// One transfer: everything a download attempt needs besides its paths.
struct Transfer<'a> {
    client: &'a Client,
    url: &'a Url,
    checksum: Option<&'a ExpectedChecksum>,
    expected_size: Option<u64>,
    max_bytes: u64,
    cancel: Option<&'a CancelFlag>,
}

fn check_cancelled(cancel: Option<&CancelFlag>) -> Result<(), DownloadError> {
    if cancel.is_some_and(CancelFlag::is_cancelled) {
        Err(DownloadError::cancelled())
    } else {
        Ok(())
    }
}

async fn download_once<F>(
    transfer: &Transfer<'_>,
    destination: &Path,
    managed_root: &Path,
    report: &mut F,
) -> Result<(), DownloadError>
where
    F: FnMut(u64, u64),
{
    if !destination.is_absolute()
        || !destination.starts_with(managed_root)
        || has_parent_component(destination)
    {
        return Err(DownloadError::io(
            "Temporary download path must remain inside managed storage",
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| DownloadError::io("Temporary download path has no parent"))?;
    let canonical_parent = tokio::fs::canonicalize(parent).await.map_err(|error| {
        DownloadError::io(format!(
            "Failed to resolve temporary download directory: {error}"
        ))
    })?;
    if !canonical_parent.starts_with(managed_root) {
        return Err(DownloadError::io(
            "Temporary download directory must remain inside managed storage",
        ));
    }
    check_cancelled(transfer.cancel)?;
    let response = send_request_with_timeout(
        transfer.client.get(transfer.url.clone()),
        RESPONSE_HEADERS_TIMEOUT,
        "HTTP request failed",
    )
    .await
    .map_err(DownloadError::network)?;
    if !response.status().is_success() {
        return Err(DownloadError::network(format!(
            "HTTP error: {}",
            response.status()
        )));
    }
    let max_bytes = transfer.max_bytes;
    let total = response.content_length().unwrap_or(0);
    if total > max_bytes {
        return Err(DownloadError::new(
            DownloadErrorKind::TooLarge,
            format!("Download exceeds the {max_bytes}-byte limit"),
        ));
    }
    if let Some(expected_size) = transfer.expected_size {
        if total != 0 && total != expected_size {
            return Err(DownloadError::new(
                DownloadErrorKind::ChecksumMismatch,
                format!("Download size mismatch: expected {expected_size} bytes, got {total}"),
            ));
        }
    }
    let mut hasher = transfer
        .checksum
        .map(validated_checksum)
        .transpose()?
        .map(|(algorithm, _)| ChecksumHasher::new(algorithm));
    if let Ok(metadata) = tokio::fs::symlink_metadata(destination).await {
        if is_link_or_reparse_point(&metadata) {
            return Err(DownloadError::io(
                "Temporary download path must not be a symbolic link or reparse point",
            ));
        }
    }
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .await
        .map_err(|error| DownloadError::io(format!("Failed to create temporary file: {error}")))?;
    let mut stream = response.bytes_stream();
    let mut downloaded = 0_u64;
    while let Some(chunk) = tokio::time::timeout(INACTIVITY_TIMEOUT, stream.next())
        .await
        .map_err(|_| DownloadError::network("Download stalled while waiting for data"))?
        .transpose()
        .map_err(|error| DownloadError::network(format!("Download stream error: {error}")))?
    {
        check_cancelled(transfer.cancel)?;
        downloaded = downloaded.checked_add(chunk.len() as u64).ok_or_else(|| {
            DownloadError::new(DownloadErrorKind::TooLarge, "Download size overflow")
        })?;
        if downloaded > max_bytes {
            return Err(DownloadError::new(
                DownloadErrorKind::TooLarge,
                format!("Download exceeds the {max_bytes}-byte limit"),
            ));
        }
        file.write_all(&chunk).await.map_err(|error| {
            DownloadError::io(format!("Failed to write temporary file: {error}"))
        })?;
        if let Some(hasher) = &mut hasher {
            hasher.update(&chunk);
        }
        report(downloaded, total);
    }
    file.flush()
        .await
        .map_err(|error| DownloadError::io(format!("Failed to flush temporary file: {error}")))?;
    file.sync_all()
        .await
        .map_err(|error| DownloadError::io(format!("Failed to sync temporary file: {error}")))?;
    if let Some(expected_size) = transfer.expected_size {
        if downloaded != expected_size {
            return Err(DownloadError::new(
                DownloadErrorKind::ChecksumMismatch,
                format!("Download size mismatch: expected {expected_size} bytes, got {downloaded}"),
            ));
        }
    }
    if let (Some(checksum), Some(hasher)) = (transfer.checksum, hasher) {
        let (_, expected) = validated_checksum(checksum)?;
        let actual = hasher.finalize();
        if actual != expected {
            return Err(DownloadError::new(
                DownloadErrorKind::ChecksumMismatch,
                format!(
                    "{} checksum mismatch: expected {expected}, got {actual}",
                    checksum.algorithm.trim().to_ascii_uppercase()
                ),
            ));
        }
    }
    Ok(())
}

/// Download options shared by the public entry points.
#[derive(Clone, Copy, Default)]
pub struct DownloadOptions<'a> {
    /// The exact size the provider published, when it did.
    pub expected_size: Option<u64>,
    /// Hosts the URL and every redirect must use. `None` skips the host check.
    pub allowed_hosts: Option<&'a [&'a str]>,
    /// Stops the transfer between chunks.
    pub cancel: Option<&'a CancelFlag>,
}

/// Downloads `url` to `destination` (inside `managed_root`, which must be
/// canonical), retrying once, and replaces any existing regular file only
/// after the bytes are complete and verified.
pub async fn download_to_destination<F>(
    url: &Url,
    destination: PathBuf,
    managed_root: &Path,
    checksum: Option<ExpectedChecksum>,
    max_bytes: u64,
    options: DownloadOptions<'_>,
    mut report: F,
) -> Result<(), DownloadError>
where
    F: FnMut(u64, u64),
{
    if !destination.is_absolute()
        || !destination.starts_with(managed_root)
        || has_parent_component(&destination)
    {
        return Err(DownloadError::io(
            "Download destination must remain inside managed storage",
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| DownloadError::io("Download destination has no parent"))?;
    let canonical_parent = tokio::fs::canonicalize(parent).await.map_err(|error| {
        DownloadError::io(format!("Failed to resolve download directory: {error}"))
    })?;
    if !canonical_parent.starts_with(managed_root) {
        return Err(DownloadError::io(
            "Download directory must remain inside managed storage",
        ));
    }
    let client = http_client(options.allowed_hosts)?;
    let transfer = Transfer {
        client: &client,
        url,
        checksum: checksum.as_ref(),
        expected_size: options.expected_size,
        max_bytes,
        cancel: options.cancel,
    };
    let mut last_error = DownloadError::network("download failed");
    for attempt in 1..=MAX_ATTEMPTS {
        let temp = temporary_path(&destination, attempt);
        let outcome = match download_once(&transfer, &temp, managed_root, &mut report).await {
            Ok(()) => replace_destination(&temp, &destination, managed_root).await,
            Err(error) => Err(error),
        };
        match outcome {
            Ok(()) => return Ok(()),
            Err(error) => last_error = error,
        }
        if temp.is_absolute() && temp.starts_with(managed_root) && !has_parent_component(&temp) {
            let _ = tokio::fs::remove_file(&temp).await;
        }
        // Cancellation and policy failures do not get better on a second try.
        if matches!(
            last_error.kind,
            DownloadErrorKind::Cancelled | DownloadErrorKind::Policy
        ) {
            break;
        }
        if attempt < MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(250 * attempt as u64)).await;
        }
    }
    Err(last_error)
}

/// Downloads an executable artifact to a private staging file next to
/// `staging_hint` and verifies it against `checksum`. The caller moves the
/// returned file into place (or removes it).
pub async fn download_verified_artifact<F>(
    url: &str,
    staging_hint: &Path,
    managed_root: &Path,
    checksum: &ExpectedChecksum,
    max_bytes: u64,
    options: DownloadOptions<'_>,
    report: F,
) -> Result<VerifiedArtifact, DownloadError>
where
    F: FnMut(u64, u64),
{
    let url = validate_url(url, options.allowed_hosts)?;
    let (_, normalized) = validated_checksum(checksum)?;
    let staging = staging_hint.with_file_name(format!(
        ".{}-verified-{}.part",
        staging_hint
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("artifact"),
        Uuid::new_v4()
    ));

    let downloaded = download_to_destination(
        &url,
        staging.clone(),
        managed_root,
        Some(checksum.clone()),
        max_bytes,
        options,
        report,
    )
    .await;
    if let Err(error) = downloaded {
        let _ = tokio::fs::remove_file(&staging).await;
        return Err(error);
    }

    let size = tokio::fs::metadata(&staging)
        .await
        .map_err(|error| {
            DownloadError::io(format!("Failed to inspect verified artifact: {error}"))
        })?
        .len();
    Ok(VerifiedArtifact {
        path: staging,
        checksum: normalized,
        size,
    })
}

/// Converts byte counts to a 0–100 percentage, or `None` when the total size
/// is unknown.
pub fn percent(downloaded: u64, total: u64) -> Option<u32> {
    (total > 0).then(|| ((downloaded.min(total) as f64 / total as f64) * 100.0) as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::thread;

    struct TestDirectory {
        _dir: tempfile::TempDir,
        path: PathBuf,
    }

    impl TestDirectory {
        fn new() -> Self {
            let dir = tempfile::tempdir().expect("test directory should be created");
            // Managed roots are canonical (macOS temp dirs live behind /var -> /private/var).
            let path = dir
                .path()
                .canonicalize()
                .expect("test directory should resolve");
            Self { _dir: dir, path }
        }

        fn path(&self) -> &Path {
            &self.path
        }

        fn file_in(&self, folder: &str, name: &str) -> PathBuf {
            let directory = self.path().join(folder);
            std::fs::create_dir_all(&directory).expect("folder should be created");
            directory.join(name)
        }

        fn plugins_example(&self) -> PathBuf {
            self.file_in("plugins", "example.jar")
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
                    // The client may hang up early (cancellation, size limits).
                    let _ = stream.write_all(&response);
                    let _ = stream.flush();
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
    ) -> Result<(), DownloadError> {
        download_to_destination(
            &server.url,
            destination,
            managed_root,
            checksum,
            max_bytes,
            DownloadOptions::default(),
            |_, _| {},
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
        for (algorithm, input, expected) in [
            ("sha1", "abc", "a9993e364706816aba3e25717850c26c9cd0d89d"),
            (
                "sha256",
                "abc",
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ),
            (
                "sha512",
                "abc",
                "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
            ),
        ] {
            let (parsed, _) = validated_checksum(&ExpectedChecksum {
                algorithm: algorithm.to_string(),
                value: expected.to_string(),
            })
            .unwrap();
            let mut hasher = ChecksumHasher::new(parsed);
            hasher.update(input.as_bytes());
            assert_eq!(hasher.finalize(), expected);
        }
    }

    #[test]
    fn rejects_invalid_checksum_and_unapproved_urls() {
        assert!(!ExpectedChecksum::sha1("0".repeat(64)).is_valid());
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

    #[tokio::test]
    async fn downloads_to_the_final_path() {
        for folder in ["plugins", "mods"] {
            let test_dir = TestDirectory::new();
            let destination = test_dir.file_in(folder, "example.jar");
            let server = TestHttpServer::new(b"plugin bytes", true, 1);

            download_from_test_server(&server, test_dir.path(), destination.clone(), None, 1024)
                .await
                .expect("artifact should download");

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

        let error = download_from_test_server(
            &server,
            test_dir.path(),
            destination.clone(),
            Some(ExpectedChecksum::sha256("0".repeat(64))),
            1024,
        )
        .await
        .expect_err("checksum mismatch should reject the download");

        assert_eq!(error.kind, DownloadErrorKind::ChecksumMismatch);
        assert!(error.message.contains("checksum mismatch"));
        assert_eq!(std::fs::read(&destination).unwrap(), b"existing plugin");
        assert_no_temporary_files(destination.parent().unwrap(), &destination);
    }

    #[tokio::test]
    async fn rejects_content_length_and_stream_size_limits_without_final_file() {
        let test_dir = TestDirectory::new();
        for (name, include_length) in [("content-length.jar", true), ("stream-limit.jar", false)] {
            let destination = test_dir.file_in("plugins", name);
            let server = TestHttpServer::new(b"012345", include_length, MAX_ATTEMPTS);
            let error =
                download_from_test_server(&server, test_dir.path(), destination.clone(), None, 5)
                    .await
                    .expect_err("a body over the limit should be rejected");
            assert_eq!(error.kind, DownloadErrorKind::TooLarge);
            assert!(error.message.contains("Download exceeds the 5-byte limit"));
            assert!(!destination.exists());
            assert_no_temporary_files(destination.parent().unwrap(), &destination);
        }
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

        assert!(error.message.contains("symbolic link"));
        assert!(std::fs::symlink_metadata(&destination)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_no_temporary_files(destination.parent().unwrap(), &destination);
    }

    #[tokio::test]
    async fn cancelling_stops_the_download_and_removes_the_temporary_file() {
        let test_dir = TestDirectory::new();
        let destination = test_dir.plugins_example();
        // Large enough to arrive in several chunks.
        let body = vec![7_u8; 512 * 1024];
        let server = TestHttpServer::new(&body, true, 1);
        let cancel = CancelFlag::new();
        let flag = cancel.clone();

        let error = download_to_destination(
            &server.url,
            destination.clone(),
            test_dir.path(),
            None,
            u64::MAX,
            DownloadOptions {
                cancel: Some(&cancel),
                ..DownloadOptions::default()
            },
            move |_, _| flag.cancel(),
        )
        .await
        .expect_err("a cancelled download should fail");

        assert_eq!(error.kind, DownloadErrorKind::Cancelled);
        assert!(!destination.exists());
        assert_no_temporary_files(destination.parent().unwrap(), &destination);
    }

    #[tokio::test]
    async fn a_cancel_before_the_request_is_reported_without_retrying() {
        let test_dir = TestDirectory::new();
        let destination = test_dir.plugins_example();
        // No server: a cancelled download must not even connect.
        let url = Url::parse("http://127.0.0.1:9/plugin.jar").unwrap();
        let cancel = CancelFlag::new();
        cancel.cancel();

        let error = download_to_destination(
            &url,
            destination,
            test_dir.path(),
            None,
            1024,
            DownloadOptions {
                cancel: Some(&cancel),
                ..DownloadOptions::default()
            },
            |_, _| {},
        )
        .await
        .expect_err("a cancelled download should fail");
        assert_eq!(error.kind, DownloadErrorKind::Cancelled);
    }

    #[test]
    fn rejects_malformed_checksum_values_before_download() {
        for (algorithm, value) in [
            ("sha1", "0".repeat(39)),
            ("sha256", "0".repeat(63)),
            ("sha512", "0".repeat(127)),
            ("sha256", format!("{}g", "0".repeat(63))),
        ] {
            assert!(!ExpectedChecksum {
                algorithm: algorithm.to_string(),
                value,
            }
            .is_valid());
        }
        assert!(ChecksumAlgorithm::parse("md5").is_err());
    }

    #[test]
    fn executable_artifacts_require_sha256() {
        assert!(required_sha256(None).is_err());
        assert!(required_sha256(Some(ExpectedChecksum::sha1("0".repeat(40)))).is_err());
        let checksum = test_checksum("sha256", b"artifact");
        let expected = checksum.value.clone();
        assert_eq!(required_sha256(Some(checksum)).unwrap(), expected);
    }

    #[test]
    fn redirect_validation_keeps_allowlists_strict() {
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
        assert!(
            validate_https_url("https://127.0.0.1/plugin.jar", Some(&["cdn.modrinth.com"]))
                .is_err()
        );
    }

    #[test]
    fn percent_handles_unknown_and_overshooting_totals() {
        assert_eq!(percent(5, 0), None);
        assert_eq!(percent(50, 200), Some(25));
        assert_eq!(percent(300, 200), Some(100));
    }
}
