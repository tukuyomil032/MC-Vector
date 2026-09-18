use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::{JoinHandle, JoinSet};
use tokio::time::{timeout, Duration};
use uuid::Uuid;

use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use super::server::ServerManager;
use crate::map::application::{
    CachedTile, MemoryTileCache, RenderProgress, TileKey, TileMetadata, TilePriority,
    TileRenderState, TileScheduler, DEFAULT_PERSPECTIVE,
};
use crate::map::assets::{self as map_assets, MapAssets};
use crate::map::bridge::config::{
    config_read_error, inspect_bridge_config, read_bridge_config, validate_bridge_config,
    write_bridge_config, BridgeConfig, BridgeConfigInspection, MAP_PROTOCOL_VERSION,
};
use crate::map::bridge::framing::read_bridge_line;
use crate::map::bridge::protocol::{
    hello_ack, hello_rejection_reason, parse_chat_message, parse_hello, parse_world_status_message,
    validate_hello, BridgeStatusPayload, ChatMessageEventPayload, WorldStatusEventPayload,
};
use crate::map::domain::{ChunkKey, ChunkView};
use crate::map::projection::{floor_div, TileWorldBounds};
use crate::map::renderer::{render_world_tile_detailed, LiveChunkMap, MAX_ZOOM, TILE_SIZE};
use crate::map::sources::{
    decode_live_snapshot as decode_world_snapshot, enumerate_region_files, read_level_metadata,
    LiveSnapshotCache,
};

// Keep this file as the parent module so existing `commands::map` state APIs
// remain stable. Rust cannot compile both `map.rs` and `map/mod.rs` as the
// same module, so the command boundaries live in path-qualified child files.
#[path = "map/assets.rs"]
pub mod assets;
#[path = "map/lifecycle.rs"]
pub mod lifecycle;
#[path = "map/markers.rs"]
pub mod markers;
#[path = "map/status.rs"]
pub mod status;
#[path = "map/tiles.rs"]
pub mod tiles;
#[path = "map/world.rs"]
pub mod world;
use status::MapStatus;
use world::{MapWorldBorder, MapWorldInfo};

const CORE_JAR_NAME: &str = "mc-vector-core.jar";
const CORE_DISABLED_JAR_NAME: &str = "mc-vector-core.jar.disabled";
const CORE_CONFIG_NAME: &str = "mc-vector-core.yml";
const CORE_METADATA_NAME: &str = "mc-vector-core.managed.json";
const MAX_LIVE_CHUNKS_PER_TILE: usize = 64;
const MAX_LIVE_CHUNKS_PER_AXIS: i64 = 8;
// Bump this whenever the rasterisation algorithm or its source data contract
// changes. In particular, the earlier representative-colour/surface tiles
// must never be reused by the Iso ray renderer.
const TILE_RENDERER_VERSION: &str = "iso-ray-model-texture-v7";
const MAX_TILE_CACHE_ENTRIES: usize = 256;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapViewport {
    pub center_x: f64,
    pub center_z: f64,
    pub zoom: u8,
    #[serde(default = "default_viewport_width")]
    pub width: u32,
    #[serde(default = "default_viewport_height")]
    pub height: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRenderRequestResult {
    pub requested: usize,
    pub accepted: usize,
}

fn default_viewport_width() -> u32 {
    1024
}

fn default_viewport_height() -> u32 {
    768
}

#[derive(Clone, Debug)]
struct RuntimeBridgeStatus {
    bridge: String,
    last_heartbeat: Option<u64>,
}

type TileCacheKey = TileKey;

#[derive(Clone)]
pub struct MapBridgeManager {
    listeners: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
    statuses: Arc<Mutex<HashMap<String, RuntimeBridgeStatus>>>,
    tile_cache: Arc<Mutex<MemoryTileCache>>,
    inflight_tiles:
        Arc<Mutex<HashMap<TileCacheKey, Vec<oneshot::Sender<Result<Vec<u8>, String>>>>>>,
    asset_cache: Arc<StdMutex<HashMap<String, Arc<MapAssets>>>>,
    sessions: Arc<Mutex<HashMap<String, BridgeSender>>>,
    pending_snapshots: Arc<Mutex<HashMap<String, PendingSnapshotSender>>>,
    live_snapshots: Arc<Mutex<LiveSnapshotCache>>,
    tile_scheduler: Arc<TileScheduler>,
}

impl Default for MapBridgeManager {
    fn default() -> Self {
        Self {
            listeners: Arc::default(),
            statuses: Arc::default(),
            tile_cache: Arc::new(Mutex::new(MemoryTileCache::new(MAX_TILE_CACHE_ENTRIES))),
            inflight_tiles: Arc::default(),
            asset_cache: Arc::default(),
            sessions: Arc::default(),
            pending_snapshots: Arc::default(),
            live_snapshots: Arc::new(Mutex::new(LiveSnapshotCache::new(2_000))),
            tile_scheduler: Arc::new(TileScheduler::new(64, 2)),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedMetadata {
    managed_by: String,
    schema_version: u32,
    artifact_name: String,
    artifact_provenance: String,
    removal_requested: bool,
    #[serde(default)]
    restart_required: bool,
}

#[derive(Clone, Debug)]
struct MapPaths {
    active_jar: PathBuf,
    disabled_jar: PathBuf,
    config: PathBuf,
    metadata: PathBuf,
    assets: PathBuf,
}

type BridgeSender = mpsc::Sender<String>;
type PendingSnapshotSender = oneshot::Sender<Result<ChunkView, String>>;

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
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

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())
}

fn server_dir(app_data_dir: &Path, server_id: &str) -> Result<PathBuf, String> {
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: String::new(),
    };
    let path = resolve_managed_request(app_data_dir, &request, false)?;
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_dir() && !is_link_or_reparse_point(&metadata) => Ok(path),
        Ok(_) => Err("Managed server path is not a directory".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err("Managed server directory does not exist".to_string())
        }
        Err(error) => Err(format!(
            "Failed to inspect managed server directory: {error}"
        )),
    }
}

fn clear_restart_requirement(app: &AppHandle, server_id: &str) -> Result<(), String> {
    let app_data = app_data_dir(app)?;
    let root = server_dir(&app_data, server_id)?;
    let Some(paths) = map_paths(&root, false)? else {
        return Ok(());
    };
    let Some(mut metadata) = load_metadata(&paths)? else {
        return Ok(());
    };
    if metadata.restart_required {
        metadata.restart_required = false;
        write_json_file(&paths.metadata, &metadata)?;
    }
    Ok(())
}

fn inspect_directory(path: &Path, create: bool) -> Result<Option<PathBuf>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) {
                return Err("Refusing to access a symbolic link or reparse point".to_string());
            }
            if !metadata.is_dir() {
                return Err("Map plugin path is not a directory".to_string());
            }
            Ok(Some(path.to_path_buf()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
            fs::create_dir_all(path)
                .map_err(|error| format!("Failed to create the plugins directory: {error}"))?;
            let metadata = fs::symlink_metadata(path)
                .map_err(|error| format!("Failed to inspect the plugins directory: {error}"))?;
            if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                return Err("Created plugins path is not a normal directory".to_string());
            }
            Ok(Some(path.to_path_buf()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to inspect the plugins directory: {error}")),
    }
}

fn map_paths(server_root: &Path, create_plugins_dir: bool) -> Result<Option<MapPaths>, String> {
    let Some(plugins_dir) = inspect_directory(&server_root.join("plugins"), create_plugins_dir)?
    else {
        return Ok(None);
    };

    Ok(Some(MapPaths {
        active_jar: plugins_dir.join(CORE_JAR_NAME),
        disabled_jar: plugins_dir.join(CORE_DISABLED_JAR_NAME),
        config: plugins_dir.join(CORE_CONFIG_NAME),
        metadata: plugins_dir.join(CORE_METADATA_NAME),
        assets: server_root.join("map-assets.json"),
    }))
}

fn existing_normal_file(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) {
                return Err(format!(
                    "Refusing to access a symbolic link or reparse point: {}",
                    path.display()
                ));
            }
            Ok(metadata.is_file())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("Failed to inspect map component: {error}")),
    }
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if is_link_or_reparse_point(&metadata) {
            return Err(format!(
                "Refusing to read a symbolic link or reparse point: {}",
                path.display()
            ));
        }
    }
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|error| format!("Invalid managed map metadata: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read managed map metadata: {error}")),
    }
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize managed map metadata: {error}"))?;
    fs::write(path, bytes).map_err(|error| format!("Failed to write managed map metadata: {error}"))
}

fn locate_core_artifact(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(CORE_JAR_NAME));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../src/map/paper/mc-vector-core/build/libs")
            .join(CORE_JAR_NAME),
    );

    candidates.into_iter().find(|path| {
        fs::symlink_metadata(path)
            .is_ok_and(|metadata| metadata.is_file() && !is_link_or_reparse_point(&metadata))
    })
}

fn install_core_artifact(source: &Path, destination: &Path) -> Result<(), String> {
    if existing_normal_file(destination)? {
        return Err("Refusing to overwrite an existing MC-Vector Core artifact".to_string());
    }
    let staging = destination.with_extension("jar.part");
    if fs::symlink_metadata(&staging).is_ok() {
        return Err("A pending MC-Vector Core installation already exists".to_string());
    }
    fs::copy(source, &staging)
        .map_err(|error| format!("Failed to stage MC-Vector Core: {error}"))?;
    if let Err(error) = fs::rename(&staging, destination) {
        let _ = fs::remove_file(&staging);
        return Err(format!("Failed to install MC-Vector Core: {error}"));
    }
    Ok(())
}

fn default_metadata() -> ManagedMetadata {
    ManagedMetadata {
        managed_by: "MC-Vector".to_string(),
        schema_version: 1,
        artifact_name: CORE_JAR_NAME.to_string(),
        artifact_provenance: "pending".to_string(),
        removal_requested: false,
        restart_required: false,
    }
}

fn validate_metadata(metadata: &ManagedMetadata) -> Result<(), String> {
    if metadata.managed_by != "MC-Vector"
        || metadata.schema_version != 1
        || metadata.artifact_name != CORE_JAR_NAME
    {
        return Err("Map component metadata is not managed by MC-Vector".to_string());
    }
    Ok(())
}

