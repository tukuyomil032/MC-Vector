//! Swift-facing API of the MC-Vector core (NAT-004 / API-001).
//!
//! Only typed records, enums and functions cross this boundary; Tauri command
//! names and JSON values never do. Every failure is `FfiError::Core`, which the
//! hand-written Swift layer turns into `CoreError { code, message, retryable }`.
//!
//! Data access is only possible after `start` has taken the cross-edition
//! instance lock (NAT-010): `start` stores the lock and the opened registry in
//! process-wide state, and every other function reads that state.

mod jar_upgrade;
mod java_runtimes;
mod plugins;
pub use jar_upgrade::*;
pub use java_runtimes::*;
pub use plugins::*;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use mcvector_core::backups::{
    self, auto as auto_backups, BackupOrigin as CoreBackupOrigin, BackupRecord as CoreBackupRecord,
    BackupRetentionReport as CoreBackupRetentionReport,
    CreateBackupRequest as CoreCreateBackupRequest,
};
use mcvector_core::console_line;
use mcvector_core::download::CancelFlag;
use mcvector_core::error::{CoreError, CoreErrorCode};
use mcvector_core::eula::{self, EULA_REQUIRED_ERROR};
use mcvector_core::instance_lock::{self, InstanceLock, LockOutcome, LockOwner};
use mcvector_core::lifecycle;
use mcvector_core::managed_files::{self, FilesErrorKind};
use mcvector_core::managed_path::{
    resolve_managed_request, validate_server_id, ManagedPathRequest, ManagedRoot,
};
use mcvector_core::metric_history::MetricHistorySnapshot;
use mcvector_core::operations::OperationKind;
use mcvector_core::operations::ServerOperationManager;
use mcvector_core::paths;
use mcvector_core::players::{
    PlayerEntry as CorePlayerEntry, PlayerListAction as CorePlayerListAction, PlayerListError,
    PlayerListErrorKind, PlayerListMutation,
    PlayerListMutationResult as CorePlayerListMutationResult,
    PlayerListSnapshot as CorePlayerListSnapshot, PlayerListType as CorePlayerListType,
};
use mcvector_core::properties::{
    PropertiesError, PropertiesErrorKind, PropertyEntry as CorePropertyEntry,
    PropertyLineEnding as CorePropertyLineEnding,
    ServerPropertiesSnapshot as CoreServerPropertiesSnapshot,
};
use mcvector_core::registry::{
    template_from_server, MinecraftServer, ServerRegistry, ServerTemplate,
};
use mcvector_core::server_creation::{self, CreationEvent, NewServerRequest};
use mcvector_core::server_import::ImportManager;
use mcvector_core::server_jar;
use mcvector_core::server_process::{
    self, CommandLimiter, LogStream, ServerContext, ServerEvents, ServerLogEvent, ServerManager,
    ServerStatsEvent, ServerStatus, ServerStatusEvent,
};
use mcvector_core::server_settings::{
    self, AutoBackupScheduleType as CoreAutoBackupScheduleType,
    ServerSettings as CoreServerSettings, ServerSettingsSaveResult as CoreServerSettingsSaveResult,
    ServerSettingsUpdate as CoreServerSettingsUpdate,
};

uniffi::setup_scaffolding!();

/// Bundle identifier of the Native edition (NAT-009).
pub const NATIVE_BUNDLE_ID: &str = "com.tukuyomi032.mcvector.native";

// ---------------------------------------------------------------------------
// Errors

/// The single error type of the Swift API. UniFFI errors must be enums, so the
/// structured CoreError travels as the one `Core` variant.
#[derive(Debug, uniffi::Error)]
pub enum FfiError {
    Core {
        code: String,
        message: String,
        retryable: bool,
    },
}

impl std::fmt::Display for FfiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let FfiError::Core { code, message, .. } = self;
        write!(f, "{code}: {message}")
    }
}

impl std::error::Error for FfiError {}

impl From<CoreError> for FfiError {
    fn from(error: CoreError) -> Self {
        FfiError::Core {
            code: error.code.as_str().to_string(),
            message: error.message,
            retryable: error.retryable,
        }
    }
}

fn core_error(code: CoreErrorCode, message: impl Into<String>) -> FfiError {
    CoreError::new(code, message).into()
}

// ---------------------------------------------------------------------------
// Startup and the instance lock

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum Edition {
    Tauri,
    Native,
}

impl From<instance_lock::Edition> for Edition {
    fn from(edition: instance_lock::Edition) -> Self {
        match edition {
            instance_lock::Edition::Tauri => Edition::Tauri,
            instance_lock::Edition::Native => Edition::Native,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct LockOwnerInfo {
    pub edition: Edition,
    pub pid: u32,
    pub bundle_id: String,
    pub bundle_path: String,
    pub started_at_ms: u64,
}

impl From<LockOwner> for LockOwnerInfo {
    fn from(owner: LockOwner) -> Self {
        Self {
            edition: owner.edition.into(),
            pid: owner.pid,
            bundle_id: owner.bundle_id,
            bundle_path: owner.bundle_path,
            started_at_ms: owner.started_at_ms,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Enum)]
pub enum StartOutcome {
    /// The lock is held by this process and the registry is open.
    Ready { data_dir: String },
    /// Another MC-Vector holds the lock. `owner` is None when its metadata
    /// could not be read. Nothing in the data directory was touched.
    HeldByOther { owner: Option<LockOwnerInfo> },
}

struct Session {
    // Held only to keep the lock until the process exits.
    _lock: InstanceLock,
    data_dir: PathBuf,
    registry: ServerRegistry,
    /// Serializes mutations per server, like the Tauri edition's operation manager.
    operations: ServerOperationManager,
}

/// Clones of the session handles, so async work never holds the session mutex.
fn session_handles() -> Result<(PathBuf, ServerRegistry, ServerOperationManager), FfiError> {
    let session = lock_session()?;
    let session = session.as_ref().ok_or_else(|| {
        core_error(
            CoreErrorCode::CoreNotStarted,
            "The core has not been started.",
        )
    })?;
    Ok((
        session.data_dir.clone(),
        session.registry.clone(),
        session.operations.clone(),
    ))
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

/// Takes the instance lock in the shared data root and opens the server
/// registry. Debug builds use the `.debug` data root shared with the Tauri
/// debug build, so development never touches release data (DATA-001).
///
/// `debug_data_dir_override` is honored only when `debug_build` is true. The
/// Native capture tooling uses it to point the app at fixture data inside
/// native/.build; release builds always use the shared root.
///
/// Calling it again after it returned `Ready` returns `Ready` without
/// reopening anything.
#[uniffi::export]
pub fn start(
    debug_build: bool,
    bundle_path: String,
    debug_data_dir_override: Option<String>,
) -> Result<StartOutcome, FfiError> {
    let override_dir = debug_data_dir_override
        .filter(|dir| debug_build && !dir.is_empty())
        .map(PathBuf::from);
    let data_dir = match override_dir {
        Some(dir) => dir,
        None => {
            let identifier = if debug_build {
                paths::DEBUG_DATA_IDENTIFIER
            } else {
                paths::SHARED_DATA_IDENTIFIER
            };
            paths::data_dir_for(identifier).ok_or_else(|| {
                core_error(
                    CoreErrorCode::PathAppDataUnavailable,
                    "The application data folder could not be determined.",
                )
            })?
        }
    };
    start_in(data_dir, bundle_path)
}

/// The UI locale saved in config.json by either edition (`"en"` or `"ja"`),
/// or None to follow the system language (NAT-008). Requires `start`.
#[uniffi::export]
pub fn config_locale() -> Result<Option<String>, FfiError> {
    let session = lock_session()?;
    let session = session.as_ref().ok_or_else(|| {
        core_error(
            CoreErrorCode::CoreNotStarted,
            "The core has not been started.",
        )
    })?;
    Ok(mcvector_core::config::locale(&session.data_dir))
}

// ---------------------------------------------------------------------------
// App settings (shared config.json keys; UI-015)

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct AppSettings {
    /// `"en"`, `"ja"`, or None to follow the system language.
    pub locale: Option<String>,
    /// `"stable"` or `"beta"`.
    pub update_channel: String,
    pub allow_unverified_plugin_downloads: bool,
}

fn config_error(error: String, data_dir: &std::path::Path) -> FfiError {
    core_error(CoreErrorCode::ConfigWriteFailed, redact(&error, data_dir))
}

#[uniffi::export]
pub fn get_app_settings() -> Result<AppSettings, FfiError> {
    let (data_dir, _, _) = session_handles()?;
    let settings = mcvector_core::config::app_settings(&data_dir)
        .map_err(|error| config_error(error, &data_dir))?;
    Ok(AppSettings {
        locale: settings.locale,
        update_channel: settings.update_channel,
        allow_unverified_plugin_downloads: settings.allow_unverified_plugin_downloads,
    })
}

#[uniffi::export]
pub fn set_locale(locale: String) -> Result<(), FfiError> {
    let (data_dir, _, _) = session_handles()?;
    mcvector_core::config::set_locale(&data_dir, &locale)
        .map_err(|error| config_error(error, &data_dir))
}

#[uniffi::export]
pub fn set_update_channel(channel: String) -> Result<(), FfiError> {
    let (data_dir, _, _) = session_handles()?;
    mcvector_core::config::set_update_channel(&data_dir, &channel)
        .map_err(|error| config_error(error, &data_dir))
}

#[uniffi::export]
pub fn set_allow_unverified_plugin_downloads(enabled: bool) -> Result<(), FfiError> {
    let (data_dir, _, _) = session_handles()?;
    mcvector_core::config::set_allow_unverified_plugin_downloads(&data_dir, enabled)
        .map_err(|error| config_error(error, &data_dir))
}

fn start_in(data_dir: PathBuf, bundle_path: String) -> Result<StartOutcome, FfiError> {
    let mut session = lock_session()?;
    if session.is_some() {
        return Ok(StartOutcome::Ready {
            data_dir: data_dir.display().to_string(),
        });
    }

    let owner = LockOwner::current(
        instance_lock::Edition::Native,
        NATIVE_BUNDLE_ID,
        bundle_path,
    );
    let lock = match instance_lock::acquire(&data_dir, &owner) {
        Ok(LockOutcome::Acquired(lock)) => lock,
        Ok(LockOutcome::HeldByOther(other)) => {
            return Ok(StartOutcome::HeldByOther {
                owner: other.map(Into::into),
            });
        }
        Err(error) => {
            return Err(core_error(
                CoreErrorCode::LockUnavailable,
                format!("The instance lock could not be taken: {}.", error.kind()),
            ));
        }
    };

    let registry = ServerRegistry::open(&data_dir).map_err(|error| {
        core_error(
            CoreErrorCode::RegistryOpenFailed,
            format!(
                "The server registry could not be opened: {}",
                redact(&error, &data_dir)
            ),
        )
    })?;

    if let Some(failure) = mcvector_core::plugins::installer::recover_startup(&data_dir, &registry)
        .into_iter()
        .find(|failure| failure.server_id.is_none())
    {
        return Err(core_error(
            CoreErrorCode::PluginIo,
            redact(&failure.error, &data_dir),
        ));
    }
    // Interrupted server jar upgrades are finished or undone before any
    // server can start; a server that cannot be recovered is marked
    // unavailable (and the failure logged) by the core, so startup continues.
    let _deferred = mcvector_core::server_upgrade::recover_startup(&data_dir, &registry);
    *session = Some(Session {
        _lock: lock,
        data_dir: data_dir.clone(),
        registry,
        operations: ServerOperationManager::default(),
    });
    Ok(StartOutcome::Ready {
        data_dir: data_dir.display().to_string(),
    })
}

fn lock_session() -> Result<std::sync::MutexGuard<'static, Option<Session>>, FfiError> {
    SESSION
        .lock()
        .map_err(|_| core_error(CoreErrorCode::InternalUnknown, "Core state is poisoned."))
}

/// Error messages must not contain absolute local paths (NAT-005).
fn redact(message: &str, data_dir: &std::path::Path) -> String {
    message.replace(&data_dir.display().to_string(), "<data>")
}

// ---------------------------------------------------------------------------
// Servers (OP-SRV-001)

/// What the Native UI needs to list servers. Numeric JSON fields are converted
/// here so Swift never sees raw JSON (API-001).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ServerProfile {
    pub id: String,
    pub name: String,
    pub profile_name: Option<String>,
    pub group_name: Option<String>,
    pub version: String,
    pub software: String,
    pub port: Option<i64>,
    /// Heap size in megabytes, as stored in the registry (`memoryGb * 1024` at creation).
    pub memory_mb: Option<u64>,
    /// The managed server folder. Shown in the delete confirmation, as in React.
    pub path: String,
    pub status: String,
    pub java_path: Option<String>,
    pub unavailable_reason: Option<String>,
    /// OS notification when CPU stays high (React `notifyOnHighCpu`).
    pub notify_on_high_cpu: bool,
    /// Percent; React's default is 90.
    pub notify_high_cpu_threshold: Option<f64>,
}

impl From<MinecraftServer> for ServerProfile {
    fn from(server: MinecraftServer) -> Self {
        Self {
            id: server.id,
            name: server.name,
            profile_name: server.profile_name,
            group_name: server.group_name,
            version: server.version,
            software: server.software,
            port: server.port.as_i64(),
            memory_mb: server.memory.as_u64(),
            path: server.path,
            status: server.status,
            java_path: server.java_path,
            unavailable_reason: server.unavailable_reason,
            notify_on_high_cpu: server.notify_on_high_cpu.unwrap_or(false),
            notify_high_cpu_threshold: server
                .notify_high_cpu_threshold
                .as_ref()
                .and_then(|value| value.as_f64()),
        }
    }
}

/// Lists registered servers. Requires a successful `start`.
#[uniffi::export]
pub fn get_servers() -> Result<Vec<ServerProfile>, FfiError> {
    let session = lock_session()?;
    let session = session.as_ref().ok_or_else(|| {
        core_error(
            CoreErrorCode::CoreNotStarted,
            "The core has not been started.",
        )
    })?;
    let servers = session.registry.get_servers().map_err(|error| {
        core_error(
            CoreErrorCode::RegistryReadFailed,
            format!("The server list could not be read: {error}"),
        )
    })?;
    Ok(servers.into_iter().map(Into::into).collect())
}

// ---------------------------------------------------------------------------
// Server general settings (UI-014)

/// The backup schedule selected in the server's general settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum AutoBackupScheduleType {
    Interval,
    Daily,
    Weekly,
}

impl From<CoreAutoBackupScheduleType> for AutoBackupScheduleType {
    fn from(schedule: CoreAutoBackupScheduleType) -> Self {
        match schedule {
            CoreAutoBackupScheduleType::Interval => Self::Interval,
            CoreAutoBackupScheduleType::Daily => Self::Daily,
            CoreAutoBackupScheduleType::Weekly => Self::Weekly,
        }
    }
}

impl From<AutoBackupScheduleType> for CoreAutoBackupScheduleType {
    fn from(schedule: AutoBackupScheduleType) -> Self {
        match schedule {
            AutoBackupScheduleType::Interval => Self::Interval,
            AutoBackupScheduleType::Daily => Self::Daily,
            AutoBackupScheduleType::Weekly => Self::Weekly,
        }
    }
}

/// Typed Native view of all per-server general settings.
///
/// Software and version are editable metadata here; jar upgrades still use
/// their separate version-upgrade operation. `server_path` is read-only.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ServerSettings {
    pub server_id: String,
    pub server_path: String,
    pub name: String,
    pub profile_name: String,
    pub group_name: String,
    pub software: String,
    pub version: String,
    pub memory_mb: u64,
    pub port: u16,
    /// `None` selects Java automatically. Use the system Java sentinel to force PATH.
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
    pub backup_restart_after_safe_backup: bool,
    pub notify_on_crash: bool,
    pub notify_on_start: bool,
    pub notify_on_high_cpu: bool,
    pub notify_high_cpu_threshold: u8,
}

impl From<CoreServerSettings> for ServerSettings {
    fn from(settings: CoreServerSettings) -> Self {
        Self {
            server_id: settings.server_id,
            server_path: settings.server_path,
            name: settings.name,
            profile_name: settings.profile_name,
            group_name: settings.group_name,
            software: settings.software,
            version: settings.version,
            memory_mb: settings.memory_mb,
            port: settings.port,
            java_path: settings.java_path,
            jvm_args: settings.jvm_args,
            auto_restart_on_crash: settings.auto_restart_on_crash,
            max_auto_restarts: settings.max_auto_restarts,
            auto_restart_delay_sec: settings.auto_restart_delay_sec,
            auto_backup_enabled: settings.auto_backup_enabled,
            auto_backup_interval_min: settings.auto_backup_interval_min,
            auto_backup_schedule_type: settings.auto_backup_schedule_type.into(),
            auto_backup_time: settings.auto_backup_time,
            auto_backup_weekday: settings.auto_backup_weekday,
            auto_backup_retain_count: settings.auto_backup_retain_count,
            auto_backup_retain_days: settings.auto_backup_retain_days,
            backup_restart_after_safe_backup: settings.backup_restart_after_safe_backup,
            notify_on_crash: settings.notify_on_crash,
            notify_on_start: settings.notify_on_start,
            notify_on_high_cpu: settings.notify_on_high_cpu,
            notify_high_cpu_threshold: settings.notify_high_cpu_threshold,
        }
    }
}

/// Full update to the editable general-settings fields.
///
/// `backup_restart_after_safe_backup` is optional because the current React
/// form does not expose it; `None` preserves the stored value.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
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

impl ServerSettingsUpdate {
    fn into_core(self) -> CoreServerSettingsUpdate {
        CoreServerSettingsUpdate {
            name: self.name,
            profile_name: self.profile_name,
            group_name: self.group_name,
            software: self.software,
            version: self.version,
            memory_mb: self.memory_mb,
            port: self.port,
            java_path: self.java_path,
            jvm_args: self.jvm_args,
            auto_restart_on_crash: self.auto_restart_on_crash,
            max_auto_restarts: self.max_auto_restarts,
            auto_restart_delay_sec: self.auto_restart_delay_sec,
            auto_backup_enabled: self.auto_backup_enabled,
            auto_backup_interval_min: self.auto_backup_interval_min,
            auto_backup_schedule_type: self.auto_backup_schedule_type.into(),
            auto_backup_time: self.auto_backup_time,
            auto_backup_weekday: self.auto_backup_weekday,
            auto_backup_retain_count: self.auto_backup_retain_count,
            auto_backup_retain_days: self.auto_backup_retain_days,
            backup_restart_after_safe_backup: self.backup_restart_after_safe_backup,
            notify_on_crash: self.notify_on_crash,
            notify_on_start: self.notify_on_start,
            notify_on_high_cpu: self.notify_on_high_cpu,
            notify_high_cpu_threshold: self.notify_high_cpu_threshold,
        }
    }
}

/// Result of saving settings, including whether the new values need a restart.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ServerSettingsSaveResult {
    pub settings: ServerSettings,
    pub restart_required: bool,
}

