//! Minecraft player-list operations shared by the Tauri and Native editions.
//!
//! Player lists live below a registered, managed server directory. The core
//! owns validation, file safety, Mojang profile lookup, and per-server
//! serialization; UI adapters only translate their transport types.

use std::future::Future;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::{fs::File, io::Read};

use reqwest::redirect::Policy;
use reqwest::Url;
use serde::{Deserialize, Serialize};

use crate::managed_files::atomic_write;
use crate::managed_path::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use crate::operations::{OperationKind, ServerOperationManager};
use crate::registry::ServerRegistry;

const MOJANG_PROFILE_URL: &str = "https://api.mojang.com/users/profiles/minecraft/";
const MOJANG_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_MOJANG_RESPONSE_BYTES: usize = 16 * 1024;
const MAX_PLAYER_LIST_BYTES: u64 = 4 * 1024 * 1024;

/// Machine-readable cause for a player-list failure.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlayerListErrorKind {
    InvalidServerId,
    ServerNotRegistered,
    UnmanagedServer,
    InvalidPlayerName,
    InvalidIpAddress,
    InvalidListFile,
    ListTooLarge,
    MalformedList,
    Io,
    Operation,
}

/// A player-list failure with a stable classification and readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlayerListError {
    pub kind: PlayerListErrorKind,
    pub message: String,
}

impl PlayerListError {
    fn new(kind: PlayerListErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    fn io(message: impl Into<String>) -> Self {
        Self::new(PlayerListErrorKind::Io, message)
    }
}

impl std::fmt::Display for PlayerListError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for PlayerListError {}

/// The vanilla JSON file to manage.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PlayerListType {
    Whitelist,
    Ops,
    BannedPlayers,
    BannedIps,
}

impl PlayerListType {
    fn file_name(self) -> &'static str {
        match self {
            Self::Whitelist => "whitelist.json",
            Self::Ops => "ops.json",
            Self::BannedPlayers => "banned-players.json",
            Self::BannedIps => "banned-ips.json",
        }
    }

    fn is_ip_list(self) -> bool {
        matches!(self, Self::BannedIps)
    }
}

/// Requested mutation for one vanilla player-list file.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PlayerListAction {
    Add,
    Remove,
}

/// One player or banned-IP record in a vanilla JSON list.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bypasses_player_limit: Option<bool>,
}

/// All four vanilla player lists for one server.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerListSnapshot {
    pub whitelist: Vec<PlayerEntry>,
    pub ops: Vec<PlayerEntry>,
    pub banned_players: Vec<PlayerEntry>,
    pub banned_ips: Vec<PlayerEntry>,
}

/// Input payload for adding or removing one player name or IP address.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerListMutation {
    pub list_type: PlayerListType,
    pub action: PlayerListAction,
    pub value: String,
}

/// Updated lists and whether the requested operation changed the file.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerListMutationResult {
    pub lists: PlayerListSnapshot,
    pub changed: bool,
    pub canonical_target: String,
}

/// Valid Mojang player profile used when a player entry is created.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerProfile {
    pub name: String,
    pub uuid: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PlayerIdentity {
    name: String,
    uuid: Option<String>,
}

#[derive(Deserialize)]
struct MojangProfile {
    id: String,
    name: String,
}

#[derive(Clone, Debug)]
enum NewEntry {
    Player(PlayerIdentity),
    Ip(String),
}

fn validate_server_id(server_id: &str) -> Result<String, PlayerListError> {
    let server_id = server_id.trim();
    if server_id.is_empty()
        || server_id.len() > 128
        || server_id.chars().any(char::is_control)
        || matches!(server_id, "." | "..")
        || server_id
            .chars()
            .any(|character| matches!(character, '/' | '\\' | ':'))
    {
        return Err(PlayerListError::new(
            PlayerListErrorKind::InvalidServerId,
            "Server ID is invalid",
        ));
    }
    Ok(server_id.to_owned())
}

fn validate_player_name(name: &str) -> Result<String, PlayerListError> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 16
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(PlayerListError::new(
            PlayerListErrorKind::InvalidPlayerName,
            "Player name must contain 1 to 16 letters, digits, or underscores",
        ));
    }
    Ok(name.to_owned())
}

