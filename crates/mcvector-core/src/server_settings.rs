//! Typed read and update operations for a server's General Settings.
//!
//! The renderer has a compatibility adapter in `update_server_profile`; native
//! callers should use [`ServerSettingsUpdate`] and [`update_server_settings`].

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Number;

use crate::error::{CoreError, CoreErrorCode};
use crate::java::SYSTEM_JAVA_SENTINEL;
use crate::java_policy::{validate_java_executable_path, validate_jvm_extra_args};
use crate::managed_files;
use crate::managed_path::{
    resolve_managed_request, validate_server_id, ManagedPathRequest, ManagedRoot,
};
use crate::operations::{OperationKind, ServerOperationManager};
use crate::properties::{parse_properties, patch_properties, MAX_PROPERTIES_BYTES};
use crate::registry::{MinecraftServer, ServerRegistry};
use crate::server_creation::AVAILABLE_SOFTWARE;

/// Java's auto-backup scheduling mode. The wire values match React's form.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AutoBackupScheduleType {
    Interval,
    Daily,
    Weekly,
}

/// General Settings read model. `server_path` is display-only and remains
/// owned by the managed-path layer.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerSettings {
    pub server_id: String,
    pub server_path: String,
    pub name: String,
    pub profile_name: String,
    pub group_name: String,
    pub software: String,
    pub version: String,
    /// Server memory in MiB, matching the renderer's `memory` field.
    pub memory_mb: u64,
    pub port: u16,
    /// `None` selects Java automatically. `SYSTEM_JAVA_SENTINEL` uses Java on PATH.
    pub java_path: Option<String>,
    pub jvm_args: String,
    pub auto_restart_on_crash: bool,
    pub max_auto_restarts: u32,
    pub auto_restart_delay_sec: u32,
    pub auto_backup_enabled: bool,
    pub auto_backup_interval_min: u32,
    pub auto_backup_schedule_type: AutoBackupScheduleType,
    pub auto_backup_time: String,
    pub auto_backup_weekday: u8,
    pub auto_backup_retain_count: u32,
    pub auto_backup_retain_days: u32,
    /// Hidden from this form but retained for the automation subsystem.
    pub backup_restart_after_safe_backup: bool,
    pub notify_on_crash: bool,
    pub notify_on_start: bool,
    pub notify_on_high_cpu: bool,
    pub notify_high_cpu_threshold: u8,
}

/// Complete replacement for the editable General Settings fields.
///
/// `backup_restart_after_safe_backup` is optional because the React form does
/// not edit it; `None` preserves the stored value (defaulting to `true`).
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerSettingsUpdate {
    pub name: String,
    pub profile_name: String,
    pub group_name: String,
    pub software: String,
    pub version: String,
    pub memory_mb: u64,
    pub port: u16,
    pub java_path: Option<String>,
    pub jvm_args: String,
    pub auto_restart_on_crash: bool,
    pub max_auto_restarts: u32,
    pub auto_restart_delay_sec: u32,
    pub auto_backup_enabled: bool,
    pub auto_backup_interval_min: u32,
    pub auto_backup_schedule_type: AutoBackupScheduleType,
    pub auto_backup_time: String,
    pub auto_backup_weekday: u8,
    pub auto_backup_retain_count: u32,
    pub auto_backup_retain_days: u32,
    pub backup_restart_after_safe_backup: Option<bool>,
    pub notify_on_crash: bool,
    pub notify_on_start: bool,
    pub notify_on_high_cpu: bool,
    pub notify_high_cpu_threshold: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerSettingsSaveResult {
    pub settings: ServerSettings,
    pub restart_required: bool,
}

/// Loads the typed settings snapshot under the shared per-server operation lock.
pub async fn get_server_settings(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
) -> Result<ServerSettings, CoreError> {
    let server_id = validate_settings_server_id(&server_id)?;
    let guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|_| invalid_request("The server ID is invalid."))?;

    tokio::task::spawn_blocking(move || {
        let _guard = guard;
        let server = registered_server(&registry, &server_id)?;
        validate_managed_profile(&app_data_dir, &server)?;
        settings_from_profile(&server)
    })
    .await
    .map_err(|_| CoreError::internal("Could not load server settings."))?
}

/// Validates and atomically saves General Settings. A changed port is also
/// patched into an existing `server.properties` file while preserving its
/// formatting. A missing properties file stays missing.
pub async fn update_server_settings(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
    settings: ServerSettingsUpdate,
) -> Result<ServerSettingsSaveResult, CoreError> {
    let server_id = validate_settings_server_id(&server_id)?;
    let guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|_| invalid_request("The server ID is invalid."))?;

    tokio::task::spawn_blocking(move || {
        let _guard = guard;
        update_server_settings_sync(&app_data_dir, &registry, &server_id, settings)
    })
    .await
    .map_err(|_| CoreError::internal("Could not save server settings."))?
}