impl From<CoreServerSettingsSaveResult> for ServerSettingsSaveResult {
    fn from(result: CoreServerSettingsSaveResult) -> Self {
        Self {
            settings: result.settings.into(),
            restart_required: result.restart_required,
        }
    }
}

/// Reads the typed general settings for one registered server.
#[uniffi::export(async_runtime = "tokio")]
pub async fn get_server_settings(server_id: String) -> Result<ServerSettings, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    Ok(
        server_settings::get_server_settings(&operations, data_dir, registry, server_id)
            .await?
            .into(),
    )
}

/// Saves the typed general settings for one registered server.
#[uniffi::export(async_runtime = "tokio")]
pub async fn update_server_settings(
    server_id: String,
    settings: ServerSettingsUpdate,
) -> Result<ServerSettingsSaveResult, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    Ok(server_settings::update_server_settings(
        &operations,
        data_dir,
        registry,
        server_id,
        settings.into_core(),
    )
    .await?
    .into())
}

// ---------------------------------------------------------------------------
// Server management (OP-SRV-004, OP-SRV-015, OP-SRV-016)

/// Clone and delete refuse running servers. The instance lock keeps the Tauri
/// edition from running any, so this process's manager is the whole truth.
async fn server_is_running(server_id: String) -> bool {
    SERVERS.is_server_running(&server_id).await
}

/// Maps the core's String errors to structured codes. "running" errors get their
/// own code so the UI can show the "stop it first" message.
fn server_error(error: String, data_dir: &std::path::Path) -> FfiError {
    let code = if error.contains("running server") {
        CoreErrorCode::ServerRunning
    } else {
        CoreErrorCode::ServerOperationFailed
    };
    core_error(code, redact(&error, data_dir))
}

/// Copies a stopped server's managed folder and registers the copy as `name`.
#[uniffi::export(async_runtime = "tokio")]
pub async fn clone_server(
    source_server_id: String,
    name: String,
) -> Result<ServerProfile, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    lifecycle::clone_server(
        &data_dir,
        &registry,
        &operations,
        server_is_running,
        &source_server_id,
        &name,
    )
    .await
    .map(Into::into)
    .map_err(|error| server_error(error, &data_dir))
}

/// Deletes a stopped server and its managed folder. False when nothing was removed.
#[uniffi::export(async_runtime = "tokio")]
pub async fn delete_server(server_id: String) -> Result<bool, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    lifecycle::delete_server(
        &data_dir,
        &registry,
        &operations,
        server_is_running,
        &server_id,
    )
    .await
    .map_err(|error| server_error(error, &data_dir))
}

/// Saves the server's settings as a new template named `name`
/// (React `buildTemplateFromServer` + `save_server_template`).
#[uniffi::export(async_runtime = "tokio")]
pub async fn save_server_template_from_server(
    server_id: String,
    name: String,
) -> Result<(), FfiError> {
    let (data_dir, registry, _) = session_handles()?;
    let result = tokio::task::spawn_blocking(move || {
        let server = registry
            .get_servers()?
            .into_iter()
            .find(|server| server.id == server_id)
            .ok_or_else(|| "Server is not registered".to_string())?;
        let template = template_from_server(&server, uuid::Uuid::new_v4().to_string(), name);
        registry.save_server_template(&template)
    })
    .await
    .map_err(|error| error.to_string())
    .and_then(|result| result);
    result.map_err(|error| server_error(error, &data_dir))
}

// ---------------------------------------------------------------------------
// Server creation (OP-SRV-002)

/// Sets the User-Agent for provider requests, for example from the bundle's
/// `CFBundleShortVersionString`. Call once at startup.
#[uniffi::export]
pub fn set_app_version(version: String) {
    mcvector_core::download::set_user_agent(format!(
        "MC-Vector-Native/{} (https://github.com/tukuyomil032/MC-Vector)",
        version.trim()
    ));
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum SoftwareGroup {
    Standard,
    Modded,
    Proxy,
}

/// One software choice of the add-server form, in display order.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct SoftwareOption {
    pub name: String,
    pub group: SoftwareGroup,
    /// True when MC-Vector downloads and verifies the jar itself.
    pub automatic_jar: bool,
}

/// The software choices of the add-server form.
#[uniffi::export]
pub fn software_options() -> Vec<SoftwareOption> {
    server_creation::SOFTWARE_OPTIONS
        .iter()
        .map(|option| SoftwareOption {
            name: option.name.to_string(),
            group: match option.group {
                server_creation::SoftwareGroup::Standard => SoftwareGroup::Standard,
                server_creation::SoftwareGroup::Modded => SoftwareGroup::Modded,
                server_creation::SoftwareGroup::Proxy => SoftwareGroup::Proxy,
            },
            automatic_jar: server_jar::supports_automatic_install(option.name),
        })
        .collect()
}

/// The add-server name rule (trimmed `[A-Za-z0-9_-]`, 1–128 bytes), so the
/// form validates exactly like the core.
#[uniffi::export]
pub fn is_valid_server_name(name: String) -> bool {
    server_creation::is_valid_server_name(&name)
}

/// A saved template, with the fields the add-server form fills from it.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ServerTemplateInfo {
    pub id: String,
    pub name: String,
    pub profile_name: Option<String>,
    pub group_name: Option<String>,
    pub version: String,
    pub software: String,
    pub port: Option<i64>,
    pub memory_mb: Option<u64>,
}

impl From<&ServerTemplate> for ServerTemplateInfo {
    fn from(template: &ServerTemplate) -> Self {
        Self {
            id: template.id.clone(),
            name: template.name.clone(),
            profile_name: template.profile_name.clone(),
            group_name: template.group_name.clone(),
            version: template.version.clone(),
            software: template.software.clone(),
            port: template.port.as_i64(),
            memory_mb: template.memory.as_u64(),
        }
    }
}

