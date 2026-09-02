use futures_util::StreamExt;
use reqwest::{redirect, Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;
use tokio::io::AsyncWriteExt;

use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};

const USER_AGENT: &str = "MC-Vector/2.0.57 (https://github.com/tukuyomil032/MC-Vector)";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_ATTEMPTS: usize = 2;
const MAX_EVENT_ID_LENGTH: usize = 128;
const MAX_SERVER_ID_LENGTH: usize = 128;
const MAX_PLUGIN_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;
const MAX_SERVER_JAR_BYTES: u64 = 512 * 1024 * 1024;
const SERVER_JAR_HOSTS: &[&str] = &[
    "api.leafmc.one",
    "api.papermc.io",
    "fill-data.papermc.io",
    "fill.papermc.io",
    "meta.fabricmc.net",
    "piston-data.mojang.com",
];

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

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginArtifactRequest {
    pub url: String,
    pub server_id: String,
    pub relative_path: String,
    pub provider: String,
    pub checksum: Option<ExpectedChecksum>,
    pub event_id: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ExpectedChecksum {
    pub algorithm: String,
    pub value: String,
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

fn validate_https_url(url: &str, allowed_hosts: Option<&[&str]>) -> Result<Url, String> {
    if url.chars().any(char::is_control) {
        return Err("Download URL contains control characters".to_string());
    }
    let parsed = Url::parse(url.trim()).map_err(|_| "Invalid download URL".to_string())?;
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
            if validate_https_url(attempt.url().as_str(), allowed.as_deref()).is_ok() {
                attempt.follow()
            } else {
                attempt.error("Download redirect rejected by provider source policy")
            }
        }))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))
}

fn temporary_path(destination: &Path, attempt: usize) -> PathBuf {
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("download");
    destination.with_file_name(format!(".{name}.part-{}-{attempt}", std::process::id()))
}

fn managed_servers_root(app_data_dir: &Path) -> Result<PathBuf, String> {
    // This root is fixed by the command contract. It is never derived from
    // renderer-provided path data.
    let root = app_data_dir.join("servers");
    let metadata = std::fs::symlink_metadata(&root)
        .map_err(|error| format!("Failed to inspect managed server root: {error}"))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Managed server root must be a real directory".to_string());
    }
    std::fs::canonicalize(&root)
        .map_err(|error| format!("Failed to resolve managed server root: {error}"))
}

async fn replace_destination(
    temp: &Path,
    destination: &Path,
    managed_root: &Path,
) -> Result<(), String> {
    if !temp.starts_with(managed_root) || !destination.starts_with(managed_root) {
        return Err("Download paths must remain inside managed storage".to_string());
    }
    if let Ok(metadata) = tokio::fs::symlink_metadata(destination).await {
        if is_link_or_reparse_point(&metadata) {
            return Err(
                "Download destination must not be a symbolic link or reparse point".to_string(),
            );
        }
    }
    match tokio::fs::rename(temp, destination).await {
        Ok(()) => Ok(()),
        Err(initial) if destination.exists() => {
            tokio::fs::remove_file(destination)
                .await
                .map_err(|error| format!("Failed to replace existing destination: {error}"))?;
            tokio::fs::rename(temp, destination).await.map_err(|error| {
                format!(
                    "Failed to atomically move downloaded file: {error}; initial error: {initial}"
                )
            })
        }
        Err(error) => Err(format!(
            "Failed to atomically move downloaded file: {error}"
        )),
    }
}

async fn download_once<F>(
    client: &Client,
    url: &Url,
    destination: &Path,
    managed_root: &Path,
    checksum: Option<&ExpectedChecksum>,
    max_bytes: u64,
    mut report: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    if !destination.starts_with(managed_root) {
        return Err("Temporary download path must remain inside managed storage".to_string());
    }
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| format!("HTTP request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);
    if total > max_bytes {
        return Err(format!("Download exceeds the {max_bytes}-byte limit"));
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
    let mut file = tokio::fs::File::create(destination)
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
    max_bytes: u64,
    allowed_hosts: Option<&[&str]>,
    mut report: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) -> Result<(), String>,
{
    if !destination.starts_with(managed_root) {
        return Err("Download destination must remain inside managed storage".to_string());
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
        if temp.starts_with(managed_root) {
            let _ = tokio::fs::remove_file(&temp).await;
        }
        if attempt < MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(250 * attempt as u64)).await;
        }
    }
    Err(last_error)
}

