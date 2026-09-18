use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zip::ZipArchive;

use crate::map::assets::{
    discover_asset_candidates, is_air, manifest_quality, material_kind, source_version,
    AssetCandidate, AssetDiscoveryOptions, AssetLauncher, AssetManifest, AssetResolver,
    MaterialKind, RenderFace, ASSET_MANIFEST_VERSION,
};

const ASSET_CONFIG_NAME: &str = "map-assets.json";
const VANILLA_VERSION_PREFIX: &str = "1.21";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetConfig {
    /// Backward-compatible single-source form used by older installations.
    pub source_path: Option<String>,
    /// Ordered from lowest to highest priority, matching Minecraft's pack
    /// stack semantics. The first entry is normally a client JAR.
    #[serde(default)]
    pub source_paths: Vec<String>,
}

pub(crate) struct MapAssets {
    resolver: AssetResolver,
    pub(crate) identity: String,
    pub(crate) manifest: AssetManifest,
}

impl MapAssets {
    pub(crate) fn sample_state_face_at_with_biome(
        &self,
        state: &str,
        biome: &str,
        face: &str,
        u: f32,
        v: f32,
    ) -> [u8; 4] {
        let (encoded, block_id) = encode_state(state);
        self.resolver
            .sample_face_at(&encoded, face, u, v)
            .map(|color| {
                crate::map::assets::apply_tint(color, self.resolver.biome_tint(&encoded, biome))
            })
            .unwrap_or_else(|| fallback_block_colour(&block_id))
    }

    pub(crate) fn model_faces(&self, state: &str) -> Option<Vec<RenderFace>> {
        let (encoded, _) = encode_state(state);
        self.resolver.appearance(&encoded)
    }

    pub(crate) fn sample_model_face(
        &self,
        state: &str,
        biome: &str,
        face: &RenderFace,
        u: f32,
        v: f32,
    ) -> [u8; 4] {
        let (_, block_id) = encode_state(state);
        self.resolver
            .sample_resolved_face(face, u, v)
            .map(|color| {
                if face.tint_index.is_some() {
                    crate::map::assets::apply_tint(
                        color,
                        self.resolver.biome_tint(&block_id, biome),
                    )
                } else {
                    color
                }
            })
            .unwrap_or_else(|| fallback_block_colour(&block_id))
    }
}

fn encode_state(state: &str) -> (String, String) {
    let (block_id, properties) = if let Some((block_id, properties)) = state.split_once('|') {
        (block_id, properties)
    } else {
        let (block_id, properties) = state.split_once('[').unwrap_or((state, ""));
        (block_id, properties.strip_suffix(']').unwrap_or(properties))
    };
    let mut properties = properties
        .split(',')
        .filter(|property| !property.is_empty())
        .filter_map(|property| property.split_once('='))
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>();
    properties.sort();
    (
        format!("{block_id}|{}", properties.join(",")),
        block_id.to_string(),
    )
}

pub(crate) fn load_for_server(server_root: &Path) -> Result<Option<MapAssets>, String> {
    let sources = configured_sources(server_root)?.or_else(detect_vanilla_sources);
    let Some(sources) = sources else {
        return Ok(None);
    };
    load_from_sources(&sources).map(Some)
}

pub(crate) fn read_config(server_root: &Path) -> Result<AssetConfig, String> {
    let path = server_root.join(ASSET_CONFIG_NAME);
    match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| format!("Invalid map asset configuration: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AssetConfig::default()),
        Err(error) => Err(format!("Failed to read map asset configuration: {error}")),
    }
}

pub(crate) fn write_config(server_root: &Path, config: &AssetConfig) -> Result<(), String> {
    for source in config_sources(config) {
        validate_asset_source(&source)?;
    }
    let path = server_root.join(ASSET_CONFIG_NAME);
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("Failed to serialize map asset configuration: {error}"))?;
    fs::write(path, bytes)
        .map_err(|error| format!("Failed to write map asset configuration: {error}"))
}