/// Saved server templates.
#[uniffi::export]
pub fn server_templates() -> Result<Vec<ServerTemplateInfo>, FfiError> {
    let (_, registry, _) = session_handles()?;
    let templates = registry.get_server_templates().map_err(|error| {
        core_error(
            CoreErrorCode::RegistryReadFailed,
            format!("The templates could not be read: {error}"),
        )
    })?;
    Ok(templates.iter().map(Into::into).collect())
}

/// What the add-server form sends.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct NewServerInput {
    /// A UUID chosen by the caller; pass it to `cancel_server_creation`.
    pub operation_id: String,
    pub name: String,
    pub profile_name: Option<String>,
    pub group_name: Option<String>,
    pub software: String,
    pub version: String,
    pub port: u32,
    pub memory_gb: u32,
    /// The template the form was filled from. Its Java path, auto-restart and
    /// auto-backup settings are copied too, as React does.
    pub template_id: Option<String>,
    /// From `begin_server_import`: copy that folder instead of downloading a jar.
    /// The name may then use any characters except path separators, and the
    /// version may be empty.
    pub import_token: Option<String>,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct CreatedServerInfo {
    pub server: ServerProfile,
    /// False when the user must place the server jar by hand.
    pub jar_installed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum CreationStage {
    /// Looking up the official download.
    Resolving,
    /// Downloading the jar; `percent` is None while the size is unknown.
    Downloading { percent: Option<u32> },
    /// Saving the new server.
    Finishing,
}

/// Receives creation progress. Called from a background thread.
#[uniffi::export(with_foreign)]
pub trait CreationObserver: Send + Sync {
    fn on_stage(&self, stage: CreationStage);
}

static CREATIONS: Mutex<Option<HashMap<String, CancelFlag>>> = Mutex::new(None);

fn with_creations<T>(update: impl FnOnce(&mut HashMap<String, CancelFlag>) -> T) -> T {
    let mut creations = CREATIONS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    update(creations.get_or_insert_with(HashMap::new))
}

fn apply_template(request: &mut NewServerRequest, template: &ServerTemplate) {
    macro_rules! number {
        ($field:expr) => {
            $field
                .as_ref()
                .and_then(|value| value.as_u64())
                .and_then(|value| u32::try_from(value).ok())
        };
    }
    request.java_path = template.java_path.clone();
    request.auto_restart_on_crash = template.auto_restart_on_crash;
    request.max_auto_restarts = number!(template.max_auto_restarts);
    request.auto_restart_delay_sec = number!(template.auto_restart_delay_sec);
    request.auto_backup_enabled = template.auto_backup_enabled;
    request.auto_backup_interval_min = number!(template.auto_backup_interval_min);
    request.auto_backup_schedule_type = template.auto_backup_schedule_type.clone();
    request.auto_backup_time = template.auto_backup_time.clone();
    request.auto_backup_weekday = number!(template.auto_backup_weekday);
}

/// Creates a server: validates, makes its folder, downloads and verifies the
/// jar when possible, and registers it. On failure or cancellation nothing is
/// left behind.
#[uniffi::export(async_runtime = "tokio")]
pub async fn create_server(
    input: NewServerInput,
    observer: Arc<dyn CreationObserver>,
) -> Result<CreatedServerInfo, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let operation_id = server_creation::validate_operation_id(&input.operation_id)?;

    let mut request = NewServerRequest {
        operation_id: operation_id.clone(),
        name: input.name,
        profile_name: input.profile_name,
        group_name: input.group_name,
        version: input.version,
        software: input.software,
        port: input.port,
        memory_gb: input.memory_gb,
        import_token: input.import_token.clone(),
        ..NewServerRequest::default()
    };
    if let Some(template_id) = input.template_id {
        let template = registry
            .get_server_templates()
            .map_err(|error| core_error(CoreErrorCode::RegistryReadFailed, error))?
            .into_iter()
            .find(|template| template.id == template_id);
        if let Some(template) = template {
            apply_template(&mut request, &template);
        }
    }

    let cancel = CancelFlag::new();
    let import_step = input
        .import_token
        .filter(|token| !token.trim().is_empty())
        .map(|token| IMPORTS.import_step(token, Some(cancel.clone())));
    with_creations(|creations| creations.insert(operation_id.clone(), cancel.clone()));
    let progress = move |event: CreationEvent| {
        observer.on_stage(match event {
            CreationEvent::Resolving => CreationStage::Resolving,
            CreationEvent::Downloading { percent } => CreationStage::Downloading { percent },
            CreationEvent::Finishing => CreationStage::Finishing,
        });
    };
    let result = server_creation::create_server(
        &data_dir,
        &registry,
        &operations,
        request,
        import_step,
        &progress,
        Some(&cancel),
    )
    .await;
    with_creations(|creations| creations.remove(&operation_id));

    result
        .map(|created| CreatedServerInfo {
            server: created.server.into(),
            jar_installed: created.jar_installed,
        })
        .map_err(|error| {
            FfiError::from(CoreError {
                message: redact(&error.message, &data_dir),
                ..error
            })
        })
}

/// Cancels a running `create_server`. Returns false when no creation with
/// that ID is running (for example, it already finished).
#[uniffi::export]
pub fn cancel_server_creation(operation_id: String) -> bool {
    with_creations(|creations| {
        creations
            .get(operation_id.trim())
            .map(CancelFlag::cancel)
            .is_some()
    })
}

// ---------------------------------------------------------------------------
// Server import (OP-SRV-003)

/// Picked folders waiting to be imported. Process-wide, like the Tauri state.
static IMPORTS: LazyLock<ImportManager> = LazyLock::new(ImportManager::default);

/// What MC-Vector found in a picked server folder.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ImportAnalysisInfo {
    /// Pass to `create_server` as `import_token`, or to `cancel_server_import`.
    pub token: String,
    pub folder_name: String,
    pub jar_name: Option<String>,
    /// None when the jar name does not name a known software.
    pub detected_software: Option<String>,
    pub detected_version: Option<String>,
    /// `server-port` from `server.properties`.
    pub detected_port: Option<u32>,
    pub eula_accepted: bool,
}

/// Analyzes a folder the user picked (it is not copied yet). The folder path
/// stays in the core; the returned token refers to it for 30 minutes.
#[uniffi::export(async_runtime = "tokio")]
pub async fn begin_server_import(path: String) -> Result<ImportAnalysisInfo, FfiError> {
    let (data_dir, _, _) = session_handles()?;
    let source = PathBuf::from(path);
    let analysis = tokio::task::spawn_blocking(move || IMPORTS.begin(&source))
        .await
        .map_err(|error| core_error(CoreErrorCode::InternalUnknown, error.to_string()))?
        .map_err(|error| {
            FfiError::from(CoreError {
                message: redact(&error.message, &data_dir),
                ..error
            })
        })?;
    Ok(ImportAnalysisInfo {
        token: analysis.token,
        folder_name: analysis.folder_name,
        jar_name: analysis.jar_name,
        detected_software: analysis.detected_software,
        detected_version: analysis.detected_version,
        detected_port: analysis.detected_port,
        eula_accepted: analysis.eula_accepted,
    })
}

/// Forgets a picked folder. Unknown tokens are ignored.
#[uniffi::export]
pub fn cancel_server_import(token: String) {
    IMPORTS.cancel(&token);
}

// ---------------------------------------------------------------------------
// Running servers (OP-SRV-005..008)

/// Running servers of this process.
static SERVERS: LazyLock<ServerManager> = LazyLock::new(|| {
    let manager = ServerManager::default();
    // Native does not consume the private status channel yet, so drop its
    // receiver instead of letting events queue up.
    drop(manager.take_status_receiver());
    manager
});
static LIMITER: LazyLock<CommandLimiter> = LazyLock::new(CommandLimiter::default);
static AUTO_BACKUPS: LazyLock<auto_backups::AutoBackupManager> =
    LazyLock::new(auto_backups::AutoBackupManager::default);
static OBSERVER: RwLock<Option<Arc<dyn ServerEventObserver>>> = RwLock::new(None);
static BACKUP_CANCELLATIONS: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = Mutex::new(None);

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum ServerRunStatus {
    Online,
    Offline,
    Crashed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Fatal,
}

/// One console line, without ANSI or `§` color codes.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ConsoleLine {
    pub server_id: String,
    pub generation: u64,
    pub text: String,
    pub level: LogLevel,
    pub is_stderr: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct StatusChange {
    pub server_id: String,
    pub generation: u64,
    pub status: ServerRunStatus,
    /// True when the stop was requested (stop, restart, quit).
    pub expected: bool,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct StatsSample {
    pub server_id: String,
    pub generation: u64,
    pub cpu: f32,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct ResourcePoint {
    /// Milliseconds since the server process started.
    pub elapsed_ms: u64,
    /// Percent, 0–100.
    pub cpu: f32,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct TpsPoint {
    pub elapsed_ms: u64,
    pub tps: f32,
}

/// The last 60 seconds of a running server's metrics (dashboard charts).
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct MetricSnapshot {
    pub server_id: String,
    pub generation: u64,
    /// Increases with every change; drop snapshots older than the one shown.
    pub sequence: u64,
    /// Milliseconds since the process started, when the snapshot was taken.
    pub elapsed_ms: u64,
    pub resource: Vec<ResourcePoint>,
    pub tps: Vec<TpsPoint>,
}

impl From<&MetricHistorySnapshot> for MetricSnapshot {
    fn from(snapshot: &MetricHistorySnapshot) -> Self {
        Self {
            server_id: snapshot.server_id.clone(),
            generation: snapshot.generation,
            sequence: snapshot.sequence,
            elapsed_ms: snapshot.elapsed_ms,
            resource: snapshot
                .resource
                .iter()
                .map(|point| ResourcePoint {
                    elapsed_ms: point.elapsed_ms,
                    cpu: point.cpu,
                    memory_bytes: point.memory,
                })
                .collect(),
            tps: snapshot
                .tps
                .iter()
                .map(|point| TpsPoint {
                    elapsed_ms: point.elapsed_ms,
                    tps: point.tps,
                })
                .collect(),
        }
    }
}

/// Receives running-server events. Called from background threads.
#[uniffi::export(with_foreign)]
pub trait ServerEventObserver: Send + Sync {
    fn on_console(&self, line: ConsoleLine);
    fn on_status(&self, change: StatusChange);
    fn on_stats(&self, sample: StatsSample);
    fn on_metrics(&self, snapshot: MetricSnapshot);
}

/// Sets the one observer of running-server events (replacing any earlier one).
#[uniffi::export]
pub fn subscribe_server_events(observer: Arc<dyn ServerEventObserver>) {
    if let Ok(mut current) = OBSERVER.write() {
        *current = Some(observer);
    }
}

fn observer() -> Option<Arc<dyn ServerEventObserver>> {
    OBSERVER.read().ok().and_then(|current| current.clone())
}

struct FfiServerEvents;

impl ServerEvents for FfiServerEvents {
    fn log(&self, event: ServerLogEvent) {
        let Some(observer) = observer() else { return };
        let text = console_line::strip_formatting(&event.line);
        let level = match console_line::detect_level(&text) {
            console_line::LogLevel::Info => LogLevel::Info,
            console_line::LogLevel::Warn => LogLevel::Warn,
            console_line::LogLevel::Error => LogLevel::Error,
            console_line::LogLevel::Fatal => LogLevel::Fatal,
        };
        observer.on_console(ConsoleLine {
            server_id: event.server_id,
            generation: event.generation,
            text,
            level,
            is_stderr: event.stream == LogStream::Stderr,
        });
    }

    fn status(&self, event: &ServerStatusEvent) {
        let Some(observer) = observer() else { return };
        observer.on_status(StatusChange {
            server_id: event.server_id.clone(),
            generation: event.generation,
            status: match event.status {
                ServerStatus::Online => ServerRunStatus::Online,
                ServerStatus::Offline => ServerRunStatus::Offline,
                ServerStatus::Crashed => ServerRunStatus::Crashed,
            },
            expected: event.expected,
        });
    }

    fn stats(&self, event: ServerStatsEvent) {
        let Some(observer) = observer() else { return };
        observer.on_stats(StatsSample {
            server_id: event.server_id,
            generation: event.generation,
            cpu: event.cpu,
            memory_bytes: event.memory,
        });
    }

    fn metrics(&self, snapshot: &MetricHistorySnapshot) {
        let Some(observer) = observer() else { return };
        observer.on_metrics(snapshot.into());
    }
}

fn server_context(data_dir: PathBuf) -> ServerContext {
    ServerContext {
        java_registry: java_runtimes::java_store(&data_dir),
        data_dir,
        events: Arc::new(FfiServerEvents),
    }
}

/// Maps the process manager's messages to codes the UI can explain.
fn run_error(error: String, data_dir: &std::path::Path) -> FfiError {
    let code = if error == EULA_REQUIRED_ERROR {
        CoreErrorCode::ServerEulaRequired
    } else if error.contains("Too many running servers") {
        CoreErrorCode::ServerLimitReached
    } else if error.contains("not found or not running") {
        CoreErrorCode::ServerNotRunning
    } else if error.contains("already running") {
        CoreErrorCode::ServerRunning
    } else if error.starts_with("Command ") || error.contains("sent too quickly") {
        CoreErrorCode::ServerCommandRejected
    } else if error.contains("Java") || error.contains("java") {
        CoreErrorCode::ServerJavaInvalid
    } else {
        CoreErrorCode::ServerOperationFailed
    };
    core_error(code, redact(&error, data_dir))
}

/// Starts a registered server.
#[uniffi::export(async_runtime = "tokio")]
pub async fn start_server(server_id: String) -> Result<(), FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    server_process::start_registered_server(
        server_context(data_dir.clone()),
        &SERVERS,
        &LIMITER,
        &operations,
        &registry,
        server_id,
    )
    .await
    .map_err(|error| run_error(error, &data_dir))
}

/// Sends `stop`, then force-kills the server if it is still running after 20 seconds.
#[uniffi::export(async_runtime = "tokio")]
pub async fn stop_server(server_id: String) -> Result<(), FfiError> {
    let (data_dir, _, operations) = session_handles()?;
    server_process::stop_server_with_id(&SERVERS, &operations, server_id)
        .await
        .map_err(|error| run_error(error, &data_dir))
}

/// Stops and starts a server with its saved settings.
#[uniffi::export(async_runtime = "tokio")]
pub async fn restart_server(server_id: String) -> Result<(), FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    server_process::restart_server(
        server_context(data_dir.clone()),
        &SERVERS,
        &LIMITER,
        &operations,
        &registry,
        &server_id,
    )
    .await
    .map_err(|error| run_error(error, &data_dir))
}

/// Sends one console command.
#[uniffi::export(async_runtime = "tokio")]
pub async fn send_command(server_id: String, command: String) -> Result<(), FfiError> {
    let (data_dir, _, _) = session_handles()?;
    server_process::send_command(&SERVERS, &LIMITER, &server_id, &command)
        .await
        .map_err(|error| run_error(error, &data_dir))
}

/// The current 60-second metric window of a running server, or None.
#[uniffi::export(async_runtime = "tokio")]
pub async fn server_metric_history(server_id: String) -> Option<MetricSnapshot> {
    SERVERS
        .metric_history(&server_id)
        .await
        .ok()
        .flatten()
        .as_ref()
        .map(Into::into)
}

/// IDs of the servers this process is running.
#[uniffi::export(async_runtime = "tokio")]
pub async fn running_server_ids() -> Vec<String> {
    SERVERS.running_server_ids().await
}

/// Stops every running server (force-killing stragglers), for quitting.
#[uniffi::export(async_runtime = "tokio")]
pub async fn shutdown_all_servers() -> Result<(), FfiError> {
    AUTO_BACKUPS.shutdown().await;
    SERVERS
        .shutdown_all()
        .await
        .map_err(|error| core_error(CoreErrorCode::ServerOperationFailed, error))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Record)]
