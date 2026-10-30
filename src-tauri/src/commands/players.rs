use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::{fs::File, io::Read};

use reqwest::redirect::Policy;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use super::file_utils::{
    atomic_write_managed_text_file, resolve_managed_request, ManagedPathRequest, ManagedRoot,
};
use super::server_registry::ServerRegistry;
use crate::state::operation_manager::{OperationKind, ServerOperationManager};

const MOJANG_PROFILE_URL: &str = "https://api.mojang.com/users/profiles/minecraft/";
const MOJANG_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_MOJANG_RESPONSE_BYTES: usize = 16 * 1024;
const MAX_PLAYER_LIST_BYTES: u64 = 4 * 1024 * 1024;

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

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PlayerListAction {
    Add,
    Remove,
}

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

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerListSnapshot {
    pub whitelist: Vec<PlayerEntry>,
    pub ops: Vec<PlayerEntry>,
    pub banned_players: Vec<PlayerEntry>,
    pub banned_ips: Vec<PlayerEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerListMutation {
    pub list_type: PlayerListType,
    pub action: PlayerListAction,
    pub value: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerListMutationResult {
    pub lists: PlayerListSnapshot,
    pub changed: bool,
    pub canonical_target: String,
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

fn validate_server_id(server_id: &str) -> Result<String, String> {
    let server_id = server_id.trim();
    if server_id.is_empty()
        || server_id.len() > 128
        || server_id.chars().any(char::is_control)
        || matches!(server_id, "." | "..")
        || server_id
            .chars()
            .any(|character| matches!(character, '/' | '\\' | ':'))
    {
        return Err("Server ID is invalid".into());
    }
    Ok(server_id.to_owned())
}

fn validate_player_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 16
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err("Player name must contain 1 to 16 letters, digits, or underscores".into());
    }
    Ok(name.to_owned())
}

fn validate_ip_address(value: &str) -> Result<String, String> {
    IpAddr::from_str(value.trim())
        .map(|ip| ip.to_string())
        .map_err(|_| "Enter a valid IPv4 or IPv6 address".to_string())
}

fn parse_mojang_profile(body: &[u8], requested_name: &str) -> Option<PlayerIdentity> {
    let profile: MojangProfile = serde_json::from_slice(body).ok()?;
    if profile.id.len() != 32 || !profile.id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let name = validate_player_name(&profile.name).ok()?;
    if !requested_name.eq_ignore_ascii_case(&name) {
        return None;
    }
    Some(PlayerIdentity {
        name,
        uuid: Some(profile.id),
    })
}

async fn resolve_player_identity(name: &str) -> Result<PlayerIdentity, String> {
    let requested_name = validate_player_name(name)?;
    let mut url = Url::parse(MOJANG_PROFILE_URL).map_err(|error| error.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "Mojang profile URL cannot accept a path segment".to_string())?
        .push(&requested_name);

    let client = reqwest::Client::builder()
        .timeout(MOJANG_TIMEOUT)
        .redirect(Policy::none())
        .user_agent("MC-Vector")
        .build()
        .map_err(|error| format!("Failed to create Mojang API client: {error}"))?;

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
                        Ok(None) => break parse_mojang_profile(&body, &requested_name),
                    }
                }
            }
        }
        // Unknown names, rate limits, service errors, and transient network
        // failures retain the historical behavior: keep the entered name with
        // no UUID so the Minecraft server can decide how to handle it.
        _ => None,
    };

    Ok(profile.unwrap_or(PlayerIdentity {
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
) -> Result<PathBuf, String> {
    resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_owned()),
            relative_path: list_type.file_name().to_owned(),
        },
        false,
    )
}

fn read_player_file(path: &Path) -> Result<Vec<PlayerEntry>, String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Failed to inspect player list: {error}")),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Player list must be a regular file".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x0400 != 0 {
            return Err("Player list must not be a reparse point".into());
        }
    }

    if metadata.len() > MAX_PLAYER_LIST_BYTES {
        return Err("Player list exceeds the 4 MiB size limit".into());
    }
    let mut content = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .and_then(|file| {
            file.take(MAX_PLAYER_LIST_BYTES + 1)
                .read_to_end(&mut content)
        })
        .map_err(|error| format!("Failed to read player list: {error}"))?;
    if content.len() as u64 > MAX_PLAYER_LIST_BYTES {
        return Err("Player list exceeds the 4 MiB size limit".into());
    }
    serde_json::from_slice(&content)
        .map_err(|error| format!("Player list JSON is malformed: {error}"))
}