fn validate_event_id(event_id: &str) -> Result<String, String> {
    let value = event_id.trim();
    if value.is_empty()
        || value.len() > MAX_EVENT_ID_LENGTH
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        Err("Invalid download event ID".to_string())
    } else {
        Ok(value.to_string())
    }
}
fn validate_server_id(server_id: &str) -> Result<String, String> {
    let value = server_id.trim();
    if value.is_empty()
        || value.len() > MAX_SERVER_ID_LENGTH
        || value.chars().any(char::is_control)
        || matches!(value, "." | "..")
        || value.contains(['/', '\\', ':'])
    {
        Err("Invalid server ID".to_string())
    } else {
        Ok(value.to_string())
    }
}
fn validate_plugin_relative_path(relative_path: &str) -> Result<(String, String), String> {
    let path = Path::new(relative_path.trim());
    let components = path.components().collect::<Vec<_>>();
    if path.is_absolute()
        || components.len() != 2
        || !components
            .iter()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err("Plugin path must be plugins/<file>.jar or mods/<file>.jar".to_string());
    }
    let directory = components[0]
        .as_os_str()
        .to_str()
        .ok_or_else(|| "Plugin path is not valid UTF-8".to_string())?;
    let file = components[1]
        .as_os_str()
        .to_str()
        .ok_or_else(|| "Plugin filename is not valid UTF-8".to_string())?;
    if !matches!(directory, "plugins" | "mods")
        || file.len() > 128
        || file.contains('\0')
        || !file.to_ascii_lowercase().ends_with(".jar")
    {
        return Err("Plugin path must target a .jar file under plugins or mods".to_string());
    }
    Ok((directory.to_string(), file.to_string()))
}
async fn managed_plugin_destination(
    app: &AppHandle,
    server_id: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let server_id = validate_server_id(server_id)?;
    let _ = validate_plugin_relative_path(relative_path)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id),
        relative_path: relative_path.trim().to_string(),
    };
    let destination = resolve_managed_request(&app_data, &request, true)?;
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Failed to create managed plugin directory: {error}"))?;
    }
    if tokio::fs::symlink_metadata(&destination)
        .await
        .ok()
        .is_some_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err("Plugin destination must not be a symlink".to_string());
    }
    Ok(destination)
}
fn provider_hosts(provider: &str) -> Result<&'static [&'static str], String> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "modrinth" => Ok(&["cdn.modrinth.com"]),
        "hangar" => Ok(&["hangar.papermc.io", "hangarcdn.papermc.io", "dl.hangar.io"]),
        "spiget" => Ok(&["api.spiget.org"]),
        _ => Err("Unsupported plugin download provider".to_string()),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginDownloadCommandError {
    code: &'static str,
    message: String,
}

fn plugin_download_error(code: &'static str, message: impl Into<String>) -> String {
    let error = PluginDownloadCommandError {
        code,
        message: message.into(),
    };
    serde_json::to_string(&error).unwrap_or_else(|_| {
        format!("{{\"code\":\"{code}\",\"message\":\"plugin download failed\"}}")
    })
}

fn classify_plugin_download_error(error: &str) -> &'static str {
    if error.contains("checksum mismatch") {
        return "checksum-mismatch";
    }
    if (error.contains("Invalid ") && error.to_ascii_lowercase().contains("checksum"))
        || error.contains("Unsupported checksum algorithm")
    {
        return "checksum-invalid";
    }
    if error.contains("Download exceeds") || error.contains("Download size overflow") {
        return "size-limit-exceeded";
    }
    if error.contains("Download URL")
        || error.contains("Download redirect rejected")
        || error.contains("Unsupported plugin download provider")
    {
        return "source-rejected";
    }
    if error.contains("Plugin path")
        || error.contains("Plugin filename")
        || error.contains("Plugin destination")
        || error.contains("managed plugin")
        || error.contains("managed root")
        || error.contains("Temporary download path")
        || error.contains("atomically move downloaded file")
        || error.contains("replace existing destination")
    {
        return "destination-rejected";
    }
    if error.contains("HTTP")
        || error.contains("Download stalled")
        || error.contains("Download stream")
        || error.contains("download failed")
        || error.contains("HTTP client")
        || error.contains("connection")
    {
        return "network";
    }
    "unknown"
}

fn hashless_plugin_download_is_allowed(config_value: Option<&serde_json::Value>) -> bool {
    matches!(config_value, Some(serde_json::Value::Bool(true)))
}

fn allows_unverified_plugin_downloads(app: &AppHandle) -> bool {
    let value = app
        .store("config.json")
        .ok()
        .and_then(|store| store.get("allowUnverifiedPluginDownloads"));
    hashless_plugin_download_is_allowed(value.as_ref())
}