fn validate_ip_address(value: &str) -> Result<String, PlayerListError> {
    IpAddr::from_str(value.trim())
        .map(|ip| ip.to_string())
        .map_err(|_| {
            PlayerListError::new(
                PlayerListErrorKind::InvalidIpAddress,
                "Enter a valid IPv4 or IPv6 address",
            )
        })
}

fn parse_mojang_profile(body: &[u8], requested_name: &str) -> Option<PlayerProfile> {
    let profile: MojangProfile = serde_json::from_slice(body).ok()?;
    if profile.id.len() != 32 || !profile.id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let name = validate_player_name(&profile.name).ok()?;
    if !requested_name.eq_ignore_ascii_case(&name) {
        return None;
    }
    Some(PlayerProfile {
        name,
        uuid: profile.id,
    })
}

async fn lookup_mojang_profile(name: String) -> Result<Option<PlayerProfile>, PlayerListError> {
    let mut url = Url::parse(MOJANG_PROFILE_URL).map_err(|error| {
        PlayerListError::io(format!("Failed to create Mojang profile URL: {error}"))
    })?;
    url.path_segments_mut()
        .map_err(|_| PlayerListError::io("Mojang profile URL cannot accept a path segment"))?
        .push(&name);

    let client = reqwest::Client::builder()
        .timeout(MOJANG_TIMEOUT)
        .redirect(Policy::none())
        .user_agent("MC-Vector")
        .build()
        .map_err(|error| {
            PlayerListError::io(format!("Failed to create Mojang API client: {error}"))
        })?;

    let profile = match client.get(url).send().await {
        Ok(response) if response.status().is_success() => {
            if response
                .content_length()
                .is_some_and(|length| length > MAX_MOJANG_RESPONSE_BYTES as u64)
            {
                None
            } else {
                let mut response = response;
                let mut body = Vec::new();
                loop {
                    match response.chunk().await {
                        Ok(Some(chunk))
                            if body.len() + chunk.len() <= MAX_MOJANG_RESPONSE_BYTES =>
                        {
                            body.extend_from_slice(&chunk);
                        }
                        Ok(Some(_)) | Err(_) => break None,
                        Ok(None) => break parse_mojang_profile(&body, &name),
                    }
                }
            }
        }
        // Unknown names, rate limits, service errors, and transient network
        // failures retain the historical behavior: Minecraft decides.
        _ => None,
    };

    Ok(profile)
}

async fn resolve_player_identity_with<F, Fut>(
    name: &str,
    lookup: F,
) -> Result<PlayerIdentity, PlayerListError>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<Option<PlayerProfile>, PlayerListError>>,
{
    let requested_name = validate_player_name(name)?;
    let profile = lookup(requested_name.clone()).await?;
    let identity = profile.and_then(|profile| {
        let name = validate_player_name(&profile.name).ok()?;
        if profile.uuid.len() != 32
            || !profile.uuid.bytes().all(|byte| byte.is_ascii_hexdigit())
            || !requested_name.eq_ignore_ascii_case(&name)
        {
            return None;
        }
        Some(PlayerIdentity {
            name,
            uuid: Some(profile.uuid),
        })
    });
    Ok(identity.unwrap_or(PlayerIdentity {
        name: requested_name,
        uuid: None,
    }))
}

fn format_minecraft_timestamp(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let day_seconds = seconds.rem_euclid(86_400);

    // Gregorian civil date conversion for days since 1970-01-01.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    let hour = day_seconds / 3_600;
    let minute = (day_seconds % 3_600) / 60;
    let second = day_seconds % 60;

    format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02} +0000")
}

fn current_minecraft_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    format_minecraft_timestamp(seconds)
}

fn resolve_player_file(
    app_data_dir: &Path,
    server_id: &str,
    list_type: PlayerListType,
) -> Result<PathBuf, PlayerListError> {
    resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_owned()),
            relative_path: list_type.file_name().to_owned(),
        },
        false,
    )
    .map_err(|error| PlayerListError::new(PlayerListErrorKind::UnmanagedServer, error))
}

