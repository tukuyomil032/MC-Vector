use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use zip::ZipArchive;

use super::{manifest::AssetSourceState, resolver::source_version};

#[derive(Clone, Copy, Debug, Hash, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AssetLauncher {
    Manual,
    PrismLauncherStandard,
    PrismLauncherCustom,
    PrismLauncherPortable,
    OfficialLauncher,
    MultiMc,
    ModrinthApp,
    CurseForge,
    GdLauncher,
    AtLauncher,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetArtifact {
    pub(crate) path: PathBuf,
    pub(crate) identity: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetCandidate {
    pub(crate) launcher: AssetLauncher,
    pub(crate) launcher_root: PathBuf,
    pub(crate) instance_id: Option<String>,
    pub(crate) game_directory: Option<PathBuf>,
    pub(crate) client_jar: Option<AssetArtifact>,
    pub(crate) resource_packs: Vec<AssetArtifact>,
    pub(crate) minecraft_version: Option<String>,
    pub(crate) source_identity: Option<String>,
    pub(crate) resource_pack_hash: Option<String>,
    pub(crate) state: AssetSourceState,
    pub(crate) message: Option<String>,
}

impl AssetCandidate {
    pub(crate) fn is_usable(&self) -> bool {
        self.state == AssetSourceState::Valid
            && (self.client_jar.is_some() || !self.resource_packs.is_empty())
    }
}

#[derive(Clone, Debug)]
pub(crate) struct AssetDiscoveryOptions {
    pub(crate) home: PathBuf,
    pub(crate) prism_custom_roots: Vec<PathBuf>,
    pub(crate) prism_portable_roots: Vec<PathBuf>,
    pub(crate) official_launcher_roots: Vec<PathBuf>,
    pub(crate) multimc_roots: Vec<PathBuf>,
    pub(crate) modrinth_roots: Vec<PathBuf>,
    pub(crate) curseforge_roots: Vec<PathBuf>,
    pub(crate) gdlauncher_roots: Vec<PathBuf>,
    pub(crate) atlauncher_roots: Vec<PathBuf>,
    pub(crate) manual_paths: Vec<PathBuf>,
    pub(crate) expected_minecraft_version: Option<String>,
}

impl AssetDiscoveryOptions {
    pub(crate) fn for_home(home: impl Into<PathBuf>) -> Self {
        Self {
            home: home.into(),
            prism_custom_roots: Vec::new(),
            prism_portable_roots: Vec::new(),
            official_launcher_roots: Vec::new(),
            multimc_roots: Vec::new(),
            modrinth_roots: Vec::new(),
            curseforge_roots: Vec::new(),
            gdlauncher_roots: Vec::new(),
            atlauncher_roots: Vec::new(),
            manual_paths: Vec::new(),
            expected_minecraft_version: None,
        }
    }
}

pub(crate) fn discover_asset_candidates(options: &AssetDiscoveryOptions) -> Vec<AssetCandidate> {
    let mut candidates = Vec::new();

    for path in &options.manual_paths {
        discover_manual_path(path, options, &mut candidates);
    }

    for root in standard_prism_roots(&options.home) {
        discover_prism_root(
            &root,
            AssetLauncher::PrismLauncherStandard,
            options,
            &mut candidates,
        );
    }
    for root in &options.prism_custom_roots {
        discover_prism_root(
            root,
            AssetLauncher::PrismLauncherCustom,
            options,
            &mut candidates,
        );
    }
    for root in &options.prism_portable_roots {
        discover_prism_root(
            root,
            AssetLauncher::PrismLauncherPortable,
            options,
            &mut candidates,
        );
    }

    for root in standard_multimc_roots(&options.home) {
        discover_instance_root(
            &root,
            AssetLauncher::MultiMc,
            &["instances"],
            &[".minecraft", "minecraft"],
            options,
            &mut candidates,
        );
    }
    for root in &options.multimc_roots {
        discover_instance_root(
            root,
            AssetLauncher::MultiMc,
            &["instances"],
            &[".minecraft", "minecraft"],
            options,
            &mut candidates,
        );
    }
    for (roots, launcher, instance_directories) in [
        (
            standard_modrinth_roots(&options.home),
            AssetLauncher::ModrinthApp,
            vec!["profiles", "instances"],
        ),
        (
            standard_curseforge_roots(&options.home),
            AssetLauncher::CurseForge,
            vec!["minecraft/Instances", "Instances", "instances"],
        ),
        (
            standard_gdlauncher_roots(&options.home),
            AssetLauncher::GdLauncher,
            vec!["instances", "profiles"],
        ),
        (
            standard_atlauncher_roots(&options.home),
            AssetLauncher::AtLauncher,
            vec!["instances"],
        ),
    ] {
        for root in roots {
            discover_instance_root(
                &root,
                launcher,
                &instance_directories,
                &[".minecraft", "minecraft", "game"],
                options,
                &mut candidates,
            );
        }
    }
    for (roots, launcher, instance_directories) in [
        (
            &options.modrinth_roots,
            AssetLauncher::ModrinthApp,
            vec!["profiles", "instances"],
        ),
        (
            &options.curseforge_roots,
            AssetLauncher::CurseForge,
            vec!["minecraft/Instances", "Instances", "instances"],
        ),
        (
            &options.gdlauncher_roots,
            AssetLauncher::GdLauncher,
            vec!["instances", "profiles"],
        ),
        (
            &options.atlauncher_roots,
            AssetLauncher::AtLauncher,
            vec!["instances"],
        ),
    ] {
        for root in roots {
            discover_instance_root(
                root,
                launcher,
                &instance_directories,
                &[".minecraft", "minecraft", "game"],
                options,
                &mut candidates,
            );
        }
    }

    let mut official_roots = standard_official_roots(&options.home);
    official_roots.extend(options.official_launcher_roots.iter().cloned());
    for root in official_roots {
        discover_official_root(&root, options, &mut candidates);
    }

    deduplicate_candidates(candidates)
}

fn standard_prism_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Library/Application Support/PrismLauncher"),
        home.join(".local/share/PrismLauncher"),
        home.join("AppData/Roaming/PrismLauncher"),
    ]
}

