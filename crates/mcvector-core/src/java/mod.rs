//! Java runtimes: the registry of installed runtimes (app-managed Temurin
//! downloads and runtimes the user added), Adoptium downloads with SHA-256
//! verification and safe extraction, deletion, and which Java a Minecraft
//! version needs.
//!
//! Every mutation holds the global `JavaRuntime` operation lock, so Tauri and
//! Native callers in one process never overlap. A runtime used by a running
//! server is never replaced or deleted.

pub mod adoptium;
pub mod extract;
pub mod install;
pub mod probe;
pub mod registry;
pub mod requirement;
mod resolution;

use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use uuid::Uuid;

pub use adoptium::{JavaPackage, FALLBACK_LTS_RELEASES, JAVA_DOWNLOAD_HOSTS};
pub use registry::{
    decode_java_versions, upsert_java_version, ConfigJavaRegistry, JavaRegistryStore, JavaVersion,
    JAVA_REGISTRY_KEY,
};
pub use requirement::{required_java, table_requirement, JavaRequirement, RequirementSource};
pub(crate) use resolution::{java_requirement_for_launch, resolve_java_with_requirement};
pub use resolution::{
    resolve_java_for_server, JavaResolution, JavaSelection, JavaSelectionReason,
    SYSTEM_JAVA_SENTINEL,
};

use crate::download::{
    self, CancelFlag, DownloadError, DownloadErrorKind, DownloadOptions, ExpectedChecksum,
};
use crate::error::{CoreError, CoreErrorCode};
use crate::java_policy::validate_java_executable_path;
use crate::operations::{GlobalOperation, OperationKind, ServerOperationManager};
use crate::registry::MinecraftServer;
use crate::server_process::ServerManager;
use install::{
    backup_java_install_for_removal, cleanup_java_backup, install_java_with_rollback,
    managed_install_dir, managed_java_root, reject_mutation_of_running_runtime,
    restore_java_install_backup, rollback_java_install, validate_managed_java_install_dir,
    DirectoryGuard, FileGuard, RuntimeInUse,
};

/// Why a Java operation failed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JavaErrorKind {
    /// The major version or path is malformed.
    InvalidRequest,
    /// A running server uses the runtime.
    InUse,
    /// Another runtime is registered for the same major version.
    Duplicate,
    /// Adoptium offers no build for this OS or CPU.
    UnsupportedPlatform,
    /// The picked file is not an acceptable java executable.
    InvalidExecutable,
    /// `java -version` failed or could not be read.
    ProbeFailed,
    /// The archive is unsafe or malformed.
    ArchiveInvalid,
    /// The stored runtime list is malformed (it is left untouched).
    RegistryInvalid,
    /// A local file or registry write failed.
    InstallFailed,
    /// The provider metadata could not be read.
    Unavailable,
    Network,
    ChecksumMismatch,
    TooLarge,
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JavaError {
    pub kind: JavaErrorKind,
    pub message: String,
}