fn read_player_file(path: &Path) -> Result<Vec<PlayerEntry>, PlayerListError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(PlayerListError::io(format!(
                "Failed to inspect player list: {error}"
            )))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(PlayerListError::new(
            PlayerListErrorKind::InvalidListFile,
            "Player list must be a regular file",
        ));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x0400 != 0 {
            return Err(PlayerListError::new(
                PlayerListErrorKind::InvalidListFile,
                "Player list must not be a reparse point",
            ));
        }
    }

    if metadata.len() > MAX_PLAYER_LIST_BYTES {
        return Err(PlayerListError::new(
            PlayerListErrorKind::ListTooLarge,
            "Player list exceeds the 4 MiB size limit",
        ));
    }
    let mut content = Vec::new();
    File::open(path)
        .and_then(|file| {
            file.take(MAX_PLAYER_LIST_BYTES + 1)
                .read_to_end(&mut content)
        })
        .map_err(|error| PlayerListError::io(format!("Failed to read player list: {error}")))?;
    if content.len() as u64 > MAX_PLAYER_LIST_BYTES {
        return Err(PlayerListError::new(
            PlayerListErrorKind::ListTooLarge,
            "Player list exceeds the 4 MiB size limit",
        ));
    }
    serde_json::from_slice(&content).map_err(|error| {
        PlayerListError::new(
            PlayerListErrorKind::MalformedList,
            format!("Player list JSON is malformed: {error}"),
        )
    })
}

fn read_snapshot(
    app_data_dir: &Path,
    server_id: &str,
) -> Result<PlayerListSnapshot, PlayerListError> {
    Ok(PlayerListSnapshot {
        whitelist: read_player_file(&resolve_player_file(
            app_data_dir,
            server_id,
            PlayerListType::Whitelist,
        )?)?,
        ops: read_player_file(&resolve_player_file(
            app_data_dir,
            server_id,
            PlayerListType::Ops,
        )?)?,
        banned_players: read_player_file(&resolve_player_file(
            app_data_dir,
            server_id,
            PlayerListType::BannedPlayers,
        )?)?,
        banned_ips: read_player_file(&resolve_player_file(
            app_data_dir,
            server_id,
            PlayerListType::BannedIps,
        )?)?,
    })
}

fn require_registered_managed_server(
    registry: &ServerRegistry,
    app_data_dir: &Path,
    server_id: &str,
) -> Result<PathBuf, PlayerListError> {
    let servers = registry
        .get_servers()
        .map_err(|error| PlayerListError::io(format!("Failed to read server registry: {error}")))?;
    let server = servers
        .iter()
        .find(|server| server.id == server_id)
        .ok_or_else(|| {
            PlayerListError::new(
                PlayerListErrorKind::ServerNotRegistered,
                "Server does not exist in the server registry",
            )
        })?;
    let directory = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_owned()),
            relative_path: String::new(),
        },
        false,
    )
    .map_err(|error| PlayerListError::new(PlayerListErrorKind::UnmanagedServer, error))?;
    let profile_path = std::fs::canonicalize(&server.path).map_err(|_| {
        PlayerListError::new(
            PlayerListErrorKind::UnmanagedServer,
            "Failed to resolve registered server path",
        )
    })?;
    let managed_path = std::fs::canonicalize(&directory).map_err(|_| {
        PlayerListError::new(
            PlayerListErrorKind::UnmanagedServer,
            "Failed to resolve managed server path",
        )
    })?;
    if profile_path != managed_path {
        return Err(PlayerListError::new(
            PlayerListErrorKind::UnmanagedServer,
            "Player lists are available only for managed server directories",
        ));
    }
    Ok(directory)
}