pub(crate) fn source_status(server_root: &Path) -> Result<AssetStatus, String> {
    let configured = match configured_sources(server_root) {
        Ok(configured) => configured,
        Err(error) => {
            return Ok(AssetStatus::invalid(error));
        }
    };
    let sources = configured.clone().or_else(detect_vanilla_sources);
    let Some(sources) = sources else {
        return Ok(AssetStatus {
            state: "missing".to_string(),
            source_path: None,
            source_paths: Vec::new(),
            identity: None,
            blockstate_count: 0,
            model_count: 0,
            texture_count: 0,
            animated_texture_count: 0,
            minecraft_version: None,
            quality: "missing".to_string(),
            unresolved_blockstate_count: 0,
            message: Some("No Minecraft client JAR or resource pack was found".to_string()),
        });
    };

    match source_details(&sources) {
        Ok(details) => Ok(AssetStatus {
            state: if configured.is_some() {
                "user_selected".to_string()
            } else {
                "auto_detected".to_string()
            },
            source_path: sources.first().map(|source| source.display().to_string()),
            source_paths: sources
                .iter()
                .map(|source| source.display().to_string())
                .collect(),
            identity: Some(details.identity),
            blockstate_count: details.blockstate_count,
            model_count: details.model_count,
            texture_count: details.texture_count,
            animated_texture_count: details.animated_texture_count,
            minecraft_version: details.minecraft_version,
            quality: details.quality,
            unresolved_blockstate_count: details.unresolved_blockstate_count,
            message: None,
        }),
        Err(error) => Ok(AssetStatus {
            state: "invalid".to_string(),
            source_path: sources.first().map(|source| source.display().to_string()),
            source_paths: sources
                .iter()
                .map(|source| source.display().to_string())
                .collect(),
            identity: None,
            blockstate_count: 0,
            model_count: 0,
            texture_count: 0,
            animated_texture_count: 0,
            minecraft_version: sources
                .first()
                .and_then(|source| source_version(&source.display().to_string())),
            quality: "invalid".to_string(),
            unresolved_blockstate_count: 0,
            message: Some(error),
        }),
    }
}

pub(crate) fn asset_candidates(server_root: &Path) -> Result<Vec<AssetCandidate>, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to discover Minecraft assets because HOME is unset".to_string())?;
    let mut options = AssetDiscoveryOptions::for_home(home);
    if let Some(config_dir) = std::env::var_os("XDG_CONFIG_HOME") {
        options
            .official_launcher_roots
            .push(PathBuf::from(config_dir).join("minecraft"));
    }
    if let Some(configured) = configured_sources(server_root)? {
        options.manual_paths.extend(configured);
    }

    let mut candidates = discover_asset_candidates(&options);
    candidates.sort_by(|left, right| {
        launcher_priority(left.launcher)
            .cmp(&launcher_priority(right.launcher))
            .then_with(|| {
                version_key(&right.minecraft_version).cmp(&version_key(&left.minecraft_version))
            })
            .then_with(|| candidate_path(left).cmp(&candidate_path(right)))
    });
    Ok(candidates)
}

struct SourceDetails {
    identity: String,
    blockstate_count: usize,
    model_count: usize,
    texture_count: usize,
    animated_texture_count: usize,
    minecraft_version: Option<String>,
    quality: String,
    unresolved_blockstate_count: usize,
}

