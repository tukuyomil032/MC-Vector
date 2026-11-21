//! Java runtimes for the Native edition: installed runtimes, Adoptium LTS
//! releases, verified downloads with progress and cancellation, deletion,
//! custom runtimes and the Java a server's Minecraft version needs.
use super::*;
use mcvector_core::java::{
    self as core_java, ConfigJavaRegistry, JavaContext, JavaOrigin, JavaPhase, JavaRegistryStore,
    JavaRequirement, RequirementSource,
};

static OPERATIONS: LazyLock<Mutex<HashMap<String, CancelFlag>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Registers a cancellable long-running operation under a caller-chosen ID
/// for as long as the value lives. Shared by Java installs and jar upgrades.
pub(crate) struct OperationRegistration(String);

impl OperationRegistration {
    pub(crate) fn register(
        id: &str,
        duplicate_code: CoreErrorCode,
    ) -> Result<(Self, CancelFlag), FfiError> {
        use std::collections::hash_map::Entry;

        let mut active = OPERATIONS.lock().unwrap_or_else(|p| p.into_inner());
        let Entry::Vacant(entry) = active.entry(id.to_owned()) else {
            return Err(core_error(duplicate_code, "Operation ID is already active"));
        };
        let cancel = CancelFlag::new();
        entry.insert(cancel.clone());
        Ok((Self(id.to_owned()), cancel))
    }

    pub(crate) fn cancel(id: &str) -> bool {
        let active = OPERATIONS.lock().unwrap_or_else(|p| p.into_inner());
        match active.get(id) {
            Some(cancel) => {
                cancel.cancel();
                true
            }
            None => false,
        }
    }
}

impl Drop for OperationRegistration {
    fn drop(&mut self) {
        OPERATIONS
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&self.0);
    }
}

pub(crate) fn redacted_error(error: CoreError, data: &Path) -> FfiError {
    FfiError::from(CoreError {
        message: redact(&error.message, data),
        ..error
    })
}

fn java_error(error: core_java::JavaError, data: &Path) -> FfiError {
    redacted_error(error.into(), data)
}

