//! Creating a new server profile.
//!
//! [`create_server`] validates the request, creates `servers/<uuid>`, fills
//! it (an imported folder, or the official jar when MC-Vector can verify it),
//! and adds the profile to the registry. On any failure or cancellation the
//! new folder is removed before the error is returned, so nothing half-made
//! is left behind.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Number;
use uuid::Uuid;

use crate::download::{CancelFlag, DownloadErrorKind};
use crate::error::{CoreError, CoreErrorCode};
use crate::managed_path::{
    is_link_or_reparse_point, resolve_managed_request, ManagedPathRequest, ManagedRoot,
};
use crate::operations::{OperationKind, ServerOperationManager};
use crate::registry::{MinecraftServer, ServerRegistry};
use crate::server_jar::{self, JarInstallError};

/// Software a profile may use. The UI offers a subset (see [`SOFTWARE_OPTIONS`]);
/// the rest stay accepted for imported and older profiles.
pub const AVAILABLE_SOFTWARE: [&str; 12] = [
    "Paper",
    "LeafMC",
    "Vanilla",
    "Fabric",
    "Spigot",
    "Forge",
    "Velocity",
    "Waterfall",
    "BungeeCord",
    "Purpur",
    "CraftBukkit",
    "NeoForge",
];

/// How the add-server form groups software.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SoftwareGroup {
    Standard,
    Modded,
    Proxy,
}

/// One choice in the add-server form, in the same order and groups as the
/// React `softwareSelectOptions`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SoftwareOption {
    pub name: &'static str,
    pub group: SoftwareGroup,
}

pub const SOFTWARE_OPTIONS: [SoftwareOption; 10] = [
    SoftwareOption {
        name: "Vanilla",
        group: SoftwareGroup::Standard,
    },
    SoftwareOption {
        name: "Paper",
        group: SoftwareGroup::Standard,
    },
    SoftwareOption {
        name: "LeafMC",
        group: SoftwareGroup::Standard,
    },
    SoftwareOption {
        name: "Spigot",
        group: SoftwareGroup::Standard,
    },
    SoftwareOption {
        name: "Fabric",
        group: SoftwareGroup::Modded,
    },
    SoftwareOption {
        name: "Forge",
        group: SoftwareGroup::Modded,
    },
    SoftwareOption {
        name: "NeoForge",
        group: SoftwareGroup::Modded,
    },
    SoftwareOption {
        name: "Velocity",
        group: SoftwareGroup::Proxy,
    },
    SoftwareOption {
        name: "Waterfall",
        group: SoftwareGroup::Proxy,
    },
    SoftwareOption {
        name: "BungeeCord",
        group: SoftwareGroup::Proxy,
    },
];

pub const MAX_PORT: u32 = 65_535;
pub const MAX_MEMORY_GB: u32 = 1_024;

/// A new server, as the add-server and import forms send it.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewServerRequest {
    /// Correlates progress events; must be a UUID.
    pub operation_id: String,
    pub name: String,
    #[serde(default)]
    pub profile_name: Option<String>,
    #[serde(default)]
    pub group_name: Option<String>,
    pub version: String,
    pub software: String,
    pub port: u32,
    pub memory_gb: u32,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub auto_restart_on_crash: Option<bool>,
    #[serde(default)]
    pub max_auto_restarts: Option<u32>,
    #[serde(default)]
    pub auto_restart_delay_sec: Option<u32>,
    #[serde(default)]
    pub auto_backup_enabled: Option<bool>,
    #[serde(default)]
    pub auto_backup_interval_min: Option<u32>,
    #[serde(default)]
    pub auto_backup_schedule_type: Option<String>,
    #[serde(default)]
    pub auto_backup_time: Option<String>,
    #[serde(default)]
    pub auto_backup_weekday: Option<u32>,
    #[serde(default)]
    pub auto_backup_retain_count: Option<u32>,
    #[serde(default)]
    pub auto_backup_retain_days: Option<u32>,
    #[serde(default)]
    pub backup_restart_after_safe_backup: Option<bool>,
    #[serde(default)]
    pub jvm_args: Option<String>,
    #[serde(default)]
    pub notify_on_crash: Option<bool>,
    #[serde(default)]
    pub notify_on_start: Option<bool>,
    #[serde(default)]
    pub notify_on_high_cpu: Option<bool>,
    #[serde(default)]
    pub notify_high_cpu_threshold: Option<u32>,
    /// Set by the import form; the import itself is done by `import_step`.
    #[serde(default)]
    pub import_token: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedServer {
    pub server: MinecraftServer,
    /// False when the user must place the server jar by hand.
    pub jar_installed: bool,
}