fn make_player_entry(list_type: PlayerListType, new_entry: NewEntry) -> PlayerEntry {
    match (list_type, new_entry) {
        (PlayerListType::Ops, NewEntry::Player(identity)) => PlayerEntry {
            uuid: identity.uuid,
            name: identity.name,
            level: Some(4),
            bypasses_player_limit: Some(false),
            created: None,
            source: None,
            expires: None,
            reason: None,
            ip: None,
        },
        (PlayerListType::BannedPlayers, NewEntry::Player(identity)) => PlayerEntry {
            uuid: identity.uuid,
            name: identity.name,
            created: Some(current_minecraft_timestamp()),
            source: Some("Console".into()),
            reason: Some("Banned by Admin".into()),
            level: None,
            expires: None,
            ip: None,
            bypasses_player_limit: None,
        },
        (PlayerListType::BannedIps, NewEntry::Ip(ip)) => PlayerEntry {
            uuid: None,
            name: "unknown".into(),
            created: Some(current_minecraft_timestamp()),
            source: Some("Console".into()),
            reason: Some("IP Banned".into()),
            level: None,
            expires: None,
            ip: Some(ip),
            bypasses_player_limit: None,
        },
        (_, NewEntry::Player(identity)) => PlayerEntry {
            uuid: identity.uuid,
            name: identity.name,
            level: None,
            created: None,
            source: None,
            expires: None,
            reason: None,
            ip: None,
            bypasses_player_limit: None,
        },
        (_, NewEntry::Ip(_)) => unreachable!("IP entries are only valid for banned IP lists"),
    }
}

fn entries_for_list(snapshot: PlayerListSnapshot, list_type: PlayerListType) -> Vec<PlayerEntry> {
    match list_type {
        PlayerListType::Whitelist => snapshot.whitelist,
        PlayerListType::Ops => snapshot.ops,
        PlayerListType::BannedPlayers => snapshot.banned_players,
        PlayerListType::BannedIps => snapshot.banned_ips,
    }
}

fn mutate_player_file(
    app_data_dir: &Path,
    server_id: &str,
    mutation: &PlayerListMutation,
    identity: Option<PlayerIdentity>,
    canonical_target: String,
) -> Result<PlayerListMutationResult, PlayerListError> {
    // Validate all four documents before writing one. Otherwise a corrupt
    // sibling list could make the mutation succeed but prevent its response.
    let snapshot = read_snapshot(app_data_dir, server_id)?;
    let path = resolve_player_file(app_data_dir, server_id, mutation.list_type)?;
    let mut entries = entries_for_list(snapshot, mutation.list_type);
    let changed = match mutation.action {
        PlayerListAction::Add => {
            let new_entry = match (mutation.list_type, identity) {
                (PlayerListType::BannedIps, _) => NewEntry::Ip(canonical_target.clone()),
                (_, Some(identity)) => NewEntry::Player(identity),
                _ => {
                    return Err(PlayerListError::io("Player identity is unavailable"));
                }
            };
            let exists = if mutation.list_type.is_ip_list() {
                entries
                    .iter()
                    .any(|entry| entry.ip.as_deref() == Some(&canonical_target))
            } else {
                entries
                    .iter()
                    .any(|entry| entry.name.eq_ignore_ascii_case(&canonical_target))
            };
            if exists {
                false
            } else {
                entries.push(make_player_entry(mutation.list_type, new_entry));
                true
            }
        }
        PlayerListAction::Remove => {
            let old_len = entries.len();
            if mutation.list_type.is_ip_list() {
                entries.retain(|entry| entry.ip.as_deref() != Some(&canonical_target));
            } else {
                entries.retain(|entry| !entry.name.eq_ignore_ascii_case(&canonical_target));
            }
            entries.len() != old_len
        }
    };

    if changed {
        let content = serde_json::to_vec_pretty(&entries).map_err(|error| {
            PlayerListError::io(format!("Failed to encode player list: {error}"))
        })?;
        if content.len() as u64 > MAX_PLAYER_LIST_BYTES {
            return Err(PlayerListError::new(
                PlayerListErrorKind::ListTooLarge,
                "Player list exceeds the 4 MiB size limit",
            ));
        }
        atomic_write(&path, &content).map_err(|error| PlayerListError::io(error.to_string()))?;
    }

    Ok(PlayerListMutationResult {
        lists: read_snapshot(app_data_dir, server_id)?,
        changed,
        canonical_target,
    })
}