impl JavaError {
    pub fn new(kind: JavaErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    fn cancelled() -> Self {
        Self::new(JavaErrorKind::Cancelled, "Java installation was cancelled")
    }

    pub fn code(&self) -> CoreErrorCode {
        match self.kind {
            JavaErrorKind::InvalidRequest => CoreErrorCode::JavaInvalidRequest,
            JavaErrorKind::InUse => CoreErrorCode::JavaInUse,
            JavaErrorKind::Duplicate => CoreErrorCode::JavaDuplicate,
            JavaErrorKind::UnsupportedPlatform => CoreErrorCode::JavaUnsupportedPlatform,
            JavaErrorKind::InvalidExecutable => CoreErrorCode::JavaInvalidExecutable,
            JavaErrorKind::ProbeFailed => CoreErrorCode::JavaProbeFailed,
            JavaErrorKind::ArchiveInvalid => CoreErrorCode::JavaArchiveInvalid,
            JavaErrorKind::RegistryInvalid => CoreErrorCode::JavaRegistryInvalid,
            JavaErrorKind::InstallFailed => CoreErrorCode::JavaInstallFailed,
            JavaErrorKind::Unavailable => CoreErrorCode::DownloadUnavailable,
            JavaErrorKind::Network => CoreErrorCode::DownloadNetworkFailed,
            JavaErrorKind::ChecksumMismatch => CoreErrorCode::DownloadChecksumMismatch,
            JavaErrorKind::TooLarge => CoreErrorCode::DownloadTooLarge,
            JavaErrorKind::Cancelled => CoreErrorCode::OperationCancelled,
        }
    }
}

impl fmt::Display for JavaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for JavaError {}

impl From<JavaError> for String {
    fn from(error: JavaError) -> Self {
        error.message
    }
}

impl From<JavaError> for CoreError {
    fn from(error: JavaError) -> Self {
        CoreError::new(error.code(), error.message)
    }
}

fn download_error(error: DownloadError) -> JavaError {
    let kind = match error.kind {
        DownloadErrorKind::Policy => JavaErrorKind::Unavailable,
        DownloadErrorKind::Network => JavaErrorKind::Network,
        DownloadErrorKind::ChecksumMismatch => JavaErrorKind::ChecksumMismatch,
        DownloadErrorKind::TooLarge => JavaErrorKind::TooLarge,
        DownloadErrorKind::Cancelled => JavaErrorKind::Cancelled,
        DownloadErrorKind::Io => JavaErrorKind::InstallFailed,
    };
    JavaError::new(kind, error.message)
}

/// Where a runtime came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JavaOrigin {
    /// Downloaded by MC-Vector into `<data>/java/jdk-<major>`.
    Managed,
    /// Added by the user from an existing installation.
    Custom,
}

/// One registered runtime with what could be read about it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JavaRuntime {
    pub major: u16,
    /// The full version (`21.0.5`), when the runtime's `release` file or
    /// version check reported it.
    pub version: Option<String>,
    pub name: String,
    /// The registry path: the Java home (managed) or the picked path (custom).
    /// This is what a server profile's `javaPath` is set to.
    pub path: String,
    pub executable: String,
    pub vendor: Option<String>,
    pub origin: JavaOrigin,
    /// Whether the executable still exists.
    pub available: bool,
}

/// One LTS major Adoptium offers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct JavaRelease {
    pub major: u16,
    pub installed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JavaReleases {
    /// Newest first.
    pub releases: Vec<JavaRelease>,
    /// True when Adoptium could not be reached and the fallback list is shown.
    pub offline: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JavaPhase {
    Download,
    Verify,
    Extract,
    Install,
}

/// Install progress. `total` is the archive size; outside `Download` the byte
/// counts stay at the archive size.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct JavaProgress {
    pub phase: JavaPhase,
    pub downloaded: u64,
    pub total: u64,
}

/// A finished install.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstalledJava {
    pub java_home: String,
    pub runtime: JavaRuntime,
}

/// Process-wide handles every mutation needs.
pub struct JavaContext<'a> {
    pub data_dir: &'a Path,
    pub store: Arc<dyn JavaRegistryStore>,
    pub operations: &'a ServerOperationManager,
    pub servers: &'a ServerManager,
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, JavaError> + Send + 'static,
) -> Result<T, JavaError> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|error| JavaError::new(JavaErrorKind::InstallFailed, error.to_string()))?
}

async fn load(store: &Arc<dyn JavaRegistryStore>) -> Result<Vec<JavaVersion>, JavaError> {
    let store = store.clone();
    blocking(move || {
        registry::read_java_versions(store.as_ref())
            .map_err(|error| JavaError::new(JavaErrorKind::RegistryInvalid, error))
    })
    .await
}

