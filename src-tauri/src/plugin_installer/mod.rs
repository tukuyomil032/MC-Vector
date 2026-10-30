//! Rust-owned plugin planning and transactions. IPC never supplies paths, hashes
//! or artifact URLs. A plan is an ephemeral capability, consumed before execution.
#[cfg(test)]
mod tests;
mod transaction;

use crate::commands::download::{self, ExpectedChecksum};
use crate::commands::server_registry::{MinecraftServer, ServerRegistry};
use crate::plugin_catalog::{hangar, modrinth, spiget};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const PLAN_LIFETIME: Duration = Duration::from_secs(5 * 60);
const MAX_GRAPH: usize = 128;
const MAX_PLANS: usize = 256;
const PLUGIN_RECOVERY_UNAVAILABLE_PREFIX: &str =
    "[plugin-recovery] Plugin transaction recovery needs attention: ";
const PLUGIN_RECOVERY_UNAVAILABLE_SEPARATOR: &str = "\n\n";
#[cfg(debug_assertions)]
const E2E_PLUGIN_PROJECT_ID: &str = "e2e-verified-plugin";
#[cfg(debug_assertions)]
const E2E_PLUGIN_MISMATCH_PROJECT_ID: &str = "e2e-verified-plugin-mismatch";
const E2E_APP_IDENTIFIER: &str = "com.tukuyomi032.mcvector.e2e";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "provider", rename_all = "lowercase", deny_unknown_fields)]
pub enum ProjectRef {
    Modrinth {
        #[serde(rename = "projectId")]
        project_id: String,
    },
    Hangar {
        owner: String,
        slug: String,
    },
    Spiget {
        #[serde(rename = "resourceId")]
        resource_id: u64,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareRequest {
    pub server_id: String,
    pub project: ProjectRef,
    pub replace_file_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecuteRequest {
    pub token: String,
    /// Exact dependency keys displayed by prepare; an empty list is explicit.
    pub confirmed_dependency_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MutationRequest {
    pub server_id: String,
    pub file_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactPreview {
    pub id: String,
    pub project: ProjectRef,
    pub title: String,
    pub version: String,
    pub file_name: String,
    pub installed_file_name: Option<String>,
    pub dependency: bool,
    pub verified: bool,
    pub compatibility: String,
    pub supported_versions: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPreview {
    pub token: Option<String>,
    pub expires_in_seconds: u64,
    pub server_id: String,
    pub server_version: String,
    pub server_software: String,
    pub target_directory: String,
    pub artifacts: Vec<ArtifactPreview>,
    pub missing_dependency_ids: Vec<String>,
    pub external_url: Option<String>,
    pub requires_unverified_downloads: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub server_id: String,
    pub installed_file_names: Vec<String>,
}

#[derive(Clone, Debug)]
pub(super) struct Artifact {
    pub preview: ArtifactPreview,
    pub provider: String,
    pub url: String,
    pub checksum: Option<ExpectedChecksum>,
    pub original_name: Option<String>,
    pub original_sha256: Option<String>,
    pub identity_candidates: Vec<String>,
}

#[derive(Clone)]
struct Plan {
    server_id: String,
    profile: String,
    directory: PathBuf,
    directory_snapshot: String,
    created: Instant,
    artifacts: Vec<Artifact>,
    dependencies: Vec<String>,
}

#[derive(Default)]
pub struct PluginInstaller {
    plans: Mutex<HashMap<String, Plan>>,
}

fn text<'a>(value: &'a Value, field: &str) -> &'a str {
    value[field].as_str().unwrap_or("")
}
fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect()
}
fn io(error: std::io::Error) -> String {
    error.to_string()
}

pub(super) fn is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return metadata.file_attributes() & 0x0400 != 0;
    }
    #[cfg(not(windows))]
    false
}

pub(super) fn basename(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value.len() > 180
        || value.trim() != value
        || value.contains(['/', '\\', ':'])
        || value.chars().any(char::is_control)
        || value.ends_with([' ', '.'])
        || matches!(value, "." | "..")
        || !(value.to_ascii_lowercase().ends_with(".jar")
            || value.to_ascii_lowercase().ends_with(".jar.disabled"))
    {
        return Err("Plugin filename must be a single .jar or .jar.disabled basename".into());
    }
    let stem = value.split('.').next().unwrap_or("").to_ascii_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
    {
        return Err("Reserved plugin filename".into());
    }
    Ok(value)
}

pub(super) fn regular_file(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if is_link(&metadata) || !metadata.is_file() => {
            Err("Plugin path must be a regular file without symbolic links".into())
        }
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(io(error)),
    }
}

fn server(registry: &ServerRegistry, id: &str) -> Result<MinecraftServer, String> {
    registry
        .get_servers()?
        .into_iter()
        .find(|server| server.id == id)
        .ok_or("Server profile no longer exists".into())
}