/// Reads all four player lists after verifying that the server is registered
/// at its managed `servers/<serverID>` location.
pub async fn get_player_lists(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    operations: &ServerOperationManager,
    server_id: &str,
) -> Result<PlayerListSnapshot, PlayerListError> {
    let server_id = validate_server_id(server_id)?;
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| PlayerListError::new(PlayerListErrorKind::Operation, error))?;
    let app_data_dir = app_data_dir.to_path_buf();
    let registry = registry.clone();
    tokio::task::spawn_blocking(move || {
        require_registered_managed_server(&registry, &app_data_dir, &server_id)?;
        read_snapshot(&app_data_dir, &server_id)
    })
    .await
    .map_err(|error| PlayerListError::io(format!("Player-list task failed: {error}")))?
}

/// Adds or removes one player-list entry. Mojang lookup failure falls back to
/// the validated input name, matching Minecraft's own offline/name handling.
pub async fn mutate_player_list(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    operations: &ServerOperationManager,
    server_id: &str,
    mutation: &PlayerListMutation,
) -> Result<PlayerListMutationResult, PlayerListError> {
    mutate_player_list_with_lookup(
        app_data_dir,
        registry,
        operations,
        server_id,
        mutation,
        |name| async move { lookup_mojang_profile(name).await },
    )
    .await
}

/// Variant of [`mutate_player_list`] with an injectable profile lookup. The
/// Native FFI can supply an alternate lookup policy and tests can stay offline.
pub async fn mutate_player_list_with_lookup<F, Fut>(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    operations: &ServerOperationManager,
    server_id: &str,
    mutation: &PlayerListMutation,
    lookup: F,
) -> Result<PlayerListMutationResult, PlayerListError>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<Option<PlayerProfile>, PlayerListError>>,
{
    let server_id = validate_server_id(server_id)?;
    let value = if mutation.list_type.is_ip_list() {
        validate_ip_address(&mutation.value)?
    } else {
        validate_player_name(&mutation.value)?
    };
    let identity = if mutation.action == PlayerListAction::Add && !mutation.list_type.is_ip_list() {
        Some(resolve_player_identity_with(&value, lookup).await?)
    } else {
        None
    };
    let canonical_target = identity
        .as_ref()
        .map(|identity| identity.name.clone())
        .unwrap_or(value);

    let _operation_guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| PlayerListError::new(PlayerListErrorKind::Operation, error))?;
    let app_data_dir = app_data_dir.to_path_buf();
    let registry = registry.clone();
    let mutation = mutation.clone();
    tokio::task::spawn_blocking(move || {
        require_registered_managed_server(&registry, &app_data_dir, &server_id)?;
        mutate_player_file(
            &app_data_dir,
            &server_id,
            &mutation,
            identity,
            canonical_target,
        )
    })
    .await
    .map_err(|error| PlayerListError::io(format!("Player-list task failed: {error}")))?
}

#[cfg(test)]
mod tests {
    use super::{
        current_minecraft_timestamp, format_minecraft_timestamp, get_player_lists,
        mutate_player_list_with_lookup, parse_mojang_profile, validate_ip_address,
        validate_player_name, PlayerEntry, PlayerListAction, PlayerListErrorKind,
        PlayerListMutation, PlayerListType, PlayerProfile,
    };
    use crate::operations::ServerOperationManager;
    use crate::registry::{JsonNumber, MinecraftServer, ServerRegistry};
    use serde_json::Value;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let directory = tempfile::tempdir().expect("create temporary player-list directory");
            let path = directory.keep();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn server_profile(id: &str, path: &Path) -> MinecraftServer {
        MinecraftServer {
            id: id.to_owned(),
            name: "Test Server".to_owned(),
            profile_name: None,
            group_name: None,
            version: "1.21".to_owned(),
            software: "Paper".to_owned(),
            port: JsonNumber::from(25565),
            memory: JsonNumber::from(2),
            path: path.to_string_lossy().into_owned(),
            status: "offline".to_owned(),
            java_path: None,
            auto_restart_on_crash: None,
            max_auto_restarts: None,
            auto_restart_delay_sec: None,
            auto_backup_enabled: None,
            auto_backup_interval_min: None,
            auto_backup_schedule_type: None,
            auto_backup_time: None,
            auto_backup_weekday: None,
            auto_backup_retain_count: None,
            auto_backup_retain_days: None,
            backup_restart_after_safe_backup: None,
            created_date: None,
            jvm_args: None,
            notify_on_crash: None,
            notify_on_start: None,
            notify_on_high_cpu: None,
            notify_high_cpu_threshold: None,
            unavailable_reason: None,
            extra: HashMap::<String, Value>::new(),
        }
    }

