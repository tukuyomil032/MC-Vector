//! Installed artifact inventory, origin tracking, and sequential updates.
use super::*;
use std::io::Read;

const ORIGINS: &str = ".mcvector-plugin-origins.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ArtifactOrigin {
    pub project: ProjectRef,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(super) struct VerifiedOrigin {
    pub origin: ArtifactOrigin,
    pub version_key: String,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpdateStatus {
    Local,
    UpToDate,
    Available { version: String },
    Unknown,
}

#[derive(Clone, Debug)]
pub struct InstalledArtifact {
    pub file_name: String,
    pub enabled: bool,
    pub origin: Option<ArtifactOrigin>,
    pub update: UpdateStatus,
}

#[derive(Clone, Debug)]
pub struct BulkProgress {
    pub completed: u32,
    pub total: u32,
    pub file_name: String,
}

#[derive(Clone, Debug)]
pub struct BulkOutcome {
    pub items: Vec<BulkItem>,
    pub cancelled: bool,
}

#[derive(Clone, Debug)]
pub struct BulkItem {
    pub file_name: String,
    pub result: BulkItemResult,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BulkItemResult {
    Updated { installed_file_names: Vec<String> },
    Skipped { reason: BulkSkipReason },
    Failed { error: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BulkSkipReason {
    Local,
    UpToDate,
    CompatibilityUnknown,
    ConfirmationRequired,
    ExternalDownload,
    UnverifiedDownload,
    AlreadyUpdated,
}

fn enabled(name: &str) -> bool {
    !name.to_ascii_lowercase().ends_with(".disabled")
}

// Keep the original case because case-sensitive volumes can contain separate
// artifacts whose names differ only by case. Toggle preserves this key.
fn origin_key(name: &str) -> &str {
    if enabled(name) {
        name
    } else {
        &name[..name.len() - ".disabled".len()]
    }
}

fn origins(directory: &Path) -> Result<BTreeMap<String, VerifiedOrigin>, String> {
    let path = directory.join(ORIGINS);
    if !regular_file(&path)? {
        return Ok(BTreeMap::new());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(io)?
        .take(crate::managed_files::MAX_TEXT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(io)?;
    if bytes.len() as u64 > crate::managed_files::MAX_TEXT_BYTES {
        return Err("Plugin origin metadata exceeds the size limit".into());
    }
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid plugin origin metadata: {error}"))
}

fn write_origins(
    directory: &Path,
    origins: &BTreeMap<String, VerifiedOrigin>,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(origins).map_err(|error| error.to_string())?;
    crate::managed_files::atomic_write(&directory.join(ORIGINS), &bytes)
        .map_err(|error| error.to_string())?;
    transaction::sync_directory(directory)
}

pub(super) fn remove_origin(directory: &Path, name: &str) -> Result<(), String> {
    let mut entries = origins(directory)?;
    if entries.remove(origin_key(name)).is_some() {
        write_origins(directory, &entries)?;
    }
    Ok(())
}

/// Replay publication from a committed journal. If a user has subsequently
/// replaced a destination, the recorded hash cannot authorize updating it.
pub(super) fn publish_origins<'a>(
    directory: &Path,
    changes: impl Iterator<Item = (&'a str, Option<&'a str>, &'a VerifiedOrigin)>,
) -> Result<(), String> {
    let mut changes = changes.peekable();
    if changes.peek().is_none() {
        return Ok(());
    }
    let mut entries = origins(directory)?;
    for (name, original, origin) in changes {
        if let Some(original) = original {
            entries.remove(origin_key(original));
        }
        entries.insert(origin_key(name).to_owned(), origin.clone());
    }
    write_origins(directory, &entries)
}

fn inventory(directory: &Path) -> Result<Vec<(String, Option<VerifiedOrigin>)>, String> {
    let origins = origins(directory)?;
    let mut items = Vec::new();
    for entry in directory_entries(directory)? {
        let Some(name) = entry.file_name().into_string().ok() else {
            continue;
        };
        if basename(&name).is_err() || !origin_key(&name).to_ascii_lowercase().ends_with(".jar") {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(io(error)),
        };
        if !metadata.is_file() || is_link(&metadata) {
            continue;
        }
        let origin = match origins.get(origin_key(&name)) {
            Some(origin) if file_sha256(&entry.path())? == origin.sha256 => Some(origin.clone()),
            _ => None,
        };
        items.push((name, origin));
    }
    items.sort_by_cached_key(|(name, _)| (name.to_ascii_lowercase(), name.clone()));
    Ok(items)
}

async fn load_inventory(
    app_data: &Path,
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<(MinecraftServer, Vec<(String, Option<VerifiedOrigin>)>), String> {
    let registry = registry.clone();
    let app_data = app_data.to_owned();
    let server_id = server_id.to_owned();
    blocking(move || {
        let profile = server(&registry, &server_id)?;
        recover_profile(&app_data, &profile)?;
        let (directory, _) = directory(&app_data, &profile)?;
        Ok((profile, inventory(&directory)?))
    })
    .await
}

fn compare_version(origin: &VerifiedOrigin, key: String, version: &str) -> UpdateStatus {
    if key == origin.version_key {
        return UpdateStatus::UpToDate;
    }
    UpdateStatus::Available {
        version: version.to_owned(),
    }
}

async fn lookup_update(
    origin: &VerifiedOrigin,
    profile: &MinecraftServer,
) -> Result<UpdateStatus, String> {
    let (key, version) = match &origin.origin.project {
        ProjectRef::Modrinth { project_id } => {
            let (loader, _) = loader(&profile.software)?;
            let version =
                modrinth::compatible_version(project_id, loader, &profile.version).await?;
            if version.is_null() {
                return Ok(UpdateStatus::Unknown);
            }
            let id = text(&version, "id");
            let version = modrinth::install_version(id).await?;
            if text(&version, "projectId") != project_id
                || !strings(&version["gameVersions"]).contains(&profile.version)
                || !strings(&version["loaders"])
                    .iter()
                    .any(|value| value == loader)
            {
                return Ok(UpdateStatus::Unknown);
            }
            (
                format!("modrinth:{project_id}:{id}"),
                text(&version, "versionName").to_owned(),
            )
        }
        ProjectRef::Hangar { owner, slug } => {
            let value =
                hangar::resolve_download(owner, slug, &profile.software, &profile.version).await?;
            if value["compatible"].as_bool() != Some(true) {
                return Ok(UpdateStatus::Unknown);
            }
            let version = text(&value, "versionName");
            (
                format!("hangar:{owner}/{slug}:{version}"),
                version.to_owned(),
            )
        }
        ProjectRef::Spiget { resource_id } => {
            let value = spiget::install_resource(*resource_id, &profile.version).await?;
            let Some(id) = value["versionId"].as_u64() else {
                return Ok(UpdateStatus::Unknown);
            };
            if text(&value, "compatibility") != "compatible" {
                return Ok(UpdateStatus::Unknown);
            }
            (
                format!("spiget:{resource_id}:{id}"),
                text(&value, "versionName").to_owned(),
            )
        }
    };
    Ok(compare_version(origin, key, &version))
}

fn skip(reason: BulkSkipReason) -> BulkItemResult {
    BulkItemResult::Skipped { reason }
}

impl PluginInstaller {
    /// Callers hold the server's ArtifactInstall lock while recovering and
    /// snapshotting its inventory.
    pub async fn installed(
        &self,
        app_data: &Path,
        registry: &ServerRegistry,
        server_id: &str,
        check_updates: bool,
    ) -> Result<Vec<InstalledArtifact>, String> {
        let (profile, inventory) = load_inventory(app_data, registry, server_id).await?;
        let mut items = Vec::with_capacity(inventory.len());
        for (file_name, origin) in inventory {
            let update = match &origin {
                Some(origin) if check_updates => lookup_update(origin, &profile)
                    .await
                    .unwrap_or(UpdateStatus::Unknown),
                Some(_) => UpdateStatus::Unknown,
                None => UpdateStatus::Local,
            };
            items.push(InstalledArtifact {
                enabled: enabled(&file_name),
                file_name,
                origin: origin.map(|value| value.origin),
                update,
            });
        }
        Ok(items)
    }

    /// Caller holds the server's ArtifactInstall lock. Only complete artifact
    /// transactions are reported as updated, with cancellation between items.
    pub async fn bulk_update(
        &self,
        app_data: &Path,
        registry: &ServerRegistry,
        server_id: &str,
        allow_unverified: bool,
        cancel: &CancelFlag,
        mut report: impl FnMut(BulkProgress),
    ) -> Result<BulkOutcome, String> {
        if cancel.is_cancelled() {
            return Ok(BulkOutcome {
                items: Vec::new(),
                cancelled: true,
            });
        }
        let (profile, inventory) = load_inventory(app_data, registry, server_id).await?;
        let total = u32::try_from(inventory.len()).map_err(|_| "Too many installed plugins")?;
        let mut items = Vec::with_capacity(inventory.len());
        for (completed, (file_name, origin)) in (0..total).zip(inventory) {
            if cancel.is_cancelled() {
                break;
            }
            report(BulkProgress {
                completed,
                total,
                file_name: file_name.clone(),
            });
            let result = match origin {
                Some(origin) => self
                    .update_one(
                        app_data,
                        registry,
                        &profile,
                        &file_name,
                        origin,
                        allow_unverified,
                    )
                    .await
                    .unwrap_or_else(|error| BulkItemResult::Failed { error }),
                None => skip(BulkSkipReason::Local),
            };
            report(BulkProgress {
                completed: completed + 1,
                total,
                file_name: file_name.clone(),
            });
            items.push(BulkItem { file_name, result });
        }
        Ok(BulkOutcome {
            cancelled: items.len() < total as usize && cancel.is_cancelled(),
            items,
        })
    }

    async fn update_one(
        &self,
        app_data: &Path,
        registry: &ServerRegistry,
        profile: &MinecraftServer,
        file_name: &str,
        origin: VerifiedOrigin,
        allow_unverified: bool,
    ) -> Result<BulkItemResult, String> {
        match lookup_update(&origin, profile).await? {
            UpdateStatus::Local => return Ok(skip(BulkSkipReason::Local)),
            UpdateStatus::UpToDate => return Ok(skip(BulkSkipReason::UpToDate)),
            UpdateStatus::Unknown => return Ok(skip(BulkSkipReason::CompatibilityUnknown)),
            UpdateStatus::Available { .. } => {}
        }
        let preview = self
            .prepare_replacement(
                app_data,
                registry,
                "",
                PrepareRequest {
                    server_id: profile.id.clone(),
                    project: origin.origin.project,
                    replace_file_name: Some(file_name.to_owned()),
                },
                Some(&origin.sha256),
            )
            .await?;
        let reason = match preview.policy(allow_unverified) {
            InstallPolicy::ExternalDownload => Some(BulkSkipReason::ExternalDownload),
            InstallPolicy::UnverifiedBlocked => Some(BulkSkipReason::UnverifiedDownload),
            InstallPolicy::IncompletePreview
            | InstallPolicy::Incompatible
            | InstallPolicy::Confirm {
                unknown_compatibility: true,
                ..
            } => Some(BulkSkipReason::CompatibilityUnknown),
            InstallPolicy::Confirm { .. } if !preview.missing_dependency_ids.is_empty() => {
                Some(BulkSkipReason::ConfirmationRequired)
            }
            InstallPolicy::Confirm { .. }
                if preview
                    .artifacts
                    .iter()
                    .any(|item| !item.dependency && item.id == origin.version_key) =>
            {
                Some(BulkSkipReason::AlreadyUpdated)
            }
            InstallPolicy::Confirm { .. } => None,
        };
        if let Some(reason) = reason {
            if let Some(token) = preview.token {
                self.plans
                    .lock()
                    .map_err(|_| "Plugin plan lock poisoned")?
                    .remove(&token);
            }
            return Ok(skip(reason));
        }
        let token = preview.token.ok_or("Missing update plan")?;
        let installed = self
            .execute(
                app_data,
                registry,
                ExecuteRequest {
                    token,
                    confirmed_dependency_ids: Vec::new(),
                },
                allow_unverified,
                |_| {},
                None,
            )
            .await?;
        Ok(BulkItemResult::Updated {
            installed_file_names: installed.installed_file_names,
        })
    }
}
