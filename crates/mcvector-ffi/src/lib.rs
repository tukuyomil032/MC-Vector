//! Swift-facing API of the MC-Vector core (NAT-004 / API-001).
//!
//! Only typed records, enums and functions cross this boundary; Tauri command
//! names and JSON values never do. Every failure is `FfiError::Core`, which the
//! hand-written Swift layer turns into `CoreError { code, message, retryable }`.
//!
//! Data access is only possible after `start` has taken the cross-edition
//! instance lock (NAT-010): `start` stores the lock and the opened registry in
//! process-wide state, and every other function reads that state.

use std::path::PathBuf;
use std::sync::Mutex;

use mcvector_core::error::{CoreError, CoreErrorCode};
use mcvector_core::instance_lock::{self, InstanceLock, LockOutcome, LockOwner};
use mcvector_core::paths;
use mcvector_core::registry::{MinecraftServer, ServerRegistry};

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
    registry: ServerRegistry,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

/// Takes the instance lock in the shared data root and opens the server
/// registry. Debug builds use the `.debug` data root shared with the Tauri
/// debug build, so development never touches release data (DATA-001).
///
/// Calling it again after it returned `Ready` returns `Ready` without
/// reopening anything.
#[uniffi::export]
pub fn start(debug_build: bool, bundle_path: String) -> Result<StartOutcome, FfiError> {
    let identifier = if debug_build {
        paths::DEBUG_DATA_IDENTIFIER
    } else {
        paths::SHARED_DATA_IDENTIFIER
    };
    let data_dir = paths::data_dir_for(identifier).ok_or_else(|| {
        core_error(
            CoreErrorCode::PathAppDataUnavailable,
            "The application data folder could not be determined.",
        )
    })?;
    start_in(data_dir, bundle_path)
}

fn start_in(data_dir: PathBuf, bundle_path: String) -> Result<StartOutcome, FfiError> {
    let mut session = lock_session()?;
    if session.is_some() {
        return Ok(StartOutcome::Ready {
            data_dir: data_dir.display().to_string(),
        });
    }

    let owner = LockOwner::current(instance_lock::Edition::Native, NATIVE_BUNDLE_ID, bundle_path);
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
            format!("The server registry could not be opened: {}", redact(&error, &data_dir)),
        )
    })?;

    *session = Some(Session {
        _lock: lock,
        registry,
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
        let tauri = LockOwner::current(instance_lock::Edition::Tauri, "com.tukuyomi032.mcvector", "/x");
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

        drop(held);
        assert!(matches!(
            start_in(data_dir.clone(), "/app".into()).unwrap(),
            StartOutcome::Ready { .. }
        ));
        assert!(get_servers().unwrap().is_empty());
        // Idempotent.
        assert!(matches!(
            start_in(data_dir, "/app".into()).unwrap(),
            StartOutcome::Ready { .. }
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