/// Compatibility adapter for React's historical full-profile `update_server`
/// payload. Only General Settings fields are accepted from the caller; path,
/// runtime status, creation metadata, and unknown registry properties stay from
/// the current stored profile. Returns `false` for a profile that disappeared.
pub async fn update_server_profile(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server: MinecraftServer,
) -> Result<bool, CoreError> {
    let server_id = validate_settings_server_id(&server.id)?;
    let guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|_| invalid_request("The server ID is invalid."))?;

    tokio::task::spawn_blocking(move || {
        let _guard = guard;
        let current = match registered_server(&registry, &server_id) {
            Ok(current) => current,
            Err(error) if error.code == CoreErrorCode::ServerSettingsNotFound => return Ok(false),
            Err(error) => return Err(error),
        };
        validate_managed_profile(&app_data_dir, &current)?;
        let settings = legacy_update(&server, &current)?;
        update_server_settings_sync(&app_data_dir, &registry, &server_id, settings)?;
        Ok(true)
    })
    .await
    .map_err(|_| CoreError::internal("Could not save server settings."))?
}

fn validate_settings_server_id(server_id: &str) -> Result<String, CoreError> {
    validate_server_id(server_id).map_err(|_| invalid_request("The server ID is invalid."))
}

fn registered_server(
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<MinecraftServer, CoreError> {
    registry
        .get_servers()
        .map_err(|_| {
            CoreError::new(
                CoreErrorCode::ServerSettingsRegistry,
                "Could not read the server registry.",
            )
        })?
        .into_iter()
        .find(|server| server.id == server_id)
        .ok_or_else(|| {
            CoreError::new(
                CoreErrorCode::ServerSettingsNotFound,
                "Server settings were not found.",
            )
        })
}

fn validate_managed_profile(
    app_data_dir: &Path,
    server: &MinecraftServer,
) -> Result<(PathBuf, PathBuf), CoreError> {
    let server_root = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server.id.clone()),
            relative_path: String::new(),
        },
        false,
    )
    .map_err(|_| unmanaged_profile())?;
    let properties_path = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server.id.clone()),
            relative_path: "server.properties".to_string(),
        },
        false,
    )
    .map_err(|_| unmanaged_profile())?;
    let canonical_root = fs::canonicalize(&server_root).map_err(|_| unmanaged_profile())?;
    let canonical_registered = fs::canonicalize(&server.path).map_err(|_| unmanaged_profile())?;
    if canonical_root != canonical_registered {
        return Err(unmanaged_profile());
    }
    Ok((server_root, properties_path))
}

fn settings_from_profile(server: &MinecraftServer) -> Result<ServerSettings, CoreError> {
    let port = server
        .port
        .as_u64()
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port > 0)
        .ok_or_else(|| invalid_port("Server port must be between 1 and 65535."))?;
    let memory_mb = server
        .memory
        .as_u64()
        .ok_or_else(|| invalid_memory("Server memory must be a non-negative integer."))?;

    let schedule_type = match server.auto_backup_schedule_type.as_deref() {
        Some("daily") => AutoBackupScheduleType::Daily,
        Some("weekly") => AutoBackupScheduleType::Weekly,
        _ => AutoBackupScheduleType::Interval,
    };
    let auto_backup_time = server
        .auto_backup_time
        .as_deref()
        .filter(|time| valid_time(time))
        .unwrap_or("03:00")
        .to_string();

    Ok(ServerSettings {
        server_id: server.id.clone(),
        server_path: server.path.clone(),
        name: server.name.clone(),
        profile_name: server.profile_name.clone().unwrap_or_default(),
        group_name: server.group_name.clone().unwrap_or_default(),
        software: if server.software.trim().is_empty() {
            "Paper".to_string()
        } else {
            server.software.clone()
        },
        version: server.version.clone(),
        memory_mb,
        port,
        java_path: server.java_path.as_deref().and_then(non_empty_trimmed),
        jvm_args: server.jvm_args.clone().unwrap_or_default(),
        auto_restart_on_crash: server.auto_restart_on_crash.unwrap_or(false),
        max_auto_restarts: bounded_json_number(server.max_auto_restarts.as_ref(), 3, 0, 20) as u32,
        auto_restart_delay_sec: bounded_json_number(
            server.auto_restart_delay_sec.as_ref(),
            5,
            1,
            300,
        ) as u32,
        auto_backup_enabled: server.auto_backup_enabled.unwrap_or(false),
        auto_backup_interval_min: bounded_json_number(
            server.auto_backup_interval_min.as_ref(),
            60,
            1,
            1440,
        ) as u32,
        auto_backup_schedule_type: schedule_type,
        auto_backup_time,
        auto_backup_weekday: bounded_json_number(server.auto_backup_weekday.as_ref(), 0, 0, 6)
            as u8,
        auto_backup_retain_count: bounded_json_number(
            server.auto_backup_retain_count.as_ref(),
            0,
            0,
            999,
        ) as u32,
        auto_backup_retain_days: bounded_json_number(
            server.auto_backup_retain_days.as_ref(),
            0,
            0,
            365,
        ) as u32,
        backup_restart_after_safe_backup: server.backup_restart_after_safe_backup.unwrap_or(true),
        notify_on_crash: server.notify_on_crash.unwrap_or(true),
        notify_on_start: server.notify_on_start.unwrap_or(false),
        notify_on_high_cpu: server.notify_on_high_cpu.unwrap_or(false),
        notify_high_cpu_threshold: bounded_json_number(
            server.notify_high_cpu_threshold.as_ref(),
            90,
            1,
            100,
        ) as u8,
    })
}