pub struct EulaStatus {
    pub accepted: bool,
    pub file_exists: bool,
}

/// Whether the server's eula.txt says `eula=true`.
#[uniffi::export]
pub fn server_eula_status(server_id: String) -> Result<EulaStatus, FfiError> {
    let (data_dir, _, _) = session_handles()?;
    let status =
        eula::eula_status(&data_dir, &server_id).map_err(|error| run_error(error, &data_dir))?;
    Ok(EulaStatus {
        accepted: status.accepted,
        file_exists: status.file_exists,
    })
}

/// Writes `eula=true` into the server's eula.txt.
#[uniffi::export]
pub fn accept_server_eula(server_id: String) -> Result<(), FfiError> {
    let (data_dir, _, _) = session_handles()?;
    eula::accept_eula(&data_dir, &server_id).map_err(|error| run_error(error, &data_dir))
}

// ---------------------------------------------------------------------------
// Server properties and player lists (OP-SRV-021, OP-SRV-022, OP-SRV-024, OP-SRV-025)

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct PropertyEntry {
    pub key: String,
    pub value: String,
}

impl From<CorePropertyEntry> for PropertyEntry {
    fn from(entry: CorePropertyEntry) -> Self {
        Self {
            key: entry.key,
            value: entry.value,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum PropertyLineEnding {
    Lf,
    CrLf,
    Mixed,
    None,
}

impl From<CorePropertyLineEnding> for PropertyLineEnding {
    fn from(value: CorePropertyLineEnding) -> Self {
        match value {
            CorePropertyLineEnding::Lf => Self::Lf,
            CorePropertyLineEnding::CrLf => Self::CrLf,
            CorePropertyLineEnding::Mixed => Self::Mixed,
            CorePropertyLineEnding::None => Self::None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct ServerPropertiesSnapshot {
    pub entries: Vec<PropertyEntry>,
    pub line_ending: PropertyLineEnding,
    pub has_bom: bool,
}

impl From<CoreServerPropertiesSnapshot> for ServerPropertiesSnapshot {
    fn from(snapshot: CoreServerPropertiesSnapshot) -> Self {
        Self {
            entries: snapshot.entries.into_iter().map(Into::into).collect(),
            line_ending: snapshot.line_ending.into(),
            has_bom: snapshot.has_bom,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct PropertyUpdate {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Record)]
pub struct SavePropertiesResult {
    pub port_changed_to: Option<u16>,
}

fn properties_error(error: PropertiesError, data_dir: &std::path::Path) -> FfiError {
    let code = match &error.kind {
        PropertiesErrorKind::Missing => CoreErrorCode::PropertiesMissing,
        PropertiesErrorKind::Malformed => CoreErrorCode::PropertiesMalformed,
        PropertiesErrorKind::Invalid => CoreErrorCode::PropertiesInvalid,
        PropertiesErrorKind::NotRegistered => CoreErrorCode::ServerNotFound,
        PropertiesErrorKind::Io => CoreErrorCode::PropertiesIo,
    };
    core_error(code, redact(&error.message, data_dir))
}

/// Reads the registered server's server.properties file without normalizing
/// line endings or a UTF-8 BOM (OP-SRV-021).
#[uniffi::export(async_runtime = "tokio")]
pub async fn get_server_properties(
    server_id: String,
) -> Result<ServerPropertiesSnapshot, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let error_data_dir = data_dir.clone();
    mcvector_core::properties::get_server_properties(&operations, data_dir, registry, server_id)
        .await
        .map(Into::into)
        .map_err(|error| properties_error(error, &error_data_dir))
}

/// Applies typed updates while retaining comments, ordering and untouched lines
/// in server.properties. Returns the server port when it was updated.
#[uniffi::export(async_runtime = "tokio")]
pub async fn save_server_properties(
    server_id: String,
    updates: Vec<PropertyUpdate>,
) -> Result<SavePropertiesResult, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let error_data_dir = data_dir.clone();
    let updates = updates
        .into_iter()
        .map(|update| (update.key, update.value))
        .collect();
    mcvector_core::properties::save_server_properties(
        &operations,
        data_dir,
        registry,
        server_id,
        updates,
    )
    .await
    .map(|port_changed_to| SavePropertiesResult { port_changed_to })
    .map_err(|error| properties_error(error, &error_data_dir))
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct PlayerEntry {
    pub uuid: Option<String>,
    pub name: String,
    pub level: Option<u8>,
    pub created: Option<String>,
    pub source: Option<String>,
    pub expires: Option<String>,
    pub reason: Option<String>,
    pub ip: Option<String>,
    pub bypasses_player_limit: Option<bool>,
}

impl From<CorePlayerEntry> for PlayerEntry {
    fn from(entry: CorePlayerEntry) -> Self {
        Self {
            uuid: entry.uuid,
            name: entry.name,
            level: entry.level,
            created: entry.created,
            source: entry.source,
            expires: entry.expires,
            reason: entry.reason,
            ip: entry.ip,
            bypasses_player_limit: entry.bypasses_player_limit,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, uniffi::Record)]
pub struct PlayerListSnapshot {
    pub whitelist: Vec<PlayerEntry>,
    pub ops: Vec<PlayerEntry>,
    pub banned_players: Vec<PlayerEntry>,
    pub banned_ips: Vec<PlayerEntry>,
}

impl From<CorePlayerListSnapshot> for PlayerListSnapshot {
    fn from(snapshot: CorePlayerListSnapshot) -> Self {
        Self {
            whitelist: snapshot.whitelist.into_iter().map(Into::into).collect(),
            ops: snapshot.ops.into_iter().map(Into::into).collect(),
            banned_players: snapshot
                .banned_players
                .into_iter()
                .map(Into::into)
                .collect(),
            banned_ips: snapshot.banned_ips.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum PlayerListKind {
    Whitelist,
    Ops,
    BannedPlayers,
    BannedIps,
}

impl From<PlayerListKind> for CorePlayerListType {
    fn from(value: PlayerListKind) -> Self {
        match value {
            PlayerListKind::Whitelist => Self::Whitelist,
            PlayerListKind::Ops => Self::Ops,
            PlayerListKind::BannedPlayers => Self::BannedPlayers,
            PlayerListKind::BannedIps => Self::BannedIps,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum PlayerListAction {
    Add,
    Remove,
}

impl From<PlayerListAction> for CorePlayerListAction {
    fn from(value: PlayerListAction) -> Self {
        match value {
            PlayerListAction::Add => Self::Add,
            PlayerListAction::Remove => Self::Remove,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct PlayerListMutationResult {
    pub lists: PlayerListSnapshot,
    pub changed: bool,
    pub canonical_target: String,
}

impl From<CorePlayerListMutationResult> for PlayerListMutationResult {
    fn from(result: CorePlayerListMutationResult) -> Self {
        Self {
            lists: result.lists.into(),
            changed: result.changed,
            canonical_target: result.canonical_target,
        }
    }
}

fn player_list_error(error: PlayerListError, data_dir: &std::path::Path) -> FfiError {
    let code = match &error.kind {
        PlayerListErrorKind::InvalidServerId => CoreErrorCode::ServerInvalidRequest,
        PlayerListErrorKind::ServerNotRegistered => CoreErrorCode::ServerNotFound,
        PlayerListErrorKind::UnmanagedServer => CoreErrorCode::ServerUnmanaged,
        PlayerListErrorKind::InvalidPlayerName => CoreErrorCode::PlayerInvalidName,
        PlayerListErrorKind::InvalidIpAddress => CoreErrorCode::PlayerInvalidIp,
        PlayerListErrorKind::InvalidListFile => CoreErrorCode::PlayerInvalidFile,
        PlayerListErrorKind::ListTooLarge => CoreErrorCode::PlayerListTooLarge,
        PlayerListErrorKind::MalformedList => CoreErrorCode::PlayerMalformedList,
        PlayerListErrorKind::Io => CoreErrorCode::PlayerIo,
        PlayerListErrorKind::Operation => CoreErrorCode::ServerOperationFailed,
    };
    core_error(code, redact(&error.message, data_dir))
}

/// Reads all four JSON player lists for the registered, managed server.
#[uniffi::export(async_runtime = "tokio")]
pub async fn get_player_lists(server_id: String) -> Result<PlayerListSnapshot, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    mcvector_core::players::get_player_lists(&data_dir, &registry, &operations, &server_id)
        .await
        .map(Into::into)
        .map_err(|error| player_list_error(error, &data_dir))
}

/// Adds or removes a player/IP and returns the persisted lists and canonical
/// console target. Command dispatch remains a separate Swift call.
#[uniffi::export(async_runtime = "tokio")]
pub async fn mutate_player_list(
    server_id: String,
    list: PlayerListKind,
    action: PlayerListAction,
    value: String,
) -> Result<PlayerListMutationResult, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let mutation = PlayerListMutation {
        list_type: list.into(),
        action: action.into(),
        value,
    };
    mcvector_core::players::mutate_player_list(
        &data_dir,
        &registry,
        &operations,
        &server_id,
        &mutation,
    )
    .await
    .map(Into::into)
    .map_err(|error| player_list_error(error, &data_dir))
}

// ---------------------------------------------------------------------------
// Backups (OP-BACK-001..005, EVT-006)

/// One full backup archive and its verified manifest metadata.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct BackupRecord {
    /// Archive file name, for display and managed backup operations.
    pub name: String,
    /// User metadata joined from the shared backup sidecar.
    pub tags: Vec<String>,
    pub note: String,
    pub backup_id: String,
    pub server_id: String,
    pub archive_path: String,
    pub kind: String,
    pub consistency: String,
    pub origin: String,
    pub created_at: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub archive_sha256: String,
    pub manifest_version: u32,
    pub restore_eligible: bool,
    pub duration_ms: Option<u64>,
}

impl From<CoreBackupRecord> for BackupRecord {
    fn from(record: CoreBackupRecord) -> Self {
        Self {
            name: record.archive_path.clone(),
            tags: Vec::new(),
            note: String::new(),
            backup_id: record.backup_id,
            server_id: record.server_id,
            archive_path: record.archive_path,
            kind: record.kind,
            consistency: record.consistency,
            origin: record.origin,
            created_at: record.created_at,
            file_count: record.file_count,
            total_bytes: record.total_bytes,
            archive_sha256: record.archive_sha256,
            manifest_version: record.manifest_version,
            restore_eligible: record.restore_eligible,
            duration_ms: record.duration_ms,
        }
    }
}

fn attach_backup_metadata(records: &mut [BackupRecord], metadata: &backups::BackupMetadataCatalog) {
    for record in records {
        if let Some(entry) = metadata.entries.get(&record.name) {
            record.tags.clone_from(&entry.tags);
            record.note.clone_from(&entry.note);
        }
    }
}

fn backup_records_with_metadata(
    records: Vec<CoreBackupRecord>,
    metadata: &backups::BackupMetadataCatalog,
) -> Vec<BackupRecord> {
    let mut records = records.into_iter().map(Into::into).collect::<Vec<_>>();
    attach_backup_metadata(&mut records, metadata);
    records
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct BackupRetentionReport {
    pub deleted_names: Vec<String>,
    pub failed_delete_count: u32,
    pub records: Vec<BackupRecord>,
}

impl From<CoreBackupRetentionReport> for BackupRetentionReport {
    fn from(report: CoreBackupRetentionReport) -> Self {
        Self {
            deleted_names: report.deleted_names,
            failed_delete_count: report.failed_delete_count,
            records: report.records.into_iter().map(Into::into).collect(),
        }
    }
}

/// The backup list's latest managed-file snapshot, keyed by relative path.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct BackupSnapshotEntry {
    pub relative_path: String,
    pub size: u64,
    pub modified: u64,
}

/// User-maintained tags and note for a single backup.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct BackupMetadataEntry {
    pub backup_name: String,
    pub tags: Vec<String>,
    pub note: String,
    pub created_at: String,
}

/// Shared metadata catalog used by both editions.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct BackupMetadataCatalog {
    pub last_backup_name: Option<String>,
    pub latest_snapshot: Vec<BackupSnapshotEntry>,
    pub entries: Vec<BackupMetadataEntry>,
}

impl From<backups::BackupMetadataCatalog> for BackupMetadataCatalog {
    fn from(catalog: backups::BackupMetadataCatalog) -> Self {
        Self {
            last_backup_name: catalog.last_backup_name,
            latest_snapshot: catalog
                .latest_snapshot
                .into_iter()
                .map(|(relative_path, entry)| BackupSnapshotEntry {
                    relative_path,
                    size: entry.size,
                    modified: entry.modified,
                })
                .collect(),
            entries: catalog
                .entries
                .into_iter()
                .map(|(backup_name, entry)| BackupMetadataEntry {
                    backup_name,
                    tags: entry.tags,
                    note: entry.note,
                    created_at: entry.created_at,
                })
                .collect(),
        }
    }
}

/// Structured warning that does not invalidate an already-installed archive.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct BackupOperationWarning {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl From<CoreError> for BackupOperationWarning {
    fn from(error: CoreError) -> Self {
        Self {
            code: error.code.as_str().to_string(),
            message: error.message,
            retryable: error.retryable,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Enum)]
pub enum BackupRestartOutcome {
    NotNeeded,
    Restarted,
    Failed { error: String },
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Enum)]
pub enum BackupCreateOutcome {
    ConfirmationRequired,
    Created {
        backup_name: String,
        record: Option<BackupRecord>,
        catalog_warning: Option<BackupOperationWarning>,
        restart: BackupRestartOutcome,
    },
}

/// Inputs for a manual full backup. The Native edition always includes the
/// whole managed server; `operation_id` also identifies progress and cancel.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct BackupCreateInput {
    pub operation_id: String,
    pub server_id: String,
    pub backup_name: Option<String>,
    pub compression_level: Option<i64>,
    pub stop_running_server: bool,
}

/// Native progress events use a normalized 0.0–1.0 fraction and include per-run
/// ordering fields so parallel servers cannot overwrite each other's state.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct BackupProgressEvent {
    pub operation_id: String,
    pub server_id: String,
    pub sequence: u64,
    pub emitted_at_ms: u64,
    pub progress: f32,
    pub current_file: String,
}

/// Receives progress for manual and automatic backup creation.
#[uniffi::export(with_foreign)]
pub trait BackupProgressObserver: Send + Sync {
    fn on_progress(&self, event: BackupProgressEvent);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum AutomaticBackupTickStatus {
    Created,
    Skipped,
    Failed,
}

/// Terminal result for one due automatic backup. Not-due servers are omitted.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct AutomaticBackupTickResult {
    pub operation_id: String,
    pub server_id: String,
    pub server_name: String,
    pub status: AutomaticBackupTickStatus,
    pub backup_name: Option<String>,
    pub catalog_warning: Option<BackupOperationWarning>,
    pub retention: Option<BackupRetentionReport>,
    pub retention_warning: Option<BackupOperationWarning>,
    pub error: Option<String>,
    pub restart_error: Option<String>,
}

/// Direct estimate based on up to five recent backup-throughput samples.
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Record)]
pub struct BackupEstimate {
    pub size_bytes: u64,
    pub duration_ms: u64,
}

fn backup_core_error(error: CoreError, data_dir: &Path) -> FfiError {
    FfiError::from(CoreError {
        message: redact(&error.message, data_dir),
        ..error
    })
}

fn normalize_backup_server_id(server_id: &str, data_dir: &Path) -> Result<String, FfiError> {
    validate_server_id(server_id)
        .map_err(|error| core_error(CoreErrorCode::ServerInvalidName, redact(&error, data_dir)))
}

fn backup_paths_error(error: String, data_dir: &Path) -> FfiError {
    core_error(
        CoreErrorCode::ServerOperationFailed,
        redact(&error, data_dir),
    )
}

/// Confirms the registry entry still points at its canonical managed folder,
/// then resolves both operation paths through the shared backup boundary.
async fn registered_backup_paths(
    data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
    create_backup_dir: bool,
) -> Result<backups::ManagedBackupPaths, FfiError> {
    let server_id = validate_server_id(&server_id).map_err(|error| {
        core_error(
            CoreErrorCode::ServerInvalidRequest,
            redact(&error, &data_dir),
        )
    })?;
    let data_for_work = data_dir.clone();
    tokio::task::spawn_blocking(move || {
        let server = registry
            .get_servers()
            .map_err(|error| core_error(CoreErrorCode::RegistryReadFailed, error))?
            .into_iter()
            .find(|server| server.id == server_id)
            .ok_or_else(|| {
                core_error(
                    CoreErrorCode::ServerNotFound,
                    "The registered server could not be found.",
                )
            })?;
        let paths = backups::resolve_managed_paths(&data_for_work, &server_id, create_backup_dir)
            .map_err(|error| backup_core_error(error, &data_for_work))?;
        let canonical_root = std::fs::canonicalize(&paths.server_dir).map_err(|_| {
            core_error(
                CoreErrorCode::ServerUnmanaged,
                "The server folder is unmanaged.",
            )
        })?;
        let canonical_registered = std::fs::canonicalize(&server.path).map_err(|_| {
            core_error(
                CoreErrorCode::ServerUnmanaged,
                "The server folder is unmanaged.",
            )
        })?;
        if canonical_root != canonical_registered {
            return Err(core_error(
                CoreErrorCode::ServerUnmanaged,
                "The registered server folder is outside its managed location.",
            ));
        }
        Ok(paths)
    })
    .await
    .map_err(|_| {
        core_error(
            CoreErrorCode::InternalUnknown,
            "Could not resolve the server folder.",
        )
    })?
}

fn with_backup_cancellations<T>(
    update: impl FnOnce(&mut HashMap<String, Arc<AtomicBool>>) -> T,
) -> T {
    let mut cancellations = BACKUP_CANCELLATIONS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    update(cancellations.get_or_insert_with(HashMap::new))
}

fn emitted_at_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

fn backup_progress_event(
    operation_id: String,
    server_id: String,
    sequence: u64,
    fraction: f32,
    current_file: String,
) -> BackupProgressEvent {
    BackupProgressEvent {
        operation_id,
        server_id,
        sequence,
        emitted_at_ms: emitted_at_ms(),
        progress: fraction.clamp(0.0, 1.0),
        current_file,
    }
}

impl From<auto_backups::AutoBackupTickResult> for AutomaticBackupTickResult {
    fn from(result: auto_backups::AutoBackupTickResult) -> Self {
        let status = match result.status {
            auto_backups::AutoBackupTickStatus::Created => AutomaticBackupTickStatus::Created,
            auto_backups::AutoBackupTickStatus::Skipped => AutomaticBackupTickStatus::Skipped,
            auto_backups::AutoBackupTickStatus::Failed => AutomaticBackupTickStatus::Failed,
        };
        Self {
            operation_id: result.operation_id,
            server_id: result.server_id,
            server_name: result.server_name,
            status,
            backup_name: result.backup_name,
            catalog_warning: result.catalog_error.map(|message| BackupOperationWarning {
                code: "backup.catalog_failed".to_string(),
                message,
                retryable: true,
            }),
            retention: result.retention.map(Into::into),
            retention_warning: result
                .retention_error
                .map(|message| BackupOperationWarning {
                    code: "backup.catalog_failed".to_string(),
                    message,
                    retryable: true,
                }),
            error: result.error,
            restart_error: result.restart_error,
        }
    }
}

/// Reads and verifies the backup manifests for a registered managed server.
#[uniffi::export(async_runtime = "tokio")]
pub async fn list_managed_backups(server_id: String) -> Result<Vec<BackupRecord>, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let server_id = normalize_backup_server_id(&server_id, &data_dir)?;
    let paths =
        registered_backup_paths(data_dir.clone(), registry, server_id.clone(), true).await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupCreate)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    blocking(move || {
        let _operation = operation;
        let records = backups::list_backups(&paths.backup_dir, &server_id)
            .map_err(|error| backup_core_error(error, &data_dir))?;
        let metadata = backups::load_backup_metadata(&paths.backup_dir)
            .map_err(|error| backup_core_error(error, &data_dir))?;
        Ok(backup_records_with_metadata(records, &metadata))
    })
    .await
}

/// Creates a manual, full-server backup. The listener is attached before work
/// begins; cancel by the supplied operation ID at archive checkpoints.
#[uniffi::export(async_runtime = "tokio")]
pub async fn create_managed_backup(
    input: BackupCreateInput,
    observer: Arc<dyn BackupProgressObserver>,
) -> Result<BackupCreateOutcome, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let operation_id = server_creation::validate_operation_id(&input.operation_id)
        .map_err(|error| backup_core_error(error, &data_dir))?;
    let server_id = validate_server_id(&input.server_id).map_err(|error| {
        core_error(
            CoreErrorCode::ServerInvalidRequest,
            redact(&error, &data_dir),
        )
    })?;
    let cancellation = Arc::new(AtomicBool::new(false));
    let registered = with_backup_cancellations(|operations| {
        if operations.contains_key(&operation_id) {
            false
        } else {
            operations.insert(operation_id.clone(), cancellation.clone());
            true
        }
    });
    if !registered {
        return Err(core_error(
            CoreErrorCode::ServerInvalidRequest,
            "Backup operation ID is already in use.",
        ));
    }

    let result = create_managed_backup_inner(
        data_dir.clone(),
        registry,
        operations,
        server_id,
        input,
        operation_id.clone(),
        cancellation,
        observer,
    )
    .await;
    with_backup_cancellations(|operations| operations.remove(&operation_id));
    result
}

#[allow(clippy::too_many_arguments)]
async fn create_managed_backup_inner(
    data_dir: PathBuf,
    registry: ServerRegistry,
    operations: ServerOperationManager,
    server_id: String,
    input: BackupCreateInput,
    operation_id: String,
    cancellation: Arc<AtomicBool>,
    observer: Arc<dyn BackupProgressObserver>,
) -> Result<BackupCreateOutcome, FfiError> {
    let paths =
        registered_backup_paths(data_dir.clone(), registry.clone(), server_id.clone(), true)
            .await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupCreate)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    if cancellation.load(Ordering::SeqCst) {
        return Err(CoreError::cancelled().into());
    }
    let server_was_running = SERVERS.is_server_running(&server_id).await;
    if server_was_running && !input.stop_running_server {
        drop(operation);
        return Ok(BackupCreateOutcome::ConfirmationRequired);
    }
    if server_was_running {
        if let Err(error) =
            server_process::stop_server_with_guard_recovery(&SERVERS, &server_id, None).await
        {
            if error.recovery_state == server_process::StopErrorRecoveryState::Stopped {
                if let Err(restart_error) = server_process::start_registered_server_with_guard(
                    server_context(data_dir.clone()),
                    &SERVERS,
                    &LIMITER,
                    &operations,
                    &registry,
                    server_id.clone(),
                    operation,
                )
                .await
                {
                    return Err(core_error(
                        CoreErrorCode::ServerOperationFailed,
                        format!(
                            "{} The server could not be restarted: {}",
                            error.message,
                            redact(&restart_error, &data_dir)
                        ),
                    ));
                }
            } else {
                drop(operation);
            }
            return Err(core_error(
                CoreErrorCode::ServerOperationFailed,
                redact(&error.message, &data_dir),
            ));
        }
    }

    let progress_sequence = Arc::new(AtomicU64::new(0));
    let sequence_for_work = progress_sequence.clone();
    let operation_for_work = operation_id.clone();
    let server_for_work = server_id.clone();
    let server_for_request = server_for_work.clone();
    let observer_for_work = observer.clone();
    let cancellation_for_work = cancellation.clone();
    let backup_name = input.backup_name;
    let compression_level = input.compression_level;
    let archive_result = tokio::task::spawn_blocking(move || {
        let mut progress = |event: backups::BackupProgress| {
            observer_for_work.on_progress(backup_progress_event(
                operation_for_work.clone(),
                server_for_work.clone(),
                sequence_for_work.fetch_add(1, Ordering::SeqCst) + 1,
                event.fraction,
                event.current_file,
            ));
        };
        backups::create_backup(
            &paths.server_dir,
            &paths.backup_dir,
            CoreCreateBackupRequest {
                server_id: server_for_request,
                backup_name,
                sources: None,
                compression_level,
                origin: CoreBackupOrigin::Manual,
            },
            Some(&cancellation_for_work),
            &mut progress,
        )
    })
    .await
    .unwrap_or_else(|_| {
        Err(CoreError::internal(
            "The backup worker stopped unexpectedly.",
        ))
    });

    let restart = if server_was_running {
        match server_process::start_registered_server_with_guard(
            server_context(data_dir.clone()),
            &SERVERS,
            &LIMITER,
            &operations,
            &registry,
            server_id,
            operation,
        )
        .await
        {
            Ok(()) => BackupRestartOutcome::Restarted,
            Err(error) => BackupRestartOutcome::Failed {
                error: redact(&error, &data_dir),
            },
        }
    } else {
        drop(operation);
        BackupRestartOutcome::NotNeeded
    };

    match archive_result {
        Ok(created) => Ok(BackupCreateOutcome::Created {
            backup_name: created.backup_name,
            record: created.record.map(Into::into),
            catalog_warning: created.catalog_error.map(|error| BackupOperationWarning {
                code: error.code.as_str().to_string(),
                message: redact(&error.message, &data_dir),
                retryable: error.retryable,
            }),
            restart,
        }),
        Err(mut error) => {
            if let BackupRestartOutcome::Failed {
                error: restart_error,
            } = &restart
            {
                error.message = format!(
                    "{} The server could not be restarted: {restart_error}",
                    error.message
                );
            }
            Err(backup_core_error(error, &data_dir))
        }
    }
}

/// Cancels an active manual or automatic backup by operation ID.
#[uniffi::export(async_runtime = "tokio")]
pub async fn cancel_backup(operation_id: String) -> bool {
    let Ok(operation_id) = server_creation::validate_operation_id(&operation_id) else {
        return false;
    };
    if let Some(cancellation) =
        with_backup_cancellations(|operations| operations.get(&operation_id).cloned())
    {
        cancellation.store(true, Ordering::SeqCst);
        return true;
    }
    AUTO_BACKUPS.cancel(&operation_id).await
}

/// Restores one validated archive into a stopped, registered server folder.
#[uniffi::export(async_runtime = "tokio")]
pub async fn restore_managed_backup(
    server_id: String,
    backup_name: String,
) -> Result<(), FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let server_id = normalize_backup_server_id(&server_id, &data_dir)?;
    let paths =
        registered_backup_paths(data_dir.clone(), registry, server_id.clone(), true).await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupRestore)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    if SERVERS.is_server_running(&server_id).await {
        return Err(core_error(
            CoreErrorCode::ServerRunning,
            "Stop the server before restoring a backup.",
        ));
    }
    let archive = resolve_managed_request(
        &data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Backups,
            server_id: Some(server_id.clone()),
            relative_path: backup_name,
        },
        true,
    )
    .map_err(|error| backup_paths_error(error, &data_dir))?;
    blocking(move || {
        let _operation = operation;
        backups::restore_backup(&archive, &paths.server_dir, &server_id)
            .map_err(|error| backup_core_error(error, &data_dir))
    })
    .await
}