    fn fixture() -> (TestDirectory, ServerRegistry, ServerOperationManager) {
        let directory = TestDirectory::new();
        let server_path = directory.path().join("servers/server-1");
        std::fs::create_dir_all(&server_path).expect("create managed server directory");
        let registry = ServerRegistry::open(directory.path()).expect("open server registry");
        registry
            .add_server(&server_profile("server-1", &server_path))
            .expect("register managed server");
        (directory, registry, ServerOperationManager::default())
    }

    fn mutation(
        list_type: PlayerListType,
        action: PlayerListAction,
        value: &str,
    ) -> PlayerListMutation {
        PlayerListMutation {
            list_type,
            action,
            value: value.to_owned(),
        }
    }

    async fn injected_lookup(
        app_data_dir: &Path,
        registry: &ServerRegistry,
        operations: &ServerOperationManager,
        mutation: &PlayerListMutation,
        profile: Option<PlayerProfile>,
    ) -> super::PlayerListMutationResult {
        let lookup_profile = profile.clone();
        mutate_player_list_with_lookup(
            app_data_dir,
            registry,
            operations,
            "server-1",
            mutation,
            move |_name| async move { Ok(lookup_profile) },
        )
        .await
        .expect("mutate player list")
    }

    #[test]
    fn player_names_are_safe_for_minecraft_commands_and_paths() {
        assert_eq!(validate_player_name(" Alex_123 ").unwrap(), "Alex_123");
        let long_name = "x".repeat(17);
        for invalid in [
            "",
            "a player",
            "name\nstop",
            "../world",
            "player.name",
            long_name.as_str(),
        ] {
            assert_eq!(
                validate_player_name(invalid).unwrap_err().kind,
                PlayerListErrorKind::InvalidPlayerName
            );
        }
    }

    #[test]
    fn ip_addresses_are_parsed_and_canonicalized_before_use() {
        assert_eq!(validate_ip_address(" 192.0.2.10 ").unwrap(), "192.0.2.10");
        assert_eq!(validate_ip_address("2001:0db8::1").unwrap(), "2001:db8::1");
        assert!(validate_ip_address("127.0.0.1\nstop").is_err());
        assert!(validate_ip_address("plugin.example").is_err());
    }