async fn save(
    store: &Arc<dyn JavaRegistryStore>,
    versions: Vec<JavaVersion>,
) -> Result<(), JavaError> {
    let store = store.clone();
    blocking(move || {
        registry::write_java_versions(store.as_ref(), &versions)
            .map_err(|error| JavaError::new(JavaErrorKind::InstallFailed, error))
    })
    .await
}

fn validate_major(major: u16) -> Result<(), JavaError> {
    if (1..=99).contains(&major) {
        Ok(())
    } else {
        Err(JavaError::new(
            JavaErrorKind::InvalidRequest,
            "Unsupported Java major version",
        ))
    }
}

fn in_use_error(error: RuntimeInUse) -> JavaError {
    match error {
        RuntimeInUse::Running => JavaError::new(
            JavaErrorKind::InUse,
            "Cannot modify a Java runtime used by a running server",
        ),
        RuntimeInUse::Inspect(message) => JavaError::new(JavaErrorKind::InstallFailed, message),
    }
}

/// The registry entry with what its `release` file says. No process runs.
pub fn runtime_from_entry(entry: &JavaVersion) -> JavaRuntime {
    let origin = if entry.is_custom == Some(true) {
        JavaOrigin::Custom
    } else {
        JavaOrigin::Managed
    };
    let path = Path::new(&entry.path);
    let (home, executable) = match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() => {
            (Some(path.to_path_buf()), probe::executable_in_home(path))
        }
        _ => (probe::home_of_executable(path), path.to_path_buf()),
    };
    let (version, implementor) = home
        .as_deref()
        .and_then(probe::read_release_file)
        .unwrap_or((None, None));
    let vendor = implementor
        .as_deref()
        .and_then(probe::vendor_from_text)
        .or(implementor)
        .or_else(|| (origin == JavaOrigin::Managed).then(|| "Eclipse Adoptium".to_owned()));
    JavaRuntime {
        major: entry.version,
        version,
        name: entry.name.clone(),
        path: entry.path.clone(),
        available: executable.is_file(),
        executable: executable.to_string_lossy().into_owned(),
        vendor,
        origin,
    }
}

/// The raw registry, as the Tauri `get_java_versions` command returns it.
pub async fn registry_entries(
    store: Arc<dyn JavaRegistryStore>,
) -> Result<Vec<JavaVersion>, JavaError> {
    load(&store).await
}

/// Every registered runtime, newest major first.
pub async fn installed_runtimes(
    store: Arc<dyn JavaRegistryStore>,
) -> Result<Vec<JavaRuntime>, JavaError> {
    let versions = load(&store).await?;
    blocking(move || {
        let mut runtimes: Vec<JavaRuntime> = versions.iter().map(runtime_from_entry).collect();
        runtimes.sort_by(|a, b| b.major.cmp(&a.major));
        Ok(runtimes)
    })
    .await
}

/// The LTS majors Adoptium offers, newest first, with whether each is
/// registered. Falls back to [`FALLBACK_LTS_RELEASES`] when offline.
pub async fn available_releases(
    store: Arc<dyn JavaRegistryStore>,
) -> Result<JavaReleases, JavaError> {
    let installed = load(&store).await?;
    let (majors, offline) = match adoptium::available_lts_releases().await {
        Ok(majors) => (majors, false),
        Err(error) => {
            log::info!("Adoptium release list unavailable; using the fallback list: {error}");
            (FALLBACK_LTS_RELEASES.to_vec(), true)
        }
    };
    Ok(merge_releases(&majors, &installed, offline))
}

fn merge_releases(majors: &[u16], installed: &[JavaVersion], offline: bool) -> JavaReleases {
    let mut releases: Vec<JavaRelease> = majors
        .iter()
        .map(|major| JavaRelease {
            major: *major,
            installed: installed.iter().any(|entry| entry.version == *major),
        })
        .collect();
    releases.sort_by(|a, b| b.major.cmp(&a.major));
    releases.dedup_by_key(|release| release.major);
    JavaReleases { releases, offline }
}

