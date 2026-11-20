//! Server version upgrades for the Native edition: newer versions the
//! provider offers, a prepared plan, and the journaled jar swap with progress
//! and cancellation.
use super::java_runtimes::{redacted_error, JavaRequirementRecord, OperationRegistration};
use super::*;
use mcvector_core::server_upgrade::{self, ServerJarUpgrader, UpgradePhase};

static UPGRADER: LazyLock<ServerJarUpgrader> = LazyLock::new(ServerJarUpgrader::default);

fn upgrade_error(error: server_upgrade::UpgradeError, data: &Path) -> FfiError {
    redacted_error(error.into(), data)
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct ServerJarCandidate {
    pub version: String,
    /// The newest version the provider lists.
    pub latest: bool,
    pub release_notes_url: Option<String>,
    /// From the built-in table; the prepared plan carries Mojang's value.
    pub required_java_major: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct ServerJarCandidates {
    pub server_id: String,
    pub software: String,
    pub current_version: String,
    /// False when MC-Vector cannot install this software's jar by itself.
    pub supported: bool,
    /// Newer versions, newest first.
    pub candidates: Vec<ServerJarCandidate>,
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct ServerJarChecksum {
    /// `sha256` or `sha1`.
    pub algorithm: String,
    /// Lowercase hex.
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct ServerJarUpgradePlan {
    /// Pass to `execute_server_jar_upgrade` within `expires_in_seconds`.
    pub plan_id: String,
    pub server_id: String,
    pub software: String,
    pub current_version: String,
    pub target_version: String,
    pub file_name: String,
    pub size: Option<u64>,
    pub checksum: Option<ServerJarChecksum>,
    /// False when the provider publishes no checksum; execute refuses such plans.
    pub verified: bool,
    pub required_java: Option<JavaRequirementRecord>,
    /// The server must be stopped before execute.
    pub server_running: bool,
    pub release_notes_url: Option<String>,
    pub expires_in_seconds: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum ServerJarUpgradePhase {
    Download,
    Verify,
    Install,
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct ServerJarUpgradeProgress {
    pub operation_id: String,
    pub phase: ServerJarUpgradePhase,
    pub downloaded: u64,
    /// 0 while the size is unknown.
    pub total: u64,
}

#[uniffi::export(with_foreign)]
pub trait ServerJarUpgradeObserver: Send + Sync {
    fn on_progress(&self, event: ServerJarUpgradeProgress);
}

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct ServerJarUpgradeResult {
    pub server_id: String,
    pub previous_version: String,
    pub version: String,
}

/// Newer versions the provider offers for the server.
#[uniffi::export(async_runtime = "tokio")]
pub async fn server_jar_upgrade_candidates(
    server_id: String,
) -> Result<ServerJarCandidates, FfiError> {
    let (data, registry, _) = session_handles()?;
    server_upgrade::candidates(&registry, &server_id)
        .await
        .map(|list| ServerJarCandidates {
            server_id: list.server_id,
            software: list.software,
            current_version: list.current_version,
            supported: list.supported,
            candidates: list
                .candidates
                .into_iter()
                .map(|candidate| ServerJarCandidate {
                    version: candidate.version,
                    latest: candidate.latest,
                    release_notes_url: candidate.release_notes_url,
                    required_java_major: candidate.required_java.map(Into::into),
                })
                .collect(),
        })
        .map_err(|error| upgrade_error(error, &data))
}

/// Resolves `target_version` (the newest when None) into a short-lived plan.
#[uniffi::export(async_runtime = "tokio")]
pub async fn prepare_server_jar_upgrade(
    server_id: String,
    target_version: Option<String>,
) -> Result<ServerJarUpgradePlan, FfiError> {
    let (data, registry, _) = session_handles()?;
    UPGRADER
        .prepare(&registry, &SERVERS, &server_id, target_version.as_deref())
        .await
        .map(|plan| ServerJarUpgradePlan {
            plan_id: plan.plan_id,
            server_id: plan.server_id,
            software: plan.software,
            current_version: plan.current_version,
            target_version: plan.target_version,
            file_name: plan.file_name,
            size: plan.size,
            checksum: plan
                .checksum
                .map(|(algorithm, value)| ServerJarChecksum { algorithm, value }),
            verified: plan.verified,
            required_java: plan.required_java.map(Into::into),
            server_running: plan.server_running,
            release_notes_url: plan.release_notes_url,
            expires_in_seconds: plan.expires_in_seconds,
        })
        .map_err(|error| upgrade_error(error, &data))
}

/// Installs a prepared plan: stopped servers only, verified jars only, atomic
/// swap with rollback. Cancel with `cancel_server_jar_upgrade(operation_id)`
/// (honored until the swap starts).
#[uniffi::export(async_runtime = "tokio")]
pub async fn execute_server_jar_upgrade(
    operation_id: String,
    plan_id: String,
    observer: Arc<dyn ServerJarUpgradeObserver>,
) -> Result<ServerJarUpgradeResult, FfiError> {
    let (data, registry, operations) = session_handles()?;
    let (_registration, cancel) =
        OperationRegistration::register(&operation_id, CoreErrorCode::ServerJarInvalidRequest)?;
    UPGRADER
        .execute(
            &data,
            &registry,
            &operations,
            &SERVERS,
            &plan_id,
            Some(&cancel),
            |event| {
                observer.on_progress(ServerJarUpgradeProgress {
                    operation_id: operation_id.clone(),
                    phase: match event.phase {
                        UpgradePhase::Download => ServerJarUpgradePhase::Download,
                        UpgradePhase::Verify => ServerJarUpgradePhase::Verify,
                        UpgradePhase::Install => ServerJarUpgradePhase::Install,
                    },
                    downloaded: event.downloaded,
                    total: event.total,
                });
            },
        )
        .await
        .map(|result| ServerJarUpgradeResult {
            server_id: result.server_id,
            previous_version: result.previous_version,
            version: result.version,
        })
        .map_err(|error| upgrade_error(error, &data))
}

/// Requests cancellation of an active upgrade. True when the ID was active.
#[uniffi::export(async_runtime = "tokio")]
pub async fn cancel_server_jar_upgrade(operation_id: String) -> bool {
    OperationRegistration::cancel(&operation_id)
}