/// Restores one validated archive and streams progress through the Native API.
/// Restore intentionally has no cancellation token: the shared core keeps the
/// existing transaction and rollback boundary intact.
#[uniffi::export(async_runtime = "tokio")]
pub async fn restore_managed_backup_with_progress(
    server_id: String,
    backup_name: String,
    operation_id: String,
    observer: Arc<dyn BackupProgressObserver>,
) -> Result<(), FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let operation_id = server_creation::validate_operation_id(&operation_id)
        .map_err(|error| backup_core_error(error, &data_dir))?;
    let server_id = normalize_backup_server_id(&server_id, &data_dir)?;
    let paths =
        registered_backup_paths(data_dir.clone(), registry, server_id.clone(), true).await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupRestore)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    if SERVERS.is_server_running(&server_id).await {
        return Err(core_error(
            CoreErrorCode::ServerRunning,
            "Stop the server before restoring a backup.",
        ));
    }
    let archive = resolve_managed_request(
        &data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Backups,
            server_id: Some(server_id.clone()),
            relative_path: backup_name,
        },
        true,
    )
    .map_err(|error| backup_paths_error(error, &data_dir))?;
    let progress_sequence = Arc::new(AtomicU64::new(0));
    blocking(move || {
        let _operation = operation;
        let mut progress = |event: backups::BackupProgress| {
            observer.on_progress(backup_progress_event(
                operation_id.clone(),
                server_id.clone(),
                progress_sequence.fetch_add(1, Ordering::SeqCst) + 1,
                event.fraction,
                event.current_file,
            ));
        };
        backups::restore_backup_with_progress(
            &archive,
            &paths.server_dir,
            &server_id,
            &mut progress,
        )
        .map_err(|error| backup_core_error(error, &data_dir))
    })
    .await
}