/// Downloads and installs the newest Temurin JDK of `major` for this machine.
/// Replaces an earlier managed install of the same major atomically.
pub async fn install<F>(
    context: &JavaContext<'_>,
    major: u16,
    cancel: Option<&CancelFlag>,
    progress: F,
) -> Result<InstalledJava, JavaError>
where
    F: FnMut(JavaProgress) + Send,
{
    let _operation = context
        .operations
        .acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall)
        .await
        .map_err(|error| JavaError::new(JavaErrorKind::InstallFailed, error))?;
    validate_major(major)?;
    if cancel.is_some_and(CancelFlag::is_cancelled) {
        return Err(JavaError::cancelled());
    }
    // Fail before downloading when the stored list cannot be updated.
    load(&context.store).await?;
    let package = match adoptium::e2e_java_fixture()
        .map_err(|error| JavaError::new(JavaErrorKind::InvalidRequest, error))?
    {
        Some(package) => package,
        None => {
            adoptium::host_platform()
                .map_err(|error| JavaError::new(JavaErrorKind::UnsupportedPlatform, error))?;
            let install_dir = managed_install_dir(context.data_dir, major);
            validate_managed_java_install_dir(context.data_dir, &install_dir)
                .map_err(|error| JavaError::new(JavaErrorKind::InstallFailed, error))?;
            reject_mutation_of_running_runtime(context.servers, &install_dir)
                .await
                .map_err(in_use_error)?;
            adoptium::resolve_package(major)
                .await
                .map_err(|error| JavaError::new(JavaErrorKind::Unavailable, error))?
        }
    };
    install_package_locked(context, major, &package, cancel, progress).await
}