fn load_metadata(paths: &MapPaths) -> Result<Option<ManagedMetadata>, String> {
    let metadata = read_json_file::<ManagedMetadata>(&paths.metadata)?;
    if let Some(metadata) = metadata.as_ref() {
        validate_metadata(metadata)?;
    }
    Ok(metadata)
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

async fn runtime_status(
    manager: &MapBridgeManager,
    server_id: &str,
) -> Option<RuntimeBridgeStatus> {
    manager.statuses.lock().await.get(server_id).cloned()
}

fn component_state(
    active: bool,
    disabled: bool,
    metadata: Option<&ManagedMetadata>,
) -> (String, Option<String>) {
    if active && disabled {
        return (
            "conflict".to_string(),
            Some("Both active and disabled MC-Vector Core files exist".to_string()),
        );
    }

    let Some(metadata) = metadata else {
        if active || disabled {
            return (
                "conflict".to_string(),
                Some("The same-named plugin file is not identified as managed".to_string()),
            );
        }
        return ("absent".to_string(), None);
    };

    if metadata.removal_requested {
        return (
            "remove_pending".to_string(),
            Some("Removal is waiting for the server to stop".to_string()),
        );
    }

    if active {
        if metadata.artifact_provenance == "managed" {
            if metadata.restart_required {
                (
                    "waiting_restart".to_string(),
                    Some("Map component changes will apply after the server restarts".to_string()),
                )
            } else {
                ("active".to_string(), None)
            }
        } else {
            (
                "conflict".to_string(),
                Some("The Core JAR needs a verified managed artifact identity".to_string()),
            )
        }
    } else if disabled {
        if metadata.artifact_provenance == "managed" {
            if metadata.restart_required {
                (
                    "waiting_restart".to_string(),
                    Some("Map component changes will apply after the server restarts".to_string()),
                )
            } else {
                ("paused".to_string(), None)
            }
        } else {
            (
                "conflict".to_string(),
                Some(
                    "The disabled Core file needs a verified managed artifact identity".to_string(),
                ),
            )
        }
    } else {
        (
            "absent".to_string(),
            Some("MC-Vector Core artifact is not installed yet".to_string()),
        )
    }
}

async fn build_status(
    app: &AppHandle,
    manager: &MapBridgeManager,
    server_id: &str,
) -> Result<MapStatus, String> {
    let app_data = app_data_dir(app)?;
    let root = server_dir(&app_data, server_id)?;
    let paths = map_paths(&root, false)?;
    let Some(paths) = paths else {
        return Ok(MapStatus {
            server_id: server_id.to_string(),
            component: "absent".to_string(),
            artifact: None,
            restart_required: false,
            bridge: "not_applicable".to_string(),
            config_state: "missing".to_string(),
            config_reason: None,
            protocol_version: MAP_PROTOCOL_VERSION,
            plugin_version: None,
            configured_port: None,
            last_heartbeat: None,
            asset_state: "not_applicable".to_string(),
            asset_source: None,
            asset_identity: None,
            asset_message: None,
            message: None,
        });
    };

    let active = existing_normal_file(&paths.active_jar)?;
    let disabled = existing_normal_file(&paths.disabled_jar)?;
    let (metadata, metadata_message) = match load_metadata(&paths) {
        Ok(metadata) => (metadata, None),
        Err(error) => (None, Some(error)),
    };
    let (raw_component, raw_component_message) =
        component_state(active, disabled, metadata.as_ref());
    let artifact = if active {
        Some("active".to_string())
    } else if disabled {
        Some("paused".to_string())
    } else {
        None
    };
    let inspection = match inspect_bridge_config(&paths.config, Some(server_id)) {
        Ok(inspection) => inspection,
        Err(error) => config_read_error(error),
    };
    let config = match &inspection {
        BridgeConfigInspection::Valid(config) => Some(config.clone()),
        BridgeConfigInspection::Missing | BridgeConfigInspection::Invalid(_) => None,
    };
    let config_issue = match &inspection {
        BridgeConfigInspection::Invalid(issue) => Some(issue),
        BridgeConfigInspection::Missing | BridgeConfigInspection::Valid(_) => None,
    };
    let asset_status = match map_assets::source_status(&root) {
        Ok(status) => status,
        Err(error) => map_assets::AssetStatus::invalid(error),
    };

    if let Some(config) = config.as_ref() {
        let _ = ensure_bridge_listener(app.clone(), manager, config.clone()).await;
    }

    let runtime = runtime_status(manager, server_id).await;
    let bridge = match &inspection {
        BridgeConfigInspection::Invalid(issue) => {
            if issue.state == "invalid" {
                "error".to_string()
            } else {
                "incompatible".to_string()
            }
        }
        BridgeConfigInspection::Missing => {
            if active || disabled {
                "disconnected".to_string()
            } else {
                "not_applicable".to_string()
            }
        }
        BridgeConfigInspection::Valid(_) => runtime
            .as_ref()
            .map(|status| status.bridge.clone())
            .unwrap_or_else(|| "disconnected".to_string()),
    };
    let (component, component_message) =
        if config_issue.is_some_and(|issue| issue.state == "conflict") {
            (
                "conflict".to_string(),
                config_issue.map(|issue| issue.message.clone()),
            )
        } else if raw_component == "waiting_restart" && bridge == "connected" {
            if active {
                ("active".to_string(), None)
            } else {
                ("paused".to_string(), None)
            }
        } else {
            (raw_component, raw_component_message)
        };
    let restart_required = metadata
        .as_ref()
        .is_some_and(|metadata| metadata.restart_required)
        && bridge != "connected";
    let message = config_issue
        .map(|issue| issue.message.clone())
        .or(metadata_message)
        .or(component_message)
        .or_else(|| {
            if component == "active" && bridge == "disconnected" {
                Some(
                    "MC-Vector Core is installed, but the Rust bridge is not connected".to_string(),
                )
            } else {
                None
            }
        });
    let (config_state, config_reason) = match &inspection {
        BridgeConfigInspection::Missing => ("missing".to_string(), None),
        BridgeConfigInspection::Valid(_) => ("valid".to_string(), None),
        BridgeConfigInspection::Invalid(issue) => (issue.state.clone(), Some(issue.reason.clone())),
    };

    Ok(MapStatus {
        server_id: server_id.to_string(),
        component,
        artifact,
        restart_required,
        bridge,
        config_state,
        config_reason,
        protocol_version: config
            .as_ref()
            .map(|config| config.protocol_version)
            .unwrap_or(MAP_PROTOCOL_VERSION),
        plugin_version: config.as_ref().map(|config| config.plugin_version.clone()),
        configured_port: config.as_ref().map(|config| config.port),
        last_heartbeat: runtime.and_then(|status| status.last_heartbeat),
        asset_state: asset_status.state,
        asset_source: asset_status.source_path,
        asset_identity: asset_status.identity,
        asset_message: asset_status.message,
        message,
    })
}

fn emit_bridge_status(app: &AppHandle, payload: BridgeStatusPayload) {
    let _ = app.emit("map-bridge-status", payload);
}

async fn set_runtime_status(
    manager: &MapBridgeManager,
    server_id: &str,
    bridge: &str,
    last_heartbeat: Option<u64>,
) {
    manager.statuses.lock().await.insert(
        server_id.to_string(),
        RuntimeBridgeStatus {
            bridge: bridge.to_string(),
            last_heartbeat,
        },
    );
}

fn dimension_matches_world(world_id: &str, dimension: &str) -> bool {
    matches!(
        (world_id, dimension),
        ("overworld", "minecraft:overworld")
            | ("world_nether", "minecraft:the_nether")
            | ("world_the_end", "minecraft:the_end")
    ) || world_id == dimension
}

fn tile_coordinates_intersect_chunk(
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    chunk_x: i64,
    chunk_z: i64,
) -> bool {
    let blocks_per_pixel = 1_i64 << (MAX_ZOOM - zoom);
    let tile_min_x = i64::from(tile_x) * i64::from(TILE_SIZE) * blocks_per_pixel;
    let tile_min_z = i64::from(tile_y) * i64::from(TILE_SIZE) * blocks_per_pixel;
    let tile_max_x = tile_min_x + i64::from(TILE_SIZE) * blocks_per_pixel - 1;
    let tile_max_z = tile_min_z + i64::from(TILE_SIZE) * blocks_per_pixel - 1;
    let chunk_min_x = chunk_x * 16;
    let chunk_min_z = chunk_z * 16;
    let chunk_max_x = chunk_min_x + 15;
    let chunk_max_z = chunk_min_z + 15;
    tile_min_x <= chunk_max_x
        && tile_max_x >= chunk_min_x
        && tile_min_z <= chunk_max_z
        && tile_max_z >= chunk_min_z
}

fn normal_directory_entries(path: &Path) -> Result<Option<Vec<fs::DirEntry>>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to inspect map tile cache: {error}")),
    };
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err(format!(
            "Map tile cache path is not a normal directory: {}",
            path.display()
        ));
    }
    let entries = fs::read_dir(path)
        .map_err(|error| format!("Failed to read map tile cache: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to read map tile cache entry: {error}"))?;
    Ok(Some(entries))
}