fn loader(software: &str) -> Result<(&'static str, &'static str), String> {
    match software.trim().to_ascii_lowercase().as_str() {
        "fabric" => Ok(("fabric", "mods")),
        "forge" => Ok(("forge", "mods")),
        "neoforge" => Ok(("neoforge", "mods")),
        "quilt" => Ok(("quilt", "mods")),
        "paper" | "purpur" | "leaf" | "leafmc" | "folia" => Ok(("paper", "plugins")),
        "spigot" | "bukkit" | "craftbukkit" => Ok(("spigot", "plugins")),
        "velocity" => Ok(("velocity", "plugins")),
        "waterfall" | "bungeecord" => Ok(("bungeecord", "plugins")),
        _ => Err("Server software does not support managed plugins or mods".into()),
    }
}

fn profile_fingerprint(server: &MinecraftServer) -> String {
    // Runtime status/name do not affect installation; path/version/software do.
    serde_json::json!([server.id, server.path, server.software, server.version]).to_string()
}

fn managed_server_root(app_data: &Path, server: &MinecraftServer) -> Result<PathBuf, String> {
    if server.id.is_empty()
        || server.id.contains(['/', '\\', ':'])
        || matches!(server.id.as_str(), "." | "..")
        || server.id.chars().any(char::is_control)
    {
        return Err("Unsafe server ID in registry".into());
    }
    let root = app_data.join("servers");
    let server_dir = root.join(&server.id);
    for path in [&root, &server_dir] {
        let metadata = fs::symlink_metadata(path).map_err(io)?;
        if is_link(&metadata) || !metadata.is_dir() {
            return Err("Managed server root must be a real directory".into());
        }
    }
    // Registry profiles may refer to unavailable/external paths. They must never
    // redirect installation away from the fixed managed root.
    let canonical = fs::canonicalize(&server_dir).map_err(io)?;
    if fs::canonicalize(&server.path).map_err(io)? != canonical {
        return Err("Server profile path is outside its managed root".into());
    }
    Ok(canonical)
}

fn directory(app_data: &Path, server: &MinecraftServer) -> Result<(PathBuf, &'static str), String> {
    let (_, kind) = loader(&server.software)?;
    let canonical = managed_server_root(app_data, server)?;
    let target = canonical.join(kind);
    match fs::symlink_metadata(&target) {
        Ok(metadata) if is_link(&metadata) || !metadata.is_dir() => {
            return Err("Plugin directory must be a real directory".into())
        }
        Ok(_) => (),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(error) => return Err(io(error)),
    }
    Ok((target, kind))
}

fn directory_entries(path: &Path) -> Result<Vec<fs::DirEntry>, String> {
    match fs::read_dir(path) {
        Ok(entries) => entries.collect::<Result<Vec<_>, _>>().map_err(io),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(error) => Err(io(error)),
    }
}

/// Every source/backup verification performs its own fresh path check. Check
/// again after opening, before reading bytes, so a substituted link is rejected.
pub(super) fn file_sha256(path: &Path) -> Result<String, String> {
    if !regular_file(path)? {
        return Err("Replacement plugin no longer exists".into());
    }
    let mut file = fs::File::open(path).map_err(io)?;
    if !regular_file(path)? || !file.metadata().map_err(io)?.is_file() {
        return Err("Replacement hash source must remain a regular file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let opened = file.metadata().map_err(io)?;
        let current = fs::symlink_metadata(path).map_err(io)?;
        if is_link(&current) || opened.dev() != current.dev() || opened.ino() != current.ino() {
            return Err("Replacement hash source changed while opening".into());
        }
    }
    let mut digest = Sha256::new();
    std::io::copy(&mut file, &mut digest).map_err(io)?;
    Ok(format!("{:x}", digest.finalize()))
}

fn create_install_directory(path: &Path) -> Result<(), String> {
    match fs::create_dir(path) {
        Ok(()) => (),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(io(error)),
    }
    let metadata = fs::symlink_metadata(path).map_err(io)?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err("Plugin directory must be a real directory".into());
    }
    Ok(())
}

/// Hash the exact installed bytes as well as names to invalidate plans after
/// external/manual edits, including same-size changes and enable/disable moves.
fn file_inventory(directory: &Path) -> Result<BTreeMap<String, String>, String> {
    let mut files = BTreeMap::new();
    for entry in directory_entries(directory)? {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Non-UTF8 plugin filename")?;
        if basename(&name).is_err() {
            continue;
        }
        if !regular_file(&entry.path())? {
            continue;
        }
        files.insert(name, file_sha256(&entry.path())?);
    }
    Ok(files)
}

fn snapshot(directory: &Path) -> Result<String, String> {
    serde_json::to_string(&file_inventory(directory)?).map_err(|error| error.to_string())
}

fn listed_file_name(directory: &Path, requested: &str) -> Result<Option<String>, String> {
    let mut found = None;
    for entry in directory_entries(directory)? {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if name.eq_ignore_ascii_case(requested) {
            regular_file(&entry.path())?;
            if found.is_some() {
                return Err("Ambiguous plugin filenames differ only by letter case".into());
            }
            found = Some(name);
        }
    }
    Ok(found)
}

fn installed_name(directory: &Path, file_name: &str) -> Result<Option<String>, String> {
    basename(file_name)?;
    let enabled = listed_file_name(directory, file_name)?;
    let disabled = listed_file_name(directory, &format!("{file_name}.disabled"))?;
    if enabled.is_some() && disabled.is_some() {
        return Err("Both enabled and disabled copies exist; resolve the conflict first".into());
    }
    Ok(enabled.or(disabled))
}