fn standard_multimc_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Library/Application Support/MultiMC"),
        home.join(".local/share/MultiMC"),
        home.join("AppData/Roaming/MultiMC"),
        home.join("MultiMC"),
    ]
}

fn standard_modrinth_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Library/Application Support/ModrinthApp"),
        home.join(".local/share/ModrinthApp"),
        home.join("AppData/Roaming/ModrinthApp"),
    ]
}

fn standard_curseforge_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Library/Application Support/CurseForge"),
        home.join(".local/share/CurseForge"),
        home.join("AppData/Roaming/CurseForge"),
    ]
}

fn standard_gdlauncher_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Library/Application Support/gdlauncher_next"),
        home.join(".local/share/gdlauncher_next"),
        home.join("AppData/Roaming/gdlauncher_next"),
    ]
}

fn standard_atlauncher_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Library/Application Support/ATLauncher"),
        home.join(".local/share/ATLauncher"),
        home.join("AppData/Roaming/ATLauncher"),
    ]
}

fn standard_official_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join("Library/Application Support/minecraft"),
        home.join(".minecraft"),
        home.join("AppData/Roaming/.minecraft"),
    ]
}

fn discover_prism_root(
    root: &Path,
    launcher: AssetLauncher,
    options: &AssetDiscoveryOptions,
    candidates: &mut Vec<AssetCandidate>,
) {
    let Ok(root) = canonical_directory(root) else {
        return;
    };
    let instances = if root.file_name().and_then(|name| name.to_str()) == Some("instances") {
        root.clone()
    } else {
        root.join("instances")
    };
    let Ok(instances) = canonical_directory(&instances) else {
        return;
    };

    for instance in safe_directories(&instances) {
        let Some(instance_id) = instance
            .file_name()
            .and_then(|name| name.to_str())
            .map(ToOwned::to_owned)
        else {
            continue;
        };
        let game_directory = instance.join(".minecraft");
        let game_directory = if is_normal_directory(&game_directory) {
            match canonical_directory(&game_directory) {
                Ok(path) => path,
                Err(_) => continue,
            }
        } else {
            instance.clone()
        };
        let metadata_version = instance_metadata_version(&game_directory);
        let (jars, packs, pack_error) = discover_game_sources(&game_directory);

        if jars.is_empty() {
            candidates.push(build_candidate(
                launcher,
                root.clone(),
                Some(instance_id),
                Some(game_directory),
                None,
                packs,
                metadata_version,
                options,
                pack_error,
            ));
            continue;
        }

        for jar in jars {
            let version =
                source_version(&jar.display().to_string()).or_else(|| metadata_version.clone());
            candidates.push(build_candidate(
                launcher,
                root.clone(),
                Some(instance_id.clone()),
                Some(game_directory.clone()),
                Some((version, jar)),
                packs.clone(),
                metadata_version.clone(),
                options,
                pack_error.clone(),
            ));
        }
    }
}