/// Where a creation is, for progress UI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CreationEvent {
    /// Looking up the official download.
    Resolving,
    /// Downloading the jar; `None` while the size is unknown.
    Downloading { percent: Option<u32> },
    /// Writing the profile.
    Finishing,
}

/// Receives [`CreationEvent`]s. Must not block.
pub trait CreationProgress: Send + Sync {
    fn report(&self, event: CreationEvent);
}

impl<F> CreationProgress for F
where
    F: Fn(CreationEvent) + Send + Sync,
{
    fn report(&self, event: CreationEvent) {
        self(event)
    }
}

/// Fills the new server folder from an import: `(data_dir, server_id)`.
/// See `server_import::ImportManager::import_step`.
pub type ImportStep = Box<dyn FnOnce(&Path, &str) -> Result<(), CoreError> + Send + 'static>;

fn invalid(code: CoreErrorCode, message: &str) -> CoreError {
    CoreError::new(code, message)
}

pub fn validate_operation_id(operation_id: &str) -> Result<String, CoreError> {
    let normalized = operation_id.trim();
    Uuid::parse_str(normalized).map_err(|_| {
        invalid(
            CoreErrorCode::ServerInvalidRequest,
            "Server creation operation ID is invalid",
        )
    })?;
    Ok(normalized.to_owned())
}

/// The add-server form's name rule: trimmed, 1–128 bytes of `[A-Za-z0-9_-]`.
pub fn is_valid_server_name(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty()
        && name.len() <= 128
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn normalize_text(
    field: &str,
    value: Option<String>,
    max_bytes: usize,
) -> Result<Option<String>, CoreError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > max_bytes || value.chars().any(char::is_control) {
        return Err(CoreError::new(
            CoreErrorCode::ServerInvalidRequest,
            format!("{field} is invalid"),
        ));
    }
    Ok(Some(value.to_owned()))
}

fn normalize_backup_time(value: Option<String>) -> Result<String, CoreError> {
    let bad = |message: &str| invalid(CoreErrorCode::ServerInvalidRequest, message);
    let value = value.unwrap_or_else(|| "03:00".to_string());
    let value = value.trim();
    if value.len() != 5
        || value.as_bytes()[2] != b':'
        || !value.as_bytes()[..2].iter().all(u8::is_ascii_digit)
        || !value.as_bytes()[3..].iter().all(u8::is_ascii_digit)
    {
        return Err(bad("Automatic backup time must use HH:MM format"));
    }
    let hour = value[..2]
        .parse::<u8>()
        .map_err(|_| bad("Automatic backup time is invalid"))?;
    let minute = value[3..]
        .parse::<u8>()
        .map_err(|_| bad("Automatic backup time is invalid"))?;
    if hour > 23 || minute > 59 {
        return Err(bad("Automatic backup time is invalid"));
    }
    Ok(value.to_owned())
}