fn bounded_json_number(value: Option<&Number>, default: u64, min: u64, max: u64) -> u64 {
    value
        .and_then(Number::as_u64)
        .map(|value| value.clamp(min, max))
        .unwrap_or(default)
}

fn validate_settings(
    settings: &ServerSettingsUpdate,
    current_memory_mb: u64,
) -> Result<(), CoreError> {
    if !valid_server_name(&settings.name) {
        return Err(CoreError::new(
            CoreErrorCode::ServerSettingsInvalidName,
            "Server name is empty, too long, or contains unsupported characters.",
        ));
    }
    if !(1024..=1_048_576).contains(&settings.memory_mb) && settings.memory_mb != current_memory_mb
    {
        return Err(invalid_memory(
            "Server memory must be between 1024 and 1048576 MB.",
        ));
    }
    if settings.port == 0 {
        return Err(invalid_port("Server port must be between 1 and 65535."));
    }
    if !AVAILABLE_SOFTWARE.contains(&settings.software.trim()) {
        return Err(invalid_request("Server software is invalid."));
    }
    if settings.version.trim().len() > 128 || settings.version.chars().any(char::is_control) {
        return Err(invalid_request("Server version is invalid."));
    }
    if !valid_optional_text(&settings.profile_name, 128)
        || !valid_optional_text(&settings.group_name, 128)
    {
        return Err(invalid_request("Server profile or group name is invalid."));
    }
    if !(0..=20).contains(&settings.max_auto_restarts)
        || !(1..=300).contains(&settings.auto_restart_delay_sec)
        || !(1..=1440).contains(&settings.auto_backup_interval_min)
        || settings.auto_backup_weekday > 6
        || settings.auto_backup_retain_count > 999
        || settings.auto_backup_retain_days > 365
        || !(1..=100).contains(&settings.notify_high_cpu_threshold)
        || !valid_time(&settings.auto_backup_time)
    {
        return Err(invalid_request(
            "One or more server settings values are outside the supported range.",
        ));
    }
    let jvm_args = settings.jvm_args.trim();
    if jvm_args.len() > 8192 || jvm_args.chars().any(char::is_control) {
        return Err(invalid_request("JVM arguments are invalid."));
    }
    if !jvm_args.is_empty() && validate_jvm_extra_args(jvm_args).is_err() {
        return Err(invalid_request(
            "JVM arguments contain unsupported or unsafe flags.",
        ));
    }
    Ok(())
}

fn update_server_settings_sync(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    server_id: &str,
    mut settings: ServerSettingsUpdate,
) -> Result<ServerSettingsSaveResult, CoreError> {
    let original_server = registered_server(registry, server_id)?;
    let (_, properties_path) = validate_managed_profile(app_data_dir, &original_server)?;
    let mut updated_server = original_server.clone();
    let original_settings = settings_from_profile(&original_server)?;
    settings.java_path = settings.java_path.as_deref().and_then(non_empty_trimmed);
    validate_settings(&settings, original_settings.memory_mb)?;
    if settings.java_path != original_settings.java_path {
        if let Some(java_path) = settings
            .java_path
            .as_deref()
            .filter(|path| *path != SYSTEM_JAVA_SENTINEL)
        {
            validate_java_executable_path(java_path, &app_data_dir.join("java")).map_err(|_| {
                invalid_request("Java path must identify a supported Java executable.")
            })?;
        }
    }
    apply_update(&mut updated_server, &settings, &original_settings);
    let result_settings = settings_from_profile(&updated_server)?;
    let restart_required = restart_affecting_fields_changed(&original_settings, &result_settings);

    let port_changed = original_settings.port != settings.port;
    let original_properties = if port_changed {
        read_optional_properties(&properties_path)?
    } else {
        None
    };
    let patched_properties = if let Some(original) = original_properties.as_deref() {
        let content = String::from_utf8(original.to_vec())
            .map_err(|_| settings_io("server.properties is not valid UTF-8."))?;
        parse_properties(&content)
            .map_err(|_| settings_io("server.properties contains malformed entries."))?;
        let mut port_update = HashMap::new();
        port_update.insert("server-port".to_string(), settings.port.to_string());
        Some(
            patch_properties(&content, &port_update)
                .map_err(|_| settings_io("server.properties could not be updated."))?
                .into_bytes(),
        )
    } else {
        None
    };

    let properties_changed = patched_properties
        .as_deref()
        .zip(original_properties.as_deref())
        .is_some_and(|(patched, original)| patched != original);
    if properties_changed {
        managed_files::atomic_write(
            &properties_path,
            patched_properties.as_deref().unwrap_or_default(),
        )
        .map_err(|_| settings_io("server.properties could not be written."))?;
    }

    if let Err(_error) = registry.update_servers(&[updated_server.clone()]) {
        if properties_changed {
            if let Some(original) = original_properties.as_deref() {
                if managed_files::atomic_write(&properties_path, original).is_err() {
                    return Err(settings_io(
                        "The registry save failed and server.properties could not be restored.",
                    ));
                }
            }
        }
        return Err(CoreError::new(
            CoreErrorCode::ServerSettingsRegistry,
            "Could not save the server registry.",
        ));
    }

    Ok(ServerSettingsSaveResult {
        settings: result_settings,
        restart_required,
    })
}