fn discover_instance_root(
    root: &Path,
    launcher: AssetLauncher,
    instance_directories: &[&str],
    game_directories: &[&str],
    options: &AssetDiscoveryOptions,
    candidates: &mut Vec<AssetCandidate>,
) {
    let Ok(root) = canonical_directory(root) else {
        return;
    };
    let mut instance_roots = Vec::new();
    for relative in instance_directories {
        let instance_root = if Path::new(relative)
            .file_name()
            .and_then(|name| name.to_str())
            == root.file_name().and_then(|name| name.to_str())
        {
            root.clone()
        } else {
            root.join(relative)
        };
        let Ok(instance_root) = canonical_directory(&instance_root) else {
            continue;
        };
        if !instance_roots.contains(&instance_root) {
            instance_roots.push(instance_root);
        }
    }

    for instances in instance_roots {
        for instance in safe_directories(&instances) {
            let Some(instance_id) = instance
                .file_name()
                .and_then(|name| name.to_str())
                .map(ToOwned::to_owned)
            else {
                continue;
            };
            let game_directory = game_directories
                .iter()
                .map(|relative| instance.join(relative))
                .find(|path| is_normal_directory(path))
                .and_then(|path| canonical_directory(&path).ok())
                .unwrap_or_else(|| instance.clone());
            let metadata_version = instance_metadata_version(&game_directory);
            let (jars, packs, pack_error) = discover_game_sources(&game_directory);

            if jars.is_empty() {
                candidates.push(build_candidate(
                    launcher,
                    root.clone(),
                    Some(instance_id),
                    Some(game_directory),
                    None,
                    packs,
                    metadata_version,
                    options,
                    pack_error,
                ));
                continue;
            }

            for jar in jars {
                let version =
                    source_version(&jar.display().to_string()).or_else(|| metadata_version.clone());
                candidates.push(build_candidate(
                    launcher,
                    root.clone(),
                    Some(instance_id.clone()),
                    Some(game_directory.clone()),
                    Some((version, jar)),
                    packs.clone(),
                    metadata_version.clone(),
                    options,
                    pack_error.clone(),
                ));
            }
        }
    }
}

fn discover_official_root(
    root: &Path,
    options: &AssetDiscoveryOptions,
    candidates: &mut Vec<AssetCandidate>,
) {
    let Ok(root) = canonical_directory(root) else {
        return;
    };
    let is_versions_root = root.file_name().and_then(|name| name.to_str()) == Some("versions");
    let versions = if is_versions_root {
        root.clone()
    } else {
        root.join("versions")
    };
    let Ok(versions) = canonical_directory(&versions) else {
        return;
    };
    let game_directory = if is_versions_root {
        root.parent().unwrap_or(&root).to_path_buf()
    } else {
        root.clone()
    };
    let game_directory = canonical_directory(&game_directory).unwrap_or(game_directory);
    let (_, packs, pack_error) = discover_game_sources(&game_directory);

    for version_directory in safe_directories(&versions) {
        let Some(version) = version_directory
            .file_name()
            .and_then(|name| name.to_str())
            .map(ToOwned::to_owned)
        else {
            continue;
        };
        let jar = version_directory.join(format!("{version}.jar"));
        if !is_normal_file(&jar) {
            continue;
        }
        let Ok(jar) = canonical_file(&jar) else {
            continue;
        };
        candidates.push(build_candidate(
            AssetLauncher::OfficialLauncher,
            root.clone(),
            None,
            Some(game_directory.clone()),
            Some((
                Some(source_version(&jar.display().to_string()).unwrap_or(version)),
                jar,
            )),
            packs.clone(),
            None,
            options,
            pack_error.clone(),
        ));
    }
}

