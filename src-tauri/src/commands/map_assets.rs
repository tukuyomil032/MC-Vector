use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use fastanvil::Block;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zip::ZipArchive;

use crate::map::assets::{
    manifest_quality, source_version, AssetManifest, AssetResolver, ASSET_MANIFEST_VERSION,
};

const ASSET_CONFIG_NAME: &str = "map-assets.json";
const VANILLA_VERSION_PREFIX: &str = "1.21";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetConfig {
    pub source_path: Option<String>,
}

pub(crate) struct MapAssets {
    resolver: AssetResolver,
    top_color_cache: Mutex<HashMap<String, [u8; 4]>>,
    pub(crate) identity: String,
    pub(crate) manifest: AssetManifest,
}

impl MapAssets {
    pub(crate) fn cache_identity(&self) -> String {
        format!(
            "{}:manifest-v{}",
            self.identity, self.manifest.manifest_version
        )
    }

    pub(crate) fn sample(&self, block: &Block) -> [u8; 4] {
        self.sample_encoded_state(block.encoded_description(), block.name())
    }

    pub(crate) fn sample_state(&self, state: &str) -> [u8; 4] {
        let (encoded, block_id) = encode_state(state);
        self.sample_encoded_state(&encoded, &block_id)
    }

    pub(crate) fn sample_state_at(&self, state: &str, u: f32, v: f32) -> [u8; 4] {
        self.sample_state_at_with_biome(state, "", u, v)
    }

    pub(crate) fn sample_state_at_with_biome(
        &self,
        state: &str,
        biome: &str,
        u: f32,
        v: f32,
    ) -> [u8; 4] {
        let (encoded, block_id) = encode_state(state);
        self.resolver
            .sample_top_at(&encoded, u, v)
            .map(|color| {
                crate::map::assets::apply_tint(color, crate::map::assets::tint_for(&encoded, biome))
            })
            .unwrap_or_else(|| fallback_block_colour(&block_id))
    }

    fn sample_encoded_state(&self, encoded: &str, block_name: &str) -> [u8; 4] {
        if let Some(colour) = self
            .top_color_cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(encoded).copied())
        {
            return colour;
        }

        let colour = self
            .resolver
            .sample_top(encoded)
            .unwrap_or_else(|| fallback_block_colour(block_name));

        if let Ok(mut cache) = self.top_color_cache.lock() {
            cache.insert(encoded.to_string(), colour);
        }
        colour
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
    let source = configured_source(server_root)?.or_else(detect_vanilla_source);
    let Some(source) = source else {
        return Ok(None);
    };
    load_from_source(&source).map(Some)
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
    if let Some(source) = config.source_path.as_deref() {
        validate_asset_source(Path::new(source))?;
    }
    let path = server_root.join(ASSET_CONFIG_NAME);
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("Failed to serialize map asset configuration: {error}"))?;
    fs::write(path, bytes)
        .map_err(|error| format!("Failed to write map asset configuration: {error}"))
}