fn apply_update(
    server: &mut MinecraftServer,
    settings: &ServerSettingsUpdate,
    original: &ServerSettings,
) {
    server.name = settings.name.trim().to_string();
    server.profile_name = non_empty_trimmed(&settings.profile_name);
    server.group_name = non_empty_trimmed(&settings.group_name);
    server.software = settings.software.trim().to_string();
    server.version = settings.version.trim().to_string();
    server.memory = Number::from(settings.memory_mb);
    server.port = Number::from(settings.port);
    server.java_path.clone_from(&settings.java_path);
    server.jvm_args = non_empty_trimmed(&settings.jvm_args);
    server.auto_restart_on_crash = Some(settings.auto_restart_on_crash);
    server.max_auto_restarts = Some(Number::from(settings.max_auto_restarts));
    server.auto_restart_delay_sec = Some(Number::from(settings.auto_restart_delay_sec));
    server.auto_backup_enabled = Some(settings.auto_backup_enabled);
    server.auto_backup_interval_min = Some(Number::from(settings.auto_backup_interval_min));
    server.auto_backup_schedule_type = Some(
        match settings.auto_backup_schedule_type {
            AutoBackupScheduleType::Interval => "interval",
            AutoBackupScheduleType::Daily => "daily",
            AutoBackupScheduleType::Weekly => "weekly",
        }
        .to_string(),
    );
    server.auto_backup_time = Some(settings.auto_backup_time.trim().to_string());
    server.auto_backup_weekday = Some(Number::from(settings.auto_backup_weekday));
    server.auto_backup_retain_count = Some(Number::from(settings.auto_backup_retain_count));
    server.auto_backup_retain_days = Some(Number::from(settings.auto_backup_retain_days));
    server.backup_restart_after_safe_backup = Some(
        settings
            .backup_restart_after_safe_backup
            .unwrap_or(original.backup_restart_after_safe_backup),
    );
    server.notify_on_crash = Some(settings.notify_on_crash);
    server.notify_on_start = Some(settings.notify_on_start);
    server.notify_on_high_cpu = Some(settings.notify_on_high_cpu);
    server.notify_high_cpu_threshold = Some(Number::from(settings.notify_high_cpu_threshold));
}

fn legacy_update(
    incoming: &MinecraftServer,
    current: &MinecraftServer,
) -> Result<ServerSettingsUpdate, CoreError> {
    let memory_mb = incoming
        .memory
        .as_u64()
        .ok_or_else(|| invalid_memory("Server memory is invalid."))?;
    let port = incoming
        .port
        .as_u64()
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port > 0)
        .ok_or_else(|| invalid_port("Server port must be between 1 and 65535."))?;
    let auto_backup_time = incoming
        .auto_backup_time
        .as_deref()
        .filter(|value| valid_time(value))
        .unwrap_or("03:00")
        .trim()
        .to_string();
    let schedule = match incoming.auto_backup_schedule_type.as_deref() {
        Some("daily") => AutoBackupScheduleType::Daily,
        Some("weekly") => AutoBackupScheduleType::Weekly,
        _ => AutoBackupScheduleType::Interval,
    };

    Ok(ServerSettingsUpdate {
        name: incoming.name.clone(),
        profile_name: incoming.profile_name.clone().unwrap_or_default(),
        group_name: incoming.group_name.clone().unwrap_or_default(),
        software: incoming.software.clone(),
        version: incoming.version.clone(),
        memory_mb,
        port,
        java_path: incoming.java_path.clone(),
        jvm_args: incoming.jvm_args.clone().unwrap_or_default(),
        auto_restart_on_crash: incoming.auto_restart_on_crash.unwrap_or(false),
        max_auto_restarts: bounded_json_number(incoming.max_auto_restarts.as_ref(), 3, 0, 20)
            as u32,
        auto_restart_delay_sec: bounded_json_number(
            incoming.auto_restart_delay_sec.as_ref(),
            5,
            1,
            300,
        ) as u32,
        auto_backup_enabled: incoming.auto_backup_enabled.unwrap_or(false),
        auto_backup_interval_min: bounded_json_number(
            incoming.auto_backup_interval_min.as_ref(),
            60,
            1,
            1440,
        ) as u32,
        auto_backup_schedule_type: schedule,
        auto_backup_time,
        auto_backup_weekday: bounded_json_number(incoming.auto_backup_weekday.as_ref(), 0, 0, 6)
            as u8,
        auto_backup_retain_count: bounded_json_number(
            incoming.auto_backup_retain_count.as_ref(),
            0,
            0,
            999,
        ) as u32,
        auto_backup_retain_days: bounded_json_number(
            incoming.auto_backup_retain_days.as_ref(),
            0,
            0,
            365,
        ) as u32,
        backup_restart_after_safe_backup: incoming
            .backup_restart_after_safe_backup
            .or(current.backup_restart_after_safe_backup),
        notify_on_crash: incoming.notify_on_crash.unwrap_or(true),
        notify_on_start: incoming.notify_on_start.unwrap_or(false),
        notify_on_high_cpu: incoming.notify_on_high_cpu.unwrap_or(false),
        notify_high_cpu_threshold: bounded_json_number(
            incoming.notify_high_cpu_threshold.as_ref(),
            90,
            1,
            100,
        ) as u8,
    })
}