    #[test]
    fn mojang_profile_parsing_requires_matching_valid_name_and_uuid() {
        let profile = parse_mojang_profile(
            br#"{"id":"0123456789abcdef0123456789abcdef","name":"Alex"}"#,
            "alex",
        )
        .unwrap();
        assert_eq!(profile.name, "Alex");
        assert_eq!(profile.uuid, "0123456789abcdef0123456789abcdef");
        assert!(parse_mojang_profile(br#"{"id":"abc","name":"Alex"}"#, "Alex").is_none());
        assert!(parse_mojang_profile(
            br#"{"id":"0123456789abcdef0123456789abcdef","name":"Other"}"#,
            "Alex"
        )
        .is_none());
    }

    #[tokio::test]
    async fn public_get_and_mutate_cover_all_lists_without_network() {
        let (directory, registry, operations) = fixture();
        let snapshot = get_player_lists(directory.path(), &registry, &operations, "server-1")
            .await
            .expect("read initial lists");
        assert!(snapshot.whitelist.is_empty());
        assert!(snapshot.ops.is_empty());
        assert!(snapshot.banned_players.is_empty());
        assert!(snapshot.banned_ips.is_empty());

        let known_profile = PlayerProfile {
            name: "Alex".to_owned(),
            uuid: "0123456789abcdef0123456789abcdef".to_owned(),
        };
        for list_type in [
            PlayerListType::Whitelist,
            PlayerListType::Ops,
            PlayerListType::BannedPlayers,
        ] {
            let add = mutation(list_type, PlayerListAction::Add, "alex");
            let result = injected_lookup(
                directory.path(),
                &registry,
                &operations,
                &add,
                Some(known_profile.clone()),
            )
            .await;
            assert!(result.changed);
            assert_eq!(result.canonical_target, "Alex");
            assert_eq!(
                result.lists.whitelist.len(),
                usize::from(list_type == PlayerListType::Whitelist)
            );
            assert_eq!(
                result.lists.ops.len(),
                usize::from(list_type == PlayerListType::Ops)
            );
            assert_eq!(
                result.lists.banned_players.len(),
                usize::from(list_type == PlayerListType::BannedPlayers)
            );

            let duplicate = injected_lookup(
                directory.path(),
                &registry,
                &operations,
                &add,
                Some(known_profile.clone()),
            )
            .await;
            assert!(!duplicate.changed);
            let remove = mutation(list_type, PlayerListAction::Remove, "ALEX");
            let result =
                injected_lookup(directory.path(), &registry, &operations, &remove, None).await;
            assert!(result.changed);
        }

        let ip_add = mutation(
            PlayerListType::BannedIps,
            PlayerListAction::Add,
            "2001:0db8::1",
        );
        let result = injected_lookup(directory.path(), &registry, &operations, &ip_add, None).await;
        assert!(result.changed);
        assert_eq!(result.canonical_target, "2001:db8::1");
        assert_eq!(
            result.lists.banned_ips[0].ip.as_deref(),
            Some("2001:db8::1")
        );
        let ip_remove = mutation(
            PlayerListType::BannedIps,
            PlayerListAction::Remove,
            "2001:0db8::1",
        );
        assert!(
            injected_lookup(directory.path(), &registry, &operations, &ip_remove, None,)
                .await
                .changed
        );
    }

    #[tokio::test]
    async fn profile_lookup_fallback_uses_input_and_invalid_profile_is_ignored() {
        let (directory, registry, operations) = fixture();
        let add = mutation(PlayerListType::Whitelist, PlayerListAction::Add, "alex");
        let fallback = injected_lookup(directory.path(), &registry, &operations, &add, None).await;
        assert_eq!(fallback.canonical_target, "alex");
        assert_eq!(fallback.lists.whitelist[0].uuid, None);

        let invalid_profile = PlayerProfile {
            name: "Other".to_owned(),
            uuid: "0123456789abcdef0123456789abcdef".to_owned(),
        };
        let duplicate = injected_lookup(
            directory.path(),
            &registry,
            &operations,
            &add,
            Some(invalid_profile),
        )
        .await;
        assert!(!duplicate.changed);
        assert_eq!(duplicate.canonical_target, "alex");
    }

    #[tokio::test]
    async fn public_mutation_rejects_bad_names_and_ips_before_side_effects() {
        let (directory, registry, operations) = fixture();
        let invalid_name = mutation(PlayerListType::Ops, PlayerListAction::Add, "../stop");
        let error = mutate_player_list_with_lookup(
            directory.path(),
            &registry,
            &operations,
            "server-1",
            &invalid_name,
            |_name| async { Ok(None) },
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, PlayerListErrorKind::InvalidPlayerName);

        let invalid_ip = mutation(
            PlayerListType::BannedIps,
            PlayerListAction::Add,
            "127.0.0.1\nstop",
        );
        let error = mutate_player_list_with_lookup(
            directory.path(),
            &registry,
            &operations,
            "server-1",
            &invalid_ip,
            |_name| async { Ok(None) },
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, PlayerListErrorKind::InvalidIpAddress);
        let snapshot = get_player_lists(directory.path(), &registry, &operations, "server-1")
            .await
            .unwrap();
        assert!(snapshot.ops.is_empty());
        assert!(snapshot.banned_ips.is_empty());
    }

    #[tokio::test]
    async fn registry_mismatch_and_symlink_lists_are_rejected() {
        let (directory, registry, operations) = fixture();
        let outside = tempfile::tempdir().unwrap();
        let mismatch = server_profile("unmanaged", outside.path());
        registry.add_server(&mismatch).unwrap();
        let error = get_player_lists(directory.path(), &registry, &operations, "unmanaged")
            .await
            .unwrap_err();
        assert_eq!(error.kind, PlayerListErrorKind::UnmanagedServer);

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let outside_file = outside.path().join("outside.json");
            std::fs::write(&outside_file, "[]").unwrap();
            symlink(
                outside_file,
                directory.path().join("servers/server-1/whitelist.json"),
            )
            .unwrap();
            let error = get_player_lists(directory.path(), &registry, &operations, "server-1")
                .await
                .unwrap_err();
            assert_eq!(error.kind, PlayerListErrorKind::UnmanagedServer);
        }
    }

    #[tokio::test]
    async fn malformed_sibling_list_prevents_mutation_and_keeps_files_unchanged() {
        let (directory, registry, operations) = fixture();
        let target = directory.path().join("servers/server-1/whitelist.json");
        let malformed = directory.path().join("servers/server-1/banned-ips.json");
        std::fs::write(&target, "[]").unwrap();
        std::fs::write(&malformed, "{broken").unwrap();
        let add = mutation(PlayerListType::Whitelist, PlayerListAction::Add, "Alex");
        let error = mutate_player_list_with_lookup(
            directory.path(),
            &registry,
            &operations,
            "server-1",
            &add,
            |_name| async { Ok(None) },
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, PlayerListErrorKind::MalformedList);
        assert_eq!(std::fs::read_to_string(target).unwrap(), "[]");
        assert_eq!(std::fs::read_to_string(malformed).unwrap(), "{broken");
    }

    #[test]
    fn oversized_player_list_is_rejected_without_rewriting_it() {
        let (directory, _, _) = fixture();
        let path = directory.path().join("servers/server-1/whitelist.json");
        let oversized = vec![b' '; (super::MAX_PLAYER_LIST_BYTES + 1) as usize];
        std::fs::write(&path, &oversized).unwrap();
        let error = super::read_player_file(&path).unwrap_err();
        assert_eq!(error.kind, PlayerListErrorKind::ListTooLarge);
        assert_eq!(
            std::fs::metadata(path).unwrap().len(),
            super::MAX_PLAYER_LIST_BYTES + 1
        );
    }

    #[tokio::test]
    async fn pretty_serialization_cannot_grow_a_list_past_the_read_limit() {
        let (directory, registry, operations) = fixture();
        let path = directory.path().join("servers/server-1/whitelist.json");
        let compact_entries = format!("[{}]", vec![r#"{"name":"Alex"}"#; 150_000].join(","));
        assert!((compact_entries.len() as u64) < super::MAX_PLAYER_LIST_BYTES);
        std::fs::write(&path, &compact_entries).unwrap();

        let add = mutation(PlayerListType::Whitelist, PlayerListAction::Add, "Steve");
        let error = mutate_player_list_with_lookup(
            directory.path(),
            &registry,
            &operations,
            "server-1",
            &add,
            |_name| async { Ok(None) },
        )
        .await
        .unwrap_err();
        assert_eq!(error.kind, PlayerListErrorKind::ListTooLarge);
        assert_eq!(std::fs::read(path).unwrap(), compact_entries.as_bytes());
    }

    #[test]
    fn minecraft_ban_timestamp_matches_the_server_utc_format() {
        let now = current_minecraft_timestamp();
        assert!(now.ends_with(" +0000"));
        assert_eq!(now.len(), 25);
        assert_eq!(format_minecraft_timestamp(0), "1970-01-01 00:00:00 +0000");
    }

    #[test]
    fn entry_ignores_unknown_fields_and_serializes_vanilla_camel_case() {
        let entry: PlayerEntry = serde_json::from_str(
            r#"{"name":"Alex","level":4,"bypassesPlayerLimit":false,"futureField":true}"#,
        )
        .unwrap();
        assert_eq!(entry.name, "Alex");
        assert_eq!(entry.level, Some(4));
        assert_eq!(entry.bypasses_player_limit, Some(false));
        let value = serde_json::to_value(entry).unwrap();
        assert_eq!(value["bypassesPlayerLimit"], false);
        assert!(value.get("futureField").is_none());
    }

    #[test]
    fn typed_enum_wire_values_remain_compatible() {
        assert_eq!(
            serde_json::to_string(&PlayerListType::BannedPlayers).unwrap(),
            "\"banned-players\""
        );
        assert_eq!(
            serde_json::to_string(&PlayerListAction::Remove).unwrap(),
            "\"remove\""
        );
    }
}