fn discover_manual_path(
    path: &Path,
    options: &AssetDiscoveryOptions,
    candidates: &mut Vec<AssetCandidate>,
) {
    let canonical = match validate_manual_path(path) {
        Ok(path) => path,
        Err(error) => {
            candidates.push(invalid_candidate(
                AssetLauncher::Manual,
                path.to_path_buf(),
                error,
            ));
            return;
        }
    };

    if canonical.is_dir() {
        if has_assets_directory(&canonical) {
            match make_artifact(&canonical) {
                Ok(pack) => candidates.push(build_candidate(
                    AssetLauncher::Manual,
                    canonical.clone(),
                    None,
                    None,
                    None,
                    vec![pack],
                    None,
                    options,
                    None,
                )),
                Err(error) => {
                    candidates.push(invalid_candidate(AssetLauncher::Manual, canonical, error))
                }
            }
            return;
        }

        let (jars, packs, pack_error) = discover_game_sources(&canonical);
        if jars.is_empty() {
            candidates.push(build_candidate(
                AssetLauncher::Manual,
                canonical.clone(),
                None,
                Some(canonical),
                None,
                packs,
                None,
                options,
                pack_error,
            ));
            return;
        }
        for jar in jars {
            candidates.push(build_candidate(
                AssetLauncher::Manual,
                canonical.clone(),
                None,
                Some(canonical.clone()),
                Some((source_version(&jar.display().to_string()), jar)),
                packs.clone(),
                None,
                options,
                pack_error.clone(),
            ));
        }
        return;
    }

    let extension = canonical
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension != "jar" && extension != "zip" {
        candidates.push(invalid_candidate(
            AssetLauncher::Manual,
            canonical,
            "Manual asset path must be a JAR, ZIP, game directory, or resource pack directory",
        ));
        return;
    }

    match make_artifact(&canonical) {
        Ok(_artifact) if extension == "jar" => candidates.push(build_candidate(
            AssetLauncher::Manual,
            canonical.clone(),
            None,
            None,
            Some((source_version(&canonical.display().to_string()), canonical)),
            Vec::new(),
            None,
            options,
            None,
        )),
        Ok(artifact) => candidates.push(build_candidate(
            AssetLauncher::Manual,
            canonical,
            None,
            None,
            None,
            vec![artifact],
            None,
            options,
            None,
        )),
        Err(error) => candidates.push(invalid_candidate(AssetLauncher::Manual, canonical, error)),
    }
}

fn discover_game_sources(
    game_directory: &Path,
) -> (Vec<PathBuf>, Vec<AssetArtifact>, Option<String>) {
    let jars = find_client_jars(game_directory);
    let (packs, pack_error) = find_resource_packs(game_directory);
    (jars, packs, pack_error)
}

fn find_client_jars(game_directory: &Path) -> Vec<PathBuf> {
    let versions = game_directory.join("versions");
    let Ok(versions) = canonical_directory(&versions) else {
        return Vec::new();
    };
    let mut jars = Vec::new();
    for version_directory in safe_directories(&versions) {
        let Some(version) = version_directory.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let jar = version_directory.join(format!("{version}.jar"));
        if is_normal_file(&jar) {
            if let Ok(jar) = canonical_file(&jar) {
                jars.push(jar);
            }
        }
    }
    jars.sort();
    jars
}