fn inventory_installed_dependency(
    files: &BTreeMap<String, String>,
    requested: &str,
    candidates: &[String],
) -> Result<Option<String>, String> {
    let matches = files
        .keys()
        .filter(|name| {
            name.eq_ignore_ascii_case(requested)
                || name.eq_ignore_ascii_case(&format!("{requested}.disabled"))
                || identity_match(name, candidates)
        })
        .cloned()
        .collect::<Vec<_>>();
    if matches.len() > 1 {
        return Err(
            "Ambiguous installed dependency copies; resolve duplicates before installing".into(),
        );
    }
    let Some(found) = matches.into_iter().next() else {
        return Ok(None);
    };
    if found.to_ascii_lowercase().ends_with(".disabled") {
        return Err(format!(
            "Required dependency is disabled as `{found}`; enable it or remove it before installing"
        ));
    }
    if !found.eq_ignore_ascii_case(requested) {
        return Err(format!(
            "A different or unverifiable version of the required dependency is installed as `{found}`; remove or replace it before installing the requested artifact"
        ));
    }
    Ok(Some(found))
}

fn normalize_candidate(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    let value = value.strip_suffix(".disabled").unwrap_or(&value);
    let value = value.strip_suffix(".jar").unwrap_or(value);
    value.chars().filter(char::is_ascii_alphanumeric).collect()
}

fn likely_version_suffix(value: &str) -> bool {
    use std::sync::OnceLock;
    static DIRECT: OnceLock<regex::Regex> = OnceLock::new();
    static CLASSIFIED: OnceLock<regex::Regex> = OnceLock::new();
    let value = value.trim();
    if value.is_empty() {
        return true;
    }
    let direct = DIRECT.get_or_init(|| regex::Regex::new(r"(?i)^[-_.\s]*v?\d+(?:\.\d+)*(?:(?:[-+_.][a-z0-9][a-z0-9.+_-]*)|(?:(?:alpha|beta|rc|snapshot|pre)\d*))?$").unwrap());
    let classified = CLASSIFIED.get_or_init(|| {
        regex::Regex::new(r"(?i)^[-_.\s]+(?:[a-z][a-z0-9]{1,31}[-_.\s]+){1,3}v?\d[\w.+-]*$")
            .unwrap()
    });
    direct.is_match(value) || classified.is_match(value)
}

fn identity_match(file: &str, candidates: &[String]) -> bool {
    let file = file.to_ascii_lowercase();
    let base = file.strip_suffix(".disabled").unwrap_or(&file);
    let base = base.strip_suffix(".jar").unwrap_or(base);
    candidates.iter().any(|candidate| {
        let candidate = candidate.trim().to_ascii_lowercase();
        let normalized = normalize_candidate(&candidate);
        if normalized.is_empty() {
            return false;
        }
        normalize_candidate(base) == normalized
            || base.strip_prefix(&candidate).is_some_and(|suffix| {
                likely_version_suffix(suffix)
                    || suffix
                        .chars()
                        .next()
                        .is_some_and(|character| !character.is_ascii_alphanumeric())
            })
    })
}

fn match_installed_identity(
    directory: &Path,
    target: &str,
    candidates: &[String],
) -> Result<Option<String>, String> {
    inventory_installed_dependency(&file_inventory(directory)?, target, candidates)
}

fn checksum(value: &Value) -> Result<Option<ExpectedChecksum>, String> {
    value
        .get("checksum")
        .filter(|value| !value.is_null())
        .map(|value| {
            serde_json::from_value(value.clone()).map_err(|_| "Malformed provider checksum".into())
        })
        .transpose()
}

async fn modrinth_artifact(
    project_id: &str,
    version: Value,
    server: &MinecraftServer,
    dependency: bool,
) -> Result<(Artifact, Vec<Value>), String> {
    let identity = modrinth::project_identity(project_id).await?;
    let canonical_id = text(&identity, "id");
    if canonical_id.is_empty() || text(&version, "projectId") != canonical_id {
        return Err("Modrinth version belongs to a different project".into());
    }
    let (loader, _) = loader(&server.software)?;
    if !strings(&version["gameVersions"])
        .iter()
        .any(|value| value == &server.version)
        || !strings(&version["loaders"])
            .iter()
            .any(|value| value == loader)
    {
        return Err("Modrinth version is incompatible with the server profile".into());
    }
    let file_name = basename(text(&version, "fileName"))?.to_string();
    if !file_name.to_ascii_lowercase().ends_with(".jar") {
        return Err("Provider artifact must be a JAR file".into());
    }
    let resolved = modrinth::artifact(text(&version, "id"), &file_name).await?;
    let hash = checksum(&resolved)?;
    let artifact = Artifact {
        preview: ArtifactPreview {
            id: format!("modrinth:{canonical_id}:{}", text(&version, "id")),
            project: ProjectRef::Modrinth {
                project_id: canonical_id.into(),
            },
            title: text(&identity, "title").into(),
            version: text(&version, "versionName").into(),
            file_name,
            installed_file_name: None,
            dependency,
            verified: hash.is_some(),
            compatibility: "compatible".into(),
            supported_versions: strings(&version["gameVersions"]),
        },
        identity_candidates: vec![
            canonical_id.to_owned(),
            text(&identity, "slug").to_owned(),
            text(&identity, "title").to_owned(),
        ],
        provider: "modrinth".into(),
        url: text(&resolved, "url").into(),
        checksum: hash,
        original_name: None,
        original_sha256: None,
    };
    Ok((
        artifact,
        version["dependencies"]
            .as_array()
            .cloned()
            .unwrap_or_default(),
    ))
}