/// Validates `request` and builds the registry profile. The name rule is
/// relaxed for imports (any characters except path separators).
pub fn build_profile(
    request: NewServerRequest,
    server_id: String,
    server_path: String,
) -> Result<MinecraftServer, CoreError> {
    let name = request.name.trim();
    let is_import = request
        .import_token
        .as_deref()
        .is_some_and(|token| !token.trim().is_empty());
    let name_ok = if is_import {
        !name.is_empty()
            && name.len() <= 128
            && !name.chars().any(char::is_control)
            && !name
                .chars()
                .any(|character| matches!(character, '/' | '\\' | ':'))
    } else {
        is_valid_server_name(name)
    };
    if !name_ok {
        return Err(invalid(
            CoreErrorCode::ServerInvalidName,
            "Server name is empty, too long, or contains unsupported characters",
        ));
    }
    let software = request.software.trim();
    if !AVAILABLE_SOFTWARE.contains(&software) {
        return Err(invalid(
            CoreErrorCode::ServerInvalidRequest,
            "Server software is invalid",
        ));
    }
    let version = request.version.trim();
    if (version.is_empty() && !is_import)
        || version.len() > 128
        || version.chars().any(char::is_control)
    {
        return Err(invalid(
            CoreErrorCode::ServerInvalidRequest,
            "Server version is invalid",
        ));
    }
    if !(1..=MAX_PORT).contains(&request.port) {
        return Err(invalid(
            CoreErrorCode::ServerInvalidPort,
            "Server port must be between 1 and 65535",
        ));
    }
    if !(1..=MAX_MEMORY_GB).contains(&request.memory_gb) {
        return Err(invalid(
            CoreErrorCode::ServerInvalidMemory,
            "Server memory must be between 1 and 1024 GB",
        ));
    }

    let profile_name = normalize_text("Profile name", request.profile_name, 128)?;
    let group_name = normalize_text("Group name", request.group_name, 128)?;
    let java_path = normalize_text("Java path", request.java_path, 4_096)?;
    let jvm_args = normalize_text("JVM arguments", request.jvm_args, 8_192)?;
    let schedule_type = match request.auto_backup_schedule_type.as_deref() {
        None | Some("") | Some("interval") => "interval".to_string(),
        Some("daily") => "daily".to_string(),
        Some("weekly") => "weekly".to_string(),
        Some(_) => {
            return Err(invalid(
                CoreErrorCode::ServerInvalidRequest,
                "Automatic backup schedule type is invalid",
            ))
        }
    };
    let backup_weekday = request.auto_backup_weekday.unwrap_or(0);
    if backup_weekday > 6 {
        return Err(invalid(
            CoreErrorCode::ServerInvalidRequest,
            "Automatic backup weekday must be between 0 and 6",
        ));
    }
    let backup_time = normalize_backup_time(request.auto_backup_time)?;
    let max_auto_restarts = request.max_auto_restarts.unwrap_or(3).min(20);
    let restart_delay = request.auto_restart_delay_sec.unwrap_or(5).clamp(1, 300);
    let backup_interval = request
        .auto_backup_interval_min
        .unwrap_or(60)
        .clamp(1, 43_200);

    Ok(MinecraftServer {
        id: server_id,
        name: name.to_owned(),
        profile_name,
        group_name,
        version: version.to_owned(),
        software: software.to_owned(),
        port: Number::from(request.port),
        memory: Number::from(request.memory_gb.saturating_mul(1024)),
        path: server_path,
        status: "offline".to_string(),
        java_path,
        auto_restart_on_crash: Some(request.auto_restart_on_crash.unwrap_or(false)),
        max_auto_restarts: Some(Number::from(max_auto_restarts)),
        auto_restart_delay_sec: Some(Number::from(restart_delay)),
        auto_backup_enabled: Some(request.auto_backup_enabled.unwrap_or(false)),
        auto_backup_interval_min: Some(Number::from(backup_interval)),
        auto_backup_schedule_type: Some(schedule_type),
        auto_backup_time: Some(backup_time),
        auto_backup_weekday: Some(Number::from(backup_weekday)),
        auto_backup_retain_count: request.auto_backup_retain_count.map(Number::from),
        auto_backup_retain_days: request.auto_backup_retain_days.map(Number::from),
        backup_restart_after_safe_backup: request.backup_restart_after_safe_backup,
        created_date: Some(Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
        jvm_args,
        notify_on_crash: request.notify_on_crash,
        notify_on_start: request.notify_on_start,
        notify_on_high_cpu: request.notify_on_high_cpu,
        notify_high_cpu_threshold: request.notify_high_cpu_threshold.map(Number::from),
        unavailable_reason: None,
        extra: Default::default(),
    })
}

fn server_directory_request(server_id: &str) -> ManagedPathRequest {
    ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: String::new(),
    }
}