/// The install steps after the package is known. The caller holds the
/// `JavaRuntime` lock.
pub(crate) async fn install_package_locked<F>(
    context: &JavaContext<'_>,
    major: u16,
    package: &JavaPackage,
    cancel: Option<&CancelFlag>,
    mut progress: F,
) -> Result<InstalledJava, JavaError>
where
    F: FnMut(JavaProgress) + Send,
{
    let failed = |error: String| JavaError::new(JavaErrorKind::InstallFailed, error);
    let check_cancel = || {
        if cancel.is_some_and(CancelFlag::is_cancelled) {
            Err(JavaError::cancelled())
        } else {
            Ok(())
        }
    };
    let mut versions = load(&context.store).await?;
    let install_path = validate_managed_java_install_dir(
        context.data_dir,
        &managed_install_dir(context.data_dir, major),
    )
    .map_err(failed)?;
    reject_mutation_of_running_runtime(context.servers, &install_path)
        .await
        .map_err(in_use_error)?;
    let java_root = managed_java_root(context.data_dir);
    tokio::fs::create_dir_all(&java_root)
        .await
        .map_err(|error| failed(format!("Failed to create managed Java root: {error}")))?;
    // Download, staging, and install paths are spelled below the canonical root
    // because the containment checks compare against it; on Windows the plain
    // app-data spelling never starts with the verbatim (`\\?\`) canonical form.
    let managed_root = java_root
        .canonicalize()
        .map_err(|error| failed(format!("Failed to resolve managed Java root: {error}")))?;

    let total = package.size;
    let extension = package.archive.extension();
    let archive_path = managed_root.join(format!(
        ".jdk-{major}.{extension}-verified-{}.part",
        Uuid::new_v4()
    ));
    let mut archive_guard = FileGuard::new(archive_path.clone());
    progress(JavaProgress {
        phase: JavaPhase::Download,
        downloaded: 0,
        total,
    });
    download::download_to_destination(
        &package.url,
        archive_path.clone(),
        &managed_root,
        Some(ExpectedChecksum::sha256(package.sha256.clone())),
        adoptium::MAX_JAVA_ARCHIVE_BYTES,
        DownloadOptions {
            expected_size: Some(total),
            allowed_hosts: Some(JAVA_DOWNLOAD_HOSTS),
            cancel,
        },
        |downloaded, reported_total| {
            progress(JavaProgress {
                phase: JavaPhase::Download,
                downloaded,
                total: if reported_total > 0 {
                    reported_total
                } else {
                    total
                },
            })
        },
    )
    .await
    .map_err(download_error)?;
    // The bytes were hashed while streaming; the file only exists once they matched.
    progress(JavaProgress {
        phase: JavaPhase::Verify,
        downloaded: total,
        total,
    });
    check_cancel()?;

    let staging_dir = managed_root.join(format!(".jdk-{major}.staging-{}", Uuid::new_v4()));
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|error| failed(format!("Failed to create Java staging directory: {error}")))?;
    let mut staging_guard = DirectoryGuard::new(staging_dir.clone());
    progress(JavaProgress {
        phase: JavaPhase::Extract,
        downloaded: total,
        total,
    });
    let archive_kind = package.archive;
    let extract_archive = archive_path.clone();
    let extract_dir = staging_dir.clone();
    let extract_cancel = cancel.cloned();
    let java_home = blocking(move || {
        extract::extract(
            archive_kind,
            &extract_archive,
            &extract_dir,
            extract_cancel.as_ref(),
        )
        .map_err(|error| {
            if error == extract::CANCELLED_MESSAGE {
                JavaError::cancelled()
            } else {
                JavaError::new(JavaErrorKind::ArchiveInvalid, error)
            }
        })
    })
    .await?;
    let relative_java_home = java_home
        .strip_prefix(&staging_dir)
        .map_err(|_| failed("Java extraction returned a path outside staging".into()))?
        .to_path_buf();
    tokio::fs::remove_file(&archive_path)
        .await
        .map_err(|error| failed(format!("Failed to remove verified Java archive: {error}")))?;
    archive_guard.disarm();
    check_cancel()?;

    progress(JavaProgress {
        phase: JavaPhase::Install,
        downloaded: total,
        total,
    });
    let destination = managed_root.join(format!("jdk-{major}"));
    let commit_staging = staging_dir.clone();
    let commit_root = managed_root.clone();
    let commit_destination = destination.clone();
    let previous_install = blocking(move || {
        install_java_with_rollback(&commit_staging, &commit_destination, &commit_root)
            .map_err(failed)
    })
    .await?;
    staging_guard.disarm();
    let java_home = install_path
        .join(relative_java_home)
        .to_string_lossy()
        .into_owned();
    let entry = JavaVersion {
        version: major,
        path: java_home.clone(),
        name: format!("Java {major}"),
        is_custom: None,
    };
    upsert_java_version(&mut versions, entry.clone());
    if let Err(error) = save(&context.store, versions).await {
        let rollback_path = install_path.clone();
        let rollback = blocking(move || {
            rollback_java_install(&rollback_path, previous_install.as_deref()).map_err(failed)
        })
        .await;
        return Err(match rollback {
            Ok(()) => error,
            Err(rollback_error) => failed(format!(
                "{error}; failed to restore the previous Java installation: {rollback_error}"
            )),
        });
    }
    if let Some(previous_install) = previous_install {
        let _ = tokio::task::spawn_blocking(move || cleanup_java_backup(&previous_install)).await;
    }
    let runtime = blocking(move || Ok(runtime_from_entry(&entry))).await?;
    Ok(InstalledJava { java_home, runtime })
}

