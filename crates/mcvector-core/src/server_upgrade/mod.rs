//! Upgrading a server to a newer Minecraft (or proxy) version by replacing
//! its `server.jar`.
//!
//! [`candidates`] lists the newer versions the provider offers. [`ServerJarUpgrader::prepare`]
//! resolves one version into a short-lived plan (file, size, checksum, the
//! Java it needs, whether the server runs). [`ServerJarUpgrader::execute`]
//! consumes the plan: it refuses running servers and jars without a published
//! checksum, downloads and verifies the jar, and swaps it in through the
//! recovery journal (see [`journal`]), updating the registry version.

pub mod journal;
pub mod versions;

use std::collections::HashMap;
use std::fmt;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use uuid::Uuid;

use crate::download::{
    self, CancelFlag, DownloadError, DownloadErrorKind, DownloadOptions, ExpectedChecksum,
};
use crate::error::{CoreError, CoreErrorCode};
use crate::java::{self, JavaRequirement};
use crate::managed_path::validate_server_id;
use crate::operations::{OperationKind, ServerOperationManager};
use crate::registry::{MinecraftServer, ServerRegistry};
use crate::server_jar::{self, MAX_JAR_BYTES, SERVER_JAR_HOSTS};
use crate::server_process::ServerManager;

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
    /// Newest first; empty when already on the newest version.
    pub candidates: Vec<UpgradeCandidate>,
}

/// A prepared upgrade. Pass `plan_id` to [`ServerJarUpgrader::execute`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpgradePlan {
    pub plan_id: String,
    pub server_id: String,
    pub software: String,
    pub current_version: String,
    pub target_version: String,
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
    pub version: String,
}

#[derive(Clone, Debug)]
struct StoredPlan {
    server_id: String,
    software: String,
    source_version: String,
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

/// Newer versions the provider offers for a registered server.
pub async fn candidates(
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<UpgradeCandidates, UpgradeError> {
    let server = load_server(registry, &normalized_server_id(server_id)?).await?;
    let versions = server_jar::available_versions(&server.software)
        .await
        .map_err(|error| UpgradeError::new(UpgradeErrorKind::Unavailable, error))?;
    Ok(candidates_from(&server, versions))
}

pub(crate) fn candidates_from(
    server: &MinecraftServer,
    versions: Option<Vec<String>>,
) -> UpgradeCandidates {
    let supported = versions.is_some() && server_jar::supports_automatic_install(&server.software);
    let newer = versions
        .map(|versions| newer_releases(&server.version, &versions))
        .unwrap_or_default();
    UpgradeCandidates {
        server_id: server.id.clone(),
        software: server.software.clone(),
        current_version: server.version.clone(),
        supported,
        candidates: newer
            .into_iter()
            .enumerate()
            .map(|(index, version)| UpgradeCandidate {
                latest: index == 0,
                release_notes_url: release_notes_url(&server.software, &version),
                required_java: java::table_requirement(&version),
                version,
            })
            .collect(),
    }
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
    /// plan. A target older than the current version is refused.
    pub async fn prepare(
        &self,
        registry: &ServerRegistry,
        servers: &ServerManager,
        server_id: &str,
        target_version: Option<&str>,
    ) -> Result<UpgradePlan, UpgradeError> {
        let server_id = normalized_server_id(server_id)?;
        let server = load_server(registry, &server_id).await?;
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
            if let (Some(current), Some(requested)) = (
                java::requirement::release_components(&server.version),
                java::requirement::release_components(target),
            ) {
                if versions::is_release(&server.version)
                    && versions::compare_releases(&requested, &current) == std::cmp::Ordering::Less
                {
                    return Err(UpgradeError::new(
                        UpgradeErrorKind::InvalidRequest,
                        "Downgrading a server is not supported",
                    ));
                }
            }
        }
        let resolved = match target {
            Some(target) => server_jar::resolve_artifact(&server.software, target, false).await,
            None => server_jar::resolve_artifact(&server.software, &server.version, true).await,
        }
        .map_err(|error| UpgradeError::new(UpgradeErrorKind::Unavailable, error))?;
        let Some(resolved) = resolved else {
            return Err(if server_jar::has_resolver(&server.software) {
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
        let checksum = usable_checksum(resolved.checksum.as_ref());
        let required_java = java::required_java(&server.software, &resolved.version).await;
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
                    target_version: resolved.version.clone(),
                    url: resolved.url.clone(),
                    checksum: checksum.clone(),
                    expires_at: Instant::now() + PLAN_TTL,
                },
            );
        }
        Ok(UpgradePlan {
            plan_id,
            server_id: server.id,
            release_notes_url: release_notes_url(&server.software, &resolved.version),
            software: server.software,
            current_version: server.version,
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
        let _operation = operations
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
            data_dir, registry, servers, &plan, &checksum, cancel, progress,
        )
        .await
    }
}

/// Downloads, verifies and swaps in the plan's jar. The caller holds the
/// server's `ArtifactInstall` lock.
async fn install_plan_locked<F>(
    data_dir: &Path,
    registry: &ServerRegistry,
    servers: &ServerManager,
    plan: &StoredPlan,
    checksum: &ExpectedChecksum,
    cancel: Option<&CancelFlag>,
    mut progress: F,
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
    let mut staging_guard = crate::java::install::FileGuard::new(staging.clone());
    if cancel.is_some_and(CancelFlag::is_cancelled) {
        return Err(UpgradeError::new(
            UpgradeErrorKind::Cancelled,
            "Server jar upgrade was cancelled",
        ));
    }
    progress(UpgradeProgress {
        phase: UpgradePhase::Install,
        downloaded: size,
        total: size,
    });
    let registry = registry.clone();
    let mut profile = server.clone();
    let target_version = plan.target_version.clone();
    let verified_sha256 = (verified.checksum.len() == 64).then_some(verified.checksum);
    let installed = tokio::task::spawn_blocking(move || {
        // The journal identifies the new jar by SHA-256; Mojang publishes SHA-1.
        let sha256 = match verified_sha256 {
            Some(sha256) => sha256,
            None => journal::file_sha256(&staging)?,
        };
        journal::install_replacement_with_journal(
            &staging,
            &destination,
            &managed_root,
            &registry,
            &mut profile,
            &target_version,
            &sha256,
            |_| Ok(()),
        )
        .map(|()| profile)
    })
    .await
    .map_err(|error| failed(format!("Server jar installation task failed: {error}")))?
    .map_err(failed)?;
    staging_guard.disarm();
    *server = installed;
    Ok(UpgradeResult {
        server_id: plan.server_id.clone(),
        previous_version: plan.source_version.clone(),
        version: plan.target_version.clone(),
    })
}

#[cfg(test)]
mod tests;