pub(crate) fn java_store(data: &Path) -> Arc<dyn JavaRegistryStore> {
    Arc::new(ConfigJavaRegistry::new(data))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum JavaRuntimeOrigin {
    /// Downloaded by MC-Vector into the managed `java` folder.
    Managed,
    /// Added by the user from an existing installation.
    Custom,
}

impl From<JavaOrigin> for JavaRuntimeOrigin {
    fn from(origin: JavaOrigin) -> Self {
        match origin {
            JavaOrigin::Managed => Self::Managed,
            JavaOrigin::Custom => Self::Custom,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct JavaRuntimeRecord {
    pub major: u32,
    /// Full version such as `21.0.5`, when the runtime reported it.
    pub version: Option<String>,
    pub name: String,
    /// Registry path: the Java home (managed) or the picked path (custom).
    /// Set a server's `javaPath` to this value to use the runtime.
    pub path: String,
    pub executable: String,
    pub vendor: Option<String>,
    pub origin: JavaRuntimeOrigin,
    /// Whether the executable still exists.
    pub available: bool,
}

impl From<core_java::JavaRuntime> for JavaRuntimeRecord {
    fn from(v: core_java::JavaRuntime) -> Self {
        Self {
            major: v.major.into(),
            version: v.version,
            name: v.name,
            path: v.path,
            executable: v.executable,
            vendor: v.vendor,
            origin: v.origin.into(),
            available: v.available,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Record)]
pub struct JavaReleaseRecord {
    pub major: u32,
    pub installed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct JavaReleaseList {
    /// Adoptium LTS majors, newest first.
    pub releases: Vec<JavaReleaseRecord>,
    /// True when Adoptium was unreachable and the built-in list is shown.
    pub offline: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum JavaInstallPhase {
    Download,
    Verify,
    Extract,
    Install,
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct JavaInstallProgress {
    pub operation_id: String,
    pub phase: JavaInstallPhase,
    pub downloaded: u64,
    /// Archive size in bytes.
    pub total: u64,
}

#[uniffi::export(with_foreign)]
pub trait JavaInstallObserver: Send + Sync {
    fn on_progress(&self, event: JavaInstallProgress);
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum JavaRequirementSource {
    /// Mojang's version metadata.
    Mojang,
    /// MC-Vector's built-in table (offline or unlisted versions).
    Table,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Record)]
pub struct JavaRequirementRecord {
    pub major: u32,
    pub source: JavaRequirementSource,
}

impl From<JavaRequirement> for JavaRequirementRecord {
    fn from(v: JavaRequirement) -> Self {
        Self {
            major: v.major.into(),
            source: match v.source {
                RequirementSource::Mojang => JavaRequirementSource::Mojang,
                RequirementSource::Table => JavaRequirementSource::Table,
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum JavaSelectionReason {
    Exact,
    NewerMajor,
    NewestAvailable,
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum JavaSelection {
    Installed {
        path: String,
        major: u32,
        version: Option<String>,
        origin: JavaRuntimeOrigin,
        reason: JavaSelectionReason,
    },
    System {
        major: Option<u32>,
    },
    Explicit {
        path: String,
    },
    SystemDefault,
    Missing {
        required: u32,
        system_major: Option<u32>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct JavaResolution {
    pub required_major: Option<u32>,
    pub choice: JavaSelection,
}

impl From<core_java::JavaResolution> for JavaResolution {
    fn from(resolution: core_java::JavaResolution) -> Self {
        use core_java::JavaSelection as Choice;
        use core_java::JavaSelectionReason as Reason;

        let choice = match resolution.choice {
            Choice::Installed {
                path,
                major,
                version,
                origin,
                reason,
            } => JavaSelection::Installed {
                path,
                major: major.into(),
                version,
                origin: origin.into(),
                reason: match reason {
                    Reason::Exact => JavaSelectionReason::Exact,
                    Reason::NewerMajor => JavaSelectionReason::NewerMajor,
                    Reason::NewestAvailable => JavaSelectionReason::NewestAvailable,
                },
            },
            Choice::System { major } => JavaSelection::System {
                major: major.map(Into::into),
            },
            Choice::Explicit { path } => JavaSelection::Explicit { path },
            Choice::SystemDefault => JavaSelection::SystemDefault,
            Choice::Missing {
                required,
                system_major,
            } => JavaSelection::Missing {
                required: required.into(),
                system_major: system_major.map(Into::into),
            },
        };
        Self {
            required_major: resolution.required_major.map(Into::into),
            choice,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct ServerJavaCompatibility {
    pub server_id: String,
    /// None for proxies and versions neither Mojang nor the table knows.
    pub required: Option<JavaRequirementRecord>,
    /// The selected installed or explicit path, or None when launch uses PATH.
    pub configured_path: Option<String>,
    pub configured_major: Option<u32>,
    pub configured_version: Option<String>,
    /// `configured_major >= required.major`; None when either is unknown.
    pub satisfied: Option<bool>,
}

fn java_context<'a>(data: &'a Path, operations: &'a ServerOperationManager) -> JavaContext<'a> {
    JavaContext {
        data_dir: data,
        store: java_store(data),
        operations,
        servers: &*SERVERS,
    }
}

fn u16_major(major: u32) -> u16 {
    // Out-of-range values become 0, which the core rejects as invalid.
    u16::try_from(major).unwrap_or(0)
}

/// Registered runtimes, newest major first. No process is started.
#[uniffi::export(async_runtime = "tokio")]
pub async fn java_runtimes() -> Result<Vec<JavaRuntimeRecord>, FfiError> {
    let (data, _, _) = session_handles()?;
    core_java::installed_runtimes(java_store(&data))
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(|error| java_error(error, &data))
}

/// LTS majors Adoptium offers (or the built-in list when offline).
#[uniffi::export(async_runtime = "tokio")]
pub async fn java_available_releases() -> Result<JavaReleaseList, FfiError> {
    let (data, _, _) = session_handles()?;
    core_java::available_releases(java_store(&data))
        .await
        .map(|list| JavaReleaseList {
            releases: list
                .releases
                .into_iter()
                .map(|release| JavaReleaseRecord {
                    major: release.major.into(),
                    installed: release.installed,
                })
                .collect(),
            offline: list.offline,
        })
        .map_err(|error| java_error(error, &data))
}

/// Downloads, verifies and installs the newest Temurin JDK of `major`.
/// Cancel with `cancel_java_install(operation_id)`.
#[uniffi::export(async_runtime = "tokio")]
pub async fn install_java_runtime(
    operation_id: String,
    major: u32,
    observer: Arc<dyn JavaInstallObserver>,
) -> Result<JavaRuntimeRecord, FfiError> {
    let (data, _, operations) = session_handles()?;
    let (_registration, cancel) =
        OperationRegistration::register(&operation_id, CoreErrorCode::JavaInvalidRequest)?;
    let context = java_context(&data, &operations);
    core_java::install(&context, u16_major(major), Some(&cancel), |event| {
        observer.on_progress(JavaInstallProgress {
            operation_id: operation_id.clone(),
            phase: match event.phase {
                JavaPhase::Download => JavaInstallPhase::Download,
                JavaPhase::Verify => JavaInstallPhase::Verify,
                JavaPhase::Extract => JavaInstallPhase::Extract,
                JavaPhase::Install => JavaInstallPhase::Install,
            },
            downloaded: event.downloaded,
            total: event.total,
        });
    })
    .await
    .map(|installed| installed.runtime.into())
    .map_err(|error| java_error(error, &data))
}

/// Requests cancellation of an active Java install. True when the ID was active.
#[uniffi::export(async_runtime = "tokio")]
pub async fn cancel_java_install(operation_id: String) -> bool {
    OperationRegistration::cancel(&operation_id)
}

/// Removes a runtime. Managed folders are deleted unless a running server uses them.
#[uniffi::export(async_runtime = "tokio")]
pub async fn delete_java_runtime(major: u32) -> Result<(), FfiError> {
    let (data, _, operations) = session_handles()?;
    core_java::delete(&java_context(&data, &operations), u16_major(major))
        .await
        .map_err(|error| java_error(error, &data))
}

/// Registers an existing java executable or Java home after checking its version.
#[uniffi::export(async_runtime = "tokio")]
pub async fn add_custom_java_runtime(path: String) -> Result<JavaRuntimeRecord, FfiError> {
    let (data, _, operations) = session_handles()?;
    core_java::add_custom(&java_context(&data, &operations), &path)
        .await
        .map(Into::into)
        .map_err(|error| java_error(error, &data))
}

/// The Java major `software` at `version` needs, or None (proxies, unknown versions).
#[uniffi::export(async_runtime = "tokio")]
pub async fn required_java_for_version(
    software: String,
    version: String,
) -> Option<JavaRequirementRecord> {
    core_java::required_java(&software, &version)
        .await
        .map(Into::into)
}

/// The value to store in a server profile to force Java from PATH.
#[uniffi::export]
pub fn system_java_sentinel() -> String {
    core_java::SYSTEM_JAVA_SENTINEL.to_owned()
}

/// Resolves a registered server's Java using the same selection as launch.
#[uniffi::export(async_runtime = "tokio")]
pub async fn resolve_server_java(server_id: String) -> Result<JavaResolution, FfiError> {
    let (data, registry, _) = session_handles()?;
    let server = java_server(&data, registry, &server_id).await?;
    Ok(
        core_java::resolve_java_for_server(java_store(&data), &server)
            .await
            .into(),
    )
}

async fn java_server(
    data: &Path,
    registry: ServerRegistry,
    server_id: &str,
) -> Result<MinecraftServer, FfiError> {
    let id = validate_server_id(server_id)
        .map_err(|error| core_error(CoreErrorCode::ServerNotFound, redact(&error, data)))?;
    blocking(move || {
        registry
            .get_servers()
            .map_err(|error| core_error(CoreErrorCode::RegistryReadFailed, error))?
            .into_iter()
            .find(|server| server.id == id)
            .ok_or_else(|| core_error(CoreErrorCode::ServerNotFound, "Server is not registered"))
    })
    .await
    .map_err(|error| match error {
        FfiError::Core {
            code,
            message,
            retryable,
        } => FfiError::Core {
            code,
            message: redact(&message, data),
            retryable,
        },
    })
}

/// The server's selected Java against what its Minecraft version needs.
#[uniffi::export(async_runtime = "tokio")]
pub async fn server_java_compatibility(
    server_id: String,
) -> Result<ServerJavaCompatibility, FfiError> {
    let (data, registry, _) = session_handles()?;
    let server = java_server(&data, registry, &server_id).await?;
    let report = core_java::profile_compatibility(&data, java_store(&data), &server).await;
    Ok(ServerJavaCompatibility {
        server_id: server.id,
        required: report.required.map(Into::into),
        configured_path: report.configured_path,
        configured_major: report.configured_major.map(Into::into),
        configured_version: report.configured_version,
        satisfied: report.satisfied,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operation_ids_are_exclusive_until_dropped_and_cancel_by_id() {
        let id = "ffi-java-operation-test";
        let (registration, cancel) =
            OperationRegistration::register(id, CoreErrorCode::JavaInvalidRequest).unwrap();
        assert!(matches!(
            OperationRegistration::register(id, CoreErrorCode::JavaInvalidRequest),
            Err(FfiError::Core { ref code, .. }) if code == "java.invalid_request"
        ));
        assert!(OperationRegistration::cancel(id));
        assert!(cancel.is_cancelled());
        drop(registration);
        assert!(!OperationRegistration::cancel(id));
    }

    #[test]
    fn java_resolution_preserves_the_installed_reason_and_missing_requirement() {
        let installed: JavaResolution = core_java::JavaResolution {
            required_major: Some(17),
            choice: core_java::JavaSelection::Installed {
                path: "/jdk".into(),
                major: 21,
                version: Some("21.0.5".into()),
                origin: JavaOrigin::Custom,
                reason: core_java::JavaSelectionReason::NewerMajor,
            },
        }
        .into();
        assert_eq!(
            installed,
            JavaResolution {
                required_major: Some(17),
                choice: JavaSelection::Installed {
                    path: "/jdk".into(),
                    major: 21,
                    version: Some("21.0.5".into()),
                    origin: JavaRuntimeOrigin::Custom,
                    reason: JavaSelectionReason::NewerMajor,
                },
            }
        );

        let missing: JavaResolution = core_java::JavaResolution {
            required_major: Some(21),
            choice: core_java::JavaSelection::Missing {
                required: 21,
                system_major: Some(17),
            },
        }
        .into();
        assert_eq!(
            missing,
            JavaResolution {
                required_major: Some(21),
                choice: JavaSelection::Missing {
                    required: 21,
                    system_major: Some(17),
                },
            }
        );
        assert_eq!(system_java_sentinel(), "system");
    }

    #[test]
    fn records_convert_from_core_values() {
        let record: JavaRuntimeRecord = core_java::JavaRuntime {
            major: 21,
            version: Some("21.0.5".into()),
            name: "Java 21".into(),
            path: "/j".into(),
            executable: "/j/bin/java".into(),
            vendor: None,
            origin: JavaOrigin::Custom,
            available: false,
        }
        .into();
        assert_eq!(record.major, 21);
        assert_eq!(record.origin, JavaRuntimeOrigin::Custom);
        assert_eq!(u16_major(70_000), 0);
        let requirement: JavaRequirementRecord = JavaRequirement {
            major: 17,
            source: RequirementSource::Table,
        }
        .into();
        assert_eq!(requirement.source, JavaRequirementSource::Table);
    }
}