fn read_optional_properties(path: &Path) -> Result<Option<Vec<u8>>, CoreError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(settings_io("server.properties is not a regular file."));
            }
            if metadata.len() > MAX_PROPERTIES_BYTES as u64 {
                return Err(settings_io("server.properties exceeds the supported size."));
            }
            fs::read(path)
                .map(Some)
                .map_err(|_| settings_io("server.properties could not be read."))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(settings_io("server.properties could not be inspected.")),
    }
}

fn restart_affecting_fields_changed(before: &ServerSettings, after: &ServerSettings) -> bool {
    before.software != after.software
        || before.version != after.version
        || before.memory_mb != after.memory_mb
        || before.port != after.port
        || before.java_path != after.java_path
        || before.jvm_args != after.jvm_args
}

fn valid_server_name(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty()
        && name.len() <= 128
        && !name.chars().any(char::is_control)
        && !name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | ':'))
}

fn valid_optional_text(value: &str, max_bytes: usize) -> bool {
    let value = value.trim();
    value.len() <= max_bytes && !value.chars().any(char::is_control)
}

fn valid_time(value: &str) -> bool {
    let value = value.trim();
    let bytes = value.as_bytes();
    bytes.len() == 5
        && bytes[2] == b':'
        && bytes[..2].iter().all(u8::is_ascii_digit)
        && bytes[3..].iter().all(u8::is_ascii_digit)
        && value[..2].parse::<u8>().is_ok_and(|hour| hour <= 23)
        && value[3..].parse::<u8>().is_ok_and(|minute| minute <= 59)
}