async fn latest_modrinth(project: &str, server: &MinecraftServer) -> Result<Value, String> {
    let (loader, _) = loader(&server.software)?;
    let version = modrinth::compatible_version(project, loader, &server.version).await?;
    if version.is_null() {
        return Err("No compatible Modrinth version is available".into());
    }
    modrinth::install_version(text(&version, "id")).await
}

/// Depth-first required-only traversal with both version and project identity.
/// Cycles are safe; conflicting pinned versions fail instead of choosing silently.
fn add_graph_identity(
    seen: &mut HashMap<String, String>,
    project: &str,
    version: &str,
) -> Result<bool, String> {
    if let Some(previous) = seen.get(project) {
        if previous != version {
            return Err("Conflicting required dependency versions".into());
        }
        return Ok(false);
    }
    if seen.len() >= MAX_GRAPH {
        return Err("Required dependency graph exceeds the safety limit".into());
    }
    seen.insert(project.into(), version.into());
    Ok(true)
}

async fn resolve(
    project: &ProjectRef,
    server: &MinecraftServer,
    installed_files: &BTreeMap<String, String>,
    allow_debug_e2e: bool,
) -> Result<(Vec<Artifact>, Option<String>), String> {
    #[cfg(not(debug_assertions))]
    let _ = allow_debug_e2e;
    #[cfg(debug_assertions)]
    if allow_debug_e2e {
        if let Some(artifact) = debug_e2e_artifact(project, server)? {
            return Ok((vec![artifact], None));
        }
    }

    match project {
        ProjectRef::Modrinth { project_id } => {
            let first = latest_modrinth(project_id, server).await?;
            let mut pending = vec![(project_id.clone(), first, false)];
            let mut seen = HashMap::new();
            let mut artifacts = Vec::new();
            while let Some((project, version, dependency)) = pending.pop() {
                let (artifact, dependencies) =
                    modrinth_artifact(&project, version.clone(), server, dependency).await?;
                let canonical = match &artifact.preview.project {
                    ProjectRef::Modrinth { project_id } => project_id,
                    _ => unreachable!(),
                };
                if !add_graph_identity(&mut seen, canonical, text(&version, "id"))? {
                    continue;
                }
                if dependency
                    && inventory_installed_dependency(
                        installed_files,
                        &artifact.preview.file_name,
                        &artifact.identity_candidates,
                    )?
                    .is_some()
                {
                    continue;
                }
                artifacts.push(artifact);
                for dependency in dependencies
                    .into_iter()
                    .filter(|value| text(value, "dependencyType") == "required")
                {
                    if let Some(file) = dependency["fileName"].as_str() {
                        basename(file)?;
                    }
                    if dependency["projectId"].is_null() && dependency["versionId"].is_null() {
                        return Err(
                            "Required dependency has no resolvable provider reference".into()
                        );
                    }
                    let version = if let Some(id) = dependency["versionId"].as_str() {
                        modrinth::install_version(id).await?
                    } else if let Some(id) = dependency["projectId"].as_str() {
                        latest_modrinth(id, server).await?
                    } else {
                        return Err(
                            "Required dependency has no resolvable provider reference".into()
                        );
                    };
                    let canonical = text(&version, "projectId").to_owned();
                    if let Some(expected) = dependency["projectId"].as_str() {
                        if expected != canonical {
                            return Err("Required dependency project/version mismatch".into());
                        }
                    }
                    pending.push((canonical, version, true));
                }
            }
            Ok((artifacts, None))
        }
        ProjectRef::Hangar { owner, slug } => {
            if loader(&server.software)?.1 != "plugins" {
                return Err("Hangar requires a plugin-capable server".into());
            }
            let value =
                hangar::resolve_download(owner, slug, &server.software, &server.version).await?;
            if value.is_null() {
                return Err("No Hangar version is available".into());
            }
            hangar::validate_required_dependencies(&value, &server.software)?;
            if let Some(url) = value["externalUrl"]
                .as_str()
                .filter(|url| !url.is_empty() && text(&value, "downloadUrl").is_empty())
            {
                return Ok((vec![], Some(external_url(url)?)));
            }
            let hash = checksum(&value)?;
            Ok((
                vec![Artifact {
                    preview: ArtifactPreview {
                        id: format!("hangar:{owner}/{slug}:{}", text(&value, "versionName")),
                        project: project.clone(),
                        title: slug.clone(),
                        version: text(&value, "versionName").into(),
                        file_name: basename(text(&value, "fileName"))?.into(),
                        installed_file_name: None,
                        dependency: false,
                        verified: hash.is_some(),
                        compatibility: text(&value, "compatibility").into(),
                        supported_versions: strings(&value["supportedVersions"]),
                    },
                    provider: "hangar".into(),
                    url: text(&value, "downloadUrl").into(),
                    checksum: hash,
                    original_name: None,
                    original_sha256: None,
                    identity_candidates: vec![],
                }],
                None,
            ))
        }
        ProjectRef::Spiget { resource_id } => {
            if loader(&server.software)?.1 != "plugins" {
                return Err("Spiget requires a plugin-capable server".into());
            }
            let value = spiget::install_resource(*resource_id, &server.version).await?;
            if value["premium"].as_bool() == Some(true) || value["external"].as_bool() == Some(true)
            {
                return Ok((
                    vec![],
                    Some(format!("https://www.spigotmc.org/resources/{resource_id}/")),
                ));
            }
            let version = value["versionId"]
                .as_u64()
                .ok_or("Spiget latest version is unavailable")?;
            Ok((vec![Artifact { preview: ArtifactPreview { id:format!("spiget:{resource_id}:{version}"),project:project.clone(),title:text(&value,"name").into(),
                version:text(&value,"versionName").into(),file_name:format!("spigot-{resource_id}-{version}.jar"),installed_file_name:None,dependency:false,
                verified:false,compatibility:text(&value,"compatibility").into(),supported_versions:strings(&value["supportedVersions"]) },
                provider:"spiget".into(),url:format!("https://api.spiget.org/v2/resources/{resource_id}/download?version={version}"),checksum:None,original_name:None,original_sha256:None,identity_candidates:vec![] }],None))
        }
    }
}