/// Creates `servers/<serverId>`; fails if anything already exists there.
pub fn create_server_directory(data_dir: &Path, server_id: &str) -> Result<PathBuf, String> {
    let directory = resolve_managed_request(data_dir, &server_directory_request(server_id), true)?;
    match fs::symlink_metadata(&directory) {
        Ok(_) => return Err("A server folder with this ID already exists".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Failed to inspect server directory: {error}")),
    }
    fs::create_dir(&directory)
        .map_err(|error| format!("Failed to create managed server directory: {error}"))?;
    Ok(directory)
}

/// Removes `servers/<serverId>` during rollback; refuses links and non-folders.
pub fn remove_server_directory(data_dir: &Path, server_id: &str) -> Result<(), String> {
    let directory = resolve_managed_request(data_dir, &server_directory_request(server_id), false)?;
    let metadata = match fs::symlink_metadata(&directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Failed to inspect server directory during rollback: {error}"
            ));
        }
    };
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Refusing to remove a changed server directory during rollback".to_string());
    }
    fs::remove_dir_all(directory)
        .map_err(|error| format!("Failed to remove server directory during rollback: {error}"))
}

async fn cleanup_failed_creation(
    data_dir: PathBuf,
    server_id: String,
    error: CoreError,
) -> CoreError {
    let cleanup =
        tokio::task::spawn_blocking(move || remove_server_directory(&data_dir, &server_id)).await;
    match cleanup {
        Ok(Ok(())) => error,
        Ok(Err(cleanup_error)) => {
            log::warn!("Failed to remove an incomplete server folder: {cleanup_error}");
            CoreError {
                message: format!(
                    "{}; the incomplete server folder could not be removed",
                    error.message
                ),
                ..error
            }
        }
        Err(join_error) => {
            log::warn!("Server folder cleanup task failed: {join_error}");
            error
        }
    }
}

fn jar_error(error: JarInstallError) -> CoreError {
    match error {
        JarInstallError::Unavailable(message) => {
            CoreError::new(CoreErrorCode::DownloadUnavailable, message)
        }
        JarInstallError::Io(message) => {
            CoreError::new(CoreErrorCode::ServerOperationFailed, message)
        }
        JarInstallError::Download(error) => {
            let code = match error.kind {
                DownloadErrorKind::Network | DownloadErrorKind::Policy => {
                    CoreErrorCode::DownloadNetworkFailed
                }
                DownloadErrorKind::ChecksumMismatch => CoreErrorCode::DownloadChecksumMismatch,
                DownloadErrorKind::TooLarge => CoreErrorCode::DownloadTooLarge,
                DownloadErrorKind::Cancelled => CoreErrorCode::OperationCancelled,
                DownloadErrorKind::Io => CoreErrorCode::ServerOperationFailed,
            };
            CoreError::new(code, error.message)
        }
    }
}

fn cancelled() -> CoreError {
    CoreError::new(
        CoreErrorCode::OperationCancelled,
        "Server creation was cancelled",
    )
}