/// Removes a runtime from the registry. A managed runtime's folder is
/// deleted too, unless a running server uses it. Unknown majors succeed.
pub async fn delete(context: &JavaContext<'_>, major: u16) -> Result<(), JavaError> {
    let _operation = context
        .operations
        .acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall)
        .await
        .map_err(|error| JavaError::new(JavaErrorKind::InstallFailed, error))?;
    validate_major(major)?;
    let failed = |error: String| JavaError::new(JavaErrorKind::InstallFailed, error);
    let mut versions = load(&context.store).await?;
    let Some(index) = versions.iter().position(|version| version.version == major) else {
        return Ok(());
    };

    let deletion = if versions[index].is_custom != Some(true) {
        let install_dir = managed_install_dir(context.data_dir, major);
        validate_managed_java_install_dir(context.data_dir, &install_dir).map_err(failed)?;
        reject_mutation_of_running_runtime(context.servers, &install_dir)
            .await
            .map_err(in_use_error)?;
        let backup_dir = install_dir.clone();
        blocking(move || backup_java_install_for_removal(&backup_dir).map_err(failed))
            .await?
            .map(|backup| (install_dir, backup))
    } else {
        None
    };

    versions.remove(index);
    if let Err(error) = save(&context.store, versions).await {
        if let Some((install_dir, backup)) = deletion {
            let restored = blocking(move || {
                restore_java_install_backup(&backup, &install_dir).map_err(failed)
            })
            .await;
            if let Err(rollback_error) = restored {
                return Err(failed(format!(
                    "{error}; failed to restore Java installation: {rollback_error}"
                )));
            }
        }
        return Err(error);
    }
    if let Some((_, backup)) = deletion {
        let _ = tokio::task::spawn_blocking(move || cleanup_java_backup(&backup)).await;
    }
    Ok(())
}

/// Registers an existing runtime. `path` is a java executable or a Java home;
/// it must pass the launch policy (app-managed or a trusted system location),
/// and `-version` must report its major. A custom entry of the same major is
/// replaced; a managed one is kept and the call fails with `Duplicate`.
pub async fn add_custom(context: &JavaContext<'_>, path: &str) -> Result<JavaRuntime, JavaError> {
    let _operation = context
        .operations
        .acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall)
        .await
        .map_err(|error| JavaError::new(JavaErrorKind::InstallFailed, error))?;
    let raw = path.trim();
    if raw.is_empty() || raw.len() > 4096 || raw.chars().any(char::is_control) {
        return Err(JavaError::new(
            JavaErrorKind::InvalidRequest,
            "Java path is invalid",
        ));
    }
    let java_root = managed_java_root(context.data_dir);
    let candidate = PathBuf::from(raw);
    let validated = blocking(move || {
        std::fs::create_dir_all(&java_root).map_err(|error| {
            JavaError::new(
                JavaErrorKind::InstallFailed,
                format!("Failed to create managed Java root: {}", error.kind()),
            )
        })?;
        let executable = match std::fs::symlink_metadata(&candidate) {
            Ok(metadata) if metadata.is_dir() => probe::executable_in_home(&candidate),
            _ => candidate,
        };
        if matches!(executable.to_str(), Some("java" | "java.exe")) {
            return Err(JavaError::new(
                JavaErrorKind::InvalidExecutable,
                "Pick a java executable or a Java home folder",
            ));
        }
        validate_java_executable_path(&executable.to_string_lossy(), &java_root)
            .map_err(|error| JavaError::new(JavaErrorKind::InvalidExecutable, error))
    })
    .await?;
    let probed = probe::probe_executable(&validated, probe::PROBE_TIMEOUT)
        .await
        .map_err(|error| JavaError::new(JavaErrorKind::ProbeFailed, error))?;

    let mut versions = load(&context.store).await?;
    if versions
        .iter()
        .any(|entry| entry.version == probed.major && entry.is_custom != Some(true))
    {
        return Err(JavaError::new(
            JavaErrorKind::Duplicate,
            format!(
                "Java {} is already installed by MC-Vector; remove it first",
                probed.major
            ),
        ));
    }
    let name = match &probed.vendor {
        Some(vendor) => format!("{vendor} {}", probed.version),
        None => format!("Java {}", probed.version),
    };
    let entry = JavaVersion {
        version: probed.major,
        path: validated.to_string_lossy().into_owned(),
        name: name.chars().take(256).collect(),
        is_custom: Some(true),
    };
    upsert_java_version(&mut versions, entry.clone());
    save(&context.store, versions).await?;
    let mut runtime = blocking(move || Ok(runtime_from_entry(&entry))).await?;
    runtime.version = Some(probed.version);
    if probed.vendor.is_some() {
        runtime.vendor = probed.vendor;
    }
    Ok(runtime)
}