fn source_details(sources: &[PathBuf]) -> Result<SourceDetails, String> {
    let stack = load_asset_stack(sources)?;
    let (blockstate_count, model_count, texture_count) = (
        stack.blockstate_count,
        stack.model_count,
        stack.texture_count,
    );
    if blockstate_count == 0 || model_count == 0 || texture_count == 0 {
        return Err(
            "Map asset source does not contain Minecraft blockstates, models, and textures"
                .to_string(),
        );
    }
    let resolver = AssetResolver::from_entry_layers(stack.layers.clone())?;
    let unresolved_blockstate_count = blockstate_count.saturating_sub(resolver.blockstate_count());
    let quality = manifest_quality(&AssetManifest {
        manifest_version: ASSET_MANIFEST_VERSION,
        minecraft_version: sources
            .first()
            .and_then(|source| source_version(&source.display().to_string())),
        source_path: source_paths_string(sources),
        source_identity: stack.identity.clone(),
        resource_pack_hash: stack.identity.clone(),
        blockstate_count,
        model_count,
        texture_count,
        animated_texture_count: stack.animated_texture_count,
        unresolved_blockstate_count,
        quality: AssetManifest::quality_for(unresolved_blockstate_count, stack.blockstate_count),
    })
    .to_string();
    Ok(SourceDetails {
        identity: stack.identity,
        blockstate_count,
        model_count,
        texture_count,
        animated_texture_count: stack.animated_texture_count,
        minecraft_version: sources
            .first()
            .and_then(|source| source_version(&source.display().to_string())),
        quality,
        unresolved_blockstate_count,
    })
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetStatus {
    pub state: String,
    pub source_path: Option<String>,
    pub source_paths: Vec<String>,
    pub identity: Option<String>,
    pub blockstate_count: usize,
    pub model_count: usize,
    pub texture_count: usize,
    pub animated_texture_count: usize,
    pub minecraft_version: Option<String>,
    pub quality: String,
    pub unresolved_blockstate_count: usize,
    pub message: Option<String>,
}

impl AssetStatus {
    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self {
            state: "invalid".to_string(),
            source_path: None,
            source_paths: Vec::new(),
            identity: None,
            blockstate_count: 0,
            model_count: 0,
            texture_count: 0,
            animated_texture_count: 0,
            minecraft_version: None,
            quality: "invalid".to_string(),
            unresolved_blockstate_count: 0,
            message: Some(message.into()),
        }
    }
}

fn config_sources(config: &AssetConfig) -> Vec<PathBuf> {
    if !config.source_paths.is_empty() {
        return config.source_paths.iter().map(PathBuf::from).collect();
    }
    config
        .source_path
        .as_deref()
        .map(PathBuf::from)
        .into_iter()
        .collect()
}

fn configured_sources(server_root: &Path) -> Result<Option<Vec<PathBuf>>, String> {
    let config = read_config(server_root)?;
    let sources = config_sources(&config);
    Ok((!sources.is_empty()).then_some(sources))
}

fn detect_vanilla_sources() -> Option<Vec<PathBuf>> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let mut options = AssetDiscoveryOptions::for_home(home);
    if let Some(config_dir) = std::env::var_os("XDG_CONFIG_HOME") {
        options
            .official_launcher_roots
            .push(PathBuf::from(config_dir).join("minecraft"));
    }

    let mut candidates = discover_asset_candidates(&options)
        .into_iter()
        .filter(|candidate| candidate.is_usable())
        .filter(|candidate| {
            candidate
                .minecraft_version
                .as_deref()
                .is_none_or(|version| version.starts_with(VANILLA_VERSION_PREFIX))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        launcher_priority(left.launcher)
            .cmp(&launcher_priority(right.launcher))
            .then_with(|| {
                version_key(&right.minecraft_version).cmp(&version_key(&left.minecraft_version))
            })
            .then_with(|| candidate_path(left).cmp(&candidate_path(right)))
    });

    candidates.into_iter().map(candidate_source_paths).next()
}

fn candidate_source_paths(candidate: AssetCandidate) -> Vec<PathBuf> {
    candidate
        .client_jar
        .into_iter()
        .map(|artifact| artifact.path)
        .chain(
            candidate
                .resource_packs
                .into_iter()
                .map(|artifact| artifact.path),
        )
        .collect()
}