fn find_resource_packs(game_directory: &Path) -> (Vec<AssetArtifact>, Option<String>) {
    let root = game_directory.join("resourcepacks");
    if !root.exists() {
        return (Vec::new(), None);
    }
    let root = match canonical_directory(&root) {
        Ok(root) => root,
        Err(error) => return (Vec::new(), Some(error)),
    };
    let mut paths = safe_children(&root);
    paths.sort();
    let mut packs = Vec::new();
    for path in paths {
        let is_pack_file = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"));
        if !path.is_dir() && !is_pack_file {
            continue;
        }
        match make_artifact(&path) {
            Ok(pack) => packs.push(pack),
            Err(error) => return (packs, Some(error)),
        }
    }
    (packs, None)
}

fn build_candidate(
    launcher: AssetLauncher,
    launcher_root: PathBuf,
    instance_id: Option<String>,
    game_directory: Option<PathBuf>,
    jar: Option<(Option<String>, PathBuf)>,
    resource_packs: Vec<AssetArtifact>,
    metadata_version: Option<String>,
    options: &AssetDiscoveryOptions,
    error: Option<String>,
) -> AssetCandidate {
    let (minecraft_version, client_jar) = match jar {
        Some((version, path)) => match make_artifact(&path) {
            Ok(artifact) => (version.or(metadata_version), Some(artifact)),
            Err(error) => {
                return invalid_candidate(launcher, launcher_root, error);
            }
        },
        None => (metadata_version, None),
    };
    let resource_pack_hash = (!resource_packs.is_empty()).then(|| hash_pack_stack(&resource_packs));
    let source_identity = client_jar
        .as_ref()
        .map(|artifact| artifact.identity.clone())
        .or_else(|| resource_pack_hash.clone());
    let usable = client_jar.is_some() || !resource_packs.is_empty();
    let state = if !usable || error.is_some() {
        AssetSourceState::Invalid
    } else if let (Some(expected), Some(actual)) = (
        options.expected_minecraft_version.as_deref(),
        minecraft_version.as_deref(),
    ) {
        if expected != actual {
            AssetSourceState::VersionMismatch
        } else {
            AssetSourceState::Valid
        }
    } else {
        AssetSourceState::Valid
    };
    let message = error.or_else(|| {
        (state == AssetSourceState::VersionMismatch).then(|| {
            format!(
                "Minecraft asset version mismatch: expected {}, found {}",
                options
                    .expected_minecraft_version
                    .as_deref()
                    .unwrap_or("unknown"),
                minecraft_version.as_deref().unwrap_or("unknown")
            )
        })
    });

    AssetCandidate {
        launcher,
        launcher_root,
        instance_id,
        game_directory,
        client_jar,
        resource_packs,
        minecraft_version,
        source_identity,
        resource_pack_hash,
        state,
        message,
    }
}

fn invalid_candidate(
    launcher: AssetLauncher,
    path: PathBuf,
    message: impl Into<String>,
) -> AssetCandidate {
    AssetCandidate {
        launcher,
        launcher_root: path,
        instance_id: None,
        game_directory: None,
        client_jar: None,
        resource_packs: Vec::new(),
        minecraft_version: None,
        source_identity: None,
        resource_pack_hash: None,
        state: AssetSourceState::Invalid,
        message: Some(message.into()),
    }
}

fn deduplicate_candidates(candidates: Vec<AssetCandidate>) -> Vec<AssetCandidate> {
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|candidate| {
            let key = candidate
                .client_jar
                .as_ref()
                .map(|artifact| artifact.path.clone())
                .or_else(|| {
                    candidate
                        .resource_packs
                        .first()
                        .map(|artifact| artifact.path.clone())
                })
                .or_else(|| candidate.game_directory.clone());
            match key {
                Some(key) => seen.insert(key),
                None => true,
            }
        })
        .collect()
}