fn invalidate_disk_chunk_tiles(
    server_root: &Path,
    server_id: &str,
    dimension: &str,
    chunk_x: i64,
    chunk_z: i64,
) -> Result<(), String> {
    let server_cache = server_root.join("map-cache").join(cache_segment(server_id));
    let Some(world_entries) = normal_directory_entries(&server_cache)? else {
        return Ok(());
    };

    for world_entry in world_entries {
        let world_path = world_entry.path();
        let Some(world_id) = world_path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !dimension_matches_world(world_id, dimension) {
            continue;
        }
        let Some(version_entries) = normal_directory_entries(&world_path)? else {
            continue;
        };
        for version_entry in version_entries {
            let Some(resource_entries) = normal_directory_entries(&version_entry.path())? else {
                continue;
            };
            for resource_entry in resource_entries {
                let Some(manifest_entries) = normal_directory_entries(&resource_entry.path())?
                else {
                    continue;
                };
                for manifest_entry in manifest_entries {
                    let Some(renderer_entries) = normal_directory_entries(&manifest_entry.path())?
                    else {
                        continue;
                    };
                    for renderer_entry in renderer_entries {
                        let Some(perspective_entries) =
                            normal_directory_entries(&renderer_entry.path())?
                        else {
                            continue;
                        };
                        for perspective_entry in perspective_entries {
                            let Some(zoom_entries) =
                                normal_directory_entries(&perspective_entry.path())?
                            else {
                                continue;
                            };
                            for zoom_entry in zoom_entries {
                                let Some(zoom) = zoom_entry
                                    .file_name()
                                    .to_str()
                                    .and_then(|value| value.parse::<u8>().ok())
                                else {
                                    continue;
                                };
                                let Some(tile_x_entries) =
                                    normal_directory_entries(&zoom_entry.path())?
                                else {
                                    continue;
                                };
                                for tile_x_entry in tile_x_entries {
                                    let Some(tile_x) = tile_x_entry
                                        .file_name()
                                        .to_str()
                                        .and_then(|value| value.parse::<i32>().ok())
                                    else {
                                        continue;
                                    };
                                    let tile_x_path = tile_x_entry.path();
                                    let Some(tile_y_entries) =
                                        normal_directory_entries(&tile_x_path)?
                                    else {
                                        continue;
                                    };
                                    for tile_y_entry in tile_y_entries {
                                        let path = tile_y_entry.path();
                                        let metadata =
                                            fs::symlink_metadata(&path).map_err(|error| {
                                                format!(
                                                    "Failed to inspect cached map tile: {error}"
                                                )
                                            })?;
                                        if is_link_or_reparse_point(&metadata) {
                                            return Err(format!(
                                                "Refusing to inspect a symbolic cached map tile: {}",
                                                path.display()
                                            ));
                                        }
                                        let Some(tile_y) = path
                                            .file_stem()
                                            .and_then(|value| value.to_str())
                                            .filter(|_| {
                                                path.extension().and_then(|ext| ext.to_str())
                                                    == Some("png")
                                            })
                                            .and_then(|value| value.parse::<i32>().ok())
                                        else {
                                            continue;
                                        };
                                        if tile_coordinates_intersect_chunk(
                                            zoom, tile_x, tile_y, chunk_x, chunk_z,
                                        ) {
                                            fs::remove_file(&path).map_err(|error| {
                                                format!(
                                                    "Failed to invalidate cached map tile: {error}"
                                                )
                                            })?;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

async fn invalidate_chunk_tiles(
    manager: &MapBridgeManager,
    server_id: &str,
    dimension: &str,
    chunk_x: i64,
    chunk_z: i64,
) {
    manager.tile_cache.lock().await.remove_where(|key| {
        key.server_id == server_id
            && dimension_matches_world(&key.world_id, dimension)
            && crate::map::tiles::tile_intersects_chunk(key, chunk_x, chunk_z)
    });
    manager
        .live_snapshots
        .lock()
        .await
        .remove(server_id, &ChunkKey::new(dimension, chunk_x, chunk_z));
}

fn decode_live_snapshot(value: &Value) -> Result<ChunkView, String> {
    decode_world_snapshot(value)
}

async fn request_live_chunk(
    manager: &MapBridgeManager,
    server_id: &str,
    dimension: &str,
    chunk_x: i64,
    chunk_z: i64,
) -> Option<ChunkView> {
    let chunk_key = ChunkKey::new(dimension, chunk_x, chunk_z);
    let now = current_timestamp();
    if let Some(cached) =
        manager
            .live_snapshots
            .lock()
            .await
            .get(server_id, &chunk_key, now.saturating_mul(1_000))
    {
        return Some(cached);
    }

    let sender = manager.sessions.lock().await.get(server_id).cloned()?;
    let request_id = Uuid::new_v4().to_string();
    let (response_sender, response_receiver) = oneshot::channel();
    manager
        .pending_snapshots
        .lock()
        .await
        .insert(request_id.clone(), response_sender);

    let message = serde_json::json!({
        "type": "chunk_snapshot_request",
        "requestId": request_id,
        "dimension": dimension,
        "chunkX": chunk_x,
        "chunkZ": chunk_z,
        "preferLive": true
    })
    .to_string();
    if sender.send(message).await.is_err() {
        manager.pending_snapshots.lock().await.remove(&request_id);
        return None;
    }

    match timeout(Duration::from_millis(750), response_receiver).await {
        Ok(Ok(Ok(snapshot)))
            if snapshot.key.dimension == dimension
                && snapshot.key.chunk_x == chunk_x
                && snapshot.key.chunk_z == chunk_z =>
        {
            manager.live_snapshots.lock().await.insert(
                server_id,
                snapshot.clone(),
                current_timestamp().saturating_mul(1_000),
            );
            Some(snapshot)
        }
        _ => {
            manager.pending_snapshots.lock().await.remove(&request_id);
            None
        }
    }
}

async fn request_live_chunks_for_tile(
    manager: &Arc<MapBridgeManager>,
    server_id: &str,
    dimension: &str,
    bounds: TileWorldBounds,
) -> LiveChunkMap {
    let (min_chunk_x, max_chunk_x) = limited_chunk_range(
        floor_div(bounds.origin_x, 16),
        floor_div(bounds.max_x(), 16),
        floor_div(bounds.origin_x + bounds.max_x(), 32),
    );
    let (min_chunk_z, max_chunk_z) = limited_chunk_range(
        floor_div(bounds.origin_z, 16),
        floor_div(bounds.max_z(), 16),
        floor_div(bounds.origin_z + bounds.max_z(), 32),
    );
    let center_chunk_x = floor_div(bounds.origin_x + bounds.max_x(), 32);
    let center_chunk_z = floor_div(bounds.origin_z + bounds.max_z(), 32);
    let mut candidates = (min_chunk_z..=max_chunk_z)
        .flat_map(|chunk_z| (min_chunk_x..=max_chunk_x).map(move |chunk_x| (chunk_x, chunk_z)))
        .collect::<Vec<_>>();
    candidates.sort_by_key(|(chunk_x, chunk_z)| {
        (
            (chunk_x - center_chunk_x).abs() + (chunk_z - center_chunk_z).abs(),
            *chunk_x,
            *chunk_z,
        )
    });
    candidates.truncate(MAX_LIVE_CHUNKS_PER_TILE);

    let mut requests = JoinSet::new();
    for (chunk_x, chunk_z) in candidates {
        let manager = Arc::clone(manager);
        let server_id = server_id.to_string();
        let dimension = dimension.to_string();
        requests.spawn(async move {
            let snapshot =
                request_live_chunk(&manager, &server_id, &dimension, chunk_x, chunk_z).await;
            ((chunk_x, chunk_z), snapshot)
        });
    }

    let mut snapshots = LiveChunkMap::new();
    while let Some(result) = requests.join_next().await {
        if let Ok((key, Some(snapshot))) = result {
            snapshots.insert(key, snapshot);
        }
    }
    snapshots
}

fn limited_chunk_range(minimum: i64, maximum: i64, center: i64) -> (i64, i64) {
    if maximum.saturating_sub(minimum).saturating_add(1) <= MAX_LIVE_CHUNKS_PER_AXIS {
        return (minimum, maximum);
    }
    let half = MAX_LIVE_CHUNKS_PER_AXIS / 2;
    let start = center.saturating_sub(half).clamp(
        minimum,
        maximum.saturating_sub(MAX_LIVE_CHUNKS_PER_AXIS - 1),
    );
    (start, start.saturating_add(MAX_LIVE_CHUNKS_PER_AXIS - 1))
}

async fn handle_bridge_connection(
    app: AppHandle,
    manager: Arc<MapBridgeManager>,
    server_id: String,
    config: BridgeConfig,
    stream: TcpStream,
) {
    let mut reader = BufReader::new(stream);
    let hello_result = match read_bridge_line(&mut reader).await {
        Ok(Some(line)) => serde_json::from_slice::<Value>(&line)
            .map_err(|error| format!("Invalid hello JSON: {error}"))
            .and_then(|value| parse_hello(&value))
            .and_then(|hello| {
                validate_hello(&hello, &config)?;
                Ok(hello)
            }),
        Ok(None) => return,
        Err(error) => {
            emit_bridge_status(
                &app,
                BridgeStatusPayload {
                    server_id: server_id.clone(),
                    status: "error".to_string(),
                    last_heartbeat: None,
                    message: Some(error),
                },
            );
            return;
        }
    };

    let mut stream = reader.into_inner();
    let hello = match hello_result {
        Ok(hello) => hello,
        Err(error) => {
            let reason = hello_rejection_reason(&error);
            let _ = stream
                .write_all(hello_ack(false, Some(reason)).as_bytes())
                .await;
            let _ = stream.flush().await;
            emit_bridge_status(
                &app,
                BridgeStatusPayload {
                    server_id: server_id.clone(),
                    status: "incompatible".to_string(),
                    last_heartbeat: None,
                    message: Some(error),
                },
            );
            return;
        }
    };

    let _ = hello;
    let _ = clear_restart_requirement(&app, &server_id);
    if stream
        .write_all(hello_ack(true, None).as_bytes())
        .await
        .is_err()
    {
        return;
    }
    let _ = stream.flush().await;
    set_runtime_status(&manager, &server_id, "connected", None).await;
    emit_bridge_status(
        &app,
        BridgeStatusPayload {
            server_id: server_id.clone(),
            status: "connected".to_string(),
            last_heartbeat: None,
            message: None,
        },
    );

    let (read_half, mut write_half) = stream.into_split();
    let (sender, mut receiver) = mpsc::channel::<String>(256);
    manager
        .sessions
        .lock()
        .await
        .insert(server_id.clone(), sender);
    let writer_task = tokio::spawn(async move {
        while let Some(message) = receiver.recv().await {
            if write_half.write_all(message.as_bytes()).await.is_err()
                || write_half.write_all(b"\n").await.is_err()
                || write_half.flush().await.is_err()
            {
                break;
            }
        }
    });
    let mut reader = BufReader::new(read_half);
    loop {
        let Some(line) = (match read_bridge_line(&mut reader).await {
            Ok(line) => line,
            Err(error) => {
                emit_bridge_status(
                    &app,
                    BridgeStatusPayload {
                        server_id: server_id.clone(),
                        status: "error".to_string(),
                        last_heartbeat: None,
                        message: Some(error),
                    },
                );
                break;
            }
        }) else {
            break;
        };

        let Ok(value) = serde_json::from_slice::<Value>(&line) else {
            continue;
        };
        let message_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        match message_type {
            "heartbeat" => {
                let heartbeat = current_timestamp();
                set_runtime_status(&manager, &server_id, "connected", Some(heartbeat)).await;
                emit_bridge_status(
                    &app,
                    BridgeStatusPayload {
                        server_id: server_id.clone(),
                        status: "connected".to_string(),
                        last_heartbeat: Some(heartbeat),
                        message: None,
                    },
                );
            }
            "player_snapshot" => {
                let _ = app.emit(
                    "map-players-updated",
                    serde_json::json!({ "serverId": server_id.clone(), "message": value }),
                );
            }
            "world_status" => match parse_world_status_message(value) {
                Ok(message) => {
                    let payload = WorldStatusEventPayload {
                        server_id: server_id.clone(),
                        message,
                    };
                    if let Err(error) = app.emit("map-world-status", payload) {
                        log::warn!(
                            "Failed to emit world_status for server {}: {}",
                            server_id,
                            error
                        );
                    }
                }
                Err(error) => {
                    log::warn!(
                        "Ignoring malformed world_status from server {}: {}",
                        server_id,
                        error
                    );
                }
            },
            "chat_message" => match parse_chat_message(value) {
                Ok(message) => {
                    let payload = ChatMessageEventPayload {
                        server_id: server_id.clone(),
                        message,
                    };
                    if let Err(error) = app.emit("map-chat-message", payload) {
                        log::warn!(
                            "Failed to emit chat_message for server {}: {}",
                            server_id,
                            error
                        );
                    }
                }
                Err(error) => {
                    log::warn!(
                        "Ignoring malformed chat_message from server {}: {}",
                        server_id,
                        error
                    );
                }
            },
            "chunk_dirty" => {
                if let (Some(dimension), Some(chunk_x), Some(chunk_z)) = (
                    value.get("dimension").and_then(Value::as_str),
                    value.get("chunkX").and_then(Value::as_i64),
                    value.get("chunkZ").and_then(Value::as_i64),
                ) {
                    invalidate_chunk_tiles(&manager, &server_id, dimension, chunk_x, chunk_z).await;
                    if let Ok(app_data) = app_data_dir(&app) {
                        if let Ok(root) = server_dir(&app_data, &server_id) {
                            let server_id_for_cache = server_id.clone();
                            let dimension = dimension.to_string();
                            let result = tokio::task::spawn_blocking(move || {
                                invalidate_disk_chunk_tiles(
                                    &root,
                                    &server_id_for_cache,
                                    &dimension,
                                    chunk_x,
                                    chunk_z,
                                )
                            })
                            .await;
                            if let Ok(Err(error)) = result {
                                let _ = app.emit(
                                    "map-error",
                                    serde_json::json!({
                                        "serverId": server_id.clone(),
                                        "message": error,
                                    }),
                                );
                            }
                        }
                    }
                }
                let _ = app.emit(
                    "map-tile-invalidated",
                    serde_json::json!({ "serverId": server_id.clone(), "message": value }),
                );
            }
            "chunk_snapshot" | "chunk_snapshot_unavailable" => {
                let request_id = value.get("requestId").and_then(Value::as_str);
                if let Some(request_id) = request_id {
                    if let Some(response_sender) =
                        manager.pending_snapshots.lock().await.remove(request_id)
                    {
                        let response = if message_type == "chunk_snapshot" {
                            decode_live_snapshot(&value)
                        } else {
                            Err(value
                                .get("reason")
                                .and_then(Value::as_str)
                                .unwrap_or("unavailable")
                                .to_string())
                        };
                        let _ = response_sender.send(response);
                    }
                }
            }
            "player_joined" | "player_quit" => {
                let _ = app.emit(
                    "map-bridge-message",
                    serde_json::json!({ "serverId": server_id.clone(), "message": value }),
                );
            }
            _ => {}
        }
    }

    manager.sessions.lock().await.remove(&server_id);
    writer_task.abort();
    set_runtime_status(&manager, &server_id, "disconnected", None).await;
    emit_bridge_status(
        &app,
        BridgeStatusPayload {
            server_id,
            status: "disconnected".to_string(),
            last_heartbeat: None,
            message: None,
        },
    );
}

async fn ensure_bridge_listener(
    app: AppHandle,
    manager: &MapBridgeManager,
    config: BridgeConfig,
) -> Result<(), String> {
    validate_bridge_config(&config, &config.server_id)?;
    if manager
        .listeners
        .lock()
        .await
        .contains_key(&config.server_id)
    {
        return Ok(());
    }

    let listener = TcpListener::bind((config.host.as_str(), config.port))
        .await
        .map_err(|error| format!("Failed to bind map bridge: {error}"))?;
    let server_id = config.server_id.clone();
    let manager_ref = Arc::new(manager.clone_for_tasks());
    let app_ref = app.clone();
    let config_ref = config.clone();
    let handle = tokio::spawn(async move {
        emit_bridge_status(
            &app_ref,
            BridgeStatusPayload {
                server_id: server_id.clone(),
                status: "disconnected".to_string(),
                last_heartbeat: None,
                message: None,
            },
        );
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(connection) => connection,
                Err(error) => {
                    emit_bridge_status(
                        &app_ref,
                        BridgeStatusPayload {
                            server_id: server_id.clone(),
                            status: "error".to_string(),
                            last_heartbeat: None,
                            message: Some(format!("Map bridge accept failed: {error}")),
                        },
                    );
                    break;
                }
            };
            let app_connection = app_ref.clone();
            let manager_connection = manager_ref.clone();
            let server_id_connection = server_id.clone();
            let config_connection = config_ref.clone();
            tokio::spawn(async move {
                handle_bridge_connection(
                    app_connection,
                    manager_connection,
                    server_id_connection,
                    config_connection,
                    stream,
                )
                .await;
            });
        }
    });

    let mut listeners = manager.listeners.lock().await;
    if listeners.contains_key(&config.server_id) {
        handle.abort();
    } else {
        listeners.insert(config.server_id.clone(), handle);
    }
    set_runtime_status(manager, &config.server_id, "disconnected", None).await;
    Ok(())
}

impl MapBridgeManager {
    fn clone_for_tasks(&self) -> Self {
        Self {
            listeners: Arc::clone(&self.listeners),
            statuses: Arc::clone(&self.statuses),
            tile_cache: Arc::clone(&self.tile_cache),
            inflight_tiles: Arc::clone(&self.inflight_tiles),
            asset_cache: Arc::clone(&self.asset_cache),
            sessions: Arc::clone(&self.sessions),
            pending_snapshots: Arc::clone(&self.pending_snapshots),
            live_snapshots: Arc::clone(&self.live_snapshots),
            tile_scheduler: Arc::clone(&self.tile_scheduler),
        }
    }
}

async fn stop_bridge_listener(manager: &MapBridgeManager, server_id: &str) {
    if let Some(handle) = manager.listeners.lock().await.remove(server_id) {
        handle.abort();
    }
    manager.statuses.lock().await.remove(server_id);
}

pub(crate) async fn prepare_bridge_for_server(
    app: AppHandle,
    manager: &MapBridgeManager,
    app_data_dir: &Path,
    server_id: &str,
) {
    let Ok(root) = server_dir(app_data_dir, server_id) else {
        return;
    };
    let Ok(Some(paths)) = map_paths(&root, false) else {
        return;
    };
    let Ok(Some(config)) = read_bridge_config(&paths.config) else {
        return;
    };
    if let Err(error) = ensure_bridge_listener(app, manager, config).await {
        log::warn!(
            "Map bridge listener unavailable for server {}: {}",
            server_id,
            error
        );
    }
}

async fn repair_map_bridge_impl(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let Some(paths) = map_paths(&root, false)? else {
        return Err("MC-Vector Core is not installed".to_string());
    };
    let metadata =
        load_metadata(&paths)?.ok_or_else(|| "Map component metadata is missing".to_string())?;
    validate_metadata(&metadata)?;
    if metadata.artifact_provenance != "managed" {
        return Err("Refusing to repair an unverified MC-Vector Core artifact".to_string());
    }
    if !existing_normal_file(&paths.active_jar)? && !existing_normal_file(&paths.disabled_jar)? {
        return Err("MC-Vector Core artifact is missing".to_string());
    }

    let inspection = inspect_bridge_config(&paths.config, Some(&server_id))?;
    let can_repair = match &inspection {
        BridgeConfigInspection::Missing => true,
        BridgeConfigInspection::Valid(_) => false,
        BridgeConfigInspection::Invalid(issue) => {
            issue.managed_by.as_deref() == Some("MC-Vector")
                && issue.server_id.as_deref() == Some(server_id.as_str())
        }
    };
    if !can_repair {
        if let BridgeConfigInspection::Invalid(issue) = inspection {
            return Err(issue.message);
        }
    }
    if can_repair {
        stop_bridge_listener(&manager, &server_id).await;
    }
    let config = write_bridge_config(&paths.config, &server_id)?;
    let running = servers.servers.lock().await.contains_key(&server_id);
    let mut metadata = metadata;
    metadata.restart_required = running;
    write_json_file(&paths.metadata, &metadata)?;
    ensure_bridge_listener(app.clone(), &manager, config).await?;
    build_status(&app, &manager, &server_id).await
}

fn png_coverage(bytes: &[u8]) -> (bool, f32) {
    let Ok(image) = image::load_from_memory(bytes) else {
        return (false, 0.0);
    };
    let rgba = image.to_rgba8();
    let total = rgba.width().saturating_mul(rgba.height());
    if total == 0 {
        return (false, 0.0);
    }
    let covered = rgba.pixels().filter(|pixel| pixel[3] > 0).count() as f32;
    (covered > 0.0, covered / total as f32)
}

fn emit_map_tile_ready(
    app: &AppHandle,
    key: &TileCacheKey,
    png: &[u8],
    rendered_chunk_count: usize,
    decode_failed_chunk_count: Option<usize>,
    asset_missing: bool,
    coverage: Option<(bool, f32)>,
    diagnostic: Option<&str>,
) {
    let (has_terrain, coverage_ratio) = coverage.unwrap_or_else(|| png_coverage(png));
    let render_state = tile_render_state(asset_missing, has_terrain, diagnostic);
    let _ = app.emit(
        "map-tile-ready",
        serde_json::json!({
            "serverId": key.server_id,
            "worldId": key.world_id,
            "zoom": key.zoom,
            "tileX": key.tile_x,
            "tileY": key.tile_y,
            "hasTerrain": has_terrain,
            "renderState": render_state,
            "coverageRatio": coverage_ratio,
            "renderedChunkCount": rendered_chunk_count,
            "decodeFailedChunkCount": decode_failed_chunk_count,
            "message": diagnostic.map_or_else(
                || {
                    if has_terrain {
                        serde_json::Value::Null
                    } else {
                        serde_json::Value::String("No generated terrain intersects this tile".to_string())
                    }
                },
                |message| serde_json::Value::String(message.to_string()),
            ),
        }),
    );
}

fn tile_render_state(
    asset_missing: bool,
    has_terrain: bool,
    diagnostic: Option<&str>,
) -> &'static str {
    if asset_missing {
        "asset_missing"
    } else if diagnostic.is_some() {
        "error"
    } else if has_terrain {
        "terrain"
    } else {
        "empty"
    }
}

fn emit_map_render_progress(app: &AppHandle, key: &TileCacheKey, progress: RenderProgress) {
    let _ = app.emit(
        "map-render-progress",
        serde_json::json!({
            "serverId": key.server_id,
            "worldId": key.world_id,
            "zoom": key.zoom,
            "tileX": key.tile_x,
            "tileY": key.tile_y,
            "state": progress.state,
            "completed": progress.completed,
            "total": progress.total,
            "message": progress.message,
        }),
    );
}

async fn enable_map_impl(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let Some(paths) = map_paths(&root, true)? else {
        return Err("Failed to prepare the plugins directory".to_string());
    };
    let active = existing_normal_file(&paths.active_jar)?;
    let disabled = existing_normal_file(&paths.disabled_jar)?;
    if active && disabled {
        return Err("Both active and disabled MC-Vector Core files exist".to_string());
    }

    let metadata = load_metadata(&paths)?.unwrap_or_else(default_metadata);
    validate_metadata(&metadata)?;
    if active && metadata.artifact_provenance != "managed" {
        return Err("Refusing to overwrite an unknown same-named plugin JAR".to_string());
    }
    if disabled {
        if metadata.artifact_provenance != "managed" {
            return Err("Refusing to restore an unknown same-named plugin JAR".to_string());
        }
        fs::rename(&paths.disabled_jar, &paths.active_jar)
            .map_err(|error| format!("Failed to restore MC-Vector Core: {error}"))?;
    }

    let mut metadata = metadata;
    metadata.removal_requested = false;
    if !active && !disabled {
        if let Some(source) = locate_core_artifact(&app) {
            install_core_artifact(&source, &paths.active_jar)?;
            metadata.artifact_provenance = "managed".to_string();
        }
    }
    metadata.restart_required = servers.servers.lock().await.contains_key(&server_id)
        && (active || disabled || existing_normal_file(&paths.active_jar)?);
    write_json_file(&paths.metadata, &metadata)?;
    let config = write_bridge_config(&paths.config, &server_id)?;
    ensure_bridge_listener(app.clone(), &manager, config).await?;
    build_status(&app, &manager, &server_id).await
}

async fn pause_map_impl(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let Some(paths) = map_paths(&root, false)? else {
        return Err("MC-Vector Core is not installed".to_string());
    };
    let mut metadata = load_metadata(&paths)?
        .ok_or_else(|| "Refusing to rename an unknown same-named plugin JAR".to_string())?;
    validate_metadata(&metadata)?;
    if metadata.artifact_provenance != "managed" {
        return Err("Refusing to rename an unverified plugin JAR".to_string());
    }
    let active = existing_normal_file(&paths.active_jar)?;
    let disabled = existing_normal_file(&paths.disabled_jar)?;
    if active && disabled {
        return Err("Both active and disabled MC-Vector Core files exist".to_string());
    }
    if active {
        stop_bridge_listener(&manager, &server_id).await;
        fs::rename(&paths.active_jar, &paths.disabled_jar)
            .map_err(|error| format!("Failed to pause MC-Vector Core: {error}"))?;
    } else if !disabled {
        return Err("MC-Vector Core artifact is missing".to_string());
    }
    metadata.restart_required = servers.servers.lock().await.contains_key(&server_id);
    write_json_file(&paths.metadata, &metadata)?;
    build_status(&app, &manager, &server_id).await
}

async fn restore_map_impl(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let Some(paths) = map_paths(&root, false)? else {
        return Err("MC-Vector Core is not installed".to_string());
    };
    let mut metadata = load_metadata(&paths)?
        .ok_or_else(|| "Refusing to restore an unknown same-named plugin JAR".to_string())?;
    validate_metadata(&metadata)?;
    if metadata.artifact_provenance != "managed" {
        return Err("Refusing to restore an unverified plugin JAR".to_string());
    }
    if existing_normal_file(&paths.active_jar)? {
        metadata.restart_required = servers.servers.lock().await.contains_key(&server_id);
        write_json_file(&paths.metadata, &metadata)?;
        let config = write_bridge_config(&paths.config, &server_id)?;
        ensure_bridge_listener(app.clone(), &manager, config).await?;
        return build_status(&app, &manager, &server_id).await;
    }
    if !existing_normal_file(&paths.disabled_jar)? {
        return Err("MC-Vector Core paused artifact is missing".to_string());
    }
    fs::rename(&paths.disabled_jar, &paths.active_jar)
        .map_err(|error| format!("Failed to restore MC-Vector Core: {error}"))?;
    metadata.restart_required = servers.servers.lock().await.contains_key(&server_id);
    write_json_file(&paths.metadata, &metadata)?;
    let config = write_bridge_config(&paths.config, &server_id)?;
    ensure_bridge_listener(app.clone(), &manager, config).await?;
    build_status(&app, &manager, &server_id).await
}

async fn remove_map_component_impl(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let Some(paths) = map_paths(&root, false)? else {
        return build_status(&app, &manager, &server_id).await;
    };
    let mut metadata = load_metadata(&paths)?.unwrap_or_else(default_metadata);
    validate_metadata(&metadata)?;

    let running = servers.servers.lock().await.contains_key(&server_id);
    if running {
        metadata.removal_requested = true;
        write_json_file(&paths.metadata, &metadata)?;
        return build_status(&app, &manager, &server_id).await;
    }

    let active = existing_normal_file(&paths.active_jar)?;
    let disabled = existing_normal_file(&paths.disabled_jar)?;
    if active && metadata.artifact_provenance != "managed" {
        return Err("Refusing to delete an unknown same-named plugin JAR".to_string());
    }
    if disabled && metadata.artifact_provenance != "managed" {
        return Err("Refusing to delete an unknown disabled plugin JAR".to_string());
    }

    stop_bridge_listener(&manager, &server_id).await;
    remove_map_cache(&root)?;
    manager
        .tile_cache
        .lock()
        .await
        .remove_where(|key| key.server_id == server_id);
    manager
        .live_snapshots
        .lock()
        .await
        .remove_server(&server_id);
    manager
        .asset_cache
        .lock()
        .map_err(|_| "Map asset cache is poisoned".to_string())?
        .remove(&server_id);
    if active {
        fs::remove_file(&paths.active_jar)
            .map_err(|error| format!("Failed to remove MC-Vector Core: {error}"))?;
    }
    if disabled {
        fs::remove_file(&paths.disabled_jar)
            .map_err(|error| format!("Failed to remove paused MC-Vector Core: {error}"))?;
    }
    for path in [&paths.config, &paths.metadata, &paths.assets] {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!("Failed to remove managed map metadata: {error}"));
            }
        }
    }

    build_status(&app, &manager, &server_id).await
}

async fn render_map_tile(
    app: AppHandle,
    manager: Arc<MapBridgeManager>,
    server_id: String,
    world_id: String,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    priority: TilePriority,
) -> Result<tauri::ipc::Response, String> {
    let _ = app_data_dir(&app)?;
    if server_id.trim().is_empty() || world_id.trim().is_empty() {
        return Err("Server and world IDs are required".to_string());
    }
    if zoom > MAX_ZOOM {
        return Err(format!("Zoom must be between 0 and {MAX_ZOOM}"));
    }

    let app_data = app_data_dir(&app)?;
    let server_root = server_dir(&app_data, &server_id)?;
    let world_root = resolve_world_directory(&server_root, &world_id)?;
    let minecraft_version = map_minecraft_version(&server_root)?;
    let asset_cache = Arc::clone(&manager.asset_cache);
    let asset_server_id = server_id.clone();
    let asset_server_root = server_root.clone();
    let assets = tokio::task::spawn_blocking(move || {
        let mut cache = asset_cache
            .lock()
            .map_err(|_| "Map asset cache is poisoned".to_string())?;
        if let Some(assets) = cache.get(&asset_server_id) {
            return Ok::<_, String>(Some(Arc::clone(assets)));
        }
        let loaded = map_assets::load_for_server(&asset_server_root)
            .map_err(|error| format!("Failed to load Minecraft map assets: {error}"))?;
        let loaded = loaded.map(Arc::new);
        if let Some(assets) = loaded.as_ref() {
            cache.insert(asset_server_id, Arc::clone(assets));
        }
        Ok(loaded)
    })
    .await
    .map_err(|error| format!("Map asset worker failed: {error}"))??;

    let resource_pack_hash = assets
        .as_ref()
        .map(|assets| assets.identity.clone())
        .unwrap_or_else(|| "fallback".to_string());
    let asset_manifest_version = assets
        .as_ref()
        .map(|assets| format!("v{}", assets.manifest.manifest_version))
        .unwrap_or_else(|| "fallback".to_string());
    let key = TileCacheKey::new(
        server_id,
        world_id,
        minecraft_version,
        resource_pack_hash,
        asset_manifest_version,
        TILE_RENDERER_VERSION,
        DEFAULT_PERSPECTIVE,
        zoom,
        tile_x,
        tile_y,
    );

    if let Some(cached) = manager.tile_cache.lock().await.get(&key) {
        emit_map_tile_ready(
            &app,
            &key,
            &cached.bytes,
            cached.metadata.rendered_chunk_count,
            None,
            assets.is_none(),
            Some((cached.metadata.has_terrain, cached.metadata.coverage_ratio)),
            cached.metadata.message.as_deref(),
        );
        return Ok(tauri::ipc::Response::new(cached.bytes));
    }
    if let Some(cached) = read_disk_tile(&server_root, &key)? {
        manager
            .tile_cache
            .lock()
            .await
            .insert(key.clone(), cached.clone());
        emit_map_tile_ready(
            &app,
            &key,
            &cached.bytes,
            cached.metadata.rendered_chunk_count,
            None,
            assets.is_none(),
            Some((cached.metadata.has_terrain, cached.metadata.coverage_ratio)),
            cached.metadata.message.as_deref(),
        );
        return Ok(tauri::ipc::Response::new(cached.bytes));
    }

    if let Some(receiver) = join_inflight_tile(&manager, &key).await? {
        return match receiver.await {
            Ok(Ok(tile)) => Ok(tauri::ipc::Response::new(tile)),
            Ok(Err(error)) => Err(error),
            Err(_) => Err("Map tile render request was cancelled".to_string()),
        };
    }

    let tile_key = key.clone();
    let tile_permit = manager.tile_scheduler.acquire(key.clone(), priority).await;
    let tile_result: Result<Vec<u8>, String> = async {
        let _tile_permit = tile_permit?;
        emit_map_render_progress(&app, &key, RenderProgress::rendering(0, 1));

        let asset_missing = assets.is_none();
        let dimension = match key.world_id.as_str() {
            "overworld" => "minecraft:overworld",
            "world_nether" => "minecraft:the_nether",
            "world_the_end" => "minecraft:the_end",
            other => other,
        };
        let tile_bounds = TileWorldBounds::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
        let live_chunks =
            request_live_chunks_for_tile(&manager, &key.server_id, dimension, tile_bounds).await;

        let rendered = tokio::task::spawn_blocking(move || {
            render_world_tile_detailed(
                &world_root,
                zoom,
                tile_x,
                tile_y,
                assets.as_deref(),
                Some(&live_chunks),
            )
            .map_err(|error| format!("Failed to render map tile: {error}"))
        })
        .await
        .map_err(|error| format!("Map tile worker failed: {error}"))??;
        let tile = rendered.png;
        emit_map_tile_ready(
            &app,
            &tile_key,
            &tile,
            rendered.rendered_chunk_count,
            Some(rendered.decode_failed_chunk_count),
            asset_missing,
            Some((rendered.has_terrain, rendered.coverage_ratio)),
            rendered.message.as_deref(),
        );
        let progress_state = if asset_missing {
            TileRenderState::AssetMissing
        } else if rendered.has_terrain {
            TileRenderState::Terrain
        } else {
            TileRenderState::Empty
        };
        emit_map_render_progress(
            &app,
            &tile_key,
            RenderProgress::completed(progress_state, rendered.message.clone()),
        );

        let cached = CachedTile {
            bytes: tile.clone(),
            metadata: TileMetadata {
                rendered_chunk_count: rendered.rendered_chunk_count,
                has_terrain: rendered.has_terrain,
                coverage_ratio: rendered.coverage_ratio,
                message: rendered.message,
            },
        };
        manager
            .tile_cache
            .lock()
            .await
            .insert(tile_key.clone(), cached.clone());
        if let Err(error) = write_disk_tile(&server_root, &tile_key, &cached) {
            // A completed render is still usable when the optional persistent
            // cache cannot be written (for example, a read-only server root or
            // a transient filesystem error). Keep the in-memory tile and make
            // the cache failure observable without turning a valid PNG into a
            // render failure.
            let _ = app.emit(
                "map-error",
                serde_json::json!({
                    "serverId": tile_key.server_id,
                    "scope": "tile_cache",
                    "message": error,
                }),
            );
        }
        Ok(tile)
    }
    .await;

    if let Err(error) = &tile_result {
        emit_map_render_progress(&app, &key, RenderProgress::error(error.clone()));
    }

    finish_inflight_tile(&manager, &key, tile_result)
        .await
        .map(tauri::ipc::Response::new)
}

async fn request_map_render_impl(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
    world_id: String,
    viewport: MapViewport,
) -> Result<MapRenderRequestResult, String> {
    if server_id.trim().is_empty() || world_id.trim().is_empty() {
        return Err("Server and world IDs are required".to_string());
    }
    let coordinates = viewport_tile_coordinates(&viewport)?;
    let requested = coordinates.len();
    let blocks_per_pixel = (1_i64 << (MAX_ZOOM - viewport.zoom)) as f64;
    let tile_world_size = f64::from(TILE_SIZE) * blocks_per_pixel;
    let center_tile_x = (viewport.center_x / tile_world_size).floor() as i32;
    let center_tile_y = (viewport.center_z / tile_world_size).floor() as i32;
    let shared_manager = Arc::new(manager.inner().clone());
    let mut accepted = 0;
    for (tile_x, tile_y) in coordinates {
        let app = app.clone();
        let manager = Arc::clone(&shared_manager);
        let server_id = server_id.clone();
        let world_id = world_id.clone();
        let priority = if tile_x == center_tile_x && tile_y == center_tile_y {
            TilePriority::Viewport
        } else {
            TilePriority::Adjacent
        };
        tokio::spawn(async move {
            if let Err(error) = render_map_tile(
                app.clone(),
                manager,
                server_id.clone(),
                world_id,
                viewport.zoom,
                tile_x,
                tile_y,
                priority,
            )
            .await
            {
                let _ = app.emit(
                    "map-error",
                    serde_json::json!({
                        "serverId": server_id,
                        "scope": "tile",
                        "message": error,
                    }),
                );
            }
        });
        accepted += 1;
    }
    Ok(MapRenderRequestResult {
        requested,
        accepted,
    })
}

fn viewport_tile_coordinates(viewport: &MapViewport) -> Result<Vec<(i32, i32)>, String> {
    if !viewport.center_x.is_finite() || !viewport.center_z.is_finite() {
        return Err("Map viewport center must be finite".to_string());
    }
    if viewport.zoom > MAX_ZOOM {
        return Err(format!("Zoom must be between 0 and {MAX_ZOOM}"));
    }
    let width = viewport.width.clamp(256, 4096) as f64;
    let height = viewport.height.clamp(256, 4096) as f64;
    let blocks_per_pixel = (1_i64 << (MAX_ZOOM - viewport.zoom)) as f64;
    let tile_world_size = f64::from(TILE_SIZE) * blocks_per_pixel;
    let min_x =
        ((viewport.center_x - width * blocks_per_pixel / 2.0) / tile_world_size).floor() as i64 - 1;
    let max_x =
        ((viewport.center_x + width * blocks_per_pixel / 2.0) / tile_world_size).floor() as i64 + 1;
    let min_y = ((viewport.center_z - height * blocks_per_pixel / 2.0) / tile_world_size).floor()
        as i64
        - 1;
    let max_y = ((viewport.center_z + height * blocks_per_pixel / 2.0) / tile_world_size).floor()
        as i64
        + 1;
    let mut coordinates = Vec::new();
    for tile_y in min_y..=max_y {
        for tile_x in min_x..=max_x {
            if let (Ok(tile_x), Ok(tile_y)) = (i32::try_from(tile_x), i32::try_from(tile_y)) {
                coordinates.push((tile_x, tile_y));
            }
            if coordinates.len() >= 64 {
                return Ok(coordinates);
            }
        }
    }
    Ok(coordinates)
}

fn resolve_world_directory(server_root: &Path, world_id: &str) -> Result<PathBuf, String> {
    let world_path = if world_id == "overworld" {
        server_root.join("world")
    } else {
        let normalized = world_id.trim();
        if normalized.is_empty()
            || normalized == "."
            || normalized == ".."
            || normalized.contains(['/', '\\', ':'])
            || normalized.chars().any(char::is_control)
        {
            return Err("World ID must be a single safe identifier".to_string());
        }
        server_root.join(normalized)
    };

    match fs::symlink_metadata(&world_path) {
        Ok(metadata) if metadata.is_dir() && !is_link_or_reparse_point(&metadata) => Ok(world_path),
        Ok(_) => Err("World path is not a normal directory".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(world_path),
        Err(error) => Err(format!("Failed to inspect world directory: {error}")),
    }
}

fn map_minecraft_version(server_root: &Path) -> Result<String, String> {
    let Some(paths) = map_paths(server_root, false)? else {
        return Ok("unknown".to_string());
    };
    Ok(read_bridge_config(&paths.config)?
        .map(|config| config.minecraft_version)
        .unwrap_or_else(|| "unknown".to_string()))
}

async fn join_inflight_tile(
    manager: &MapBridgeManager,
    key: &TileCacheKey,
) -> Result<Option<oneshot::Receiver<Result<Vec<u8>, String>>>, String> {
    let mut inflight = manager.inflight_tiles.lock().await;
    if let Some(waiters) = inflight.get_mut(key) {
        let (sender, receiver) = oneshot::channel();
        waiters.push(sender);
        return Ok(Some(receiver));
    }

    inflight.insert(key.clone(), Vec::new());
    Ok(None)
}

async fn finish_inflight_tile(
    manager: &MapBridgeManager,
    key: &TileCacheKey,
    result: Result<Vec<u8>, String>,
) -> Result<Vec<u8>, String> {
    let waiters = manager
        .inflight_tiles
        .lock()
        .await
        .remove(key)
        .unwrap_or_default();
    for waiter in waiters {
        let _ = waiter.send(result.clone());
    }
    result
}

fn cache_segment(value: &str) -> String {
    let segment: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect();
    if segment.is_empty() {
        "unknown".to_string()
    } else {
        segment
    }
}

fn cache_directory_segments(key: &TileCacheKey) -> [String; 10] {
    [
        "map-cache".to_string(),
        cache_segment(&key.server_id),
        cache_segment(&key.world_id),
        cache_segment(&key.minecraft_version),
        cache_segment(&key.resource_pack_hash),
        cache_segment(&key.asset_manifest_version),
        cache_segment(&key.renderer_version),
        cache_segment(&key.perspective),
        key.zoom.to_string(),
        key.tile_x.to_string(),
    ]
}

fn tile_cache_directory(
    server_root: &Path,
    key: &TileCacheKey,
    create: bool,
) -> Result<Option<PathBuf>, String> {
    let mut current = server_root.to_path_buf();
    for segment in cache_directory_segments(key) {
        current.push(segment);
        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                    return Err(format!(
                        "Map tile cache path is not a normal directory: {}",
                        current.display()
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && !create => {
                return Ok(None);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir_all(&current).map_err(|error| {
                    format!("Failed to create map tile cache directory: {error}")
                })?;
                let metadata = fs::symlink_metadata(&current).map_err(|error| {
                    format!("Failed to inspect map tile cache directory: {error}")
                })?;
                if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                    return Err(format!(
                        "Created map tile cache path is not a normal directory: {}",
                        current.display()
                    ));
                }
            }
            Err(error) => {
                return Err(format!(
                    "Failed to inspect map tile cache directory: {error}"
                ));
            }
        }
    }
    Ok(Some(current))
}

fn read_disk_tile(server_root: &Path, key: &TileCacheKey) -> Result<Option<CachedTile>, String> {
    let Some(directory) = tile_cache_directory(server_root, key, false)? else {
        return Ok(None);
    };
    let png_path = directory.join(format!("{}.png", key.tile_y));
    let Some(bytes) = crate::map::tiles::read_png(&png_path)? else {
        return Ok(None);
    };
    let metadata_path = directory.join(format!("{}.json", key.tile_y));
    let metadata = crate::map::tiles::read_metadata(&metadata_path)?.unwrap_or_else(|| {
        let (has_terrain, coverage_ratio) = png_coverage(&bytes);
        TileMetadata {
            rendered_chunk_count: 0,
            has_terrain,
            coverage_ratio,
            message: None,
        }
    });
    Ok(Some(CachedTile { bytes, metadata }))
}

fn remove_map_cache(server_root: &Path) -> Result<(), String> {
    let path = server_root.join("map-cache");
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Failed to inspect map tile cache: {error}")),
    };
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err(format!(
            "Refusing to remove a non-managed map tile cache path: {}",
            path.display()
        ));
    }
    fs::remove_dir_all(path).map_err(|error| format!("Failed to remove map tile cache: {error}"))
}

fn write_disk_tile(
    server_root: &Path,
    key: &TileCacheKey,
    tile: &CachedTile,
) -> Result<(), String> {
    let Some(directory) = tile_cache_directory(server_root, key, true)? else {
        return Err("Map tile cache directory could not be created".to_string());
    };
    let png_path = directory.join(format!("{}.png", key.tile_y));
    if let Ok(metadata) = fs::symlink_metadata(&png_path) {
        if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
            return Err(format!(
                "Refusing to replace a non-regular cached map tile: {}",
                png_path.display()
            ));
        }
    }
    crate::map::tiles::write_png_atomic(&png_path, &tile.bytes)?;
    let metadata_path = directory.join(format!("{}.json", key.tile_y));
    crate::map::tiles::write_metadata_atomic(&metadata_path, &tile.metadata)
}

fn recommended_zoom(min_chunk_x: i64, max_chunk_x: i64, min_chunk_z: i64, max_chunk_z: i64) -> u8 {
    let span_x = (max_chunk_x - min_chunk_x + 1).max(1) * 16;
    let span_z = (max_chunk_z - min_chunk_z + 1).max(1) * 16;
    (0..=MAX_ZOOM)
        .rev()
        .find(|zoom| {
            let tile_world_size = i64::from(TILE_SIZE) * (1_i64 << (MAX_ZOOM - *zoom));
            span_x <= tile_world_size * 3 && span_z <= tile_world_size * 3
        })
        .unwrap_or(0)
}

fn inspect_world_info(world_root: &Path, world_id: &str) -> Result<MapWorldInfo, String> {
    let mut chunks = Vec::new();
    for index in enumerate_region_files(world_root)? {
        chunks.extend(index.present_chunks().iter().copied());
    }
    chunks.sort_unstable();
    chunks.dedup();
    let min_chunk_x = chunks.iter().map(|(x, _)| *x).min();
    let max_chunk_x = chunks.iter().map(|(x, _)| *x).max();
    let min_chunk_z = chunks.iter().map(|(_, z)| *z).min();
    let max_chunk_z = chunks.iter().map(|(_, z)| *z).max();
    let metadata = read_level_metadata(world_root)?;
    let (center_x, center_z, recommended_zoom) =
        match (min_chunk_x, max_chunk_x, min_chunk_z, max_chunk_z) {
            (Some(min_x), Some(max_x), Some(min_z), Some(max_z)) => {
                let generated_center = (
                    ((min_x + max_x + 1) * 16) / 2,
                    ((min_z + max_z + 1) * 16) / 2,
                );
                let center = metadata
                    .as_ref()
                    .and_then(|metadata| metadata.spawn_x.zip(metadata.spawn_z))
                    .unwrap_or(generated_center);
                (
                    center.0,
                    center.1,
                    recommended_zoom(min_x, max_x, min_z, max_z),
                )
            }
            _ => (0, 0, MAX_ZOOM),
        };
    Ok(MapWorldInfo {
        world_id: world_id.to_string(),
        has_terrain: !chunks.is_empty(),
        generated_chunk_count: chunks.len(),
        min_chunk_x,
        max_chunk_x,
        min_chunk_z,
        max_chunk_z,
        center_x,
        center_z,
        spawn_x: metadata.as_ref().and_then(|metadata| metadata.spawn_x),
        spawn_y: metadata.as_ref().and_then(|metadata| metadata.spawn_y),
        spawn_z: metadata.as_ref().and_then(|metadata| metadata.spawn_z),
        data_version: metadata.as_ref().and_then(|metadata| metadata.data_version),
        world_border: metadata.as_ref().and_then(|metadata| {
            metadata.world_border.as_ref().map(|border| MapWorldBorder {
                center_x: border.center_x,
                center_z: border.center_z,
                size: border.size,
                warning_blocks: border.warning_blocks,
                warning_time: border.warning_time,
            })
        }),
        recommended_zoom,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::map::bridge::config::CORE_PLUGIN_VERSION;
    use crate::map::bridge::protocol::{HelloRequest, MAX_CHAT_MESSAGE_BYTES};
    use crate::map::projection::floor_mod;
    use crate::map::renderer::world_tile::{
        existing_chunk_coordinates_for_tile, render_overview_tile,
    };
    use crate::map::world::{ChunkLayer, ChunkSourceKind};
    use base64::Engine;
    use flate2::{write::ZlibEncoder, Compression};
    use std::io::Write;

    fn test_config() -> BridgeConfig {
        BridgeConfig {
            managed_by: "MC-Vector".to_string(),
            schema_version: 1,
            server_id: "server-1".to_string(),
            host: "127.0.0.1".to_string(),
            port: 45_678,
            token: "1234567890abcdef".to_string(),
            protocol_version: MAP_PROTOCOL_VERSION,
            plugin_version: CORE_PLUGIN_VERSION.to_string(),
            minecraft_version: "1.21.x".to_string(),
        }
    }

    fn config_text(config: &BridgeConfig) -> String {
        format!(
            "managed-by: {}\nschema-version: {}\nserver-id: {}\nhost: {}\nport: {}\ntoken: {}\nprotocol-version: {}\nplugin-version: {}\nminecraft-version: {}\n",
            config.managed_by,
            config.schema_version,
            config.server_id,
            config.host,
            config.port,
            config.token,
            config.protocol_version,
            config.plugin_version,
            config.minecraft_version,
        )
    }

    fn live_test_snapshot(chunk_x: i64, chunk_z: i64) -> ChunkView {
        ChunkView::new(
            ChunkKey::new("minecraft:overworld", chunk_x, chunk_z),
            -64,
            320,
            (0..256)
                .map(|_| {
                    vec![ChunkLayer {
                        y: 64,
                        state: "minecraft:grass_block".to_string(),
                        biome: "minecraft:plains".to_string(),
                        sky_light: 15,
                        block_light: 0,
                    }]
                })
                .collect(),
            0,
            None,
            ChunkSourceKind::LiveSnapshot,
        )
        .expect("live test snapshot should be valid")
    }

    #[test]
    fn hello_requires_matching_server_and_token() {
        let config = test_config();
        let hello = HelloRequest {
            protocol_version: MAP_PROTOCOL_VERSION,
            server_id: "server-1".to_string(),
            token: "1234567890abcdef".to_string(),
        };
        assert!(validate_hello(&hello, &config).is_ok());

        let mut invalid = hello.clone();
        invalid.token = "wrong-token".to_string();
        assert!(validate_hello(&invalid, &config).is_err());

        invalid = hello;
        invalid.server_id = "server-2".to_string();
        assert!(validate_hello(&invalid, &config).is_err());
    }

    #[test]
    fn hello_rejection_ack_uses_stable_non_sensitive_reason_codes() {
        assert_eq!(
            hello_ack(true, None),
            "{\"type\":\"hello_ack\",\"accepted\":true,\"protocolVersion\":2}\n"
        );
        assert_eq!(
            hello_rejection_reason("Unsupported bridge protocol version"),
            "protocol_mismatch"
        );
        assert_eq!(
            hello_rejection_reason("Bridge server ID does not match the listener"),
            "server_mismatch"
        );
        assert_eq!(
            hello_rejection_reason("Bridge authentication failed"),
            "authentication_failed"
        );

        let rejection = hello_ack(false, Some("authentication_failed"));
        assert_eq!(
            rejection,
            "{\"type\":\"hello_ack\",\"accepted\":false,\"reason\":\"authentication_failed\"}\n"
        );
        assert!(!rejection.contains("1234567890abcdef"));
    }

    #[test]
    fn component_state_protects_unknown_same_named_files() {
        let (state, message) = component_state(true, false, None);
        assert_eq!(state, "conflict");
        assert!(message.is_some());

        let mut metadata = default_metadata();
        metadata.artifact_provenance = "managed".to_string();
        let (state, message) = component_state(true, false, Some(&metadata));
        assert_eq!(state, "active");
        assert!(message.is_none());

        metadata.restart_required = true;
        let (state, message) = component_state(true, false, Some(&metadata));
        assert_eq!(state, "waiting_restart");
        assert!(message.is_some());
    }

    #[test]
    fn stale_bridge_config_is_reported_without_becoming_a_fatal_status_error() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-config-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("test root should be created");
        let path = root.join("mc-vector-core.yml");
        let mut config = test_config();
        config.protocol_version = 1;
        fs::write(&path, config_text(&config)).expect("config should be written");

        let inspection =
            inspect_bridge_config(&path, Some("server-1")).expect("inspection should run");
        match inspection {
            BridgeConfigInspection::Invalid(issue) => {
                assert_eq!(issue.state, "stale");
                assert_eq!(issue.reason, "protocol_mismatch");
                assert_eq!(issue.managed_by.as_deref(), Some("MC-Vector"));
                assert_eq!(issue.server_id.as_deref(), Some("server-1"));
            }
            other => panic!("expected stale config, got {other:?}"),
        }
        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn config_for_another_server_is_a_conflict_and_is_not_repairable() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-conflict-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("test root should be created");
        let path = root.join("mc-vector-core.yml");
        let mut config = test_config();
        config.server_id = "other-server".to_string();
        fs::write(&path, config_text(&config)).expect("config should be written");

        let inspection =
            inspect_bridge_config(&path, Some("server-1")).expect("inspection should run");
        match inspection {
            BridgeConfigInspection::Invalid(issue) => {
                assert_eq!(issue.state, "conflict");
                assert_eq!(issue.reason, "server_mismatch");
            }
            other => panic!("expected conflict config, got {other:?}"),
        }
        let error =
            write_bridge_config(&path, "server-1").expect_err("conflict must not be overwritten");
        assert!(error.contains("another server"));
        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn empty_world_tile_is_a_png() {
        let root = std::env::temp_dir().join(format!("mc-vector-map-test-{}", Uuid::new_v4()));
        let png = render_world_tile_detailed(&root, MAX_ZOOM, 0, 0, None, None)
            .expect("PNG should render")
            .png;
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(png.len() > 100);
    }

    #[test]
    fn overview_decode_failures_are_counted_and_select_error_state() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-decode-error-{}", Uuid::new_v4()));
        let region_dir = root.join("region");
        fs::create_dir_all(&region_dir).expect("region directory should be created");
        let mut header = vec![0u8; 8192];
        header[2] = 2;
        header[3] = 1;
        fs::write(region_dir.join("r.0.0.mca"), &header).expect("region header should be written");

        let result = render_overview_tile(&root, MAX_ZOOM, 0, 0, None, None)
            .expect("overview should render despite a bad chunk");
        assert_eq!(result.rendered_chunk_count, 0);
        assert_eq!(result.decode_failed_chunk_count, 1);
        assert_eq!(
            tile_render_state(false, result.has_terrain, result.message.as_deref()),
            "error"
        );
        assert_eq!(tile_render_state(false, false, None), "empty");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn overview_tile_keeps_live_generated_chunk_visible() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-overview-test-{}", Uuid::new_v4()));
        let snapshot = live_test_snapshot(0, 0);
        let live_chunks = HashMap::from([((0, 0), snapshot)]);
        let detailed = render_world_tile_detailed(&root, 0, 0, 0, None, Some(&live_chunks))
            .expect("overview should render");
        let (has_terrain, coverage) = png_coverage(&detailed.png);
        assert!(has_terrain);
        assert!(coverage > 0.0);
        assert_eq!(detailed.rendered_chunk_count, 1);
    }

    #[test]
    fn region_header_enumeration_supports_sparse_and_negative_chunks() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-region-test-{}", Uuid::new_v4()));
        let region_dir = root.join("region");
        fs::create_dir_all(&region_dir).expect("region directory should be created");
        let mut header = vec![0u8; 8192];
        let positive_index = 4 * (3 + 4 * 32);
        header[positive_index + 2] = 2;
        header[positive_index + 3] = 1;
        fs::write(region_dir.join("r.0.0.mca"), &header)
            .expect("positive region should be written");

        let negative_index = 4 * (31 + 31 * 32);
        header[negative_index + 2] = 2;
        header[negative_index + 3] = 1;
        fs::write(region_dir.join("r.-1.-1.mca"), &header)
            .expect("negative region should be written");

        let positive = existing_chunk_coordinates_for_tile(&root, 0, 0, 0)
            .expect("positive chunks should be enumerated");
        assert!(positive.contains(&(3, 4)));
        let negative = existing_chunk_coordinates_for_tile(&root, MAX_ZOOM, -1, -1)
            .expect("negative chunks should be enumerated");
        assert!(negative.contains(&(-1, -1)));
        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn negative_world_coordinates_use_floor_division() {
        assert_eq!(floor_div(-1, 16), -1);
        assert_eq!(floor_mod(-1, 16), 15);
        assert_eq!(floor_div(-16, 16), -1);
        assert_eq!(floor_mod(-16, 16), 0);
    }

    #[test]
    fn dirty_chunk_invalidation_is_limited_to_intersecting_tiles() {
        let key = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "sha256:test",
            "v1",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            MAX_ZOOM,
            0,
            0,
        );
        assert!(crate::map::tiles::tile_intersects_chunk(&key, 0, 0));
        assert!(crate::map::tiles::tile_intersects_chunk(&key, 15, 15));
        assert!(!crate::map::tiles::tile_intersects_chunk(&key, 16, 0));
        assert!(!crate::map::tiles::tile_intersects_chunk(&key, 0, -1));
        assert!(dimension_matches_world("overworld", "minecraft:overworld"));
        assert!(!dimension_matches_world(
            "overworld",
            "minecraft:the_nether"
        ));
    }

    #[tokio::test]
    async fn dirty_chunk_invalidation_removes_only_matching_memory_tiles() {
        let manager = MapBridgeManager::default();
        let matching = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            MAX_ZOOM,
            0,
            0,
        );
        let unrelated_tile = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            MAX_ZOOM,
            1,
            0,
        );
        let unrelated_server = TileCacheKey::new(
            "server-2",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            MAX_ZOOM,
            0,
            0,
        );

        {
            let mut cache = manager.tile_cache.lock().await;
            for key in [
                matching.clone(),
                unrelated_tile.clone(),
                unrelated_server.clone(),
            ] {
                cache.insert(
                    key,
                    CachedTile {
                        bytes: vec![1],
                        metadata: TileMetadata::default(),
                    },
                );
            }
        }

        invalidate_chunk_tiles(&manager, "server-1", "minecraft:overworld", 0, 0).await;

        let mut cache = manager.tile_cache.lock().await;
        assert!(cache.get(&matching).is_none());
        assert!(cache.get(&unrelated_tile).is_some());
        assert!(cache.get(&unrelated_server).is_some());
    }

    #[test]
    fn disk_tile_cache_round_trips_png_atomically() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-cache-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("test root should be created");
        let key = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "sha256:test",
            "v1",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            4,
            -2,
            3,
        );
        let png = b"\x89PNG\r\n\x1a\nfixture";
        let tile = CachedTile {
            bytes: png.to_vec(),
            metadata: TileMetadata {
                rendered_chunk_count: 3,
                has_terrain: true,
                coverage_ratio: 0.5,
                message: None,
            },
        };
        write_disk_tile(&root, &key, &tile).expect("tile should be written");
        assert_eq!(
            read_disk_tile(&root, &key).expect("tile should be read"),
            Some(tile)
        );
        remove_map_cache(&root).expect("managed cache should be removable");
        assert!(!root.join("map-cache").exists());
        fs::remove_dir(root).expect("test root should be removed");
    }

    #[test]
    fn disk_dirty_chunk_invalidation_removes_only_intersecting_tiles() {
        let root = std::env::temp_dir().join(format!(
            "mc-vector-map-invalidation-test-{}",
            Uuid::new_v4()
        ));
        let png = b"\x89PNG\r\n\x1a\nfixture";
        let matching = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            MAX_ZOOM,
            0,
            0,
        );
        let unrelated = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            MAX_ZOOM,
            1,
            0,
        );
        let tile = |bytes: &[u8]| CachedTile {
            bytes: bytes.to_vec(),
            metadata: TileMetadata::default(),
        };

        write_disk_tile(&root, &matching, &tile(png)).expect("matching tile should be written");
        write_disk_tile(&root, &unrelated, &tile(png)).expect("unrelated tile should be written");
        invalidate_disk_chunk_tiles(&root, "server-1", "minecraft:overworld", 0, 0)
            .expect("dirty chunk invalidation should succeed");

        assert!(read_disk_tile(&root, &matching)
            .expect("matching tile read should succeed")
            .is_none());
        assert!(read_disk_tile(&root, &unrelated)
            .expect("unrelated tile read should succeed")
            .is_some());

        remove_map_cache(&root).expect("managed cache should be removable");
        fs::remove_dir(root).expect("test root should be removed");
    }

    #[test]
    fn tile_cache_directory_allows_concurrent_first_requests() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-cache-race-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("test root should be created");
        let key = TileCacheKey::new(
            "server-race",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            2,
            0,
            0,
        );

        std::thread::scope(|scope| {
            let handles = (0..8)
                .map(|_| scope.spawn(|| tile_cache_directory(&root, &key, true)))
                .collect::<Vec<_>>();

            for handle in handles {
                let directory = handle
                    .join()
                    .expect("cache directory request should not panic")
                    .expect("cache directory request should succeed")
                    .expect("cache directory should be returned");
                assert!(directory.is_dir());
            }
        });

        remove_map_cache(&root).expect("managed cache should be removable");
        fs::remove_dir(root).expect("test root should be removed");
    }

    #[test]
    fn tile_cache_directory_creates_a_missing_server_root() {
        let root = std::env::temp_dir().join(format!(
            "mc-vector-map-cache-missing-root-{}",
            Uuid::new_v4()
        ));
        let key = TileCacheKey::new(
            "server-missing-root",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            2,
            0,
            0,
        );

        let directory = tile_cache_directory(&root, &key, true)
            .expect("a missing server root should be created")
            .expect("create=true should return a directory");

        assert!(directory.is_dir());
        assert!(directory.starts_with(&root));
        remove_map_cache(&root).expect("managed cache should be removable");
        fs::remove_dir(root).expect("test root should be removed");
    }

    #[test]
    fn live_snapshot_payload_is_decoded_with_bounded_surface_layers() {
        let mut raw = Vec::new();
        raw.extend_from_slice(&0x4D43_5653_u32.to_be_bytes());
        raw.push(1);
        raw.extend_from_slice(&12_i32.to_be_bytes());
        raw.extend_from_slice(&(-4_i32).to_be_bytes());
        raw.extend_from_slice(&(-64_i32).to_be_bytes());
        raw.extend_from_slice(&320_i32.to_be_bytes());
        raw.extend_from_slice(&1_u16.to_be_bytes());
        raw.extend_from_slice(&1_u16.to_be_bytes());
        for value in ["minecraft:grass_block", "minecraft:plains"] {
            raw.extend_from_slice(&(value.len() as u16).to_be_bytes());
            raw.extend_from_slice(value.as_bytes());
        }
        for _ in 0..256 {
            raw.push(1);
            raw.extend_from_slice(&70_i16.to_be_bytes());
            raw.extend_from_slice(&0_u16.to_be_bytes());
            raw.extend_from_slice(&0_u16.to_be_bytes());
            raw.push(15);
            raw.push(0);
        }
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&raw).expect("payload should compress");
        let payload = base64::engine::general_purpose::STANDARD
            .encode(encoder.finish().expect("compressed payload should finish"));
        let snapshot = decode_live_snapshot(&serde_json::json!({
            "dimension": "minecraft:overworld",
            "codec": "deflate-base64",
            "payload": payload,
        }))
        .expect("snapshot should decode");
        assert_eq!((snapshot.key.chunk_x, snapshot.key.chunk_z), (12, -4));
        assert_eq!(snapshot.columns.len(), 256);
        assert_eq!(snapshot.columns[0][0].state, "minecraft:grass_block");
        assert_eq!(snapshot.columns[0][0].sky_light, 15);
    }

    #[test]
    fn oversized_lines_are_rejected_by_the_contract() {
        assert!(crate::map::bridge::framing::MAX_BRIDGE_LINE_BYTES >= 64 * 1024);
    }

    #[test]
    fn world_status_parser_preserves_structured_payload() {
        let message = serde_json::json!({
            "type": "world_status",
            "worldId": "world",
            "dimension": "minecraft:overworld",
            "status": {
                "loaded": true,
                "players": 3,
            },
        });

        assert_eq!(
            parse_world_status_message(message.clone()),
            Ok(message.clone())
        );

        let payload = WorldStatusEventPayload {
            server_id: "server-1".to_string(),
            message,
        };
        let encoded = serde_json::to_value(payload).expect("event payload should serialize");
        assert_eq!(encoded["serverId"], "server-1");
        assert_eq!(encoded["message"]["type"], "world_status");
        assert_eq!(encoded["message"]["status"]["players"], 3);
    }

    #[test]
    fn world_status_parser_rejects_malformed_payloads() {
        assert!(parse_world_status_message(serde_json::json!(null)).is_err());
        assert!(parse_world_status_message(serde_json::json!({
            "worldId": "world"
        }))
        .is_err());
        assert!(parse_world_status_message(serde_json::json!({
            "type": "player_snapshot"
        }))
        .is_err());
    }

    #[test]
    fn chat_message_parser_preserves_structured_payload() {
        let message = serde_json::json!({
            "type": "chat_message",
            "playerId": "player-1",
            "name": "Alex",
            "message": "Hello from Paper",
            "capturedAt": 1_725_000_000_u64,
            "extra": { "source": "paper" },
        });

        assert_eq!(parse_chat_message(message.clone()), Ok(message.clone()));

        let payload = ChatMessageEventPayload {
            server_id: "server-1".to_string(),
            message,
        };
        let encoded = serde_json::to_value(payload).expect("event payload should serialize");
        assert_eq!(encoded["serverId"], "server-1");
        assert_eq!(encoded["message"]["type"], "chat_message");
        assert_eq!(encoded["message"]["playerId"], "player-1");
        assert_eq!(encoded["message"]["extra"]["source"], "paper");
    }

    #[test]
    fn chat_message_parser_rejects_missing_or_wrong_fields() {
        let cases = [
            serde_json::json!(null),
            serde_json::json!({
                "type": "chat_message",
                "playerId": "player-1",
                "name": "Alex",
                "message": "Hello",
            }),
            serde_json::json!({
                "type": "chat_message",
                "playerId": "player-1",
                "name": "Alex",
                "message": 42,
                "capturedAt": 1,
            }),
            serde_json::json!({
                "type": "player_snapshot",
                "playerId": "player-1",
                "name": "Alex",
                "message": "Hello",
                "capturedAt": 1,
            }),
        ];

        for value in cases {
            assert!(parse_chat_message(value).is_err());
        }
    }

    #[test]
    fn chat_message_parser_rejects_empty_and_oversized_messages() {
        let mut empty = serde_json::json!({
            "type": "chat_message",
            "playerId": "player-1",
            "name": "Alex",
            "message": "Hello",
            "capturedAt": 1,
        });
        empty["message"] = serde_json::json!("");
        assert!(parse_chat_message(empty).is_err());

        let oversized = serde_json::json!({
            "type": "chat_message",
            "playerId": "player-1",
            "name": "Alex",
            "message": "x".repeat(MAX_CHAT_MESSAGE_BYTES + 1),
            "capturedAt": 1,
        });
        assert!(parse_chat_message(oversized).is_err());
    }
}