#[cfg(debug_assertions)]
fn debug_e2e_artifact(
    project: &ProjectRef,
    server: &MinecraftServer,
) -> Result<Option<Artifact>, String> {
    if std::env::var("MC_VECTOR_E2E").ok().as_deref() != Some("1") {
        return Ok(None);
    }
    let ProjectRef::Modrinth { project_id } = project else {
        return Ok(None);
    };
    let (expected_id, checksum_env, title) = match project_id.as_str() {
        E2E_PLUGIN_PROJECT_ID => (
            E2E_PLUGIN_PROJECT_ID,
            "MC_VECTOR_E2E_PLUGIN_SHA256",
            "E2E Verified Plugin",
        ),
        E2E_PLUGIN_MISMATCH_PROJECT_ID => (
            E2E_PLUGIN_MISMATCH_PROJECT_ID,
            "MC_VECTOR_E2E_PLUGIN_BAD_SHA256",
            "E2E Checksum Mismatch Plugin",
        ),
        _ => return Ok(None),
    };
    let url = std::env::var("MC_VECTOR_E2E_PLUGIN_URL")
        .map_err(|_| "The debug E2E plugin URL is not configured".to_string())?;
    let checksum = ExpectedChecksum {
        algorithm: "sha256".into(),
        value: std::env::var(checksum_env)
            .map_err(|_| "The debug E2E plugin checksum is not configured".to_string())?,
    };
    download::required_sha256(Some(checksum.clone()))?;
    let file_name = "e2e-verified-plugin.jar".to_string();
    Ok(Some(Artifact {
        preview: ArtifactPreview {
            id: format!("modrinth:{expected_id}:debug-fixture"),
            project: project.clone(),
            title: title.into(),
            version: server.version.clone(),
            file_name,
            installed_file_name: None,
            dependency: false,
            verified: true,
            compatibility: "compatible".into(),
            supported_versions: vec![server.version.clone()],
        },
        provider: "modrinth".into(),
        url,
        checksum: Some(checksum),
        original_name: None,
        original_sha256: None,
        identity_candidates: vec![expected_id.into(), title.into()],
    }))
}

fn external_url(value: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid external provider URL")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Unsafe external provider URL".into());
    }
    Ok(url.to_string())
}

async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| error.to_string())?
}

struct PreparedFiles {
    server: MinecraftServer,
    directory: PathBuf,
    target: &'static str,
    before: String,
    expected_files: BTreeMap<String, String>,
}