fn instance_metadata_version(game_directory: &Path) -> Option<String> {
    let value: Value =
        serde_json::from_slice(&fs::read(game_directory.join("mmc-pack.json")).ok()?).ok()?;
    value
        .get("components")?
        .as_array()?
        .iter()
        .find(|component| component.get("uid").and_then(Value::as_str) == Some("net.minecraft"))
        .and_then(|component| component.get("version"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn make_artifact(path: &Path) -> Result<AssetArtifact, String> {
    let canonical = if path.is_dir() {
        canonical_directory(path)?
    } else {
        canonical_file(path)?
    };
    let identity = if canonical.is_dir() {
        hash_directory(&canonical)?
    } else {
        validate_archive(&canonical)?;
        hash_file(&canonical)?
    };
    Ok(AssetArtifact {
        path: canonical,
        identity,
    })
}

fn validate_archive(path: &Path) -> Result<(), String> {
    let file = fs::File::open(path)
        .map_err(|error| format!("Failed to open asset archive {}: {error}", path.display()))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("Invalid asset archive {}: {error}", path.display()))?;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read asset archive entry: {error}"))?;
        if unsafe_archive_path(entry.name()) {
            return Err(format!(
                "Asset archive contains an unsafe path: {}",
                entry.name()
            ));
        }
    }
    Ok(())
}

fn unsafe_archive_path(name: &str) -> bool {
    let normalized = name.replace('\\', "/");
    normalized.starts_with('/')
        || normalized.split('/').any(|component| component == "..")
        || Path::new(&normalized)
            .components()
            .any(|component| matches!(component, Component::ParentDir))
}

fn validate_manual_path(path: &Path) -> Result<PathBuf, String> {
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Manual asset path must not contain parent traversal".to_string());
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Manual asset path is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("Manual asset path must not be a symbolic link".to_string());
    }
    if !metadata.is_dir() && !metadata.is_file() {
        return Err("Manual asset path must be a file or directory".to_string());
    }
    fs::canonicalize(path).map_err(|error| format!("Failed to resolve manual asset path: {error}"))
}

fn canonical_directory(path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Asset directory is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "Asset directory must be a non-symlink directory: {}",
            path.display()
        ));
    }
    fs::canonicalize(path).map_err(|error| format!("Failed to resolve asset directory: {error}"))
}

fn canonical_file(path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Asset file is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "Asset file must be a non-symlink file: {}",
            path.display()
        ));
    }
    fs::canonicalize(path).map_err(|error| format!("Failed to resolve asset file: {error}"))
}

fn is_normal_directory(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn is_normal_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn safe_directories(path: &Path) -> Vec<PathBuf> {
    safe_children(path)
        .into_iter()
        .filter(|path| is_normal_directory(path))
        .collect()
}

fn safe_children(path: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            fs::symlink_metadata(path)
                .map(|metadata| !metadata.file_type().is_symlink())
                .unwrap_or(false)
        })
        .collect()
}

fn has_assets_directory(path: &Path) -> bool {
    is_normal_directory(&path.join("assets"))
}