fn read_snapshot(app_data_dir: &Path, server_id: &str) -> Result<PlayerListSnapshot, String> {
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
) -> Result<PathBuf, String> {
    let servers = registry.get_servers()?;
    let server = servers
        .iter()
        .find(|server| server.id == server_id)
        .ok_or_else(|| "Server does not exist in the server registry".to_string())?;
    let directory = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_owned()),
            relative_path: String::new(),
        },
        false,
    )?;
    let profile_path = std::fs::canonicalize(&server.path)
        .map_err(|error| format!("Failed to resolve registered server path: {error}"))?;
    let managed_path = std::fs::canonicalize(&directory)
        .map_err(|error| format!("Failed to resolve managed server path: {error}"))?;
    if profile_path != managed_path {
        return Err("Player lists are available only for managed server directories".into());
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

fn mutate_player_file(
    app_data_dir: &Path,
    server_id: &str,
    mutation: &PlayerListMutation,
    identity: Option<PlayerIdentity>,
    canonical_target: String,
) -> Result<PlayerListMutationResult, String> {
    let path = resolve_player_file(app_data_dir, server_id, mutation.list_type)?;
    let mut entries = read_player_file(&path)?;
    let changed = match mutation.action {
        PlayerListAction::Add => {
            let new_entry = match (mutation.list_type, identity) {
                (PlayerListType::BannedIps, _) => NewEntry::Ip(canonical_target.clone()),
                (_, Some(identity)) => NewEntry::Player(identity),
                _ => return Err("Player identity is unavailable".into()),
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
        let content = serde_json::to_string_pretty(&entries)
            .map_err(|error| format!("Failed to encode player list: {error}"))?;
        atomic_write_managed_text_file(&path, &content)?;
    }

    Ok(PlayerListMutationResult {
        lists: read_snapshot(app_data_dir, server_id)?,
        changed,
        canonical_target,
    })
}

#[tauri::command]
pub async fn get_player_lists(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<PlayerListSnapshot, String> {
    let server_id = validate_server_id(&server_id)?;
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        require_registered_managed_server(&registry, &app_data_dir, &server_id)?;
        read_snapshot(&app_data_dir, &server_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn mutate_player_list(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    mutation: PlayerListMutation,
) -> Result<PlayerListMutationResult, String> {
    let server_id = validate_server_id(&server_id)?;
    let value = if mutation.list_type.is_ip_list() {
        validate_ip_address(&mutation.value)?
    } else {
        validate_player_name(&mutation.value)?
    };
    let identity = if mutation.action == PlayerListAction::Add && !mutation.list_type.is_ip_list() {
        Some(resolve_player_identity(&value).await?)
    } else {
        None
    };
    let canonical_target = identity
        .as_ref()
        .map(|identity| identity.name.clone())
        .unwrap_or(value);

    let _operation_guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
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
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        current_minecraft_timestamp, format_minecraft_timestamp, parse_mojang_profile,
        validate_ip_address, validate_player_name, PlayerEntry, PlayerListAction,
        PlayerListMutation, PlayerListType,
    };
    use crate::test_support::test_temp_dir;
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = test_temp_dir("mc-vector-players-tests").join(Uuid::new_v4().to_string());
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn initialize_server(directory: &TestDirectory, server_id: &str) {
        std::fs::create_dir_all(directory.path().join("servers").join(server_id)).unwrap();
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
            assert!(validate_player_name(invalid).is_err(), "{invalid:?}");
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
        assert_eq!(
            profile.uuid.as_deref(),
            Some("0123456789abcdef0123456789abcdef")
        );
        assert!(parse_mojang_profile(br#"{"id":"abc","name":"Alex"}"#, "Alex").is_none());
        assert!(parse_mojang_profile(
            br#"{"id":"0123456789abcdef0123456789abcdef","name":"Other"}"#,
            "Alex"
        )
        .is_none());
    }

    #[test]
    fn malformed_json_and_symlink_lists_fail_without_overwriting_contents() {
        let directory = TestDirectory::new();
        initialize_server(&directory, "server-1");
        let path = directory.path().join("servers/server-1/whitelist.json");
        std::fs::write(&path, "{broken").unwrap();

        let result = super::mutate_player_file(
            directory.path(),
            "server-1",
            &mutation(PlayerListType::Whitelist, PlayerListAction::Add, "Alex"),
            Some(super::PlayerIdentity {
                name: "Alex".into(),
                uuid: None,
            }),
            "Alex".into(),
        );
        assert!(result.unwrap_err().contains("malformed"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{broken");
    }

    #[test]
    fn oversized_player_list_is_rejected_without_rewriting_it() {
        let directory = TestDirectory::new();
        initialize_server(&directory, "server-1");
        let path = directory.path().join("servers/server-1/whitelist.json");
        let oversized = vec![b' '; (super::MAX_PLAYER_LIST_BYTES + 1) as usize];
        std::fs::write(&path, &oversized).unwrap();

        let result = super::mutate_player_file(
            directory.path(),
            "server-1",
            &mutation(PlayerListType::Whitelist, PlayerListAction::Add, "Alex"),
            Some(super::PlayerIdentity {
                name: "Alex".into(),
                uuid: None,
            }),
            "Alex".into(),
        );
        assert!(result.unwrap_err().contains("4 MiB size limit"));
        assert_eq!(
            std::fs::metadata(path).unwrap().len(),
            super::MAX_PLAYER_LIST_BYTES + 1
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlink_player_lists_are_refused() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let outside = TestDirectory::new();
        initialize_server(&directory, "server-1");
        std::fs::write(outside.path().join("list.json"), "[]").unwrap();
        symlink(
            outside.path().join("list.json"),
            directory.path().join("servers/server-1/whitelist.json"),
        )
        .unwrap();

        let error =
            super::read_player_file(&directory.path().join("servers/server-1/whitelist.json"))
                .unwrap_err();
        assert!(error.contains("regular file"));
    }

    #[test]
    fn duplicate_adds_are_idempotent_and_new_player_entries_keep_vanilla_shape() {
        let directory = TestDirectory::new();
        initialize_server(&directory, "server-1");
        std::fs::write(
            directory.path().join("servers/server-1/whitelist.json"),
            r#"[{"name":"Alex","uuid":"0123456789abcdef0123456789abcdef"}]"#,
        )
        .unwrap();

        let result = super::mutate_player_file(
            directory.path(),
            "server-1",
            &mutation(PlayerListType::Whitelist, PlayerListAction::Add, "alex"),
            Some(super::PlayerIdentity {
                name: "alex".into(),
                uuid: Some("0123456789abcdef0123456789abcdef".into()),
            }),
            "alex".into(),
        )
        .unwrap();
        assert!(!result.changed);
        assert_eq!(result.lists.whitelist.len(), 1);

        let ops = super::mutate_player_file(
            directory.path(),
            "server-1",
            &mutation(PlayerListType::Ops, PlayerListAction::Add, "Steve"),
            Some(super::PlayerIdentity {
                name: "Steve".into(),
                uuid: None,
            }),
            "Steve".into(),
        )
        .unwrap();
        assert!(ops.changed);
        assert_eq!(ops.lists.ops[0].level, Some(4));
        assert_eq!(ops.lists.ops[0].bypasses_player_limit, Some(false));
    }

    #[test]
    fn banned_ip_add_rejects_non_ip_and_serializes_canonical_address() {
        let directory = TestDirectory::new();
        initialize_server(&directory, "server-1");
        assert!(validate_ip_address("127.0.0.1\nstop").is_err());
        let result = super::mutate_player_file(
            directory.path(),
            "server-1",
            &mutation(
                PlayerListType::BannedIps,
                PlayerListAction::Add,
                "192.0.2.10",
            ),
            None,
            "192.0.2.10".into(),
        )
        .unwrap();
        assert!(result.changed);
        assert_eq!(result.lists.banned_ips[0].ip.as_deref(), Some("192.0.2.10"));
        assert_eq!(result.lists.banned_ips[0].name, "unknown");
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
        let value = serde_json::to_value(entry).unwrap();
        assert_eq!(value["bypassesPlayerLimit"], false);
        assert!(value.get("bypasses_player_limit").is_none());
    }
}
