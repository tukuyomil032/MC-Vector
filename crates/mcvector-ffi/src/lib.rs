//! Swift-facing API of the MC-Vector core (NAT-004 / API-001).
//!
//! Only typed records, enums and functions cross this boundary; Tauri command
//! names and JSON values never do. Every failure is `FfiError::Core`, which the
//! hand-written Swift layer turns into `CoreError { code, message, retryable }`.
//!
//! Data access is only possible after `start` has taken the cross-edition
//! instance lock (NAT-010): `start` stores the lock and the opened registry in
//! process-wide state, and every other function reads that state.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use mcvector_core::download::CancelFlag;
use mcvector_core::error::{CoreError, CoreErrorCode};
use mcvector_core::instance_lock::{self, InstanceLock, LockOutcome, LockOwner};
use mcvector_core::lifecycle;
use mcvector_core::operations::ServerOperationManager;
use mcvector_core::paths;
use mcvector_core::registry::{
    template_from_server, MinecraftServer, ServerRegistry, ServerTemplate,
};
use mcvector_core::server_creation::{self, CreationEvent, NewServerRequest};
use mcvector_core::server_jar;

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
            })
        }
        Err(error) => {
            return Err(core_error(
                CoreErrorCode::LockUnavailable,
                format!("The instance lock could not be taken: {}.", error.kind()),
            ))
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
// Server management (OP-SRV-004, OP-SRV-015, OP-SRV-016)

/// Until the Native server manager exists (phase 6), no server can be running in
/// this process, and the instance lock keeps the Tauri edition from running any.
async fn no_server_is_running(_server_id: String) -> bool {
    false
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
        no_server_is_running,
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
        no_server_is_running,
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
        None,
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
        std::fs::write(server_dir.join("server.properties"), "motd=E2E\n").unwrap();
        std::fs::write(
            data_dir.join("servers.json"),
            format!(
                r#"[{{"id":"server-1","name":"E2E Server","version":"1.21.10","software":"Paper","port":25565,"memory":2048,"path":"{}","status":"offline"}}]"#,
                server_dir.display()
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
        // Idempotent.
        assert!(matches!(
            start_in(data_dir.clone(), "/app".into()).unwrap(),
            StartOutcome::Ready { .. }
        ));

        // Server management through the same async exports the Swift app calls.
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
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
}