#[tauri::command]
pub async fn download_plugin_artifact(
    app: AppHandle,
    request: PluginArtifactRequest,
) -> Result<(), String> {
    let hosts = provider_hosts(&request.provider)
        .map_err(|error| plugin_download_error("source-rejected", error))?;
    let url = validate_https_url(&request.url, Some(hosts))
        .map_err(|error| plugin_download_error("source-rejected", error))?;
    let destination = managed_plugin_destination(&app, &request.server_id, &request.relative_path)
        .await
        .map_err(|error| plugin_download_error("destination-rejected", error))?;
    let event_id = validate_event_id(&request.event_id)
        .map_err(|error| plugin_download_error("unknown", error))?;
    let app_data = app.path().app_data_dir().map_err(|_| {
        plugin_download_error(
            "destination-rejected",
            "Failed to resolve app data directory",
        )
    })?;
    let managed_root = managed_servers_root(&app_data)
        .map_err(|error| plugin_download_error("destination-rejected", error))?;
    if request.checksum.is_none() && !allows_unverified_plugin_downloads(&app) {
        return Err(plugin_download_error(
            "unverified-artifact-blocked",
            "Plugin download rejected: checksum is required. Set allowUnverifiedPluginDownloads to true in config.json only when you explicitly accept an unverified artifact.",
        ));
    }
    let event = format!("download-progress-{event_id}");
    download_with_retry(
        url,
        destination,
        &managed_root,
        request.checksum,
        MAX_PLUGIN_DOWNLOAD_BYTES,
        Some(hosts),
        |downloaded, total| {
            app.emit(&event, DownloadProgress { downloaded, total })
                .map_err(|error| format!("Failed to emit download progress: {error}"))
        },
    )
    .await
    .map_err(|error| plugin_download_error(classify_plugin_download_error(&error), error))
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerJarDownloadRequest {
    pub server_id: String,
    pub relative_path: String,
    pub url: String,
    pub checksum: Option<ExpectedChecksum>,
}

#[tauri::command]
pub async fn download_server_jar(
    app: AppHandle,
    request: ServerJarDownloadRequest,
) -> Result<(), String> {
    let url = validate_https_url(&request.url, Some(SERVER_JAR_HOSTS))?;
    let server_id = validate_server_id(&request.server_id)?;
    let jar_path = Path::new(request.relative_path.trim());
    let components = jar_path.components().collect::<Vec<_>>();
    if jar_path.is_absolute()
        || components.len() != 1
        || !components
            .iter()
            .all(|component| matches!(component, Component::Normal(_)))
        || !jar_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.to_ascii_lowercase().ends_with(".jar"))
    {
        return Err("Server JAR destination must be a single .jar filename".to_string());
    }
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let managed_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.clone()),
        relative_path: request.relative_path.trim().to_string(),
    };
    let destination = resolve_managed_request(&app_data, &managed_request, true)?;
    let managed_root = managed_servers_root(&app_data)?;
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Failed to create directory: {error}"))?;
    }
    let progress_app = app.clone();
    let progress_server_id = server_id.clone();
    download_with_retry(
        url,
        destination,
        &managed_root,
        request.checksum,
        MAX_SERVER_JAR_BYTES,
        Some(SERVER_JAR_HOSTS),
        move |downloaded, total| {
            let progress = if total > 0 {
                ((downloaded as f64 / total as f64) * 100.0) as u32
            } else {
                0
            };
            progress_app
                .emit(
                    "download-progress",
                    serde_json::json!({
                        "serverId": progress_server_id,
                        "progress": progress,
                        "status": format!("Downloading... {progress}%")
                    }),
                )
                .map_err(|error| format!("Failed to emit download progress: {error}"))
        },
    )
    .await?;
    app.emit(
        "download-progress",
        serde_json::json!({
            "serverId": server_id,
            "progress": 100,
            "status": "Download complete"
        }),
    )
    .map_err(|error| format!("Failed to emit download progress: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc;
    use std::thread;

    static TEST_DIRECTORY_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_nanos();
            let sequence = TEST_DIRECTORY_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "mc-vector-download-{}-{nonce}-{sequence}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn prepare_destination(&self, destination: PathBuf) -> PathBuf {
            std::fs::create_dir_all(
                destination
                    .parent()
                    .expect("destination should have parent"),
            )
            .expect("destination parent should be created");
            destination
        }

        fn plugins_example(&self) -> PathBuf {
            self.prepare_destination(self.path().join("plugins").join("example.jar"))
        }

        fn mods_example(&self) -> PathBuf {
            self.prepare_destination(self.path().join("mods").join("example.jar"))
        }

        fn plugins_content_length(&self) -> PathBuf {
            self.prepare_destination(self.path().join("plugins").join("content-length.jar"))
        }

        fn plugins_stream_limit(&self) -> PathBuf {
            self.prepare_destination(self.path().join("plugins").join("stream-limit.jar"))
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
            let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
            let address = listener
                .local_addr()
                .expect("loopback listener should have an address");
            let body = body.to_vec();
            let (ready_sender, ready_receiver) = mpsc::channel();
            let thread = thread::spawn(move || {
                ready_sender
                    .send(())
                    .expect("test server should signal readiness");
                for _ in 0..requests {
                    let (mut stream, _) = listener.accept().expect("test request should connect");
                    let mut request = [0_u8; 4096];
                    let _ = stream.read(&mut request);
                    write_response(&mut stream, &body, include_content_length);
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

    fn write_response(stream: &mut TcpStream, body: &[u8], include_content_length: bool) {
        let content_length = if include_content_length {
            format!("Content-Length: {}\r\n", body.len())
        } else {
            String::new()
        };
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/java-archive\r\n{content_length}Connection: close\r\n\r\n"
        );
        stream
            .write_all(response.as_bytes())
            .expect("test response headers should be written");
        stream
            .write_all(body)
            .expect("test response body should be written");
        stream.flush().expect("test response should be flushed");
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
            max_bytes,
            None,
            |_, _| Ok(()),
        )
        .await
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
    fn plugin_paths_and_events_are_tightly_scoped() {
        assert_eq!(
            validate_plugin_relative_path("plugins/example.jar").unwrap(),
            ("plugins".to_string(), "example.jar".to_string())
        );
        assert_eq!(
            validate_plugin_relative_path("mods/Example.JAR").unwrap(),
            ("mods".to_string(), "Example.JAR".to_string())
        );
        assert!(validate_plugin_relative_path("../plugins/example.jar").is_err());
        assert!(validate_plugin_relative_path("/tmp/example.jar").is_err());
        assert!(validate_plugin_relative_path("plugins/nested/example.jar").is_err());
        assert!(validate_plugin_relative_path("plugins/example.txt").is_err());
        assert!(validate_plugin_relative_path("plugins/example.jar.tmp").is_err());
        assert!(validate_plugin_relative_path("plugins/example.jar.tmp-123").is_err());
        assert!(validate_plugin_relative_path("plugins/").is_err());
        assert!(validate_event_id("plugin-version_1.2").is_ok());
        assert!(validate_event_id("plugin/event").is_err());
    }

    #[test]
    fn deserializes_the_camel_case_plugin_download_contract() {
        let request: PluginArtifactRequest = serde_json::from_value(serde_json::json!({
            "serverId": "server-1",
            "relativePath": "plugins/example.jar",
            "provider": "modrinth",
            "url": "https://cdn.modrinth.com/example.jar",
            "checksum": { "algorithm": "sha256", "value": "0".repeat(64) },
            "eventId": "plugin-example"
        }))
        .expect("camelCase plugin request should deserialize");

        assert_eq!(request.server_id, "server-1");
        assert_eq!(request.relative_path, "plugins/example.jar");
        assert_eq!(request.event_id, "plugin-example");
        assert_eq!(request.checksum.unwrap().algorithm, "sha256");
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

    #[test]
    fn plugin_command_errors_keep_stable_codes_and_private_details_out_of_ui_classification() {
        let encoded = plugin_download_error(
            "checksum-mismatch",
            "SHA256 checksum mismatch: expected private, got actual",
        );
        let payload: serde_json::Value =
            serde_json::from_str(&encoded).expect("plugin error should be JSON encoded");
        assert_eq!(payload["code"], "checksum-mismatch");
        assert_eq!(
            payload["message"],
            "SHA256 checksum mismatch: expected private, got actual"
        );
    }

    #[test]
    fn plugin_download_failures_are_classified_by_security_boundary() {
        assert_eq!(
            classify_plugin_download_error("Invalid SHA256 checksum"),
            "checksum-invalid"
        );
        assert_eq!(
            classify_plugin_download_error("Download URL host is not approved"),
            "source-rejected"
        );
        assert_eq!(
            classify_plugin_download_error("Download redirect rejected by provider source policy"),
            "source-rejected"
        );
        assert_eq!(
            classify_plugin_download_error("Plugin destination must not be a symlink"),
            "destination-rejected"
        );
        assert_eq!(
            classify_plugin_download_error("Download exceeds the 512-byte limit"),
            "size-limit-exceeded"
        );
        assert_eq!(
            classify_plugin_download_error("HTTP request failed: connection reset"),
            "network"
        );
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
}