fn prepare_files(
    app_data: &Path,
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<PreparedFiles, String> {
    let server = server(registry, server_id)?;
    recover_profile(app_data, &server)?;
    let (directory, target) = directory(app_data, &server)?;
    let before = snapshot(&directory)?;
    let expected_files = serde_json::from_str(&before).map_err(|error| error.to_string())?;
    Ok(PreparedFiles {
        server,
        directory,
        target,
        before,
        expected_files,
    })
}

fn finish_prepare_files(
    prepared: &PreparedFiles,
    replace_file_name: Option<&str>,
    mut artifacts: Vec<Artifact>,
) -> Result<Vec<Artifact>, String> {
    let directory = &prepared.directory;
    let before = &prepared.before;
    let expected_files = &prepared.expected_files;
    let replacement = replace_file_name
        .map(basename)
        .transpose()?
        .map(|name| {
            listed_file_name(&directory, name)?
                .ok_or_else(|| "Replacement plugin no longer exists".to_owned())
        })
        .transpose()?;
    let replacement = replacement.as_deref();
    let mut target_names = HashSet::new();
    for artifact in &mut artifacts {
        if !target_names.insert(artifact.preview.file_name.to_ascii_lowercase()) {
            return Err("Install plan contains conflicting target filenames".into());
        }
        let existing = if artifact.preview.dependency {
            match_installed_identity(
                &directory,
                &artifact.preview.file_name,
                &artifact.identity_candidates,
            )?
        } else {
            installed_name(&directory, &artifact.preview.file_name)?
        };
        artifact.preview.installed_file_name = existing.clone();
        if !artifact.preview.dependency {
            artifact.original_name = replacement.map(str::to_owned).or(existing.clone());
            artifact.original_sha256 = artifact
                .original_name
                .as_ref()
                .map(|name| {
                    expected_files
                        .get(name)
                        .cloned()
                        .ok_or_else(|| "Replacement plugin changed during planning".to_owned())
                })
                .transpose()?;
            if replacement.is_some() && existing.is_some() && existing.as_deref() != replacement {
                return Err("Replacement would overwrite another installed plugin".into());
            }
            if artifact
                .original_name
                .as_deref()
                .is_some_and(|name| name.to_ascii_lowercase().ends_with(".disabled"))
            {
                artifact.preview.file_name.push_str(".disabled");
            }
        }
    }
    if snapshot(&directory)? != *before {
        return Err("Installed files changed during planning; prepare again".into());
    }
    Ok(artifacts)
}

impl PluginInstaller {
    pub async fn prepare(
        &self,
        app_data: &Path,
        registry: &ServerRegistry,
        application_identifier: &str,
        request: PrepareRequest,
    ) -> Result<InstallPreview, String> {
        let registry_worker = registry.clone();
        let app_data_worker = app_data.to_path_buf();
        let server_id = request.server_id.clone();
        let prepared =
            blocking(move || prepare_files(&app_data_worker, &registry_worker, &server_id)).await?;
        let (artifacts, external_url) = resolve(
            &request.project,
            &prepared.server,
            &prepared.expected_files,
            application_identifier == E2E_APP_IDENTIFIER,
        )
        .await?;
        let replace_file_name = request.replace_file_name;
        let (prepared, artifacts) = blocking(move || {
            let artifacts =
                finish_prepare_files(&prepared, replace_file_name.as_deref(), artifacts)?;
            Ok((prepared, artifacts))
        })
        .await?;
        let PreparedFiles {
            server,
            directory,
            target,
            before,
            ..
        } = prepared;
        let dependencies = artifacts
            .iter()
            .filter(|item| item.preview.dependency && item.preview.installed_file_name.is_none())
            .map(|item| item.preview.id.clone())
            .collect::<Vec<_>>();
        let requires_unverified_downloads = artifacts.iter().any(|item| {
            item.checksum.is_none()
                && (!item.preview.dependency || item.preview.installed_file_name.is_none())
        });
        let previews = artifacts.iter().map(|item| item.preview.clone()).collect();
        let token = if external_url.is_none() {
            let token = Uuid::new_v4().to_string();
            let plan = Plan {
                server_id: server.id.clone(),
                profile: profile_fingerprint(&server),
                directory,
                directory_snapshot: before,
                created: Instant::now(),
                artifacts,
                dependencies: dependencies.clone(),
            };
            let mut plans = self.plans.lock().map_err(|_| "Plugin plan lock poisoned")?;
            plans.retain(|_, plan| plan.created.elapsed() < PLAN_LIFETIME);
            if plans.len() >= MAX_PLANS {
                return Err("Too many pending plugin plans".into());
            }
            plans.insert(token.clone(), plan);
            Some(token)
        } else {
            None
        };
        Ok(InstallPreview {
            token,
            expires_in_seconds: PLAN_LIFETIME.as_secs(),
            server_id: server.id,
            server_version: server.version,
            server_software: server.software,
            target_directory: target.into(),
            artifacts: previews,
            missing_dependency_ids: dependencies,
            external_url,
            requires_unverified_downloads,
        })
    }

    fn consume(&self, request: &ExecuteRequest) -> Result<Plan, String> {
        let plan = self
            .plans
            .lock()
            .map_err(|_| "Plugin plan lock poisoned")?
            .remove(&request.token)
            .ok_or("Install plan is unknown or already used")?;
        if plan.created.elapsed() >= PLAN_LIFETIME {
            return Err("Install plan expired; prepare again".into());
        }
        let mut confirmed = request.confirmed_dependency_ids.clone();
        confirmed.sort();
        let mut expected = plan.dependencies.clone();
        expected.sort();
        if confirmed != expected {
            return Err("Confirmation must match the exact planned missing dependency set".into());
        }
        Ok(plan)
    }

    pub fn server_for_token(&self, token: &str) -> Result<String, String> {
        self.plans
            .lock()
            .map_err(|_| "Plugin plan lock poisoned")?
            .get(token)
            .map(|plan| plan.server_id.clone())
            .ok_or("Install plan is unknown or already used".into())
    }

    pub async fn execute(
        &self,
        app: &AppHandle,
        app_data: &Path,
        registry: &ServerRegistry,
        request: ExecuteRequest,
    ) -> Result<InstallResult, String> {
        let plan = self.consume(&request)?;
        validate_plan_async(&plan, app_data, registry).await?;
        let accepted = plan
            .artifacts
            .iter()
            .filter(|item| !item.preview.dependency || item.preview.installed_file_name.is_none())
            .cloned()
            .collect::<Vec<_>>();
        if accepted
            .iter()
            .any(|artifact| artifact.preview.compatibility == "incompatible")
        {
            return Err("Plugin is incompatible with the registered server profile".into());
        }
        let stage_artifacts = accepted.clone();
        let stage_directory = plan.directory.clone();
        let policy_app = app.clone();
        let transaction = blocking(move || {
            let requires_unverified = stage_artifacts.iter().any(|artifact| artifact.checksum.is_none());
            if requires_unverified && !download::allows_unverified_plugin_downloads(&policy_app) {
                return Err(String::from("unverified-artifact-blocked: Enable allowUnverifiedPluginDownloads to install artifacts without provider checksums"));
            }
            create_install_directory(&stage_directory)?;
            transaction::Transaction::new(&stage_directory, &stage_artifacts)
        }).await?;
        let event = format!("download-progress-{}", request.token);
        let staged = async {
            for (index, artifact) in accepted.iter().enumerate() {
                download::stage_plugin_artifact(
                    &artifact.provider,
                    &artifact.url,
                    transaction.stage(index),
                    &plan.directory,
                    artifact.checksum.clone(),
                    |downloaded, total| {
                        let progress = serde_json::json!({
                            "downloaded": downloaded,
                            "total": total,
                            "artifactId": artifact.preview.id,
                        });
                        app.emit(&event, progress)
                            .map_err(|error| error.to_string())
                    },
                )
                .await?;
            }
            // Downloads can take minutes; external filesystem edits must still
            // invalidate the exact plan before any existing artifact is touched.
            validate_plan_async(&plan, app_data, registry).await?;
            Ok::<(), String>(())
        }
        .await;
        if let Err(error) = staged {
            blocking(move || transaction.discard()).await?;
            return Err(error);
        }
        let names = blocking(move || transaction.commit()).await?;
        Ok(InstallResult {
            server_id: plan.server_id,
            installed_file_names: names,
        })
    }
}

async fn validate_plan_async(
    plan: &Plan,
    app_data: &Path,
    registry: &ServerRegistry,
) -> Result<(), String> {
    let plan = plan.clone();
    let app_data = app_data.to_path_buf();
    let registry = registry.clone();
    blocking(move || validate_plan(&plan, &app_data, &registry)).await
}

fn validate_plan(plan: &Plan, app_data: &Path, registry: &ServerRegistry) -> Result<(), String> {
    let current = server(registry, &plan.server_id)?;
    if profile_fingerprint(&current) != plan.profile
        || directory(app_data, &current)?.0 != plan.directory
        || snapshot(&plan.directory)? != plan.directory_snapshot
    {
        return Err("Install plan is stale; prepare again".into());
    }
    Ok(())
}

pub fn toggle(
    app_data: &Path,
    registry: &ServerRegistry,
    request: MutationRequest,
) -> Result<String, String> {
    let profile = server(registry, &request.server_id)?;
    recover_profile(app_data, &profile)?;
    let (directory, _) = directory(app_data, &profile)?;
    let name = basename(&request.file_name)?;
    let next = if name.to_ascii_lowercase().ends_with(".disabled") {
        name[..name.len() - 9].to_owned()
    } else {
        format!("{name}.disabled")
    };
    basename(&next)?;
    if !regular_file(&directory.join(name))? {
        return Err("Installed plugin does not exist".into());
    }
    if regular_file(&directory.join(&next))? {
        return Err("Plugin enabled/disabled counterpart already exists".into());
    }
    fs::rename(directory.join(name), directory.join(&next)).map_err(io)?;
    transaction::sync_directory(&directory)?;
    Ok(next)
}

pub fn uninstall(
    app_data: &Path,
    registry: &ServerRegistry,
    request: MutationRequest,
) -> Result<(), String> {
    let profile = server(registry, &request.server_id)?;
    recover_profile(app_data, &profile)?;
    let (directory, _) = directory(app_data, &profile)?;
    let file = directory.join(basename(&request.file_name)?);
    if !regular_file(&file)? {
        return Err("Installed plugin does not exist".into());
    }
    fs::remove_file(file).map_err(io)?;
    transaction::sync_directory(&directory)
}

fn recover_profile(app_data: &Path, profile: &MinecraftServer) -> Result<(), String> {
    let root = app_data.join("servers").join(&profile.id);
    if !root.exists() {
        return Ok(());
    }
    let canonical = managed_server_root(app_data, profile)?;
    for kind in ["plugins", "mods"] {
        let path = canonical.join(kind);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if is_link(&metadata) || !metadata.is_dir() => {
                return Err("Unsafe transaction recovery root".into())
            }
            Ok(_) => transaction::recover_directory(&path)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(io(error)),
        }
    }
    Ok(())
}