/// Deletes one backup archive and returns the refreshed manifest list.
#[uniffi::export(async_runtime = "tokio")]
pub async fn delete_managed_backup(
    server_id: String,
    backup_name: String,
) -> Result<Vec<BackupRecord>, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let server_id = normalize_backup_server_id(&server_id, &data_dir)?;
    let paths =
        registered_backup_paths(data_dir.clone(), registry, server_id.clone(), true).await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupDelete)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    blocking(move || {
        let _operation = operation;
        let records = backups::delete_backup(&paths.backup_dir, &server_id, &backup_name)
            .map_err(|error| backup_core_error(error, &data_dir))?;
        let metadata = backups::load_backup_metadata(&paths.backup_dir)
            .map_err(|error| backup_core_error(error, &data_dir))?;
        Ok(backup_records_with_metadata(records, &metadata))
    })
    .await
}

/// Applies count/day retention and reports each successful and failed deletion.
#[uniffi::export(async_runtime = "tokio")]
pub async fn apply_managed_backup_retention(
    server_id: String,
    retain_count: u32,
    retain_days: u32,
) -> Result<BackupRetentionReport, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let server_id = normalize_backup_server_id(&server_id, &data_dir)?;
    let paths =
        registered_backup_paths(data_dir.clone(), registry, server_id.clone(), true).await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupDelete)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    blocking(move || {
        let _operation = operation;
        let report = backups::apply_retention(
            &paths.backup_dir,
            &server_id,
            retain_count,
            retain_days,
            None,
        )
        .map_err(|error| backup_core_error(error, &data_dir))?;
        let metadata = backups::load_backup_metadata(&paths.backup_dir)
            .map_err(|error| backup_core_error(error, &data_dir))?;
        Ok(BackupRetentionReport {
            deleted_names: report.deleted_names,
            failed_delete_count: report.failed_delete_count,
            records: backup_records_with_metadata(report.records, &metadata),
        })
    })
    .await
}

/// Saves tags and a note while preserving the other metadata catalog entries.
#[uniffi::export(async_runtime = "tokio")]
pub async fn set_managed_backup_tags(
    server_id: String,
    backup_name: String,
    tags: Vec<String>,
    note: String,
) -> Result<BackupMetadataCatalog, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let server_id = normalize_backup_server_id(&server_id, &data_dir)?;
    let paths =
        registered_backup_paths(data_dir.clone(), registry, server_id.clone(), true).await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupDelete)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    blocking(move || {
        let _operation = operation;
        backups::set_backup_tags(&paths.backup_dir, &backup_name, tags, note)
            .map(Into::into)
            .map_err(|error| backup_core_error(error, &data_dir))
    })
    .await
}

/// Loads tags and notes for the shared backup list.
#[uniffi::export(async_runtime = "tokio")]
pub async fn load_managed_backup_metadata(
    server_id: String,
) -> Result<BackupMetadataCatalog, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let server_id = normalize_backup_server_id(&server_id, &data_dir)?;
    let paths =
        registered_backup_paths(data_dir.clone(), registry, server_id.clone(), true).await?;
    let operation =
        backups::acquire_operation(&operations, &server_id, OperationKind::BackupCreate)
            .await
            .map_err(|error| backup_core_error(error, &data_dir))?;
    blocking(move || {
        let _operation = operation;
        backups::load_backup_metadata(&paths.backup_dir)
            .map(Into::into)
            .map_err(|error| backup_core_error(error, &data_dir))
    })
    .await
}

/// Estimates duration from the newest usable backup throughput samples.
#[uniffi::export]
pub fn estimate_backup_duration(
    target_bytes: u64,
    history: Vec<BackupRecord>,
) -> Option<BackupEstimate> {
    let history = history
        .into_iter()
        .map(|record| CoreBackupRecord {
            backup_id: record.backup_id,
            server_id: record.server_id,
            archive_path: record.archive_path,
            kind: record.kind,
            consistency: record.consistency,
            origin: record.origin,
            created_at: record.created_at,
            file_count: record.file_count,
            total_bytes: record.total_bytes,
            archive_sha256: record.archive_sha256,
            manifest_version: record.manifest_version,
            restore_eligible: record.restore_eligible,
            duration_ms: record.duration_ms,
        })
        .collect::<Vec<_>>();
    backups::estimate_backup(target_bytes, &history).map(|estimate| BackupEstimate {
        size_bytes: estimate.size_bytes,
        duration_ms: estimate.duration_ms,
    })
}