pub(crate) fn source_status(server_root: &Path) -> Result<AssetStatus, String> {
    let configured = configured_source(server_root)?;
    let source = configured.clone().or_else(detect_vanilla_source);
    let Some(source) = source else {
        return Ok(AssetStatus {
            state: "missing".to_string(),
            source_path: None,
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

    match source_details(&source) {
        Ok(details) => Ok(AssetStatus {
            state: if configured.is_some() {
                "user_selected".to_string()
            } else {
                "auto_detected".to_string()
            },
            source_path: Some(source.display().to_string()),
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
            source_path: Some(source.display().to_string()),
            identity: None,
            blockstate_count: 0,
            model_count: 0,
            texture_count: 0,
            animated_texture_count: 0,
            minecraft_version: source_version(&source.display().to_string()),
            quality: "invalid".to_string(),
            unresolved_blockstate_count: 0,
            message: Some(error),
        }),
    }
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

fn source_details(source: &Path) -> Result<SourceDetails, String> {
    validate_asset_source(source)?;
    let (blockstate_count, model_count, texture_count) = count_asset_entries(source)?;
    if blockstate_count == 0 || model_count == 0 || texture_count == 0 {
        return Err(
            "Map asset source does not contain Minecraft blockstates, models, and textures"
                .to_string(),
        );
    }
    let identity = asset_identity(source)?;
    let entries = if source.is_dir() {
        load_directory_entries(source)?
    } else {
        load_archive_entries(source)?
    };
    let resolver = AssetResolver::from_entries(&entries)?;
    let unresolved_blockstate_count = blockstate_count.saturating_sub(resolver.blockstate_count());
    let quality = manifest_quality(&AssetManifest {
        manifest_version: ASSET_MANIFEST_VERSION,
        minecraft_version: source_version(&source.display().to_string()),
        source_path: source.display().to_string(),
        source_identity: identity.clone(),
        resource_pack_hash: identity.clone(),
        blockstate_count,
        model_count,
        texture_count,
        animated_texture_count: 0,
        unresolved_blockstate_count,
        quality: AssetManifest::quality_for(unresolved_blockstate_count, blockstate_count),
    })
    .to_string();
    Ok(SourceDetails {
        identity,
        blockstate_count,
        model_count,
        texture_count,
        animated_texture_count: entries
            .keys()
            .filter(|path| path.ends_with(".png.mcmeta"))
            .count(),
        minecraft_version: source_version(&source.display().to_string()),
        quality,
        unresolved_blockstate_count,
    })
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetStatus {
    pub state: String,
    pub source_path: Option<String>,
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

fn configured_source(server_root: &Path) -> Result<Option<PathBuf>, String> {
    let config = read_config(server_root)?;
    let Some(source) = config.source_path else {
        return Ok(None);
    };
    let path = PathBuf::from(source);
    Ok(Some(path))
}

fn detect_vanilla_source() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let mut roots = vec![home.join("Library/Application Support/minecraft/versions")];
    if let Some(config_dir) = std::env::var_os("XDG_CONFIG_HOME") {
        roots.push(PathBuf::from(config_dir).join("minecraft/versions"));
    } else {
        roots.push(home.join(".minecraft/versions"));
    }

    let mut candidates = Vec::new();
    for root in roots {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(version) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !version.starts_with(VANILLA_VERSION_PREFIX) {
                continue;
            }
            let jar = path.join(format!("{version}.jar"));
            if jar.is_file() {
                candidates.push((version.to_string(), jar));
            }
        }
    }
    candidates.sort_by(|left, right| left.0.cmp(&right.0));
    candidates.pop().map(|(_, path)| path)
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

fn load_from_source(source: &Path) -> Result<MapAssets, String> {
    validate_asset_source(source)?;
    let identity = asset_identity(source)?;
    let entries = if source.is_dir() {
        load_directory_entries(source)?
    } else {
        load_archive_entries(source)?
    };

    let resolver = AssetResolver::from_entries(&entries)?;
    let (blockstate_count, model_count, texture_count) = count_asset_entries(source)?;
    let animated_texture_count = entries
        .keys()
        .filter(|path| path.ends_with(".png.mcmeta"))
        .count();
    let unresolved_blockstate_count = blockstate_count.saturating_sub(resolver.blockstate_count());
    let source_path = source.display().to_string();
    let manifest = AssetManifest {
        manifest_version: ASSET_MANIFEST_VERSION,
        minecraft_version: source_version(&source_path),
        source_path,
        source_identity: identity.clone(),
        resource_pack_hash: identity.clone(),
        blockstate_count,
        model_count,
        texture_count,
        animated_texture_count,
        unresolved_blockstate_count,
        quality: AssetManifest::quality_for(unresolved_blockstate_count, blockstate_count),
    };

    Ok(MapAssets {
        resolver,
        top_color_cache: Mutex::new(HashMap::new()),
        identity,
        manifest,
    })
}

fn count_asset_entries(source: &Path) -> Result<(usize, usize, usize), String> {
    let mut blockstates = 0;
    let mut models = 0;
    let mut textures = 0;
    if source.is_dir() {
        let mut files = Vec::new();
        collect_files(source, &mut files)?;
        for path in files {
            let relative = path
                .strip_prefix(source)
                .map_err(|_| "Map asset path escaped its source directory".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            count_asset_path(&relative, &mut blockstates, &mut models, &mut textures);
        }
    } else {
        let file = fs::File::open(source)
            .map_err(|error| format!("Failed to open map asset archive: {error}"))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|error| format!("Map asset source is not a readable ZIP/JAR: {error}"))?;
        for index in 0..archive.len() {
            let entry = archive
                .by_index(index)
                .map_err(|error| format!("Failed to read map asset archive entry: {error}"))?;
            count_asset_path(
                &entry.name().replace('\\', "/"),
                &mut blockstates,
                &mut models,
                &mut textures,
            );
        }
    }
    Ok((blockstates, models, textures))
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

    named.unwrap_or_else(|| {
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_colours_are_stable_and_non_green_placeholder_like() {
        assert_eq!(
            fallback_block_colour("minecraft:water"),
            [52, 126, 196, 255]
        );
        assert_ne!(
            fallback_block_colour("minecraft:stone"),
            fallback_block_colour("minecraft:grass_block")
        );
    }
}