/// A server profile's Java against what its Minecraft version needs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JavaCompatibility {
    pub required: Option<JavaRequirement>,
    /// The runtime path, when a registered or explicit path is selected.
    pub configured_path: Option<String>,
    pub configured_major: Option<u16>,
    pub configured_version: Option<String>,
    /// `configured_major >= required`, or None when either is unknown.
    pub satisfied: Option<bool>,
}

/// Reports the configured runtime of `server` and whether it meets the
/// version's requirement. A registered runtime is read from the registry and
/// its `release` file; anything else is checked with `-version`.
pub async fn profile_compatibility(
    data_dir: &Path,
    store: Arc<dyn JavaRegistryStore>,
    server: &MinecraftServer,
) -> JavaCompatibility {
    let required = required_java(&server.software, &server.version).await;
    let (choice, system) = resolution::resolve_selection(
        store.clone(),
        server.java_path.as_deref(),
        required.map(|requirement| requirement.major),
    )
    .await;
    let (configured_path, configured_major, configured_version) = match choice {
        JavaSelection::Installed {
            path,
            major,
            version,
            ..
        } => (Some(path), Some(major), version),
        JavaSelection::Explicit { path } if !matches!(path.trim(), "java" | "java.exe") => {
            let (major, version) = configured_runtime(data_dir, &store, &path).await;
            (Some(path), major, version)
        }
        JavaSelection::Explicit { .. } | JavaSelection::SystemDefault => {
            let system = resolution::system_java().await;
            (None, system.major, system.version)
        }
        JavaSelection::System { .. } | JavaSelection::Missing { .. } => {
            (None, system.major, system.version)
        }
    };
    JavaCompatibility {
        satisfied: match (configured_major, required) {
            (Some(configured), Some(required)) => Some(configured >= required.major),
            _ => None,
        },
        required,
        configured_path,
        configured_major,
        configured_version,
    }
}

async fn configured_runtime(
    data_dir: &Path,
    store: &Arc<dyn JavaRegistryStore>,
    configured: &str,
) -> (Option<u16>, Option<String>) {
    let configured = configured.trim();
    if let Ok(versions) = load(store).await {
        let runtimes: Vec<JavaRuntime> = versions.iter().map(runtime_from_entry).collect();
        let configured_path = Path::new(configured);
        if let Some(runtime) = runtimes.iter().find(|runtime| {
            Path::new(&runtime.path) == configured_path
                || Path::new(&runtime.executable) == configured_path
        }) {
            return (Some(runtime.major), runtime.version.clone());
        }
    }
    let java_root = managed_java_root(data_dir);
    let candidate = PathBuf::from(configured);
    let validated = tokio::task::spawn_blocking(move || {
        let executable = match std::fs::symlink_metadata(&candidate) {
            Ok(metadata) if metadata.is_dir() => probe::executable_in_home(&candidate),
            _ => candidate,
        };
        validate_java_executable_path(&executable.to_string_lossy(), &java_root).ok()
    })
    .await
    .ok()
    .flatten();
    match validated {
        Some(executable) => {
            match probe::probe_executable(&executable, probe::PROBE_TIMEOUT).await {
                Ok(probed) => (Some(probed.major), Some(probed.version)),
                Err(_) => (None, None),
            }
        }
        None => (None, None),
    }
}

#[cfg(test)]
mod tests;