/// Runs one Native-owned scheduler tick. Call from the app's one-minute timer.
#[uniffi::export(async_runtime = "tokio")]
pub async fn tick_automatic_backups(
    observer: Arc<dyn BackupProgressObserver>,
) -> Result<Vec<AutomaticBackupTickResult>, FfiError> {
    let (data_dir, registry, operations) = session_handles()?;
    let sequences = Arc::new(Mutex::new(HashMap::<String, u64>::new()));
    let progress = Arc::new({
        let sequences = sequences.clone();
        move |event: auto_backups::AutoBackupProgressEvent| {
            let sequence = {
                let mut sequences = sequences
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let sequence = sequences.entry(event.operation_id.clone()).or_default();
                *sequence += 1;
                *sequence
            };
            observer.on_progress(backup_progress_event(
                event.operation_id,
                event.server_id,
                sequence,
                event.fraction,
                event.current_file,
            ));
        }
    });
    let now_ms = emitted_at_ms().min(i64::MAX as u64) as i64;
    AUTO_BACKUPS
        .tick(
            server_context(data_dir.clone()),
            &SERVERS,
            &LIMITER,
            &registry,
            &operations,
            now_ms,
            progress,
        )
        .await
        .map(|results| results.into_iter().map(Into::into).collect())
        .map_err(|error| backup_core_error(error, &data_dir))
}

// ---------------------------------------------------------------------------
// Files (OP-FILE-001..009)

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct FileItem {
    pub name: String,
    pub is_directory: bool,
    pub size: u64,
    /// Seconds since the Unix epoch.
    pub modified: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Record)]
pub struct FolderSize {
    pub bytes: u64,
    /// False when the 3-second walk ran out of time or skipped unreadable parts.
    pub complete: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum LineEnding {
    Lf,
    Crlf,
}

/// A text file for the editor: no BOM, `\n` line breaks, and what it takes to
/// write it back the same way.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct TextDocumentInfo {
    pub text: String,
    pub has_bom: bool,
    pub line_ending: LineEnding,
    /// Both endings appeared; saving uses `line_ending` for every line.
    pub mixed_line_endings: bool,
}

fn files_error(error: managed_files::FilesError, data_dir: &std::path::Path) -> FfiError {
    let code = match error.kind {
        FilesErrorKind::AlreadyExists => CoreErrorCode::FilesAlreadyExists,
        FilesErrorKind::TooLarge => CoreErrorCode::FilesTooLarge,
        FilesErrorKind::NotText => CoreErrorCode::FilesNotText,
        FilesErrorKind::InvalidName => CoreErrorCode::FilesInvalidName,
        FilesErrorKind::Io => CoreErrorCode::ServerOperationFailed,
    };
    core_error(code, redact(&error.message, data_dir))
}

fn path_error(error: String, data_dir: &std::path::Path) -> FfiError {
    core_error(
        CoreErrorCode::ServerOperationFailed,
        redact(&error, data_dir),
    )
}

/// `servers/<serverId>/<relative>`, resolved without following links.
fn server_path(
    data_dir: &std::path::Path,
    server_id: &str,
    relative: &str,
    create_root: bool,
) -> Result<PathBuf, FfiError> {
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: relative.to_string(),
    };
    resolve_managed_request(data_dir, &request, create_root)
        .map_err(|error| path_error(error, data_dir))
}

fn join_relative(parent: &str, name: &str) -> String {
    let parent = parent.trim_matches('/');
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

/// Runs blocking file work off the async runtime's worker threads.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, FfiError> + Send + 'static,
) -> Result<T, FfiError> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|error| core_error(CoreErrorCode::InternalUnknown, error.to_string()))?
}

/// Lists `relative` inside a server folder (folders first, then by name).
#[uniffi::export(async_runtime = "tokio")]
pub async fn list_files(server_id: String, relative: String) -> Result<Vec<FileItem>, FfiError> {
    let (data_dir, _, _) = session_handles()?;
    blocking(move || {
        let dir = server_path(&data_dir, &server_id, &relative, false)?;
        let entries =
            managed_files::list_directory(&dir).map_err(|error| files_error(error, &data_dir))?;
        Ok(entries
            .into_iter()
            .map(|entry| FileItem {
                name: entry.name,
                is_directory: entry.is_directory,
                size: entry.size,
                modified: entry.modified,
            })
            .collect())
    })
    .await
}

/// Creates a folder or an empty file named `name` in `parent`; never replaces
/// an existing entry.
#[uniffi::export(async_runtime = "tokio")]
pub async fn create_file_entry(
    server_id: String,
    parent: String,
    name: String,
    is_directory: bool,
) -> Result<(), FfiError> {
    let (data_dir, _, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| path_error(error, &data_dir))?;
    blocking(move || {
        let name = managed_files::validate_entry_name(&name)
            .map_err(|error| files_error(error, &data_dir))?;
        let target = server_path(&data_dir, &server_id, &join_relative(&parent, &name), true)?;
        let result = if is_directory {
            managed_files::create_directory(&target, true)
        } else {
            managed_files::create_file(&target)
        };
        result.map_err(|error| files_error(error, &data_dir))
    })
    .await
}

/// Renames an entry within its folder.
#[uniffi::export(async_runtime = "tokio")]
pub async fn rename_file_entry(
    server_id: String,
    relative: String,
    new_name: String,
) -> Result<(), FfiError> {
    let (data_dir, _, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| path_error(error, &data_dir))?;
    blocking(move || {
        let new_name = managed_files::validate_entry_name(&new_name)
            .map_err(|error| files_error(error, &data_dir))?;
        let parent = relative
            .rsplit_once('/')
            .map(|(parent, _)| parent)
            .unwrap_or("");
        let source = server_path(&data_dir, &server_id, &relative, false)?;
        let destination = server_path(
            &data_dir,
            &server_id,
            &join_relative(parent, &new_name),
            true,
        )?;
        managed_files::move_entry(&source, &destination)
            .map_err(|error| files_error(error, &data_dir))
    })
    .await
}

/// Moves entries into the folder `destination` ("" is the server folder).
/// Stops at the first failure; earlier moves stay done.
#[uniffi::export(async_runtime = "tokio")]
pub async fn move_file_entries(
    server_id: String,
    entries: Vec<String>,
    destination: String,
) -> Result<(), FfiError> {
    let (data_dir, _, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| path_error(error, &data_dir))?;
    blocking(move || {
        for relative in entries {
            let name = relative.rsplit('/').next().unwrap_or(&relative).to_string();
            let source = server_path(&data_dir, &server_id, &relative, false)?;
            let target = server_path(
                &data_dir,
                &server_id,
                &join_relative(&destination, &name),
                true,
            )?;
            managed_files::move_entry(&source, &target)
                .map_err(|error| files_error(error, &data_dir))?;
        }
        Ok(())
    })
    .await
}

/// Deletes entries (folders recursively). Stops at the first failure.
#[uniffi::export(async_runtime = "tokio")]
pub async fn delete_file_entries(server_id: String, entries: Vec<String>) -> Result<(), FfiError> {
    let (data_dir, _, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| path_error(error, &data_dir))?;
    blocking(move || {
        for relative in entries {
            if relative.trim_matches('/').is_empty() {
                return Err(core_error(
                    CoreErrorCode::FilesInvalidName,
                    "The server folder itself cannot be deleted",
                ));
            }
            let target = server_path(&data_dir, &server_id, &relative, false)?;
            managed_files::delete_entry(&target).map_err(|error| files_error(error, &data_dir))?;
        }
        Ok(())
    })
    .await
}

/// Total size of a folder, measured for at most 3 seconds.
#[uniffi::export(async_runtime = "tokio")]
pub async fn folder_size(server_id: String, relative: String) -> Result<FolderSize, FfiError> {
    let (data_dir, _, _) = session_handles()?;
    blocking(move || {
        let dir = server_path(&data_dir, &server_id, &relative, false)?;
        let size = managed_files::directory_size_within(&dir, managed_files::DIRECTORY_SIZE_BUDGET)
            .map_err(|error| files_error(error, &data_dir))?;
        Ok(FolderSize {
            bytes: size.bytes,
            complete: size.complete,
        })
    })
    .await
}

/// Copies files and folders the user picked (absolute paths) into `destination`.
/// Returns how many top-level entries were imported.
#[uniffi::export(async_runtime = "tokio")]
pub async fn import_file_entries(
    server_id: String,
    destination: String,
    sources: Vec<String>,
) -> Result<u32, FfiError> {
    let (data_dir, _, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| path_error(error, &data_dir))?;
    blocking(move || {
        let target = server_path(&data_dir, &server_id, &destination, true)?;
        let managed_root = std::fs::canonicalize(data_dir.join("servers"))
            .map_err(|error| path_error(error.to_string(), &data_dir))?;
        let imported = managed_files::import_entries(
            &target,
            &managed_root,
            sources.into_iter().map(PathBuf::from).collect(),
        )
        .map_err(|error| files_error(error, &data_dir))?;
        Ok(imported.len() as u32)
    })
    .await
}

/// The absolute path of an entry, for revealing it in Finder.
#[uniffi::export]
pub fn file_entry_path(server_id: String, relative: String) -> Result<String, FfiError> {
    let (data_dir, _, _) = session_handles()?;
    Ok(server_path(&data_dir, &server_id, &relative, false)?
        .to_string_lossy()
        .into_owned())
}

/// Reads a text file for the editor (at most 16 MiB of UTF-8).
#[uniffi::export(async_runtime = "tokio")]
pub async fn read_text_document(
    server_id: String,
    relative: String,
) -> Result<TextDocumentInfo, FfiError> {
    let (data_dir, _, _) = session_handles()?;
    blocking(move || {
        let path = server_path(&data_dir, &server_id, &relative, false)?;
        let document = managed_files::read_text_document(&path)
            .map_err(|error| files_error(error, &data_dir))?;
        Ok(TextDocumentInfo {
            text: document.text,
            has_bom: document.has_bom,
            line_ending: match document.line_ending {
                managed_files::LineEnding::Lf => LineEnding::Lf,
                managed_files::LineEnding::Crlf => LineEnding::Crlf,
            },
            mixed_line_endings: document.mixed_line_endings,
        })
    })
    .await
}