fn launcher_priority(launcher: AssetLauncher) -> u8 {
    match launcher {
        AssetLauncher::PrismLauncherStandard
        | AssetLauncher::PrismLauncherCustom
        | AssetLauncher::PrismLauncherPortable => 0,
        AssetLauncher::OfficialLauncher => 1,
        AssetLauncher::MultiMc => 2,
        AssetLauncher::ModrinthApp => 3,
        AssetLauncher::CurseForge => 4,
        AssetLauncher::GdLauncher => 5,
        AssetLauncher::AtLauncher => 6,
        AssetLauncher::Manual => 7,
    }
}

fn version_key(candidate: &Option<String>) -> [u32; 4] {
    let Some(version) = candidate.as_deref() else {
        return [0; 4];
    };
    let mut key = [0; 4];
    for (index, part) in version
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .take(4)
        .enumerate()
    {
        key[index] = part.parse().unwrap_or_default();
    }
    key
}

fn candidate_path(candidate: &AssetCandidate) -> String {
    candidate
        .client_jar
        .as_ref()
        .map(|artifact| artifact.path.display().to_string())
        .or_else(|| {
            candidate
                .resource_packs
                .first()
                .map(|artifact| artifact.path.display().to_string())
        })
        .unwrap_or_else(|| candidate.launcher_root.display().to_string())
}

fn validate_asset_source(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Map asset source is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("Map asset source must not be a symbolic link".to_string());
    }
    if !metadata.is_dir() && !metadata.is_file() {
        return Err("Map asset source must be a directory, JAR, or ZIP file".to_string());
    }
    Ok(())
}

fn load_from_sources(sources: &[PathBuf]) -> Result<MapAssets, String> {
    let stack = load_asset_stack(sources)?;
    let resolver = AssetResolver::from_entry_layers(stack.layers.clone())?;
    let unresolved_blockstate_count = stack
        .blockstate_count
        .saturating_sub(resolver.blockstate_count());
    let source_path = source_paths_string(sources);
    let manifest = AssetManifest {
        manifest_version: ASSET_MANIFEST_VERSION,
        minecraft_version: sources
            .first()
            .and_then(|source| source_version(&source.display().to_string())),
        source_path,
        source_identity: stack.identity.clone(),
        resource_pack_hash: stack.identity.clone(),
        blockstate_count: stack.blockstate_count,
        model_count: stack.model_count,
        texture_count: stack.texture_count,
        animated_texture_count: stack.animated_texture_count,
        unresolved_blockstate_count,
        quality: AssetManifest::quality_for(unresolved_blockstate_count, stack.blockstate_count),
    };

    Ok(MapAssets {
        resolver,
        identity: stack.identity,
        manifest,
    })
}

struct LoadedAssetStack {
    layers: Vec<HashMap<String, Vec<u8>>>,
    identity: String,
    blockstate_count: usize,
    model_count: usize,
    texture_count: usize,
    animated_texture_count: usize,
}

fn source_paths_string(sources: &[PathBuf]) -> String {
    sources
        .iter()
        .map(|source| source.display().to_string())
        .collect::<Vec<_>>()
        .join("\n")
}

fn load_asset_stack(sources: &[PathBuf]) -> Result<LoadedAssetStack, String> {
    if sources.is_empty() {
        return Err("Map asset source stack is empty".to_string());
    }
    let mut layers = Vec::with_capacity(sources.len());
    let mut identities = Vec::with_capacity(sources.len());
    for source in sources {
        validate_asset_source(source)?;
        identities.push(asset_identity(source)?);
        layers.push(if source.is_dir() {
            load_directory_entries(source)?
        } else {
            load_archive_entries(source)?
        });
    }

    let mut merged = HashMap::new();
    for layer in &layers {
        crate::map::assets::resource_pack::overlay_entries(&mut merged, layer.clone());
    }
    let (blockstate_count, model_count, texture_count) = count_asset_entries(&merged);
    let animated_texture_count = merged
        .keys()
        .filter(|path| path.ends_with(".png.mcmeta"))
        .count();
    Ok(LoadedAssetStack {
        layers,
        identity: format!("stack:{}", identities.join("+")),
        blockstate_count,
        model_count,
        texture_count,
        animated_texture_count,
    })
}

