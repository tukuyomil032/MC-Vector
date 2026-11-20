//! Typed Native plugin installation boundary.
use super::*;
use mcvector_core::plugins::{installer, model, readme};

static INSTALLER: LazyLock<installer::PluginInstaller> =
    LazyLock::new(installer::PluginInstaller::default);
static CANCELLATIONS: LazyLock<Mutex<HashMap<String, CancelFlag>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum PluginSource {
    Modrinth,
    Hangar,
    Spiget,
}
impl From<PluginSource> for model::PluginSource {
    fn from(v: PluginSource) -> Self {
        match v {
            PluginSource::Modrinth => Self::Modrinth,
            PluginSource::Hangar => Self::Hangar,
            PluginSource::Spiget => Self::Spiget,
        }
    }
}
impl From<model::PluginSource> for PluginSource {
    fn from(v: model::PluginSource) -> Self {
        match v {
            model::PluginSource::Modrinth => Self::Modrinth,
            model::PluginSource::Hangar => Self::Hangar,
            model::PluginSource::Spiget => Self::Spiget,
        }
    }
}
#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum PluginCompatibility {
    Compatible,
    Incompatible,
    Unknown,
}
impl From<model::Compatibility> for PluginCompatibility {
    fn from(v: model::Compatibility) -> Self {
        match v {
            model::Compatibility::Compatible => Self::Compatible,
            model::Compatibility::Incompatible => Self::Incompatible,
            model::Compatibility::Unknown => Self::Unknown,
        }
    }
}
#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum PluginSort {
    Relevance,
    Downloads,
    Name,
    Compatibility,
}
impl From<PluginSort> for model::SortMode {
    fn from(v: PluginSort) -> Self {
        match v {
            PluginSort::Relevance => Self::Relevance,
            PluginSort::Downloads => Self::Downloads,
            PluginSort::Name => Self::Name,
            PluginSort::Compatibility => Self::Compatibility,
        }
    }
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginSearchInput {
    pub source: PluginSource,
    pub query: String,
    pub software: String,
    pub game_version: String,
    pub offset: u32,
    pub limit: u32,
    pub sort: PluginSort,
    pub category: Option<String>,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginProjectRecord {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub author: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub compatibility: PluginCompatibility,
    pub project_url: String,
    pub source: PluginSource,
    /// Pass this to `prepare_plugin_install` and `plugin_readme`.
    pub project: PluginProject,
    pub supported_versions: Vec<String>,
}
/// One page of results and the provider's total, when it reports one.
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginSearchPage {
    pub items: Vec<PluginProjectRecord>,
    pub total: Option<u64>,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginVersionRecord {
    pub id: String,
    pub name: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub published: Option<String>,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginCategory {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginServerSupport {
    pub sources: Vec<PluginSource>,
    pub target_directory: String,
    pub loader: String,
}
#[uniffi::export]
pub fn plugin_server_support(software: String) -> PluginServerSupport {
    let v = model::server_support(&software);
    PluginServerSupport {
        sources: v.sources.into_iter().map(Into::into).collect(),
        target_directory: v.target_directory,
        loader: v.loader,
    }
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn search_plugins(input: PluginSearchInput) -> Result<PluginSearchPage, FfiError> {
    let (data, _, _) = session_handles()?;
    model::search(model::SearchRequest {
        source: input.source.into(),
        query: input.query,
        software: input.software,
        game_version: input.game_version,
        offset: input.offset,
        limit: input.limit,
        sort: input.sort.into(),
        category: input.category,
    })
    .await
    .map(|page| PluginSearchPage {
        items: page.items.into_iter().map(project_record).collect(),
        total: page.total,
    })
    .map_err(|e| core_error(CoreErrorCode::PluginCatalogFailed, redact(&e, &data)))
}

/// The installer reference for a search result. Hangar records carry
/// `owner/slug` as their id and the owner as author; Spiget ids are numeric.
fn project_record(v: model::ProjectRecord) -> PluginProjectRecord {
    let project = match v.source {
        model::PluginSource::Modrinth => PluginProject::Modrinth {
            project_id: v.id.clone(),
        },
        model::PluginSource::Hangar => PluginProject::Hangar {
            owner: v.author.clone(),
            slug: v.slug.clone(),
        },
        model::PluginSource::Spiget => PluginProject::Spiget {
            resource_id: v.id.parse().unwrap_or_default(),
        },
    };
    PluginProjectRecord {
        id: v.id,
        slug: v.slug,
        name: v.name,
        author: v.author,
        summary: v.summary,
        icon_url: v.icon_url,
        downloads: v.downloads,
        compatibility: v.compatibility.into(),
        project_url: v.project_url,
        source: v.source.into(),
        project,
        supported_versions: v.supported_versions,
    }
}

/// Published versions of a project for the detail view (Spiget: none).
#[uniffi::export(async_runtime = "tokio")]
pub async fn plugin_versions(
    project: PluginProject,
    software: String,
) -> Result<Vec<PluginVersionRecord>, FfiError> {
    let (data, _, _) = session_handles()?;
    model::versions(&project.into(), &software)
        .await
        .map(|items| {
            items
                .into_iter()
                .map(|v| PluginVersionRecord {
                    id: v.id,
                    name: v.name,
                    game_versions: v.game_versions,
                    loaders: v.loaders,
                    published: v.published,
                })
                .collect()
        })
        .map_err(|e| core_error(CoreErrorCode::PluginCatalogFailed, redact(&e, &data)))
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn plugin_categories(source: PluginSource) -> Result<Vec<PluginCategory>, FfiError> {
    let (data, _, _) = session_handles()?;
    model::categories(source.into())
        .await
        .map(|items| {
            items
                .into_iter()
                .map(|v| PluginCategory {
                    id: v.id,
                    name: v.name,
                })
                .collect()
        })
        .map_err(|e| core_error(CoreErrorCode::PluginCatalogFailed, redact(&e, &data)))
}
#[uniffi::export]
pub fn plugin_readme_html(
    source: PluginSource,
    body: String,
    project_url: String,
) -> Result<String, FfiError> {
    readme::safe_html(source.into(), &body, &project_url).map_err(|_| {
        core_error(
            CoreErrorCode::PluginInvalidRequest,
            "Invalid project README",
        )
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn plugin_readme(project: PluginProject) -> Result<Option<String>, FfiError> {
    let (data, _, _) = session_handles()?;
    readme::project_html(&project.into())
        .await
        .map_err(|error| core_error(CoreErrorCode::PluginCatalogFailed, redact(&error, &data)))
}

#[derive(Clone, Debug, uniffi::Enum)]
pub enum PluginProject {
    Modrinth { project_id: String },
    Hangar { owner: String, slug: String },
    Spiget { resource_id: u64 },
}
impl From<PluginProject> for installer::ProjectRef {
    fn from(value: PluginProject) -> Self {
        match value {
            PluginProject::Modrinth { project_id } => Self::Modrinth { project_id },
            PluginProject::Hangar { owner, slug } => Self::Hangar { owner, slug },
            PluginProject::Spiget { resource_id } => Self::Spiget { resource_id },
        }
    }
}
impl From<installer::ProjectRef> for PluginProject {
    fn from(value: installer::ProjectRef) -> Self {
        match value {
            installer::ProjectRef::Modrinth { project_id } => Self::Modrinth { project_id },
            installer::ProjectRef::Hangar { owner, slug } => Self::Hangar { owner, slug },
            installer::ProjectRef::Spiget { resource_id } => Self::Spiget { resource_id },
        }
    }
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginArtifactPreview {
    pub id: String,
    pub project: PluginProject,
    pub title: String,
    pub version: String,
    pub file_name: String,
    pub installed_file_name: Option<String>,
    pub dependency: bool,
    pub verified: bool,
    pub compatibility: PluginCompatibility,
    pub supported_versions: Vec<String>,
}
impl From<installer::ArtifactPreview> for PluginArtifactPreview {
    fn from(v: installer::ArtifactPreview) -> Self {
        Self {
            id: v.id,
            project: v.project.into(),
            title: v.title,
            version: v.version,
            file_name: v.file_name,
            installed_file_name: v.installed_file_name,
            dependency: v.dependency,
            verified: v.verified,
            compatibility: match v.compatibility.as_str() {
                "compatible" => PluginCompatibility::Compatible,
                "incompatible" => PluginCompatibility::Incompatible,
                _ => PluginCompatibility::Unknown,
            },
            supported_versions: v.supported_versions,
        }
    }
}

#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum PluginInstallPolicy {
    ExternalDownload,
    IncompletePreview,
    Incompatible,
    UnverifiedBlocked,
    Confirm {
        unknown_compatibility: bool,
        unverified_downloads: bool,
    },
}

impl From<installer::InstallPolicy> for PluginInstallPolicy {
    fn from(value: installer::InstallPolicy) -> Self {
        match value {
            installer::InstallPolicy::ExternalDownload => Self::ExternalDownload,
            installer::InstallPolicy::IncompletePreview => Self::IncompletePreview,
            installer::InstallPolicy::Incompatible => Self::Incompatible,
            installer::InstallPolicy::UnverifiedBlocked => Self::UnverifiedBlocked,
            installer::InstallPolicy::Confirm {
                unknown_compatibility,
                unverified_downloads,
            } => Self::Confirm {
                unknown_compatibility,
                unverified_downloads,
            },
        }
    }
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginInstallPreview {
    pub token: Option<String>,
    pub expires_in_seconds: u64,
    pub server_id: String,
    pub server_version: String,
    pub server_software: String,
    pub target_directory: String,
    pub artifacts: Vec<PluginArtifactPreview>,
    pub missing_dependency_ids: Vec<String>,
    pub external_url: Option<String>,
    pub requires_unverified_downloads: bool,
    pub policy: PluginInstallPolicy,
}
impl PluginInstallPreview {
    fn from_core(v: installer::InstallPreview, allow_unverified: bool) -> Self {
        let policy = v.policy(allow_unverified).into();
        Self {
            token: v.token,
            expires_in_seconds: v.expires_in_seconds,
            server_id: v.server_id,
            server_version: v.server_version,
            server_software: v.server_software,
            target_directory: v.target_directory,
            artifacts: v.artifacts.into_iter().map(Into::into).collect(),
            missing_dependency_ids: v.missing_dependency_ids,
            external_url: v.external_url,
            requires_unverified_downloads: v.requires_unverified_downloads,
            policy,
        }
    }
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginInstallResult {
    pub server_id: String,
    pub installed_file_names: Vec<String>,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginInstallProgress {
    pub operation_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub artifact_id: String,
}
#[uniffi::export(with_foreign)]
pub trait PluginInstallObserver: Send + Sync {
    fn on_progress(&self, event: PluginInstallProgress);
}

fn plugin_error(message: String, data: &Path) -> FfiError {
    core_error(CoreErrorCode::PluginInstallFailed, redact(&message, data))
}

fn install_error(error: installer::InstallError, data: &Path) -> FfiError {
    use installer::InstallErrorKind as Kind;
    let code = match error.kind {
        Kind::SessionExpired => CoreErrorCode::PluginSessionExpired,
        Kind::ChecksumMismatch | Kind::ChecksumInvalid => CoreErrorCode::DownloadChecksumMismatch,
        Kind::SizeLimitExceeded => CoreErrorCode::DownloadTooLarge,
        Kind::Network => CoreErrorCode::DownloadNetworkFailed,
        Kind::Cancelled => CoreErrorCode::OperationCancelled,
        Kind::Incompatible => CoreErrorCode::PluginIncompatible,
        Kind::UnverifiedBlocked => CoreErrorCode::PluginUnverifiedBlocked,
        Kind::SourceRejected => CoreErrorCode::PluginSourceRejected,
        Kind::DestinationRejected => CoreErrorCode::PluginDestinationRejected,
        Kind::Unknown => CoreErrorCode::PluginInstallFailed,
    };
    core_error(code, redact(&error.message, data))
}

fn allow_unverified(data: &Path) -> Result<bool, FfiError> {
    mcvector_core::config::app_settings(data)
        .map(|settings| settings.allow_unverified_plugin_downloads)
        .map_err(|error| config_error(error, data))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn prepare_plugin_install(
    server_id: String,
    project: PluginProject,
    replace_file_name: Option<String>,
) -> Result<PluginInstallPreview, FfiError> {
    let (data, registry, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::ArtifactInstall)
        .await
        .map_err(|e| plugin_error(e, &data))?;
    let allow = allow_unverified(&data)?;
    INSTALLER
        .prepare(
            &data,
            &registry,
            NATIVE_BUNDLE_ID,
            installer::PrepareRequest {
                server_id,
                project: project.into(),
                replace_file_name,
            },
        )
        .await
        .map(|preview| PluginInstallPreview::from_core(preview, allow))
        .map_err(|e| plugin_error(e, &data))
}

struct CancellationRegistration(String);
impl CancellationRegistration {
    fn register(id: &str) -> Result<(Self, CancelFlag), FfiError> {
        use std::collections::hash_map::Entry;

        let mut active = CANCELLATIONS.lock().unwrap_or_else(|p| p.into_inner());
        let Entry::Vacant(entry) = active.entry(id.to_owned()) else {
            return Err(core_error(
                CoreErrorCode::PluginInvalidRequest,
                "Operation ID is already active",
            ));
        };
        let cancel = CancelFlag::new();
        entry.insert(cancel.clone());
        Ok((Self(id.to_owned()), cancel))
    }
}
impl Drop for CancellationRegistration {
    fn drop(&mut self) {
        CANCELLATIONS
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&self.0);
    }
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn execute_plugin_install(
    operation_id: String,
    token: String,
    confirmed_dependency_ids: Vec<String>,
    observer: Arc<dyn PluginInstallObserver>,
) -> Result<PluginInstallResult, FfiError> {
    let (data, registry, operations) = session_handles()?;
    let (_registration, cancel) = CancellationRegistration::register(&operation_id)?;
    let server_id = INSTALLER
        .server_for_token(&token)
        .map_err(|error| core_error(CoreErrorCode::PluginSessionExpired, redact(&error, &data)))?;
    let _guard = operations
        .acquire(&server_id, OperationKind::ArtifactInstall)
        .await
        .map_err(|e| plugin_error(e, &data))?;
    let allow = allow_unverified(&data)?;
    INSTALLER
        .execute_typed(
            &data,
            &registry,
            installer::ExecuteRequest {
                token,
                confirmed_dependency_ids,
            },
            allow,
            |p| {
                observer.on_progress(PluginInstallProgress {
                    operation_id: operation_id.clone(),
                    downloaded: p.downloaded,
                    total: p.total,
                    artifact_id: p.artifact_id,
                });
            },
            Some(&cancel),
        )
        .await
        .map(|v| PluginInstallResult {
            server_id: v.server_id,
            installed_file_names: v.installed_file_names,
        })
        .map_err(|error| install_error(error, &data))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn cancel_plugin_operation(operation_id: String) -> bool {
    let active = CANCELLATIONS.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(cancel) = active.get(&operation_id) {
        cancel.cancel();
        true
    } else {
        false
    }
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn toggle_installed_plugin(
    server_id: String,
    file_name: String,
) -> Result<String, FfiError> {
    let (data, registry, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::ArtifactInstall)
        .await
        .map_err(|e| plugin_error(e, &data))?;
    blocking(move || {
        installer::toggle(
            &data,
            &registry,
            installer::MutationRequest {
                server_id,
                file_name,
            },
        )
        .map_err(|e| plugin_error(e, &data))
    })
    .await
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn uninstall_plugin(server_id: String, file_name: String) -> Result<(), FfiError> {
    let (data, registry, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::ArtifactInstall)
        .await
        .map_err(|e| plugin_error(e, &data))?;
    blocking(move || {
        installer::uninstall(
            &data,
            &registry,
            installer::MutationRequest {
                server_id,
                file_name,
            },
        )
        .map_err(|e| plugin_error(e, &data))
    })
    .await
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct InstalledPlugin {
    pub file_name: String,
    pub enabled: bool,
    pub origin: Option<PluginOrigin>,
    pub update: PluginUpdateStatus,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginOrigin {
    pub project: PluginProject,
    pub version: String,
}

#[derive(Clone, Debug, uniffi::Enum)]
pub enum PluginUpdateStatus {
    Local,
    UpToDate,
    Available { version: String },
    Unknown,
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn installed_plugins(
    server_id: String,
    check_updates: bool,
) -> Result<Vec<InstalledPlugin>, FfiError> {
    let (data, registry, operations) = session_handles()?;
    let _guard = operations
        .acquire(&server_id, OperationKind::ArtifactInstall)
        .await
        .map_err(|error| plugin_error(error, &data))?;
    INSTALLER
        .installed(&data, &registry, &server_id, check_updates)
        .await
        .map(|items| {
            items
                .into_iter()
                .map(|item| InstalledPlugin {
                    file_name: item.file_name,
                    enabled: item.enabled,
                    origin: item.origin.map(|origin| PluginOrigin {
                        project: origin.project.into(),
                        version: origin.version,
                    }),
                    update: match item.update {
                        installer::UpdateStatus::Local => PluginUpdateStatus::Local,
                        installer::UpdateStatus::UpToDate => PluginUpdateStatus::UpToDate,
                        installer::UpdateStatus::Available { version } => {
                            PluginUpdateStatus::Available { version }
                        }
                        installer::UpdateStatus::Unknown => PluginUpdateStatus::Unknown,
                    },
                })
                .collect()
        })
        .map_err(|error| core_error(CoreErrorCode::PluginIo, redact(&error, &data)))
}

#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum PluginBulkSkipReason {
    Local,
    UpToDate,
    CompatibilityUnknown,
    ConfirmationRequired,
    ExternalDownload,
    UnverifiedDownload,
    AlreadyUpdated,
}

impl From<installer::BulkSkipReason> for PluginBulkSkipReason {
    fn from(value: installer::BulkSkipReason) -> Self {
        match value {
            installer::BulkSkipReason::Local => Self::Local,
            installer::BulkSkipReason::UpToDate => Self::UpToDate,
            installer::BulkSkipReason::CompatibilityUnknown => Self::CompatibilityUnknown,
            installer::BulkSkipReason::ConfirmationRequired => Self::ConfirmationRequired,
            installer::BulkSkipReason::ExternalDownload => Self::ExternalDownload,
            installer::BulkSkipReason::UnverifiedDownload => Self::UnverifiedDownload,
            installer::BulkSkipReason::AlreadyUpdated => Self::AlreadyUpdated,
        }
    }
}

#[derive(Clone, Debug, uniffi::Enum)]
pub enum PluginBulkItemStatus {
    Updated { installed_file_names: Vec<String> },
    Skipped { reason: PluginBulkSkipReason },
    Failed { error: String },
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginBulkItemResult {
    pub file_name: String,
    pub status: PluginBulkItemStatus,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginBulkOutcome {
    pub items: Vec<PluginBulkItemResult>,
    pub cancelled: bool,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct PluginBulkProgress {
    pub operation_id: String,
    pub completed: u32,
    pub total: u32,
    pub current_file: String,
}

#[uniffi::export(with_foreign)]
pub trait PluginBulkObserver: Send + Sync {
    fn on_progress(&self, event: PluginBulkProgress);
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn bulk_update_plugins(
    operation_id: String,
    server_id: String,
    observer: Arc<dyn PluginBulkObserver>,
) -> Result<PluginBulkOutcome, FfiError> {
    let (data, registry, operations) = session_handles()?;
    let (_registration, cancel) = CancellationRegistration::register(&operation_id)?;
    let _guard = operations
        .acquire(&server_id, OperationKind::ArtifactInstall)
        .await
        .map_err(|error| plugin_error(error, &data))?;
    let allow = allow_unverified(&data)?;
    INSTALLER
        .bulk_update(&data, &registry, &server_id, allow, &cancel, |progress| {
            observer.on_progress(PluginBulkProgress {
                operation_id: operation_id.clone(),
                completed: progress.completed,
                total: progress.total,
                current_file: progress.file_name,
            });
        })
        .await
        .map(|outcome| PluginBulkOutcome {
            cancelled: outcome.cancelled,
            items: outcome
                .items
                .into_iter()
                .map(|item| PluginBulkItemResult {
                    file_name: item.file_name,
                    status: match item.result {
                        installer::BulkItemResult::Updated {
                            installed_file_names,
                        } => PluginBulkItemStatus::Updated {
                            installed_file_names,
                        },
                        installer::BulkItemResult::Skipped { reason } => {
                            PluginBulkItemStatus::Skipped {
                                reason: reason.into(),
                            }
                        }
                        installer::BulkItemResult::Failed { error } => {
                            PluginBulkItemStatus::Failed {
                                error: redact(&error, &data),
                            }
                        }
                    },
                })
                .collect(),
        })
        .map_err(|error| plugin_error(error, &data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operation_id_cannot_be_reused_until_registration_is_dropped() {
        let id = "ffi-plugin-cancellation-test";
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        let (registration, cancel) = CancellationRegistration::register(id).unwrap();
        assert!(matches!(
            CancellationRegistration::register(id),
            Err(FfiError::Core { ref code, .. }) if code == "plugin.invalid_request"
        ));
        assert!(runtime.block_on(cancel_plugin_operation(id.into())));
        assert!(cancel.is_cancelled());
        drop(registration);
        assert!(!runtime.block_on(cancel_plugin_operation(id.into())));
        assert!(CancellationRegistration::register(id).is_ok());
    }
}