/// Saves an edited document with its original BOM and line endings.
#[uniffi::export(async_runtime = "tokio")]
pub async fn write_text_document(
    server_id: String,
    relative: String,
    document: TextDocumentInfo,
) -> Result<(), FfiError> {
    let (data_dir, _, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(|error| path_error(error, &data_dir))?;
    blocking(move || {
        let path = server_path(&data_dir, &server_id, &relative, true)?;
        let document = managed_files::TextDocument {
            text: document.text,
            has_bom: document.has_bom,
            line_ending: match document.line_ending {
                LineEnding::Lf => managed_files::LineEnding::Lf,
                LineEnding::Crlf => managed_files::LineEnding::Crlf,
            },
            mixed_line_endings: document.mixed_line_endings,
        };
        managed_files::write_text_document(&path, &document)
            .map_err(|error| files_error(error, &data_dir))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    // The session is process-wide, so the start/get_servers flow is covered by
    // one test to avoid ordering between tests.
    #[test]
    fn start_takes_the_lock_then_lists_servers() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().join("data");

        // Another process-like holder: a lock taken through a separate handle.
        let tauri = LockOwner::current(
            instance_lock::Edition::Tauri,
            "com.tukuyomi032.mcvector",
            "/x",
        );
        let held = match instance_lock::acquire(&data_dir, &tauri).unwrap() {
            LockOutcome::Acquired(lock) => lock,
            other => panic!("expected Acquired, got {other:?}"),
        };

        match start_in(data_dir.clone(), "/app".into()).unwrap() {
            StartOutcome::HeldByOther { owner } => {
                if cfg!(unix) {
                    assert_eq!(owner.unwrap().edition, Edition::Tauri);
                }
            }
            other => panic!("expected HeldByOther, got {other:?}"),
        }
        // Refused start must not create the registry.
        assert!(!data_dir.join("server-registry.sqlite3").exists());
        assert!(matches!(
            get_servers(),
            Err(FfiError::Core { ref code, .. }) if code == "core.not_started"
        ));

        // One registered server with its managed folder, imported from the legacy JSON.
        let server_dir = data_dir.join("servers").join("server-1");
        std::fs::create_dir_all(&server_dir).unwrap();
        std::fs::write(
            server_dir.join("server.properties"),
            "# managed properties\r\nmotd=E2E\r\nserver-port=25565\r\n",
        )
        .unwrap();
        std::fs::write(
            server_dir.join("whitelist.json"),
            r#"[{"uuid":"8667ba71b85a4004af54457a9734eed7","name":"Alex"}]"#,
        )
        .unwrap();
        for name in ["ops.json", "banned-players.json", "banned-ips.json"] {
            std::fs::write(server_dir.join(name), "[]").unwrap();
        }
        std::fs::write(
            data_dir.join("servers.json"),
            format!(
                r#"[{{"id":"server-1","name":"E2E Server","version":"1.21.10","software":"Paper","port":25565,"memory":2048,"path":"{}","status":"offline"}}]"#,
                // Windows paths contain backslashes, which JSON must escape.
                server_dir.display().to_string().replace('\\', "\\\\")
            ),
        )
        .unwrap();

        drop(held);
        assert!(matches!(
            start_in(data_dir.clone(), "/app".into()).unwrap(),
            StartOutcome::Ready { .. }
        ));
        let servers = get_servers().unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].path, server_dir.display().to_string());
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let version_status = runtime
            .block_on(server_jar_version_status("server-1".into()))
            .unwrap();
        assert_eq!(version_status.registered_version, "1.21.10");
        assert_eq!(version_status.detected_version, None);
        assert!(!version_status.mismatch);
        assert_eq!(
            runtime
                .block_on(sync_version_from_jar("server-1".into()))
                .unwrap(),
            version_status
        );
        assert!(matches!(
            runtime
                .block_on(server_jar_version_availability(
                    "Custom".into(),
                    "1.21.10".into()
                ))
                .unwrap(),
            ServerJarVersionAvailability::None { reason } if !reason.is_empty()
        ));

        let plugin_dir = server_dir.join("plugins");
        std::fs::create_dir(&plugin_dir).unwrap();
        std::fs::write(plugin_dir.join("Example.jar"), b"local artifact").unwrap();
        let installed = runtime
            .block_on(installed_plugins("server-1".into(), false))
            .unwrap();
        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].file_name, "Example.jar");
        assert!(installed[0].enabled);
        assert!(installed[0].origin.is_none());
        assert!(matches!(installed[0].update, PluginUpdateStatus::Local));
        assert_eq!(
            runtime
                .block_on(toggle_installed_plugin(
                    "server-1".into(),
                    "Example.jar".into()
                ))
                .unwrap(),
            "Example.jar.disabled"
        );
        runtime
            .block_on(uninstall_plugin(
                "server-1".into(),
                "Example.jar.disabled".into(),
            ))
            .unwrap();
        assert!(!plugin_dir.join("Example.jar.disabled").exists());

        let properties = runtime
            .block_on(get_server_properties("server-1".into()))
            .unwrap();
        assert_eq!(properties.line_ending, PropertyLineEnding::CrLf);
        assert_eq!(properties.entries[0].key, "motd");
        let saved = runtime
            .block_on(save_server_properties(
                "server-1".into(),
                vec![PropertyUpdate {
                    key: "motd".into(),
                    value: "Native E2E".into(),
                }],
            ))
            .unwrap();
        assert_eq!(saved.port_changed_to, None);
        let saved_text = std::fs::read_to_string(server_dir.join("server.properties")).unwrap();
        assert!(saved_text.starts_with("# managed properties\r\n"));
        assert!(saved_text.contains("motd=Native E2E\r\n"));

        let player_lists = runtime
            .block_on(get_player_lists("server-1".into()))
            .unwrap();
        assert_eq!(player_lists.whitelist.len(), 1);
        assert_eq!(player_lists.whitelist[0].name, "Alex");
        let removed = runtime
            .block_on(mutate_player_list(
                "server-1".into(),
                PlayerListKind::Whitelist,
                PlayerListAction::Remove,
                "Alex".into(),
            ))
            .unwrap();
        assert!(removed.changed);
        assert_eq!(removed.canonical_target, "Alex");
        assert!(removed.lists.whitelist.is_empty());

        // Idempotent.
        assert!(matches!(
            start_in(data_dir.clone(), "/app".into()).unwrap(),
            StartOutcome::Ready { .. }
        ));

        // Server management through the same async exports the Swift app calls.
        let copy = runtime
            .block_on(clone_server("server-1".into(), "E2E Server Copy".into()))
            .unwrap();
        assert_eq!(copy.name, "E2E Server Copy");
        assert!(std::path::Path::new(&copy.path)
            .join("server.properties")
            .is_file());
        assert_eq!(get_servers().unwrap().len(), 2);

        runtime
            .block_on(save_server_template_from_server(
                "server-1".into(),
                "Survival Template".into(),
            ))
            .unwrap();
        let (_, registry, _) = session_handles().unwrap();
        let templates = registry.get_server_templates().unwrap();
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0].name, "Survival Template");
        assert_eq!(templates[0].software, "Paper");

        assert!(runtime.block_on(delete_server(copy.id.clone())).unwrap());
        assert!(!std::path::Path::new(&copy.path).exists());
        assert_eq!(get_servers().unwrap().len(), 1);

        // Unknown server: a structured error, not a panic.
        assert!(matches!(
            runtime.block_on(delete_server("missing".into())),
            Err(FfiError::Core { ref code, .. }) if code == "server.operation_failed"
        ));
    }

    #[test]
    fn redact_removes_the_data_dir() {
        let dir = std::path::Path::new("/Users/me/Library/Application Support/x");
        assert_eq!(
            redact("failed at /Users/me/Library/Application Support/x/db", dir),
            "failed at <data>/db"
        );
    }

    #[test]
    fn server_settings_records_preserve_core_values_and_request_semantics() {
        let core_settings = CoreServerSettings {
            server_id: "server-1".into(),
            server_path: "/managed/servers/server-1".into(),
            name: "Survival".into(),
            profile_name: "Main".into(),
            group_name: "Production".into(),
            software: "Paper".into(),
            version: "1.21.10".into(),
            memory_mb: 8192,
            port: 25566,
            java_path: Some("/usr/bin/java".into()),
            jvm_args: "-Xms4G -Xmx8G".into(),
            auto_restart_on_crash: true,
            max_auto_restarts: 7,
            auto_restart_delay_sec: 12,
            auto_backup_enabled: true,
            auto_backup_interval_min: 90,
            auto_backup_schedule_type: CoreAutoBackupScheduleType::Weekly,
            auto_backup_time: "04:30".into(),
            auto_backup_weekday: 2,
            auto_backup_retain_count: 5,
            auto_backup_retain_days: 14,
            backup_restart_after_safe_backup: true,
            notify_on_crash: true,
            notify_on_start: true,
            notify_on_high_cpu: true,
            notify_high_cpu_threshold: 87,
        };

        let settings = ServerSettings::from(core_settings.clone());
        assert_eq!(settings.server_id, "server-1");
        assert_eq!(settings.server_path, "/managed/servers/server-1");
        assert_eq!(settings.name, "Survival");
        assert_eq!(settings.profile_name, "Main");
        assert_eq!(settings.group_name, "Production");
        assert_eq!(settings.software, "Paper");
        assert_eq!(settings.version, "1.21.10");
        assert_eq!(settings.memory_mb, 8192);
        assert_eq!(settings.port, 25566);
        assert_eq!(settings.java_path.as_deref(), Some("/usr/bin/java"));
        assert_eq!(settings.jvm_args, "-Xms4G -Xmx8G");
        assert!(settings.auto_restart_on_crash);
        assert_eq!(settings.max_auto_restarts, 7);
        assert_eq!(settings.auto_restart_delay_sec, 12);
        assert!(settings.auto_backup_enabled);
        assert_eq!(settings.auto_backup_interval_min, 90);
        assert_eq!(
            settings.auto_backup_schedule_type,
            AutoBackupScheduleType::Weekly
        );
        assert_eq!(settings.auto_backup_time, "04:30");
        assert_eq!(settings.auto_backup_weekday, 2);
        assert_eq!(settings.auto_backup_retain_count, 5);
        assert_eq!(settings.auto_backup_retain_days, 14);
        assert!(settings.backup_restart_after_safe_backup);
        assert!(settings.notify_on_crash);
        assert!(settings.notify_on_start);
        assert!(settings.notify_on_high_cpu);
        assert_eq!(settings.notify_high_cpu_threshold, 87);

        let saved = ServerSettingsSaveResult::from(CoreServerSettingsSaveResult {
            settings: core_settings,
            restart_required: true,
        });
        assert!(saved.restart_required);
        assert_eq!(saved.settings.server_id, "server-1");

        let update = ServerSettingsUpdate {
            name: "Creative".into(),
            profile_name: "Build".into(),
            group_name: "Testing".into(),
            software: "Paper".into(),
            version: "1.21.11".into(),
            memory_mb: 4096,
            port: 25567,
            java_path: None,
            jvm_args: "-Xms2G -Xmx4G".into(),
            auto_restart_on_crash: false,
            max_auto_restarts: 3,
            auto_restart_delay_sec: 5,
            auto_backup_enabled: false,
            auto_backup_interval_min: 60,
            auto_backup_schedule_type: AutoBackupScheduleType::Daily,
            auto_backup_time: "03:00".into(),
            auto_backup_weekday: 0,
            auto_backup_retain_count: 2,
            auto_backup_retain_days: 7,
            backup_restart_after_safe_backup: None,
            notify_on_crash: true,
            notify_on_start: false,
            notify_on_high_cpu: false,
            notify_high_cpu_threshold: 90,
        }
        .into_core();
        assert_eq!(update.name, "Creative");
        assert_eq!(update.profile_name, "Build");
        assert_eq!(update.group_name, "Testing");
        assert_eq!(update.software, "Paper");
        assert_eq!(update.version, "1.21.11");
        assert_eq!(update.memory_mb, 4096);
        assert_eq!(update.port, 25567);
        assert_eq!(update.java_path, None);
        assert_eq!(update.jvm_args, "-Xms2G -Xmx4G");
        assert!(!update.auto_restart_on_crash);
        assert_eq!(update.max_auto_restarts, 3);
        assert_eq!(update.auto_restart_delay_sec, 5);
        assert!(!update.auto_backup_enabled);
        assert_eq!(update.auto_backup_interval_min, 60);
        assert_eq!(
            update.auto_backup_schedule_type,
            CoreAutoBackupScheduleType::Daily
        );
        assert_eq!(update.auto_backup_time, "03:00");
        assert_eq!(update.auto_backup_weekday, 0);
        assert_eq!(update.auto_backup_retain_count, 2);
        assert_eq!(update.auto_backup_retain_days, 7);
        assert_eq!(update.backup_restart_after_safe_backup, None);
        assert!(update.notify_on_crash);
        assert!(!update.notify_on_start);
        assert!(!update.notify_on_high_cpu);
        assert_eq!(update.notify_high_cpu_threshold, 90);
    }

    #[test]
    fn properties_missing_and_malformed_errors_remain_distinct() {
        let data_dir = std::path::Path::new("/private/data");
        let missing = properties_error(
            PropertiesError {
                kind: PropertiesErrorKind::Missing,
                message: "server.properties is missing".into(),
            },
            data_dir,
        );
        let malformed = properties_error(
            PropertiesError {
                kind: PropertiesErrorKind::Malformed,
                message: "server.properties is malformed".into(),
            },
            data_dir,
        );
        assert!(matches!(
            missing,
            FfiError::Core { ref code, .. } if code == "properties.missing"
        ));
        assert!(matches!(
            malformed,
            FfiError::Core { ref code, .. } if code == "properties.malformed"
        ));
    }

    #[test]
    fn player_input_errors_have_distinct_stable_codes() {
        let data_dir = std::path::Path::new("/private/data");
        let invalid_name = player_list_error(
            PlayerListError {
                kind: PlayerListErrorKind::InvalidPlayerName,
                message: "invalid name".into(),
            },
            data_dir,
        );
        let invalid_ip = player_list_error(
            PlayerListError {
                kind: PlayerListErrorKind::InvalidIpAddress,
                message: "invalid IP".into(),
            },
            data_dir,
        );
        assert!(matches!(
            invalid_name,
            FfiError::Core { ref code, .. } if code == "player.invalid_name"
        ));
        assert!(matches!(
            invalid_ip,
            FfiError::Core { ref code, .. } if code == "player.invalid_ip"
        ));
    }
}