#[cfg(test)]
pub fn recover(app_data: &Path, registry: &ServerRegistry) -> Result<(), String> {
    for profile in registry.get_servers()? {
        recover_profile(app_data, &profile)?;
    }
    Ok(())
}

#[derive(Debug)]
pub struct RecoveryFailure {
    pub server_id: Option<String>,
    pub error: String,
}

fn plugin_recovery_unavailable_reason(error: &str) -> String {
    format!(
        "{PLUGIN_RECOVERY_UNAVAILABLE_PREFIX}{error}. Keep this server's transaction journal and backups intact; repair the issue before starting or modifying the server."
    )
}

fn has_plugin_recovery_unavailable_reason(reason: &str) -> bool {
    reason.starts_with(PLUGIN_RECOVERY_UNAVAILABLE_PREFIX)
        || reason.contains(&format!(
            "{PLUGIN_RECOVERY_UNAVAILABLE_SEPARATOR}{PLUGIN_RECOVERY_UNAVAILABLE_PREFIX}"
        ))
}

fn remove_plugin_recovery_unavailable_reason(reason: &str) -> Option<String> {
    if reason.starts_with(PLUGIN_RECOVERY_UNAVAILABLE_PREFIX) {
        None
    } else if let Some(index) = reason.rfind(&format!(
        "{PLUGIN_RECOVERY_UNAVAILABLE_SEPARATOR}{PLUGIN_RECOVERY_UNAVAILABLE_PREFIX}"
    )) {
        let remaining = reason[..index].trim_end();
        (!remaining.is_empty()).then(|| remaining.to_owned())
    } else {
        Some(reason.to_owned())
    }
}

