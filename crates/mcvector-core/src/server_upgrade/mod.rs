//! Changing a server version or software by replacing
//! its `server.jar`.
//!
//! [`candidates`] lists the release versions the provider offers. [`ServerJarUpgrader::prepare`]
//! resolves one version into a short-lived plan (file, size, checksum, the
//! Java it needs, whether the server runs). [`ServerJarUpgrader::execute`]
//! consumes the plan: it refuses running servers and jars without a published
//! checksum, downloads and verifies the jar, and swaps it in through the
//! recovery journal (see [`journal`]), updating the registry profile.

mod detection;
pub mod journal;
pub mod versions;

use std::cmp::Ordering;
use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use uuid::Uuid;

use crate::download::{
    self, CancelFlag, DownloadError, DownloadErrorKind, DownloadOptions, ExpectedChecksum,
};
use crate::error::{CoreError, CoreErrorCode};
use crate::java::{self, JavaRequirement};
use crate::managed_path::{
    is_link_or_reparse_point, resolve_managed_request, validate_server_id, ManagedPathRequest,
    ManagedRoot,
};
use crate::operations::{OperationGuard, OperationKind, ServerOperationManager};
use crate::registry::{MinecraftServer, ServerRegistry};
use crate::server_jar::{self, MAX_JAR_BYTES, SERVER_JAR_HOSTS};
use crate::server_process::ServerManager;

pub use detection::{detected_version, sync_version_from_jar, version_status, VersionStatus};
pub use journal::{recover_replacement, recover_startup, JarRecoveryFailure};
pub use versions::{newer_releases, release_notes_url};