/// Creates a server profile. See the module documentation.
///
/// `import_step` fills the folder for imports; otherwise the official jar is
/// downloaded when [`server_jar::supports_automatic_install`] allows it.
pub async fn create_server(
    data_dir: &Path,
    registry: &ServerRegistry,
    operations: &ServerOperationManager,
    request: NewServerRequest,
    import_step: Option<ImportStep>,
    progress: &dyn CreationProgress,
    cancel: Option<&CancelFlag>,
) -> Result<CreatedServer, CoreError> {
    validate_operation_id(&request.operation_id)?;
    let server_id = Uuid::new_v4().to_string();
    let _operation = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|message| CoreError::new(CoreErrorCode::ServerOperationFailed, message))?;

    // Validate before touching the disk.
    let mut server = build_profile(request, server_id.clone(), String::new())?;

    let data_dir_for_create = data_dir.to_owned();
    let server_id_for_create = server_id.clone();
    let directory = tokio::task::spawn_blocking(move || {
        create_server_directory(&data_dir_for_create, &server_id_for_create)
    })
    .await
    .map_err(|error| {
        CoreError::new(
            CoreErrorCode::ServerOperationFailed,
            format!("Server directory creation task failed: {error}"),
        )
    })?
    .map_err(|message| CoreError::new(CoreErrorCode::ServerOperationFailed, message))?;
    server.path = directory.to_string_lossy().into_owned();

    let setup: Result<bool, CoreError> = async {
        if let Some(import_step) = import_step {
            let import_root = data_dir.to_owned();
            let import_server_id = server.id.clone();
            tokio::task::spawn_blocking(move || import_step(&import_root, &import_server_id))
                .await
                .map_err(|error| {
                    CoreError::new(
                        CoreErrorCode::ServerOperationFailed,
                        format!("Server import task failed: {error}"),
                    )
                })??;
            return Ok(true);
        }
        if !server_jar::supports_automatic_install(&server.software) {
            return Ok(false);
        }
        progress.report(CreationEvent::Resolving);
        let installed = server_jar::install_jar_for_creation(
            data_dir,
            &server.id,
            &server.software,
            &server.version,
            cancel,
            |percent| progress.report(CreationEvent::Downloading { percent }),
        )
        .await
        .map_err(jar_error)?;
        Ok(match installed {
            Some(version) => {
                server.version = version;
                true
            }
            None => false,
        })
    }
    .await;

    let jar_installed = match setup {
        Ok(_) if cancel.is_some_and(CancelFlag::is_cancelled) => {
            return Err(cleanup_failed_creation(data_dir.to_owned(), server_id, cancelled()).await)
        }
        Ok(installed) => installed,
        Err(error) => {
            return Err(cleanup_failed_creation(data_dir.to_owned(), server_id, error).await)
        }
    };

    progress.report(CreationEvent::Finishing);
    let registry_for_add = registry.clone();
    let server_for_add = server.clone();
    let added = tokio::task::spawn_blocking(move || registry_for_add.add_server(&server_for_add))
        .await
        .map_err(|error| format!("Server registry task failed: {error}"))
        .and_then(|result| result);
    if let Err(message) = added {
        let error = CoreError::new(CoreErrorCode::ServerOperationFailed, message);
        return Err(cleanup_failed_creation(data_dir.to_owned(), server_id, error).await);
    }

    Ok(CreatedServer {
        server,
        jar_installed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn request() -> NewServerRequest {
        NewServerRequest {
            operation_id: "4ddedb77-d536-4570-b647-b9e866e4d327".into(),
            name: "survival".into(),
            profile_name: Some("  Vanilla  ".into()),
            version: "1.21.10".into(),
            software: "Paper".into(),
            port: 25565,
            memory_gb: 4,
            ..NewServerRequest::default()
        }
    }

    fn data_dir() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().canonicalize().unwrap();
        (dir, path)
    }

    fn server_folders(data_dir: &Path) -> Vec<String> {
        fs::read_dir(data_dir.join("servers"))
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default()
    }

    #[test]
    fn profile_defaults_are_applied_in_rust() {
        let profile = build_profile(
            request(),
            "server-id".into(),
            "/managed/servers/server-id".into(),
        )
        .unwrap();
        assert_eq!(profile.id, "server-id");
        assert_eq!(profile.path, "/managed/servers/server-id");
        assert_eq!(profile.memory.as_u64(), Some(4096));
        assert_eq!(profile.port.as_u64(), Some(25565));
        assert_eq!(profile.status, "offline");
        assert_eq!(profile.profile_name.as_deref(), Some("Vanilla"));
        assert_eq!(profile.auto_restart_on_crash, Some(false));
        assert_eq!(
            profile.max_auto_restarts.as_ref().and_then(Number::as_u64),
            Some(3)
        );
        assert_eq!(
            profile
                .auto_backup_interval_min
                .as_ref()
                .and_then(Number::as_u64),
            Some(60)
        );
        assert!(profile.created_date.is_some());
        assert!(profile.unavailable_reason.is_none());
        assert!(profile.extra.is_empty());
    }

    #[test]
    fn validation_reports_a_specific_code_per_field() {
        type Change = fn(&mut NewServerRequest);
        let cases: [(Change, CoreErrorCode); 6] = [
            (
                |r| r.software = "https://evil.test/server.jar".into(),
                CoreErrorCode::ServerInvalidRequest,
            ),
            (
                |r| r.name = "../outside".into(),
                CoreErrorCode::ServerInvalidName,
            ),
            (|r| r.name = "   ".into(), CoreErrorCode::ServerInvalidName),
            (|r| r.port = 65_536, CoreErrorCode::ServerInvalidPort),
            (|r| r.memory_gb = 0, CoreErrorCode::ServerInvalidMemory),
            (|r| r.memory_gb = 1_025, CoreErrorCode::ServerInvalidMemory),
        ];
        for (change, code) in cases {
            let mut invalid = request();
            change(&mut invalid);
            assert_eq!(
                build_profile(invalid, "id".into(), "/p".into())
                    .unwrap_err()
                    .code,
                code
            );
        }
    }

    #[test]
    fn names_are_checked_after_trimming() {
        assert!(is_valid_server_name(" survival "));
        assert!(!is_valid_server_name("my server"));
        let mut padded = request();
        padded.name = " survival ".into();
        assert_eq!(
            build_profile(padded, "id".into(), "/p".into())
                .unwrap()
                .name,
            "survival"
        );
    }

    #[test]
    fn imported_profile_keeps_a_human_name_and_unknown_version() {
        let mut imported = request();
        imported.name = "My Imported Server".into();
        imported.version.clear();
        imported.import_token = Some("opaque-token".into());

        let profile = build_profile(imported, "id".into(), "/p".into()).unwrap();
        assert_eq!(profile.name, "My Imported Server");
        assert!(profile.version.is_empty());
    }

    #[test]
    fn managed_directory_creation_is_unique_and_rollback_stays_in_managed_storage() {
        let (_dir, data) = data_dir();
        let server_id = Uuid::new_v4().to_string();
        let created = create_server_directory(&data, &server_id).unwrap();
        assert!(created.starts_with(data.join("servers")));
        assert!(created.is_dir());
        assert!(create_server_directory(&data, &server_id).is_err());

        remove_server_directory(&data, &server_id).unwrap();
        assert!(!created.exists());
        remove_server_directory(&data, &server_id).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_to_create_or_remove_through_a_managed_symlink() {
        use std::os::unix::fs::symlink;

        let (_dir, data) = data_dir();
        let (_outside_dir, outside) = data_dir();
        fs::create_dir(data.join("servers")).unwrap();
        symlink(&outside, data.join("servers/server-id")).unwrap();

        assert!(create_server_directory(&data, "server-id").is_err());
        assert!(remove_server_directory(&data, "server-id").is_err());
        assert!(outside.is_dir());
    }

    #[test]
    fn schedule_fields_are_normalized_and_malformed_times_fail_closed() {
        let mut configured = request();
        configured.auto_backup_schedule_type = Some("weekly".into());
        configured.auto_backup_time = Some("09:45".into());
        configured.auto_backup_weekday = Some(6);
        let profile = build_profile(configured, "id".into(), "/p".into()).unwrap();
        assert_eq!(profile.auto_backup_schedule_type.as_deref(), Some("weekly"));
        assert_eq!(profile.auto_backup_time.as_deref(), Some("09:45"));
        assert_eq!(
            profile
                .auto_backup_weekday
                .as_ref()
                .and_then(Number::as_u64),
            Some(6)
        );

        let mut malformed = request();
        malformed.auto_backup_time = Some("25:75".into());
        assert!(build_profile(malformed, "id".into(), "/p".into()).is_err());
        assert!(normalize_backup_time(Some("3:00".into())).is_err());
    }

    #[test]
    fn operation_correlation_requires_uuid() {
        assert_eq!(
            validate_operation_id(" 4ddedb77-d536-4570-b647-b9e866e4d327 ").unwrap(),
            "4ddedb77-d536-4570-b647-b9e866e4d327"
        );
        assert!(validate_operation_id("../../server").is_err());
    }

    #[tokio::test]
    async fn manual_jar_software_creates_the_folder_and_registry_row_without_network() {
        let (_dir, data) = data_dir();
        let registry = ServerRegistry::open(&data).unwrap();
        let operations = ServerOperationManager::default();
        let events = Mutex::new(Vec::new());
        let progress = |event: CreationEvent| events.lock().unwrap().push(event);
        for software in ["Spigot", "Fabric"] {
            let mut manual = request();
            manual.software = software.into();
            let created =
                create_server(&data, &registry, &operations, manual, None, &progress, None)
                    .await
                    .unwrap();
            assert!(!created.jar_installed, "{software}");
            assert!(Path::new(&created.server.path).is_dir());
            assert!(registry
                .get_servers()
                .unwrap()
                .iter()
                .any(|server| server.id == created.server.id));
        }
        // No download happened, so the only event is the final one per server.
        assert_eq!(
            *events.lock().unwrap(),
            [CreationEvent::Finishing, CreationEvent::Finishing]
        );
    }

    #[tokio::test]
    async fn invalid_requests_leave_no_folder() {
        let (_dir, data) = data_dir();
        let registry = ServerRegistry::open(&data).unwrap();
        let operations = ServerOperationManager::default();
        let mut invalid = request();
        invalid.port = 0;
        let error = create_server(&data, &registry, &operations, invalid, None, &|_| {}, None)
            .await
            .unwrap_err();
        assert_eq!(error.code, CoreErrorCode::ServerInvalidPort);
        assert!(server_folders(&data).is_empty());
    }

    #[tokio::test]
    async fn a_failed_import_and_a_cancel_remove_the_new_folder() {
        let (_dir, data) = data_dir();
        let registry = ServerRegistry::open(&data).unwrap();
        let operations = ServerOperationManager::default();

        let mut import = request();
        import.import_token = Some("token".into());
        let failing: ImportStep = Box::new(|_, _| {
            Err(CoreError::new(
                CoreErrorCode::ServerOperationFailed,
                "copy failed",
            ))
        });
        let error = create_server(
            &data,
            &registry,
            &operations,
            import,
            Some(failing),
            &|_| {},
            None,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, CoreErrorCode::ServerOperationFailed);
        assert!(server_folders(&data).is_empty());

        let cancel = CancelFlag::new();
        let cancel_during_import = cancel.clone();
        let mut import = request();
        import.import_token = Some("token".into());
        let succeeding: ImportStep = Box::new(move |_, _| {
            cancel_during_import.cancel();
            Ok(())
        });
        let error = create_server(
            &data,
            &registry,
            &operations,
            import,
            Some(succeeding),
            &|_| {},
            Some(&cancel),
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, CoreErrorCode::OperationCancelled);
        assert!(server_folders(&data).is_empty());
        assert!(registry.get_servers().unwrap().is_empty());
    }

    #[test]
    fn software_options_match_the_accepted_list() {
        for option in SOFTWARE_OPTIONS {
            assert!(AVAILABLE_SOFTWARE.contains(&option.name), "{}", option.name);
        }
    }
}