fn add_plugin_recovery_unavailable_reason(existing: Option<&str>, error: &str) -> String {
    let marker = plugin_recovery_unavailable_reason(error);
    match existing
        .filter(|reason| has_plugin_recovery_unavailable_reason(reason))
        .and_then(remove_plugin_recovery_unavailable_reason)
        .or_else(|| {
            existing
                .filter(|reason| !has_plugin_recovery_unavailable_reason(reason))
                .map(str::to_owned)
        }) {
        Some(existing) if !existing.trim().is_empty() => {
            format!("{existing}{PLUGIN_RECOVERY_UNAVAILABLE_SEPARATOR}{marker}")
        }
        _ => marker,
    }
}

fn save_recovery_profile(
    registry: &ServerRegistry,
    profile: &MinecraftServer,
) -> Result<(), String> {
    if registry.update_server(profile)? {
        Ok(())
    } else {
        Err("Server disappeared while updating plugin recovery status".into())
    }
}

/// Isolate damaged servers during startup. Per-server commands retry the same
/// strict recovery and surface the error before making further filesystem edits.
pub fn recover_startup(app_data: &Path, registry: &ServerRegistry) -> Vec<RecoveryFailure> {
    let profiles = match registry.get_servers() {
        Ok(profiles) => profiles,
        Err(error) => {
            let failure = RecoveryFailure {
                server_id: None,
                error: format!("Could not read server registry for plugin recovery: {error}"),
            };
            log::error!("{}", failure.error);
            return vec![failure];
        }
    };

    let mut failures = Vec::new();
    for mut profile in profiles {
        match recover_profile(app_data, &profile) {
            Err(error) => {
                let had_recovery_marker = profile
                    .unavailable_reason
                    .as_deref()
                    .is_some_and(has_plugin_recovery_unavailable_reason);
                profile.unavailable_reason = Some(add_plugin_recovery_unavailable_reason(
                    profile.unavailable_reason.as_deref(),
                    &error,
                ));
                if let Err(persist_error) = save_recovery_profile(registry, &profile) {
                    let failure = RecoveryFailure {
                        server_id: if had_recovery_marker {
                            Some(profile.id.clone())
                        } else {
                            None
                        },
                        error: format!(
                            "{error}; could not persist the server's unavailable state: {persist_error}"
                        ),
                    };
                    log::error!("{}", failure.error);
                    failures.push(failure);
                    if !had_recovery_marker {
                        // Without a persisted marker the server start command
                        // cannot fail closed, so abort application startup.
                        return failures;
                    }
                    continue;
                }
                failures.push(RecoveryFailure {
                    server_id: Some(profile.id),
                    error,
                });
            }
            Ok(()) => {
                let has_recovery_marker = profile
                    .unavailable_reason
                    .as_deref()
                    .is_some_and(has_plugin_recovery_unavailable_reason);
                if has_recovery_marker {
                    let mut profile = profile;
                    profile.unavailable_reason = profile
                        .unavailable_reason
                        .as_deref()
                        .and_then(remove_plugin_recovery_unavailable_reason);
                    if let Err(error) = save_recovery_profile(registry, &profile) {
                        // The old marker remains in the registry, so this
                        // server stays blocked until a later startup retries.
                        failures.push(RecoveryFailure {
                            server_id: Some(profile.id),
                            error: format!(
                                "Plugin recovery completed, but its unavailable marker could not be cleared: {error}"
                            ),
                        });
                    }
                }
            }
        }
    }

    for failure in &failures {
        log::error!(
            "Plugin transaction recovery deferred for server {:?}: {}",
            failure.server_id,
            failure.error
        );
    }
    failures
}