/// How long a prepared plan stays valid.
pub const PLAN_TTL: Duration = Duration::from_secs(5 * 60);
const MAX_PENDING_PLANS: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpgradeErrorKind {
    NotFound,
    Running,
    Unsupported,
    NotAvailable,
    Unverified,
    PlanExpired,
    ProfileChanged,
    InvalidRequest,
    InstallFailed,
    Registry,
    /// Provider metadata could not be read.
    Unavailable,
    Network,
    ChecksumMismatch,
    TooLarge,
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpgradeError {
    pub kind: UpgradeErrorKind,
    pub message: String,
}

impl UpgradeError {
    pub fn new(kind: UpgradeErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn code(&self) -> CoreErrorCode {
        match self.kind {
            UpgradeErrorKind::NotFound => CoreErrorCode::ServerNotFound,
            UpgradeErrorKind::Running => CoreErrorCode::ServerRunning,
            UpgradeErrorKind::Unsupported => CoreErrorCode::ServerJarUnsupported,
            UpgradeErrorKind::NotAvailable => CoreErrorCode::ServerJarNotAvailable,
            UpgradeErrorKind::Unverified => CoreErrorCode::ServerJarUnverified,
            UpgradeErrorKind::PlanExpired => CoreErrorCode::ServerJarPlanExpired,
            UpgradeErrorKind::ProfileChanged => CoreErrorCode::ServerJarProfileChanged,
            UpgradeErrorKind::InvalidRequest => CoreErrorCode::ServerJarInvalidRequest,
            UpgradeErrorKind::InstallFailed => CoreErrorCode::ServerJarInstallFailed,
            UpgradeErrorKind::Registry => CoreErrorCode::RegistryReadFailed,
            UpgradeErrorKind::Unavailable => CoreErrorCode::DownloadUnavailable,
            UpgradeErrorKind::Network => CoreErrorCode::DownloadNetworkFailed,
            UpgradeErrorKind::ChecksumMismatch => CoreErrorCode::DownloadChecksumMismatch,
            UpgradeErrorKind::TooLarge => CoreErrorCode::DownloadTooLarge,
            UpgradeErrorKind::Cancelled => CoreErrorCode::OperationCancelled,
        }
    }
}

impl fmt::Display for UpgradeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for UpgradeError {}

impl From<UpgradeError> for String {
    fn from(error: UpgradeError) -> Self {
        error.message
    }
}

impl From<UpgradeError> for CoreError {
    fn from(error: UpgradeError) -> Self {
        CoreError::new(error.code(), error.message)
    }
}

fn download_error(error: DownloadError) -> UpgradeError {
    let kind = match error.kind {
        DownloadErrorKind::Policy => UpgradeErrorKind::Unavailable,
        DownloadErrorKind::Network => UpgradeErrorKind::Network,
        DownloadErrorKind::ChecksumMismatch => UpgradeErrorKind::ChecksumMismatch,
        DownloadErrorKind::TooLarge => UpgradeErrorKind::TooLarge,
        DownloadErrorKind::Cancelled => UpgradeErrorKind::Cancelled,
        DownloadErrorKind::Io => UpgradeErrorKind::InstallFailed,
    };
    UpgradeError::new(kind, error.message)
}

/// One version a server can move to.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpgradeCandidate {
    pub version: String,
    /// The newest version the provider lists.
    pub latest: bool,
    pub newer: bool,
    pub release_notes_url: Option<String>,
    /// From the built-in table (no network per candidate); the plan carries
    /// Mojang's value.
    pub required_java: Option<u16>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpgradeCandidates {
    pub server_id: String,
    pub software: String,
    pub current_version: String,
    /// False when MC-Vector cannot install this software's jar by itself
    /// (no resolver, or the provider publishes no checksum). Candidates may
    /// still be listed for information.
    pub supported: bool,
    pub target_software_candidates: Vec<String>,
    /// Newest first, excluding the current version.
    pub candidates: Vec<UpgradeCandidate>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SoftwareChange {
    pub from: String,
    pub to: String,
}

/// A prepared upgrade. Pass `plan_id` to [`ServerJarUpgrader::execute`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpgradePlan {
    pub plan_id: String,
    pub server_id: String,
    pub software: String,
    pub current_version: String,
    pub target_version: String,
    pub downgrade: bool,
    pub channel: String,
    pub software_change: Option<SoftwareChange>,
    /// The provider's file name (installed as `server.jar`).
    pub file_name: String,
    pub size: Option<u64>,
    /// The published checksum as `(algorithm, lowercase hex)`.
    pub checksum: Option<(String, String)>,
    /// True when the provider publishes a usable checksum. Unverified plans
    /// are refused by `execute`.
    pub verified: bool,
    pub required_java: Option<JavaRequirement>,
    /// True when the server runs now; `execute` refuses until it is stopped.
    pub server_running: bool,
    pub release_notes_url: Option<String>,
    pub expires_in_seconds: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpgradePhase {
    Download,
    Verify,
    Install,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UpgradeProgress {
    pub phase: UpgradePhase,
    pub downloaded: u64,
    /// 0 while the size is unknown.
    pub total: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpgradeResult {
    pub server_id: String,
    pub previous_version: String,
    pub previous_software: String,
    pub software: String,
    pub version: String,
}

#[derive(Clone, Debug)]
struct StoredPlan {
    server_id: String,
    software: String,
    source_version: String,
    detected_source_version: Option<String>,
    target_software: String,
    target_version: String,
    url: String,
    checksum: Option<ExpectedChecksum>,
    expires_at: Instant,
}

async fn load_server(
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<MinecraftServer, UpgradeError> {
    let registry = registry.clone();
    let server_id = server_id.to_owned();
    tokio::task::spawn_blocking(move || {
        registry
            .get_servers()
            .map_err(|error| UpgradeError::new(UpgradeErrorKind::Registry, error))?
            .into_iter()
            .find(|server| server.id == server_id)
            .ok_or_else(|| {
                UpgradeError::new(UpgradeErrorKind::NotFound, "Server is not registered")
            })
    })
    .await
    .map_err(|error| UpgradeError::new(UpgradeErrorKind::Registry, error.to_string()))?
}

fn normalized_server_id(server_id: &str) -> Result<String, UpgradeError> {
    validate_server_id(server_id.trim())
        .map(|_| server_id.trim().to_owned())
        .map_err(|error| UpgradeError::new(UpgradeErrorKind::InvalidRequest, error))
}

fn select_software<'a>(
    server: &'a MinecraftServer,
    target: Option<&'a str>,
) -> Result<&'a str, UpgradeError> {
    let target = target.unwrap_or(&server.software);
    if !server_jar::target_software_candidates(&server.software)
        .iter()
        .any(|name| name == target)
    {
        return Err(UpgradeError::new(
            UpgradeErrorKind::InvalidRequest,
            "Target software is outside the server's supported software family",
        ));
    }
    Ok(target)
}

/// Release versions offered by the selected compatible provider.
pub async fn candidates(
    data_dir: &Path,
    registry: &ServerRegistry,
    server_id: &str,
    target_software: Option<&str>,
) -> Result<UpgradeCandidates, UpgradeError> {
    let server = load_server(registry, &normalized_server_id(server_id)?).await?;
    let software = select_software(&server, target_software)?;
    let versions = server_jar::available_versions(software)
        .await
        .map_err(|error| UpgradeError::new(UpgradeErrorKind::Unavailable, error))?;
    let detected = detect_source_version(data_dir, &server.id).await?;
    Ok(candidates_from(
        &server,
        software,
        detected.as_deref().unwrap_or(&server.version),
        versions,
    ))
}

fn candidates_from(
    server: &MinecraftServer,
    software: &str,
    current_version: &str,
    versions: Option<Vec<String>>,
) -> UpgradeCandidates {
    let supported = versions.is_some() && server_jar::supports_automatic_install(software);
    let releases = versions
        .map(|versions| versions::sorted_releases(&versions))
        .unwrap_or_default();
    UpgradeCandidates {
        server_id: server.id.clone(),
        software: software.to_owned(),
        current_version: current_version.to_owned(),
        supported,
        target_software_candidates: server_jar::target_software_candidates(&server.software),
        candidates: releases
            .into_iter()
            .enumerate()
            .filter_map(|(index, version)| {
                let direction = versions::release_direction(current_version, &version);
                (direction != Ordering::Equal).then(|| UpgradeCandidate {
                    latest: index == 0,
                    newer: direction == Ordering::Greater,
                    release_notes_url: release_notes_url(software, &version),
                    required_java: java::table_requirement(&version),
                    version,
                })
            })
            .collect(),
    }
}

async fn detect_source_version(
    data_dir: &Path,
    server_id: &str,
) -> Result<Option<String>, UpgradeError> {
    let data_dir = data_dir.to_owned();
    let server_id = server_id.to_owned();
    tokio::task::spawn_blocking(move || detection::detect_managed(&data_dir, &server_id))
        .await
        .map_err(|error| UpgradeError::new(UpgradeErrorKind::InstallFailed, error.to_string()))
}

fn check_downgrade(current: &str, target: &str, allowed: bool) -> Result<bool, UpgradeError> {
    let downgrade = versions::release_direction(current, target) == Ordering::Less;
    if downgrade && !allowed {
        return Err(UpgradeError::new(
            UpgradeErrorKind::InvalidRequest,
            "Allow downgrades before preparing an older server version",
        ));
    }
    Ok(downgrade)
}

/// Validates the published checksum the plan will be verified against.
fn usable_checksum(checksum: Option<&ExpectedChecksum>) -> Option<ExpectedChecksum> {
    checksum
        .filter(|checksum| checksum.is_valid())
        .map(|checksum| ExpectedChecksum {
            algorithm: checksum.algorithm.to_ascii_lowercase(),
            value: checksum.value.trim().to_ascii_lowercase(),
        })
}

/// Pending upgrade plans. One instance per process.
#[derive(Clone, Default)]
pub struct ServerJarUpgrader {
    plans: Arc<Mutex<HashMap<String, StoredPlan>>>,
}

impl ServerJarUpgrader {
    fn plans(&self) -> std::sync::MutexGuard<'_, HashMap<String, StoredPlan>> {
        self.plans
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    /// The server a pending plan belongs to.
    pub fn plan_server(&self, plan_id: &str) -> Option<String> {
        self.plans()
            .get(plan_id.trim())
            .map(|plan| plan.server_id.clone())
    }

    /// Resolves `target_version` (or the newest version when None) into a
    /// plan using the requested software and opt-in policies.
    #[allow(clippy::too_many_arguments)]
    pub async fn prepare(
        &self,
        data_dir: &Path,
        registry: &ServerRegistry,
        servers: &ServerManager,
        server_id: &str,
        target_version: Option<&str>,
        target_software: Option<&str>,
        allow_unstable: bool,
        allow_downgrade: bool,
    ) -> Result<UpgradePlan, UpgradeError> {
        self.prepare_with(
            data_dir,
            registry,
            servers,
            server_id,
            target_version,
            target_software,
            allow_unstable,
            allow_downgrade,
            |software, version, latest, unstable| async move {
                server_jar::resolve_artifact_with_policy(&software, &version, latest, unstable)
                    .await
            },
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn prepare_with<R, Fut>(
        &self,
        data_dir: &Path,
        registry: &ServerRegistry,
        servers: &ServerManager,
        server_id: &str,
        target_version: Option<&str>,
        target_software: Option<&str>,
        allow_unstable: bool,
        allow_downgrade: bool,
        resolve: R,
    ) -> Result<UpgradePlan, UpgradeError>
    where
        R: FnOnce(String, String, bool, bool) -> Fut,
        Fut: std::future::Future<Output = Result<Option<server_jar::ResolvedArtifact>, String>>,
    {
        let server_id = normalized_server_id(server_id)?;
        let server = load_server(registry, &server_id).await?;
        let software = select_software(&server, target_software)?;
        let detected_source_version = detect_source_version(data_dir, &server.id).await?;
        let current_version = detected_source_version
            .as_deref()
            .unwrap_or(&server.version)
            .to_owned();
        let target = target_version
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(target) = target {
            if target.len() > 128 || target.chars().any(char::is_control) {
                return Err(UpgradeError::new(
                    UpgradeErrorKind::InvalidRequest,
                    "Target version is invalid",
                ));
            }
            check_downgrade(&current_version, target, allow_downgrade)?;
        }
        let resolved = resolve(
            software.to_owned(),
            target.unwrap_or(&current_version).to_owned(),
            target.is_none(),
            allow_unstable,
        )
        .await
        .map_err(|error| UpgradeError::new(UpgradeErrorKind::Unavailable, error))?;
        let Some(resolved) = resolved else {
            return Err(if server_jar::has_resolver(software) {
                UpgradeError::new(
                    UpgradeErrorKind::NotAvailable,
                    "The provider has no downloadable build for this version",
                )
            } else {
                UpgradeError::new(
                    UpgradeErrorKind::Unsupported,
                    "This server software does not support automatic server jar installation",
                )
            });
        };
        let downgrade = check_downgrade(&current_version, &resolved.version, allow_downgrade)?;
        let checksum = usable_checksum(resolved.checksum.as_ref());
        let required_java = java::required_java(software, &resolved.version).await;
        let server_running = servers.is_server_running(&server.id).await;
        let plan_id = Uuid::new_v4().to_string();
        {
            let mut plans = self.plans();
            plans.retain(|_, plan| plan.expires_at > Instant::now());
            if plans.len() >= MAX_PENDING_PLANS {
                return Err(UpgradeError::new(
                    UpgradeErrorKind::InvalidRequest,
                    "Too many pending server jar plans",
                ));
            }
            plans.insert(
                plan_id.clone(),
                StoredPlan {
                    server_id: server.id.clone(),
                    software: server.software.clone(),
                    source_version: server.version.clone(),
                    detected_source_version,
                    target_software: software.to_owned(),
                    target_version: resolved.version.clone(),
                    url: resolved.url.clone(),
                    checksum: checksum.clone(),
                    expires_at: Instant::now() + PLAN_TTL,
                },
            );
        }
        Ok(UpgradePlan {
            plan_id,
            server_id: server.id.clone(),
            release_notes_url: release_notes_url(software, &resolved.version),
            software: software.to_owned(),
            downgrade,
            channel: resolved.channel,
            software_change: (software != server.software).then(|| SoftwareChange {
                from: server.software.clone(),
                to: software.to_owned(),
            }),
            current_version,
            target_version: resolved.version,
            file_name: resolved.file_name,
            size: resolved.size,
            verified: checksum.is_some(),
            checksum: checksum.map(|checksum| (checksum.algorithm, checksum.value)),
            required_java,
            server_running,
            expires_in_seconds: PLAN_TTL.as_secs(),
        })
    }

    /// Installs a prepared plan. The plan is consumed even when this fails;
    /// prepare a new one to retry.
    #[allow(clippy::too_many_arguments)]
    pub async fn execute<F>(
        &self,
        data_dir: &Path,
        registry: &ServerRegistry,
        operations: &ServerOperationManager,
        servers: &ServerManager,
        plan_id: &str,
        cancel: Option<&CancelFlag>,
        progress: F,
    ) -> Result<UpgradeResult, UpgradeError>
    where
        F: FnMut(UpgradeProgress) + Send,
    {
        let plan = self.plans().remove(plan_id.trim()).ok_or_else(|| {
            UpgradeError::new(
                UpgradeErrorKind::PlanExpired,
                "Server jar install plan is missing or already used",
            )
        })?;
        if plan.expires_at <= Instant::now() {
            return Err(UpgradeError::new(
                UpgradeErrorKind::PlanExpired,
                "Server jar install plan expired; prepare it again",
            ));
        }
        let checksum = plan.checksum.clone().ok_or_else(|| {
            UpgradeError::new(
                UpgradeErrorKind::Unverified,
                "The provider publishes no checksum for this server jar, so it is not installed automatically",
            )
        })?;
        let operation = operations
            .acquire(&plan.server_id, OperationKind::ArtifactInstall)
            .await
            .map_err(|error| UpgradeError::new(UpgradeErrorKind::InvalidRequest, error))?;
        if plan.expires_at <= Instant::now() {
            return Err(UpgradeError::new(
                UpgradeErrorKind::PlanExpired,
                "Server jar install plan expired while waiting; prepare it again",
            ));
        }
        install_plan_locked(
            data_dir, registry, servers, &plan, &checksum, cancel, progress, operation,
        )
        .await
    }
}

/// Downloads, verifies and swaps in the plan's jar. The caller holds the
/// server's `ArtifactInstall` lock.
#[allow(clippy::too_many_arguments)]
async fn install_plan_locked<F>(
    data_dir: &Path,
    registry: &ServerRegistry,
    servers: &ServerManager,
    plan: &StoredPlan,
    checksum: &ExpectedChecksum,
    cancel: Option<&CancelFlag>,
    mut progress: F,
    operation: OperationGuard,
) -> Result<UpgradeResult, UpgradeError>
where
    F: FnMut(UpgradeProgress) + Send,
{
    let failed = |error: String| UpgradeError::new(UpgradeErrorKind::InstallFailed, error);
    if servers.is_server_running(&plan.server_id).await {
        return Err(UpgradeError::new(
            UpgradeErrorKind::Running,
            "Stop the server before installing an upgrade",
        ));
    }
    let mut server = load_server(registry, &plan.server_id).await?;
    if server.software != plan.software || server.version != plan.source_version {
        return Err(UpgradeError::new(
            UpgradeErrorKind::ProfileChanged,
            "Server profile changed after upgrade preparation",
        ));
    }
    let path_data_dir = data_dir.to_path_buf();
    let path_server_id = plan.server_id.clone();
    let (destination, managed_root) = tokio::task::spawn_blocking(move || {
        server_jar::server_jar_path(&path_data_dir, &path_server_id)
    })
    .await
    .map_err(|error| failed(format!("Server jar path validation task failed: {error}")))?
    .map_err(failed)?;

    progress(UpgradeProgress {
        phase: UpgradePhase::Download,
        downloaded: 0,
        total: 0,
    });
    let verified = download::download_verified_artifact(
        &plan.url,
        &destination,
        &managed_root,
        checksum,
        MAX_JAR_BYTES,
        DownloadOptions {
            expected_size: None,
            allowed_hosts: Some(SERVER_JAR_HOSTS),
            cancel,
        },
        |downloaded, total| {
            progress(UpgradeProgress {
                phase: UpgradePhase::Download,
                downloaded,
                total,
            })
        },
    )
    .await
    .map_err(download_error)?;
    commit_verified(
        registry,
        &mut server,
        plan,
        verified,
        destination,
        managed_root,
        cancel,
        progress,
        Some(operation),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn commit_verified<F>(
    registry: &ServerRegistry,
    server: &mut MinecraftServer,
    plan: &StoredPlan,
    verified: download::VerifiedArtifact,
    destination: std::path::PathBuf,
    managed_root: std::path::PathBuf,
    cancel: Option<&CancelFlag>,
    mut progress: F,
    operation: Option<OperationGuard>,
) -> Result<UpgradeResult, UpgradeError>
where
    F: FnMut(UpgradeProgress) + Send,
{
    let failed = |error: String| UpgradeError::new(UpgradeErrorKind::InstallFailed, error);
    let size = verified.size;
    progress(UpgradeProgress {
        phase: UpgradePhase::Verify,
        downloaded: size,
        total: size,
    });
    let staging = verified.path.clone();
    let staging_guard = crate::java::install::FileGuard::new(staging.clone());
    let check_cancel = |cancel: Option<&CancelFlag>| {
        if cancel.is_some_and(CancelFlag::is_cancelled) {
            return Err(UpgradeError::new(
                UpgradeErrorKind::Cancelled,
                "Server jar upgrade was cancelled",
            ));
        }
        Ok(())
    };
    check_cancel(cancel)?;
    // The recovery journal identifies the new jar by SHA-256 even when the
    // provider uses SHA-1. Keep cancellation open through this extra pass.
    let sha256 = if verified.checksum.len() == 64 {
        verified.checksum
    } else {
        let path = staging.clone();
        tokio::task::spawn_blocking(move || journal::file_sha256(&path))
            .await
            .map_err(|error| failed(error.to_string()))?
            .map_err(failed)?
    };
    check_cancel(cancel)?;
    let registry = registry.clone();
    let mut profile = server.clone();
    let plan = plan.clone();
    let cancel = cancel.cloned();
    progress(UpgradeProgress {
        phase: UpgradePhase::Install,
        downloaded: size,
        total: size,
    });
    let installed = {
        let plan = plan.clone();
        tokio::task::spawn_blocking(move || {
            // These guards live until the worker exits, even if the caller drops its future.
            let _operation = operation;
            let _staging = staging_guard;
            let detected = detection::detect_at(&destination);
            if detected != plan.detected_source_version {
                return Err(UpgradeError::new(
                    UpgradeErrorKind::ProfileChanged,
                    "Installed server jar version changed after preparation",
                ));
            }
            let old_version = detected.as_deref().unwrap_or(&plan.source_version);
            let mut cancellation = None;
            let result = journal::install_replacement_with_journal(
                &staging,
                &destination,
                &managed_root,
                &registry,
                &mut profile,
                &plan.target_version,
                &plan.target_software,
                &sha256,
                || {
                    if let Err(error) = check_cancel(cancel.as_ref()) {
                        cancellation = Some(error.clone());
                        return Err(error.message);
                    }
                    Ok(())
                },
                |_| Ok(()),
            );
            result.map_err(|error| cancellation.unwrap_or_else(|| failed(error)))?;
            if let Some(data_dir) = managed_root.parent() {
                clean_bootstrap_leftovers(data_dir, &plan, old_version);
            }
            Ok::<_, UpgradeError>(profile)
        })
    };
    let installed = installed
        .await
        .map_err(|error| failed(format!("Server jar installation task failed: {error}")))??;
    *server = installed;
    Ok(UpgradeResult {
        server_id: plan.server_id.clone(),
        previous_version: plan.detected_source_version.unwrap_or(plan.source_version),
        version: plan.target_version,
        previous_software: plan.software,
        software: plan.target_software,
    })
}

fn clean_bootstrap_leftovers(data_dir: &Path, plan: &StoredPlan, old_version: &str) {
    if (old_version == plan.target_version && plan.software == plan.target_software)
        || !matches!(
            plan.software.as_str(),
            "Paper" | "Purpur" | "Leaf" | "LeafMC" | "Folia"
        )
        || !versions::is_release(old_version)
        || old_version.len() > 128
    {
        return;
    }
    for (relative_path, directory) in [
        (format!("versions/{old_version}"), true),
        (format!("cache/mojang_{old_version}.jar"), false),
    ] {
        let request = ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(plan.server_id.clone()),
            relative_path,
        };
        let Ok(path) = resolve_managed_request(data_dir, &request, false) else {
            continue;
        };
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if is_link_or_reparse_point(&metadata) {
            continue;
        }
        let result = match directory {
            true if metadata.is_dir() => fs::remove_dir_all(&path),
            false if metadata.is_file() => fs::remove_file(&path),
            _ => continue,
        };
        if let Err(error) = result {
            log::warn!(
                "Could not clean server bootstrap path {:?}: {error}",
                request.relative_path
            );
        }
    }
}

#[cfg(test)]
mod tests;