fn non_empty_trimmed(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn invalid_request(message: &str) -> CoreError {
    CoreError::new(CoreErrorCode::ServerSettingsInvalidRequest, message)
}

fn invalid_port(message: &str) -> CoreError {
    CoreError::new(CoreErrorCode::ServerSettingsInvalidPort, message)
}

fn invalid_memory(message: &str) -> CoreError {
    CoreError::new(CoreErrorCode::ServerSettingsInvalidMemory, message)
}

fn unmanaged_profile() -> CoreError {
    CoreError::new(
        CoreErrorCode::ServerSettingsUnmanaged,
        "Server settings are outside the managed server folder.",
    )
}

fn settings_io(message: &str) -> CoreError {
    CoreError::new(CoreErrorCode::ServerSettingsIo, message)
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Number};
    use std::fs;
    use tokio::time::{timeout, Duration};

    use super::{
        get_server_settings, update_server_profile, update_server_settings, AutoBackupScheduleType,
        ServerSettings, ServerSettingsUpdate,
    };
    use crate::error::CoreErrorCode;
    use crate::java::SYSTEM_JAVA_SENTINEL;
    use crate::operations::{OperationKind, ServerOperationManager};
    use crate::registry::{MinecraftServer, ServerRegistry};

    fn setup(
        properties: Option<&[u8]>,
    ) -> (tempfile::TempDir, ServerRegistry, ServerOperationManager) {
        setup_with_backup_restart(properties, Some(false))
    }

    fn setup_with_backup_restart(
        properties: Option<&[u8]>,
        backup_restart_after_safe_backup: Option<bool>,
    ) -> (tempfile::TempDir, ServerRegistry, ServerOperationManager) {
        let app_data = tempfile::tempdir().expect("temporary app data directory");
        let server_dir = app_data.path().join("servers/server-1");
        fs::create_dir_all(&server_dir).expect("managed server directory");
        if let Some(properties) = properties {
            fs::write(server_dir.join("server.properties"), properties)
                .expect("server.properties fixture");
        }
        let registry = ServerRegistry::open(app_data.path()).expect("server registry");
        let mut server_json = json!({
            "id": "server-1",
            "name": "Survival",
            "software": "Paper",
            "version": "1.21.4",
            "port": 25565,
            "memory": 2048,
            "path": server_dir.to_string_lossy(),
            "status": "running",
            "customMarker": {"keep": true}
        });
        if let Some(value) = backup_restart_after_safe_backup {
            server_json["backupRestartAfterSafeBackup"] = json!(value);
        }
        let server: MinecraftServer = serde_json::from_value(server_json).expect("server profile");
        registry.add_server(&server).expect("register server");
        (app_data, registry, ServerOperationManager::default())
    }

    fn update_from(settings: &ServerSettings) -> ServerSettingsUpdate {
        ServerSettingsUpdate {
            name: settings.name.clone(),
            profile_name: settings.profile_name.clone(),
            group_name: settings.group_name.clone(),
            software: settings.software.clone(),
            version: settings.version.clone(),
            memory_mb: settings.memory_mb,
            port: settings.port,
            java_path: settings.java_path.clone(),
            jvm_args: settings.jvm_args.clone(),
            auto_restart_on_crash: settings.auto_restart_on_crash,
            max_auto_restarts: settings.max_auto_restarts,
            auto_restart_delay_sec: settings.auto_restart_delay_sec,
            auto_backup_enabled: settings.auto_backup_enabled,
            auto_backup_interval_min: settings.auto_backup_interval_min,
            auto_backup_schedule_type: settings.auto_backup_schedule_type,
            auto_backup_time: settings.auto_backup_time.clone(),
            auto_backup_weekday: settings.auto_backup_weekday,
            auto_backup_retain_count: settings.auto_backup_retain_count,
            auto_backup_retain_days: settings.auto_backup_retain_days,
            backup_restart_after_safe_backup: None,
            notify_on_crash: settings.notify_on_crash,
            notify_on_start: settings.notify_on_start,
            notify_on_high_cpu: settings.notify_on_high_cpu,
            notify_high_cpu_threshold: settings.notify_high_cpu_threshold,
        }
    }

    async fn load(
        app_data: &tempfile::TempDir,
        registry: &ServerRegistry,
        operations: &ServerOperationManager,
    ) -> ServerSettings {
        get_server_settings(
            operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
        )
        .await
        .expect("settings should load")
    }

    #[tokio::test]
    async fn read_model_uses_react_defaults_and_retains_hidden_automation_value() {
        let (app_data, registry, operations) = setup(None);
        let settings = load(&app_data, &registry, &operations).await;

        assert_eq!(settings.server_id, "server-1");
        assert_eq!(
            settings.server_path,
            app_data.path().join("servers/server-1").to_string_lossy()
        );
        assert_eq!(settings.profile_name, "");
        assert_eq!(settings.group_name, "");
        assert_eq!(settings.auto_restart_on_crash, false);
        assert_eq!(settings.max_auto_restarts, 3);
        assert_eq!(settings.auto_restart_delay_sec, 5);
        assert_eq!(settings.auto_backup_enabled, false);
        assert_eq!(settings.auto_backup_interval_min, 60);
        assert_eq!(
            settings.auto_backup_schedule_type,
            AutoBackupScheduleType::Interval
        );
        assert_eq!(settings.auto_backup_time, "03:00");
        assert_eq!(settings.auto_backup_weekday, 0);
        assert_eq!(settings.auto_backup_retain_count, 0);
        assert_eq!(settings.auto_backup_retain_days, 0);
        assert_eq!(settings.backup_restart_after_safe_backup, false);
        assert_eq!(settings.notify_on_crash, true);
        assert_eq!(settings.notify_on_start, false);
        assert_eq!(settings.notify_on_high_cpu, false);
        assert_eq!(settings.notify_high_cpu_threshold, 90);
        assert_eq!(settings.memory_mb, 2048);
        assert_eq!(settings.port, 25565);
        assert_eq!(settings.java_path, None);
    }

    #[tokio::test]
    async fn read_model_defaults_empty_software_java_and_hidden_restart_policy() {
        let (app_data, registry, operations) = setup_with_backup_restart(None, None);
        let mut server = registry.get_servers().unwrap().remove(0);
        server.software.clear();
        server.java_path = Some(String::new());
        registry.update_server(&server).unwrap();
        let settings = load(&app_data, &registry, &operations).await;

        assert_eq!(settings.software, "Paper");
        assert_eq!(settings.java_path, None);
        assert!(settings.backup_restart_after_safe_backup);
    }

    #[tokio::test]
    async fn system_java_setting_round_trips_through_legacy_and_typed_updates() {
        let (app_data, registry, operations) = setup(None);
        let mut profile = registry.get_servers().unwrap().remove(0);
        profile.java_path = Some(SYSTEM_JAVA_SENTINEL.to_string());
        assert!(update_server_profile(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            profile,
        )
        .await
        .expect("the legacy settings command should persist the sentinel"));

        let reopened = ServerRegistry::open(app_data.path()).unwrap();
        let stored = reopened.get_servers().unwrap().remove(0);
        assert_eq!(stored.java_path.as_deref(), Some(SYSTEM_JAVA_SENTINEL));
        let settings = load(&app_data, &reopened, &operations).await;
        assert_eq!(settings.java_path.as_deref(), Some(SYSTEM_JAVA_SENTINEL));

        let mut update = update_from(&settings);
        update.java_path = Some(String::new());
        let saved = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            reopened.clone(),
            settings.server_id,
            update,
        )
        .await
        .expect("the typed settings command should treat empty as Automatic");
        assert!(saved.restart_required);
        assert_eq!(saved.settings.java_path, None);
        assert_eq!(reopened.get_servers().unwrap()[0].java_path, None);
    }

    #[tokio::test]
    async fn legacy_memory_and_empty_version_can_be_loaded_and_repaired() {
        let (app_data, registry, operations) = setup(None);
        let mut server = registry.get_servers().unwrap().remove(0);
        server.software.clear();
        server.version.clear();
        server.memory = Number::from(512);
        server.java_path = Some(String::new());
        registry.update_server(&server).unwrap();

        let current = load(&app_data, &registry, &operations).await;
        assert_eq!(current.software, "Paper");
        assert_eq!(current.version, "");
        assert_eq!(current.memory_mb, 512);
        assert_eq!(current.java_path, None);

        let mut update = update_from(&current);
        update.name = "Imported server".to_string();
        let saved = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
            update,
        )
        .await
        .expect("an unchanged legacy memory value should not block another field");
        assert_eq!(saved.settings.name, "Imported server");
        assert_eq!(saved.settings.version, "");
        assert_eq!(saved.settings.memory_mb, 512);

        let mut repaired = update_from(&saved.settings);
        repaired.memory_mb = 1024;
        let saved = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry,
            "server-1".to_string(),
            repaired,
        )
        .await
        .expect("the legacy memory value should be repairable");
        assert_eq!(saved.settings.memory_mb, 1024);
        assert!(saved.restart_required);
    }

    #[tokio::test]
    async fn typed_validation_rejects_invalid_port_and_memory_without_writes() {
        let (app_data, registry, operations) = setup(None);
        let settings = load(&app_data, &registry, &operations).await;
        let mut invalid_port = update_from(&settings);
        invalid_port.port = 0;
        let error = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
            invalid_port,
        )
        .await
        .expect_err("port zero must be rejected");
        assert_eq!(error.code, CoreErrorCode::ServerSettingsInvalidPort);

        let mut invalid_memory = update_from(&settings);
        invalid_memory.memory_mb = 1023;
        let error = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
            invalid_memory,
        )
        .await
        .expect_err("memory below 1 GiB must be rejected");
        assert_eq!(error.code, CoreErrorCode::ServerSettingsInvalidMemory);
        assert_eq!(registry.get_servers().unwrap()[0].port, Number::from(25565));
        assert!(!app_data
            .path()
            .join("servers/server-1/server.properties")
            .exists());
    }

    #[tokio::test]
    async fn typed_validation_rejects_all_form_ranges_with_server_settings_codes() {
        let (app_data, registry, operations) = setup(None);
        let current = load(&app_data, &registry, &operations).await;
        let invalid_cases: Vec<(ServerSettingsUpdate, CoreErrorCode)> = vec![
            (
                {
                    let mut value = update_from(&current);
                    value.name = "../bad".into();
                    value
                },
                CoreErrorCode::ServerSettingsInvalidName,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.max_auto_restarts = 21;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_restart_delay_sec = 0;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_restart_delay_sec = 301;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_backup_interval_min = 0;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_backup_interval_min = 1441;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_backup_weekday = 7;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_backup_time = "24:00".into();
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_backup_retain_count = 1000;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.auto_backup_retain_days = 366;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.notify_high_cpu_threshold = 0;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.notify_high_cpu_threshold = 101;
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.software = "not-real".into();
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.version = "1.21\n".into();
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
            (
                {
                    let mut value = update_from(&current);
                    value.jvm_args = "-XX:OnError=bad".into();
                    value
                },
                CoreErrorCode::ServerSettingsInvalidRequest,
            ),
        ];

        for (invalid, expected_code) in invalid_cases {
            let error = update_server_settings(
                &operations,
                app_data.path().to_path_buf(),
                registry.clone(),
                "server-1".to_string(),
                invalid,
            )
            .await
            .expect_err("invalid General Settings values must be rejected");
            assert_eq!(error.code, expected_code);
        }
        assert_eq!(registry.get_servers().unwrap()[0].name, "Survival");
    }

    #[tokio::test]
    async fn restart_requirement_only_tracks_process_configuration_fields() {
        #[derive(Clone, Copy)]
        enum ProcessField {
            Software,
            Version,
            Memory,
            Port,
            Java,
            JvmArgs,
        }
        for field in [
            ProcessField::Software,
            ProcessField::Version,
            ProcessField::Memory,
            ProcessField::Port,
            ProcessField::Java,
            ProcessField::JvmArgs,
        ] {
            let (app_data, registry, operations) = setup(None);
            let current = load(&app_data, &registry, &operations).await;
            let mut update = update_from(&current);
            match field {
                ProcessField::Software => update.software = "Vanilla".into(),
                ProcessField::Version => update.version = "1.20.4".into(),
                ProcessField::Memory => update.memory_mb = 3072,
                ProcessField::Port => update.port = 25566,
                ProcessField::Java => update.java_path = Some("java".into()),
                ProcessField::JvmArgs => update.jvm_args = "-XX:+UseZGC".into(),
            }
            let saved = update_server_settings(
                &operations,
                app_data.path().to_path_buf(),
                registry.clone(),
                "server-1".to_string(),
                update,
            )
            .await
            .expect("valid process settings should save");
            assert!(saved.restart_required);
        }
    }

    #[tokio::test]
    async fn port_change_preserves_properties_format_and_returns_restart_requirement() {
        let original = b"\xef\xbb\xbf# Header\r\nserver-port = 25565\r\npvp=true\r\n";
        let (app_data, registry, operations) = setup(Some(original));
        let current = load(&app_data, &registry, &operations).await;
        let mut update = update_from(&current);
        update.port = 25566;
        update.auto_backup_enabled = true;

        let saved = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
            update,
        )
        .await
        .expect("valid settings should save");
        assert!(saved.restart_required);
        assert_eq!(saved.settings.port, 25566);
        assert_eq!(
            fs::read(app_data.path().join("servers/server-1/server.properties")).unwrap(),
            b"\xef\xbb\xbf# Header\r\nserver-port = 25566\r\npvp=true\r\n"
        );
        assert_eq!(registry.get_servers().unwrap()[0].port, Number::from(25566));

        let mut app_only_update = update_from(&saved.settings);
        app_only_update.auto_backup_enabled = false;
        let saved_again = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
            app_only_update,
        )
        .await
        .expect("application-only settings should save");
        assert!(!saved_again.restart_required);
    }

    #[tokio::test]
    async fn port_change_without_properties_file_updates_registry_without_creating_file() {
        let (app_data, registry, operations) = setup(None);
        let mut update = update_from(&load(&app_data, &registry, &operations).await);
        update.port = 25570;
        let saved = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
            update,
        )
        .await
        .expect("settings without server.properties should save");

        assert_eq!(saved.settings.port, 25570);
        assert!(saved.restart_required);
        assert_eq!(registry.get_servers().unwrap()[0].port, Number::from(25570));
        assert!(!app_data
            .path()
            .join("servers/server-1/server.properties")
            .exists());
    }

    #[tokio::test]
    async fn non_port_save_does_not_parse_malformed_server_properties() {
        let (app_data, registry, operations) = setup(Some(b"not-a-property\r\n"));
        let mut update = update_from(&load(&app_data, &registry, &operations).await);
        update.name = "Renamed".to_string();
        let saved = update_server_settings(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            "server-1".to_string(),
            update,
        )
        .await
        .expect("a name-only update should not inspect server.properties");
        assert_eq!(saved.settings.name, "Renamed");
        assert!(!saved.restart_required);
        assert_eq!(
            fs::read(app_data.path().join("servers/server-1/server.properties")).unwrap(),
            b"not-a-property\r\n"
        );
    }

    #[tokio::test]
    async fn legacy_update_preserves_runtime_and_extra_fields_and_rejects_invalid_memory() {
        let (app_data, registry, operations) = setup(None);
        let mut incoming = registry.get_servers().unwrap().remove(0);
        incoming.name = "Updated name".to_string();
        incoming.status = "offline".to_string();
        incoming.path = app_data
            .path()
            .join("outside")
            .to_string_lossy()
            .to_string();
        incoming
            .extra
            .insert("customMarker".to_string(), json!(false));
        assert!(update_server_profile(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            incoming.clone(),
        )
        .await
        .expect("legacy update should succeed"));

        let saved = registry.get_servers().unwrap().remove(0);
        assert_eq!(saved.name, "Updated name");
        assert_eq!(saved.status, "offline");
        assert_eq!(
            saved.path,
            app_data.path().join("servers/server-1").to_string_lossy()
        );
        assert_eq!(
            saved.extra.get("customMarker"),
            Some(&json!({"keep": true}))
        );
        assert_eq!(saved.backup_restart_after_safe_backup, Some(false));

        let before = saved.clone();
        let mut invalid = incoming;
        invalid.memory = Number::from(0);
        let error = update_server_profile(
            &operations,
            app_data.path().to_path_buf(),
            registry.clone(),
            invalid,
        )
        .await
        .expect_err("invalid legacy memory must be rejected");
        assert_eq!(error.code, CoreErrorCode::ServerSettingsInvalidMemory);
        assert_eq!(registry.get_servers().unwrap()[0].name, before.name);
    }

    #[tokio::test]
    async fn update_waits_for_the_shared_server_operation_lock() {
        let (app_data, registry, operations) = setup(None);
        let current = load(&app_data, &registry, &operations).await;
        let update = update_from(&current);
        let guard = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("hold the server lock");
        let operations_for_task = operations.clone();
        let app_data_for_task = app_data.path().to_path_buf();
        let registry_for_task = registry.clone();
        let mut task = tokio::spawn(async move {
            update_server_settings(
                &operations_for_task,
                app_data_for_task,
                registry_for_task,
                "server-1".to_string(),
                update,
            )
            .await
        });
        assert!(timeout(Duration::from_millis(30), &mut task).await.is_err());
        drop(guard);
        timeout(Duration::from_secs(2), task)
            .await
            .expect("update should resume after lock release")
            .expect("update task should complete")
            .expect("update should succeed");
    }
}