fn count_asset_entries(entries: &HashMap<String, Vec<u8>>) -> (usize, usize, usize) {
    let mut blockstates = 0;
    let mut models = 0;
    let mut textures = 0;
    for path in entries.keys() {
        count_asset_path(path, &mut blockstates, &mut models, &mut textures);
    }
    (blockstates, models, textures)
}

fn count_asset_path(path: &str, blockstates: &mut usize, models: &mut usize, textures: &mut usize) {
    if !path.starts_with("assets/") {
        return;
    }
    if path.contains("/blockstates/") && path.ends_with(".json") {
        *blockstates += 1;
    } else if path.contains("/models/") && path.ends_with(".json") {
        *models += 1;
    } else if path.contains("/textures/") && path.ends_with(".png") {
        *textures += 1;
    }
}

fn load_archive_entries(source: &Path) -> Result<HashMap<String, Vec<u8>>, String> {
    let file = fs::File::open(source)
        .map_err(|error| format!("Failed to open map asset archive: {error}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("Map asset source is not a readable ZIP/JAR: {error}"))?;
    let mut entries = HashMap::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read map asset archive entry: {error}"))?;
        let name = entry.name().replace('\\', "/");
        if !is_interesting_asset(&name) {
            continue;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Failed to read map asset entry {name}: {error}"))?;
        entries.insert(name, bytes);
    }
    Ok(entries)
}

fn load_directory_entries(source: &Path) -> Result<HashMap<String, Vec<u8>>, String> {
    let mut files = Vec::new();
    collect_files(source, &mut files)?;
    let mut entries = HashMap::new();
    for path in files {
        let relative = path
            .strip_prefix(source)
            .map_err(|_| "Map asset path escaped its source directory".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if is_interesting_asset(&relative) {
            let bytes = fs::read(&path)
                .map_err(|error| format!("Failed to read map asset {relative}: {error}"))?;
            entries.insert(relative, bytes);
        }
    }
    Ok(entries)
}

fn collect_files(current: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in
        fs::read_dir(current).map_err(|error| format!("Failed to scan map assets: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to scan map assets: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Failed to inspect map asset: {error}"))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_files(&path, output)?;
        } else if metadata.is_file() {
            output.push(path);
        }
    }
    Ok(())
}

fn is_interesting_asset(path: &str) -> bool {
    path.starts_with("assets/")
        && (path.contains("/blockstates/")
            || path.contains("/models/")
            || path.contains("/textures/"))
        && (path.ends_with(".json") || path.ends_with(".png") || path.ends_with(".png.mcmeta"))
}

fn asset_identity(source: &Path) -> Result<String, String> {
    let mut hasher = Sha256::new();
    if source.is_file() {
        let mut file = fs::File::open(source)
            .map_err(|error| format!("Failed to read map asset source: {error}"))?;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = file
                .read(&mut buffer)
                .map_err(|error| format!("Failed to hash map asset source: {error}"))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
    } else {
        let mut files = Vec::new();
        collect_files(source, &mut files)?;
        files.sort();
        for path in files {
            let relative = path
                .strip_prefix(source)
                .map_err(|_| "Map asset path escaped its source directory".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            hasher.update(relative.as_bytes());
            hasher.update([0]);
            let bytes = fs::read(&path)
                .map_err(|error| format!("Failed to hash map asset {relative}: {error}"))?;
            hasher.update(bytes);
        }
    }
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

pub(crate) fn fallback_block_colour(block_name: &str) -> [u8; 4] {
    if is_air(block_name) {
        return [0, 0, 0, 0];
    }
    let name = block_name.strip_prefix("minecraft:").unwrap_or(block_name);
    let named = if name.contains("water") {
        Some([52, 126, 196, 255])
    } else if name.contains("lava") {
        Some([226, 94, 25, 255])
    } else if name == "grass_block" || name == "grass" || name.contains("fern") {
        Some([91, 153, 64, 255])
    } else if name.contains("leaves") || name.contains("vine") || name.contains("moss") {
        Some([66, 126, 58, 255])
    } else if name.contains("dirt") || name.contains("mud") || name.contains("podzol") {
        Some([125, 86, 53, 255])
    } else if name.contains("stone") || name.contains("cobblestone") {
        Some(if name.contains("deepslate") {
            [70, 73, 80, 255]
        } else {
            [116, 118, 116, 255]
        })
    } else if name.contains("sand") || name.contains("sandstone") {
        Some(if name.contains("red") {
            [174, 99, 62, 255]
        } else {
            [218, 194, 132, 255]
        })
    } else if name.contains("snow") || name.contains("quartz") || name.contains("calcite") {
        Some([224, 230, 229, 255])
    } else if name.contains("ice") {
        Some([155, 207, 226, 255])
    } else if name.contains("netherrack") || name.contains("nether_brick") {
        Some([126, 57, 54, 255])
    } else if name.contains("end_stone") {
        Some([216, 211, 147, 255])
    } else if name.contains("ore") {
        Some([125, 128, 123, 255])
    } else if name.contains("log")
        || name.contains("wood")
        || name.contains("planks")
        || name.contains("stem")
    {
        Some(if name.contains("birch") {
            [194, 170, 112, 255]
        } else if name.contains("spruce") || name.contains("dark_oak") {
            [91, 61, 38, 255]
        } else if name.contains("crimson") {
            [125, 48, 85, 255]
        } else {
            [151, 102, 60, 255]
        })
    } else if name.contains("brick") || name.contains("terracotta") {
        Some([169, 83, 62, 255])
    } else {
        None
    };

    let mut colour = named.unwrap_or_else(|| {
        let mut hash = 2_166_136_261u32;
        for byte in name.bytes() {
            hash ^= u32::from(byte);
            hash = hash.wrapping_mul(16_777_619);
        }
        [
            48 + ((hash & 0x7f) as u8),
            48 + (((hash >> 8) & 0x7f) as u8),
            48 + (((hash >> 16) & 0x7f) as u8),
            255,
        ]
    });
    if matches!(material_kind(block_name), MaterialKind::Translucent) {
        colour[3] = 190;
    }
    colour
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_colours_are_stable_and_non_green_placeholder_like() {
        assert_eq!(
            fallback_block_colour("minecraft:water"),
            [52, 126, 196, 190]
        );
        assert_ne!(
            fallback_block_colour("minecraft:stone"),
            fallback_block_colour("minecraft:grass_block")
        );
    }

    #[test]
    fn auto_detection_prefers_prism_and_newer_numeric_versions() {
        assert!(
            version_key(&Some("1.21.10".to_string())) > version_key(&Some("1.21.9".to_string()))
        );
        assert_eq!(launcher_priority(AssetLauncher::PrismLauncherStandard), 0);
        assert_eq!(launcher_priority(AssetLauncher::OfficialLauncher), 1);
        assert_eq!(launcher_priority(AssetLauncher::AtLauncher), 6);
    }

    #[test]
    fn ordered_asset_config_sources_take_precedence_over_legacy_source() {
        let config = AssetConfig {
            source_path: Some("/legacy/client.jar".to_string()),
            source_paths: vec![
                "/client.jar".to_string(),
                "/resourcepacks/base.zip".to_string(),
                "/resourcepacks/override.zip".to_string(),
            ],
        };

        assert_eq!(
            config_sources(&config),
            [
                PathBuf::from("/client.jar"),
                PathBuf::from("/resourcepacks/base.zip"),
                PathBuf::from("/resourcepacks/override.zip"),
            ]
        );
    }
}