fn hash_pack_stack(packs: &[AssetArtifact]) -> String {
    let mut hasher = Sha256::new();
    for pack in packs {
        hasher.update(pack.identity.as_bytes());
        hasher.update([0]);
    }
    format!("sha256:{:x}", hasher.finalize())
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|error| format!("Failed to read asset file: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Failed to hash asset file: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

fn hash_directory(path: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    collect_directory_files(path, &mut files)?;
    files.sort_by(|left, right| relative_path(path, left).cmp(&relative_path(path, right)));
    let mut hasher = Sha256::new();
    for file in files {
        let relative = relative_path(path, &file);
        hasher.update(relative.as_bytes());
        hasher.update([0]);
        hasher.update(
            fs::read(&file).map_err(|error| format!("Failed to hash asset file: {error}"))?,
        );
        hasher.update([0]);
    }
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

fn collect_directory_files(path: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(path)
        .map_err(|error| format!("Failed to scan asset directory {}: {error}", path.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to scan asset directory: {error}"))?;
        let child = entry.path();
        let metadata = fs::symlink_metadata(&child)
            .map_err(|error| format!("Failed to inspect asset path: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Asset directory contains a symbolic link: {}",
                child.display()
            ));
        }
        if metadata.is_dir() {
            collect_directory_files(&child, files)?;
        } else if metadata.is_file() {
            files.push(child);
        }
    }
    Ok(())
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::Write,
        time::{SystemTime, UNIX_EPOCH},
    };

    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::*;

    struct TempFixture {
        root: PathBuf,
    }

    impl TempFixture {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "mc-vector-asset-discovery-{label}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&root).expect("fixture root should be created");
            Self { root }
        }

        fn path(&self, relative: impl AsRef<Path>) -> PathBuf {
            self.root.join(relative)
        }
    }

    impl Drop for TempFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn archive(path: &Path, entries: &[(&str, &[u8])]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("archive parent should be created");
        }
        let file = fs::File::create(path).expect("archive should be created");
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        for (name, bytes) in entries {
            writer
                .start_file(*name, options)
                .expect("archive entry should start");
            writer.write_all(bytes).expect("archive entry should write");
        }
        writer.finish().expect("archive should finish");
    }

    fn jar(path: &Path) {
        archive(path, &[("assets/minecraft/marker.txt", b"jar")]);
    }

    fn pack(path: &Path) {
        archive(path, &[("assets/minecraft/pack.mcmeta", b"pack")]);
    }

    fn prism_instance(root: &Path, id: &str, version: &str) -> PathBuf {
        let game = root.join("instances").join(id).join(".minecraft");
        let jar_path = game
            .join("versions")
            .join(version)
            .join(format!("{version}.jar"));
        jar(&jar_path);
        game
    }

    fn launcher_instance(
        root: &Path,
        relative_instances: &str,
        id: &str,
        game_directory: &str,
        version: &str,
    ) -> PathBuf {
        let game = root.join(relative_instances).join(id).join(game_directory);
        let jar_path = game
            .join("versions")
            .join(version)
            .join(format!("{version}.jar"));
        jar(&jar_path);
        game
    }

    #[test]
    fn discovers_prism_variants_and_official_versions_with_stable_identity() {
        let fixture = TempFixture::new("launchers");
        let standard_root = fixture.path("Library/Application Support/PrismLauncher");
        let custom_root = fixture.path("custom-prism");
        let portable_root = fixture.path("portable-prism");
        let official_root = fixture.path("official/.minecraft");
        prism_instance(&standard_root, "standard", "1.20.1");
        prism_instance(&custom_root, "custom", "1.19.4");
        prism_instance(&portable_root, "portable", "1.18.2");
        let official_jar = official_root.join("versions/1.21.1/1.21.1.jar");
        jar(&official_jar);
        pack(&official_root.join("resourcepacks/example.zip"));

        let mut options = AssetDiscoveryOptions::for_home(fixture.root.clone());
        options.prism_custom_roots.push(custom_root);
        options.prism_portable_roots.push(portable_root);
        options.official_launcher_roots.push(official_root);
        let candidates = discover_asset_candidates(&options);

        assert_eq!(candidates.len(), 4);
        assert_eq!(
            candidates
                .iter()
                .map(|candidate| candidate.launcher)
                .collect::<Vec<_>>(),
            vec![
                AssetLauncher::PrismLauncherStandard,
                AssetLauncher::PrismLauncherCustom,
                AssetLauncher::PrismLauncherPortable,
                AssetLauncher::OfficialLauncher,
            ]
        );
        assert!(candidates.iter().all(AssetCandidate::is_usable));
        assert!(candidates
            .iter()
            .all(|candidate| candidate.source_identity.is_some()));
        let official = candidates
            .iter()
            .find(|candidate| candidate.launcher == AssetLauncher::OfficialLauncher)
            .expect("official candidate should be discovered");
        assert_eq!(official.resource_packs.len(), 1);
        assert!(official.resource_pack_hash.is_some());
        assert!(official
            .client_jar
            .as_ref()
            .unwrap()
            .identity
            .starts_with("sha256:"));
    }

    #[test]
    fn discovers_supported_non_prism_launcher_instance_layouts() {
        let fixture = TempFixture::new("launcher-family");
        let multimc_root = fixture.path("MultiMC");
        let modrinth_root = fixture.path("ModrinthApp");
        let curseforge_root = fixture.path("CurseForge");
        let gdlauncher_root = fixture.path("gdlauncher_next");
        let atlauncher_root = fixture.path("ATLauncher");
        launcher_instance(&multimc_root, "instances", "multi", ".minecraft", "1.20.1");
        launcher_instance(
            &modrinth_root,
            "profiles",
            "modrinth",
            "minecraft",
            "1.20.2",
        );
        launcher_instance(
            &curseforge_root,
            "minecraft/Instances",
            "curse",
            ".minecraft",
            "1.20.3",
        );
        launcher_instance(&gdlauncher_root, "instances", "gd", "game", "1.20.4");
        launcher_instance(&atlauncher_root, "instances", "at", ".minecraft", "1.20.5");

        let mut options = AssetDiscoveryOptions::for_home(fixture.root.clone());
        options.multimc_roots.push(multimc_root);
        options.modrinth_roots.push(modrinth_root);
        options.curseforge_roots.push(curseforge_root);
        options.gdlauncher_roots.push(gdlauncher_root);
        options.atlauncher_roots.push(atlauncher_root);
        let candidates = discover_asset_candidates(&options);
        let launchers = candidates
            .iter()
            .map(|candidate| candidate.launcher)
            .collect::<HashSet<_>>();

        assert!(launchers.contains(&AssetLauncher::MultiMc));
        assert!(launchers.contains(&AssetLauncher::ModrinthApp));
        assert!(launchers.contains(&AssetLauncher::CurseForge));
        assert!(launchers.contains(&AssetLauncher::GdLauncher));
        assert!(launchers.contains(&AssetLauncher::AtLauncher));
        assert!(candidates.iter().all(AssetCandidate::is_usable));

        options.expected_minecraft_version = Some("1.21.10".to_string());
        let mismatched = discover_asset_candidates(&options);
        assert!(mismatched
            .iter()
            .filter(|candidate| candidate.launcher != AssetLauncher::OfficialLauncher)
            .all(|candidate| candidate.state == AssetSourceState::VersionMismatch));
    }

    #[test]
    fn manual_paths_report_version_mismatch_invalid_archive_and_traversal() {
        let fixture = TempFixture::new("manual");
        let valid_jar = fixture.path("minecraft-1.20.1.jar");
        let invalid_jar = fixture.path("broken.jar");
        let traversal_jar = fixture.path("traversal.jar");
        jar(&valid_jar);
        fs::write(&invalid_jar, b"not a zip").expect("invalid fixture should write");
        archive(&traversal_jar, &[("../outside.txt", b"unsafe")]);

        let mut options = AssetDiscoveryOptions::for_home(fixture.root.clone());
        options.expected_minecraft_version = Some("1.21.1".to_string());
        options.manual_paths = vec![
            valid_jar,
            invalid_jar,
            traversal_jar,
            fixture.path("../minecraft-1.20.1.jar"),
        ];
        let candidates = discover_asset_candidates(&options);

        assert_eq!(candidates.len(), 4);
        assert!(candidates.iter().any(|candidate| {
            candidate.state == AssetSourceState::VersionMismatch
                && candidate
                    .message
                    .as_deref()
                    .is_some_and(|message| message.contains("version mismatch"))
        }));
        assert_eq!(
            candidates
                .iter()
                .filter(|candidate| candidate.state == AssetSourceState::Invalid)
                .count(),
            3
        );
        assert!(candidates.iter().any(|candidate| {
            candidate
                .message
                .as_deref()
                .is_some_and(|message| message.contains("unsafe path"))
        }));
        assert!(candidates.iter().any(|candidate| {
            candidate
                .message
                .as_deref()
                .is_some_and(|message| message.contains("parent traversal"))
        }));
    }

    #[cfg(unix)]
    #[test]
    fn manual_symlink_is_rejected_before_canonicalization() {
        use std::os::unix::fs::symlink;

        let fixture = TempFixture::new("symlink");
        let target = fixture.path("target.jar");
        let link = fixture.path("link.jar");
        jar(&target);
        symlink(&target, &link).expect("symlink fixture should be created");

        let mut options = AssetDiscoveryOptions::for_home(fixture.root.clone());
        options.manual_paths.push(link);
        let candidates = discover_asset_candidates(&options);

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].state, AssetSourceState::Invalid);
        assert!(candidates[0]
            .message
            .as_deref()
            .is_some_and(|message| message.contains("symbolic link")));
    }
}
