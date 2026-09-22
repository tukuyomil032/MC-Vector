use std::collections::{HashMap, HashSet};
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
    CachedTile, MemoryTileCache, RenderProgress, ScheduleResult, TileKey, TileMetadata,
    TilePriority, TileRenderState, TileScheduler, DEFAULT_PERSPECTIVE,
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
use crate::map::core_artifact::{
    self as core_artifact, CoreArtifactStatus, ManagedMetadata, CORE_JAR_NAME,
};
use crate::map::domain::{ChunkKey, ChunkView};
use crate::map::projection::{floor_div, MapTileGeometry, MapTilePlane};
use crate::map::renderer::{
    render_world_tile_detailed, IsoHDPerspective, LiveChunkMap, TileRenderSource,
    TileUnavailableReason, MAX_ZOOM, TILE_SIZE,
};
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

const CORE_DISABLED_JAR_NAME: &str = core_artifact::CORE_DISABLED_JAR_NAME;
const CORE_CONFIG_NAME: &str = "mc-vector-core.yml";
const CORE_METADATA_NAME: &str = "mc-vector-core.managed.json";
const MAX_LIVE_CHUNKS_PER_TILE: usize = 64;
const LIVE_CHUNK_REQUEST_BATCH_SIZE: usize = 8;
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
    #[serde(default)]
    pub world_center_x: Option<f64>,
    #[serde(default)]
    pub world_center_z: Option<f64>,
    pub zoom: u8,
    #[serde(default = "default_viewport_width")]
    pub width: u32,
    #[serde(default = "default_viewport_height")]
    pub height: u32,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub request_generation: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRenderRequestResult {
    pub request_id: String,
    pub request_generation: u64,
    pub requested: usize,
    pub accepted: usize,
    pub coalesced: usize,
    pub rejected: usize,
}

#[derive(Clone, Debug)]
struct RenderRequestContext {
    request_id: Option<String>,
    request_generation: Option<u64>,
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
    render_generations: Arc<Mutex<HashMap<(String, String), u64>>>,
    core_artifact_locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
    core_artifact_errors: Arc<Mutex<HashMap<String, CoreArtifactStatus>>>,
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
            render_generations: Arc::default(),
            core_artifact_locks: Arc::default(),
            core_artifact_errors: Arc::default(),
        }
    }
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

struct LiveChunkResponse {
    snapshot: Option<ChunkView>,
    unavailable_reason: Option<TileUnavailableReason>,
}

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
    let temporary = path.with_extension(format!("json.tmp-{}", Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| format!("Failed to stage managed map metadata: {error}"))?;
        use std::io::Write;
        file.write_all(&bytes)
            .map_err(|error| format!("Failed to stage managed map metadata: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Failed to sync managed map metadata: {error}"))?;
        let rollback = path.with_extension(format!("json.rollback-{}", Uuid::new_v4()));
        let existing = match fs::symlink_metadata(path) {
            Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_file() => {
                return Err("Managed map metadata path is not a regular file".to_string());
            }
            Ok(_) => true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => {
                return Err(format!("Failed to inspect managed map metadata: {error}"));
            }
        };
        if existing {
            fs::rename(path, &rollback)
                .map_err(|error| format!("Failed to stage managed map metadata: {error}"))?;
        }
        match fs::rename(&temporary, path) {
            Ok(()) => {
                if existing {
                    let _ = fs::remove_file(&rollback);
                }
                Ok(())
            }
            Err(error) => {
                let _ = fs::remove_file(&temporary);
                if existing {
                    fs::rename(&rollback, path).map_err(|restore_error| {
                        format!(
                            "Failed to replace managed map metadata and restore the previous file: {error}; {restore_error}"
                        )
                    })?;
                }
                Err(format!("Failed to replace managed map metadata: {error}"))
            }
        }
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn default_metadata() -> ManagedMetadata {
    ManagedMetadata {
        managed_by: "MC-Vector".to_string(),
        schema_version: 2,
        artifact_name: CORE_JAR_NAME.to_string(),
        artifact_provenance: "development".to_string(),
        plugin_version: None,
        protocol_version: None,
        sha256: None,
        byte_length: None,
        release_tag: None,
        source_commit: None,
        asset_url: None,
        verified_at: None,
        removal_requested: false,
        restart_required: false,
    }
}

fn validate_metadata(metadata: &ManagedMetadata) -> Result<(), String> {
    core_artifact::validate_metadata(metadata).map_err(|error| error.to_string())
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

async fn begin_render_generation(
    manager: &MapBridgeManager,
    server_id: &str,
    world_id: &str,
) -> Result<u64, String> {
    let mut generations = manager.render_generations.lock().await;
    let generation = generations
        .entry((server_id.to_string(), world_id.to_string()))
        .or_insert(0);
    *generation = generation.wrapping_add(1).max(1);
    Ok(*generation)
}

async fn current_render_generation(
    manager: &MapBridgeManager,
    server_id: &str,
    world_id: &str,
) -> Option<u64> {
    manager
        .render_generations
        .lock()
        .await
        .get(&(server_id.to_string(), world_id.to_string()))
        .copied()
}

async fn render_generation_is_current(
    manager: &MapBridgeManager,
    server_id: &str,
    world_id: &str,
    generation: u64,
) -> bool {
    current_render_generation(manager, server_id, world_id)
        .await
        .is_some_and(|current| current == generation)
}

async fn cancel_render_requests_for_server(manager: &MapBridgeManager, server_id: &str) {
    manager
        .tile_scheduler
        .cancel_where(|key| key.server_id == server_id);
    let mut generations = manager.render_generations.lock().await;
    for ((key_server_id, _), generation) in generations.iter_mut() {
        if key_server_id == server_id {
            *generation = generation.wrapping_add(1).max(1);
        }
    }
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
        if core_artifact::metadata_is_verified(metadata) {
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
        if core_artifact::metadata_is_verified(metadata) {
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
            core_artifact: CoreArtifactStatus::missing("artifact_download_required"),
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
        Err(_) => {
            log::warn!(
                "Map Core metadata could not be verified for server {}: artifact_invalid_manifest",
                server_id
            );
            (None, Some("artifact_invalid_manifest".to_string()))
        }
    };
    let (raw_component, raw_component_message) =
        component_state(active, disabled, metadata.as_ref());
    let mut core_artifact_status =
        core_artifact::status_for_files(&paths.active_jar, &paths.disabled_jar, metadata.as_ref());
    if let Some(error_status) = manager
        .core_artifact_errors
        .lock()
        .await
        .get(server_id)
        .cloned()
    {
        core_artifact_status = error_status;
    }
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

    let core_config_mismatch = config.as_ref().is_some_and(|config| {
        core_artifact_status.state == "installed"
            && core_artifact_status.version.as_deref() != Some(config.plugin_version.as_str())
    });
    let active_verified = active
        && core_artifact_status.state == "installed"
        && core_artifact_status.verification == "verified"
        && !core_config_mismatch;
    if active_verified {
        if let Some(config) = config.as_ref() {
            let _ = ensure_bridge_listener(app.clone(), manager, config.clone()).await;
        }
    } else {
        stop_bridge_listener(manager, server_id).await;
    }

    let runtime = runtime_status(manager, server_id).await;
    let bridge = if core_config_mismatch {
        "incompatible".to_string()
    } else {
        match &inspection {
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
        }
    };
    let (component, component_message) = if core_config_mismatch {
        (
            "conflict".to_string(),
            Some("artifact_version_mismatch".to_string()),
        )
    } else if config_issue.is_some_and(|issue| issue.state == "conflict") {
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
    let (component, component_message) =
        if core_artifact_status.state != "installed" && (active || disabled) {
            (
                "conflict".to_string(),
                core_artifact_status.error_reason.clone(),
            )
        } else {
            (component, component_message)
        };
    let restart_required = metadata
        .as_ref()
        .is_some_and(|metadata| metadata.restart_required)
        && bridge != "connected";
    let message = config_issue
        .map(|issue| issue.message.clone())
        .or(metadata_message)
        .or(core_artifact_status.error_reason.clone())
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
        core_artifact: core_artifact_status,
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
    if bridge != "connected" {
        cancel_render_requests_for_server(manager, server_id).await;
    }
}

fn dimension_matches_world(world_id: &str, dimension: &str) -> bool {
    matches!(
        (world_id, dimension),
        ("overworld", "minecraft:overworld")
            | ("world_nether", "minecraft:the_nether")
            | ("world_the_end", "minecraft:the_end")
    ) || world_id == dimension
}

fn world_id_for_dimension(dimension: &str) -> String {
    match dimension {
        "minecraft:overworld" => "overworld".to_string(),
        "minecraft:the_nether" => "world_nether".to_string(),
        "minecraft:the_end" => "world_the_end".to_string(),
        other => other.to_string(),
    }
}

fn tile_coordinates_intersect_chunk(
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    chunk_x: i64,
    chunk_z: i64,
) -> bool {
    let Ok(geometry) = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)
    else {
        return false;
    };
    match geometry.plane {
        MapTilePlane::WorldXZ => geometry
            .world_bounds()
            .is_some_and(|bounds| bounds.intersects_chunk(chunk_x, chunk_z)),
        MapTilePlane::IsoProjected => IsoHDPerspective::default()
            .projected_geometry_intersects_chunk(geometry, -64.0, 320.0, chunk_x, chunk_z),
    }
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
) -> Result<Vec<(String, u8, i32, i32)>, String> {
    let mut affected = Vec::new();
    let server_cache = server_root.join("map-cache").join(cache_segment(server_id));
    let Some(world_entries) = normal_directory_entries(&server_cache)? else {
        return Ok(affected);
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
                                            affected.push((
                                                world_id.to_string(),
                                                zoom,
                                                tile_x,
                                                tile_y,
                                            ));
                                            let metadata_path =
                                                tile_x_path.join(format!("{}.json", tile_y));
                                            let mut tile_metadata =
                                                crate::map::tiles::read_metadata(&metadata_path)?
                                                    .unwrap_or_else(|| {
                                                        let bytes =
                                                            fs::read(&path).unwrap_or_default();
                                                        let (has_terrain, coverage_ratio) =
                                                            png_coverage(&bytes);
                                                        TileMetadata {
                                                            rendered_chunk_count: 0,
                                                            has_terrain,
                                                            coverage_ratio,
                                                            message: None,
                                                            source: TileRenderSource::Saved,
                                                            live_requested_count: 0,
                                                            live_received_count: 0,
                                                            unavailable_reason: None,
                                                            stale: false,
                                                        }
                                                    });
                                            tile_metadata.stale = true;
                                            crate::map::tiles::write_metadata_atomic(
                                                &metadata_path,
                                                &tile_metadata,
                                            )?;
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
    Ok(affected)
}

async fn invalidate_chunk_tiles(
    manager: &MapBridgeManager,
    server_id: &str,
    dimension: &str,
    chunk_x: i64,
    chunk_z: i64,
) -> Vec<TileKey> {
    let affected = manager.tile_cache.lock().await.mark_stale_where(|key| {
        key.server_id == server_id
            && dimension_matches_world(&key.world_id, dimension)
            && crate::map::tiles::tile_intersects_chunk(key, chunk_x, chunk_z)
    });
    manager.tile_scheduler.cancel_where(|key| {
        key.server_id == server_id
            && dimension_matches_world(&key.world_id, dimension)
            && crate::map::tiles::tile_intersects_chunk(key, chunk_x, chunk_z)
    });
    manager
        .live_snapshots
        .lock()
        .await
        .remove(server_id, &ChunkKey::new(dimension, chunk_x, chunk_z));
    affected
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
) -> LiveChunkResponse {
    let chunk_key = ChunkKey::new(dimension, chunk_x, chunk_z);
    let now = current_timestamp();
    if let Some(cached) =
        manager
            .live_snapshots
            .lock()
            .await
            .get(server_id, &chunk_key, now.saturating_mul(1_000))
    {
        return LiveChunkResponse {
            snapshot: Some(cached),
            unavailable_reason: None,
        };
    }

    let Some(sender) = manager.sessions.lock().await.get(server_id).cloned() else {
        return LiveChunkResponse {
            snapshot: None,
            unavailable_reason: Some(TileUnavailableReason::BridgeDisconnected),
        };
    };
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
        return LiveChunkResponse {
            snapshot: None,
            unavailable_reason: Some(TileUnavailableReason::BridgeDisconnected),
        };
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
            LiveChunkResponse {
                snapshot: Some(snapshot),
                unavailable_reason: None,
            }
        }
        Ok(Ok(Err(reason))) => {
            manager.pending_snapshots.lock().await.remove(&request_id);
            LiveChunkResponse {
                snapshot: None,
                unavailable_reason: Some(TileUnavailableReason::from_bridge_reason(&reason)),
            }
        }
        Ok(Ok(Ok(_))) => {
            manager.pending_snapshots.lock().await.remove(&request_id);
            LiveChunkResponse {
                snapshot: None,
                unavailable_reason: Some(TileUnavailableReason::InvalidSnapshot),
            }
        }
        _ => {
            manager.pending_snapshots.lock().await.remove(&request_id);
            LiveChunkResponse {
                snapshot: None,
                unavailable_reason: Some(TileUnavailableReason::Timeout),
            }
        }
    }
}

async fn request_live_chunks_for_tile(
    manager: &Arc<MapBridgeManager>,
    server_id: &str,
    dimension: &str,
    geometry: MapTileGeometry,
    world_anchor: Option<(f64, f64)>,
) -> LiveChunkRequestResult {
    let candidates = live_chunk_candidates(geometry, world_anchor);
    let requested_count = candidates.len();

    let mut snapshots = LiveChunkMap::new();
    let mut unavailable_reason = None;
    for batch in candidates.chunks(LIVE_CHUNK_REQUEST_BATCH_SIZE) {
        let mut requests = JoinSet::new();
        for &(chunk_x, chunk_z) in batch {
            let manager = Arc::clone(manager);
            let server_id = server_id.to_string();
            let dimension = dimension.to_string();
            requests.spawn(async move {
                let snapshot =
                    request_live_chunk(&manager, &server_id, &dimension, chunk_x, chunk_z).await;
                ((chunk_x, chunk_z), snapshot)
            });
        }
        while let Some(result) = requests.join_next().await {
            if let Ok((key, response)) = result {
                if let Some(snapshot) = response.snapshot {
                    snapshots.insert(key, snapshot);
                } else if unavailable_reason.is_none() {
                    unavailable_reason = response.unavailable_reason;
                }
            }
        }
    }
    LiveChunkRequestResult {
        chunks: snapshots,
        requested_count,
        unavailable_reason,
    }
}

struct LiveChunkRequestResult {
    chunks: LiveChunkMap,
    requested_count: usize,
    unavailable_reason: Option<TileUnavailableReason>,
}

fn world_anchor_chunk(world_anchor: Option<(f64, f64)>) -> Option<(i64, i64)> {
    world_anchor.map(|(world_x, world_z)| {
        (
            floor_div(world_x.floor() as i64, 16),
            floor_div(world_z.floor() as i64, 16),
        )
    })
}

fn live_chunk_candidates(
    geometry: MapTileGeometry,
    world_anchor: Option<(f64, f64)>,
) -> Vec<(i64, i64)> {
    let (min_chunk_x, max_chunk_x, min_chunk_z, max_chunk_z, _, _) =
        live_chunk_bounds_for_tile(geometry);
    let perspective = IsoHDPerspective::default();
    let world_center = world_anchor.unwrap_or_else(|| world_center_for_tile(geometry));
    let (search_min_x, search_max_x, search_min_z, search_max_z) = live_chunk_search_ranges(
        geometry,
        world_center,
        (min_chunk_x, max_chunk_x, min_chunk_z, max_chunk_z),
    );
    let mut candidates = (search_min_z..=search_max_z)
        .flat_map(|chunk_z| (search_min_x..=search_max_x).map(move |chunk_x| (chunk_x, chunk_z)))
        .filter(|(chunk_x, chunk_z)| match geometry.plane {
            MapTilePlane::WorldXZ => geometry
                .world_bounds()
                .is_some_and(|bounds| bounds.intersects_chunk(*chunk_x, *chunk_z)),
            MapTilePlane::IsoProjected => perspective
                .projected_geometry_intersects_chunk(geometry, -64.0, 320.0, *chunk_x, *chunk_z),
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        chunk_distance_squared(*left, world_center)
            .total_cmp(&chunk_distance_squared(*right, world_center))
            .then_with(|| left.cmp(right))
    });
    candidates.truncate(MAX_LIVE_CHUNKS_PER_TILE);
    candidates
}

fn world_center_for_tile(geometry: MapTileGeometry) -> (f64, f64) {
    if let Some(bounds) = geometry.world_bounds() {
        return (
            (bounds.origin_x as f64 + bounds.max_x() as f64) / 2.0,
            (bounds.origin_z as f64 + bounds.max_z() as f64) / 2.0,
        );
    }

    let perspective = IsoHDPerspective::default();
    let map_tile_span = geometry.tile_size as f64 * geometry.blocks_per_pixel as f64;
    let world = perspective.map_to_world([
        (f64::from(geometry.tile_x) + 0.5) * map_tile_span,
        (f64::from(geometry.tile_y) + 0.5) * map_tile_span,
        0.0,
    ]);
    (world[0], world[2])
}

fn chunk_distance_squared(chunk: (i64, i64), world_center: (f64, f64)) -> f64 {
    let chunk_center_x = chunk.0 as f64 * 16.0 + 8.0;
    let chunk_center_z = chunk.1 as f64 * 16.0 + 8.0;
    let delta_x = chunk_center_x - world_center.0;
    let delta_z = chunk_center_z - world_center.1;
    delta_x.mul_add(delta_x, delta_z * delta_z)
}

fn live_chunk_search_ranges(
    geometry: MapTileGeometry,
    world_center: (f64, f64),
    bounds: (i64, i64, i64, i64),
) -> (i64, i64, i64, i64) {
    let (min_chunk_x, max_chunk_x, min_chunk_z, max_chunk_z) = bounds;
    let area = (max_chunk_x - min_chunk_x + 1).saturating_mul(max_chunk_z - min_chunk_z + 1);
    if geometry.plane != MapTilePlane::WorldXZ || area <= 1_000_000 {
        return bounds;
    }

    // A zoom-0 WorldXZ tile covers millions of chunks. The 64 nearest chunks
    // in a rectangle are always within a 32-chunk Chebyshev radius of the
    // rectangle point nearest to worldCenter, so this is an exact bounded
    // search for the requested top-K set rather than an anchor-based cutoff.
    let center_chunk_x =
        floor_div(world_center.0.floor() as i64, 16).clamp(min_chunk_x, max_chunk_x);
    let center_chunk_z =
        floor_div(world_center.1.floor() as i64, 16).clamp(min_chunk_z, max_chunk_z);
    let radius = (MAX_LIVE_CHUNKS_PER_TILE / 2) as i64;
    (
        center_chunk_x.saturating_sub(radius).max(min_chunk_x),
        center_chunk_x.saturating_add(radius).min(max_chunk_x),
        center_chunk_z.saturating_sub(radius).max(min_chunk_z),
        center_chunk_z.saturating_add(radius).min(max_chunk_z),
    )
}

fn live_chunk_bounds_for_tile(geometry: MapTileGeometry) -> (i64, i64, i64, i64, i64, i64) {
    // Overview tiles are still rasterized on the world X/Z plane. Detailed
    // Iso tiles use projected map-plane coordinates, so their live request
    // range must be inverse-transformed just like the renderer's rays.
    let (min_world_x, max_world_x, min_world_z, max_world_z) =
        if geometry.plane == MapTilePlane::WorldXZ {
            let bounds = geometry
                .world_bounds()
                .expect("WorldXZ geometry must have world bounds");
            (
                bounds.origin_x,
                bounds.max_x(),
                bounds.origin_z,
                bounds.max_z(),
            )
        } else {
            IsoHDPerspective::default()
                .world_xz_bounds_for_geometry(geometry, -64.0, 320.0)
                .expect("Iso geometry must have projected bounds")
        };
    let min_chunk_x = floor_div(min_world_x, 16);
    let max_chunk_x = floor_div(max_world_x, 16);
    let min_chunk_z = floor_div(min_world_z, 16);
    let max_chunk_z = floor_div(max_world_z, 16);
    let center_chunk_x = floor_div((min_world_x + max_world_x) / 2, 16);
    let center_chunk_z = floor_div((min_world_z + max_world_z) / 2, 16);
    (
        min_chunk_x,
        max_chunk_x,
        min_chunk_z,
        max_chunk_z,
        center_chunk_x,
        center_chunk_z,
    )
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
                    let mut affected_tiles =
                        invalidate_chunk_tiles(&manager, &server_id, dimension, chunk_x, chunk_z)
                            .await
                            .into_iter()
                            .map(|key| (key.world_id, key.zoom, key.tile_x, key.tile_y))
                            .collect::<HashSet<_>>();
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
                            match result {
                                Ok(Ok(disk_tiles)) => affected_tiles.extend(disk_tiles),
                                Ok(Err(error)) => {
                                    let _ = app.emit(
                                        "map-error",
                                        serde_json::json!({
                                            "serverId": server_id.clone(),
                                            "message": error,
                                        }),
                                    );
                                }
                                Err(error) => {
                                    let _ = app.emit(
                                        "map-error",
                                        serde_json::json!({
                                            "serverId": server_id.clone(),
                                            "message": format!("Map cache invalidation worker failed: {error}"),
                                        }),
                                    );
                                }
                            }
                        }
                    }
                    let tiles = affected_tiles
                        .into_iter()
                        .map(|(world_id, zoom, tile_x, tile_y)| {
                            serde_json::json!({
                                "worldId": world_id,
                                "zoom": zoom,
                                "tileX": tile_x,
                                "tileY": tile_y,
                            })
                        })
                        .collect::<Vec<_>>();
                    let _ = app.emit(
                        "map-tile-invalidated",
                        serde_json::json!({
                            "serverId": server_id.clone(),
                            "message": {
                                "worldId": world_id_for_dimension(dimension),
                                "dimension": dimension,
                                "chunkX": chunk_x,
                                "chunkZ": chunk_z,
                                "tiles": tiles,
                            },
                        }),
                    );
                }
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
            render_generations: Arc::clone(&self.render_generations),
            core_artifact_locks: Arc::clone(&self.core_artifact_locks),
            core_artifact_errors: Arc::clone(&self.core_artifact_errors),
        }
    }
}

async fn core_artifact_lock(manager: &MapBridgeManager, server_id: &str) -> Arc<Mutex<()>> {
    let mut locks = manager.core_artifact_locks.lock().await;
    Arc::clone(
        locks
            .entry(server_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(()))),
    )
}

async fn set_core_artifact_error(
    manager: &MapBridgeManager,
    server_id: &str,
    error: &core_artifact::ArtifactError,
) {
    let state = if matches!(
        error,
        core_artifact::ArtifactError::Conflict
            | core_artifact::ArtifactError::InvalidJar
            | core_artifact::ArtifactError::InvalidManifest
    ) {
        "conflict"
    } else {
        "error"
    };
    manager.core_artifact_errors.lock().await.insert(
        server_id.to_string(),
        CoreArtifactStatus {
            state: state.to_string(),
            version: None,
            provenance: None,
            release_tag: None,
            verification: "failed".to_string(),
            error_reason: Some(error.to_string()),
        },
    );
}

async fn stop_bridge_listener(manager: &MapBridgeManager, server_id: &str) {
    if let Some(handle) = manager.listeners.lock().await.remove(server_id) {
        handle.abort();
    }
    manager.statuses.lock().await.remove(server_id);
    cancel_render_requests_for_server(manager, server_id).await;
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
    let Ok(metadata) = load_metadata(&paths) else {
        return;
    };
    if !existing_normal_file(&paths.active_jar).unwrap_or(false)
        || !metadata
            .as_ref()
            .is_some_and(core_artifact::metadata_is_verified)
        || core_artifact::status_for_files(
            &paths.active_jar,
            &paths.disabled_jar,
            metadata.as_ref(),
        )
        .state
            != "installed"
    {
        return;
    }
    let Ok(Some(config)) = read_bridge_config(&paths.config) else {
        return;
    };
    if metadata
        .as_ref()
        .and_then(|metadata| metadata.plugin_version.as_deref())
        != Some(config.plugin_version.as_str())
    {
        return;
    }
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
    if !core_artifact::metadata_is_verified(&metadata) {
        return Err("Refusing to repair an unverified MC-Vector Core artifact".to_string());
    }
    let active = existing_normal_file(&paths.active_jar)?;
    let disabled = existing_normal_file(&paths.disabled_jar)?;
    if !active && !disabled {
        return Err("MC-Vector Core artifact is missing".to_string());
    }
    let artifact_status =
        core_artifact::status_for_files(&paths.active_jar, &paths.disabled_jar, Some(&metadata));
    if artifact_status.state != "installed" {
        return Err(artifact_status
            .error_reason
            .unwrap_or_else(|| "artifact_invalid_manifest".to_string()));
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
    let config = write_bridge_config(
        &paths.config,
        &server_id,
        metadata
            .plugin_version
            .as_deref()
            .ok_or_else(|| "Verified Core artifact has no plugin version".to_string())?,
    )?;
    let running = servers.servers.lock().await.contains_key(&server_id);
    let mut metadata = metadata;
    metadata.restart_required = running;
    write_json_file(&paths.metadata, &metadata)?;
    if active {
        ensure_bridge_listener(app.clone(), &manager, config).await?;
    }
    manager.core_artifact_errors.lock().await.remove(&server_id);
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

fn tile_geometry_payload(key: &TileCacheKey) -> Value {
    let Ok(geometry) = MapTileGeometry::new(
        TILE_SIZE as usize,
        MAX_ZOOM,
        key.zoom,
        key.tile_x,
        key.tile_y,
    ) else {
        return Value::Null;
    };

    let plane = match geometry.plane {
        MapTilePlane::WorldXZ => "WorldXZ",
        MapTilePlane::IsoProjected => "IsoProjected",
    };
    let mut payload = serde_json::json!({
        "plane": plane,
        "tileSize": geometry.tile_size,
        "zoom": geometry.zoom,
        "maxZoom": geometry.max_zoom,
        "tileX": geometry.tile_x,
        "tileY": geometry.tile_y,
        "blocksPerPixel": geometry.blocks_per_pixel,
    });

    match geometry.plane {
        MapTilePlane::WorldXZ => {
            if let Some(bounds) = geometry.world_bounds() {
                payload["planeOrigin"] = serde_json::json!({
                    "x": bounds.origin_x,
                    "z": bounds.origin_z,
                });
                payload["planeBounds"] = serde_json::json!({
                    "minX": bounds.origin_x,
                    "maxX": bounds.max_x(),
                    "minZ": bounds.origin_z,
                    "maxZ": bounds.max_z(),
                });
            }
        }
        MapTilePlane::IsoProjected => {
            if let Some(bounds) = geometry.projected_bounds(1.0) {
                payload["planeOrigin"] = serde_json::json!({
                    "x": bounds.min_x,
                    "z": bounds.min_y,
                });
                payload["planeBounds"] = serde_json::json!({
                    "minX": bounds.min_x,
                    "maxX": bounds.max_x,
                    "minZ": bounds.min_y,
                    "maxZ": bounds.max_y,
                });
            }
        }
    }
    payload
}

fn add_render_request_context(
    payload: &mut Value,
    key: &TileCacheKey,
    context: Option<&RenderRequestContext>,
) {
    payload["geometry"] = tile_geometry_payload(key);
    if let Some(context) = context {
        if let Some(request_id) = context.request_id.as_deref() {
            payload["requestId"] = Value::String(request_id.to_string());
        }
        if let Some(request_generation) = context.request_generation {
            payload["requestGeneration"] = serde_json::json!(request_generation);
        }
    }
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
    source: TileRenderSource,
    live_requested_count: usize,
    live_received_count: usize,
    unavailable_reason: Option<TileUnavailableReason>,
    context: Option<&RenderRequestContext>,
) {
    let (has_terrain, coverage_ratio) = coverage.unwrap_or_else(|| png_coverage(png));
    let render_state =
        tile_render_state(asset_missing, has_terrain, diagnostic, unavailable_reason);
    let message = diagnostic.map(str::to_string).or_else(|| {
        (!has_terrain).then(|| {
            unavailable_reason.map_or_else(
                || "No generated terrain intersects this tile".to_string(),
                |reason| reason.message().to_string(),
            )
        })
    });
    let mut payload = serde_json::json!({
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
        "source": source,
        "liveRequestedCount": live_requested_count,
        "liveReceivedCount": live_received_count,
        "unavailableReason": unavailable_reason,
        "message": message,
    });
    add_render_request_context(&mut payload, key, context);
    let _ = app.emit("map-tile-ready", payload);
}

fn tile_render_state(
    asset_missing: bool,
    has_terrain: bool,
    diagnostic: Option<&str>,
    unavailable_reason: Option<TileUnavailableReason>,
) -> &'static str {
    if asset_missing {
        "asset_missing"
    } else if diagnostic.is_some() {
        "error"
    } else if has_terrain {
        "terrain"
    } else if unavailable_reason.is_some() {
        "paper_chunk_unavailable"
    } else {
        "empty"
    }
}

fn should_cache_tile(rendered: &crate::map::renderer::TileRenderResult) -> bool {
    if matches!(rendered.source, TileRenderSource::Live) && !rendered.has_terrain {
        return false;
    }
    rendered.has_terrain
        || matches!(
            rendered.source,
            TileRenderSource::Saved | TileRenderSource::SavedAndLive
        )
}

fn emit_map_render_progress(
    app: &AppHandle,
    key: &TileCacheKey,
    progress: RenderProgress,
    context: Option<&RenderRequestContext>,
) {
    let mut payload = serde_json::json!({
        "serverId": key.server_id,
        "worldId": key.world_id,
        "zoom": key.zoom,
        "tileX": key.tile_x,
        "tileY": key.tile_y,
        "state": progress.state,
        "completed": progress.completed,
        "total": progress.total,
        "message": progress.message,
    });
    add_render_request_context(&mut payload, key, context);
    let _ = app.emit("map-render-progress", payload);
}

async fn enable_map_impl(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    servers: State<'_, ServerManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    let lock = core_artifact_lock(&manager, &server_id).await;
    let _guard = lock.lock().await;
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let Some(paths) = map_paths(&root, true)? else {
        return Err("Failed to prepare the plugins directory".to_string());
    };
    let mut metadata = match core_artifact::ensure_installed(
        &app,
        &server_id,
        &paths.active_jar,
        &paths.disabled_jar,
        &paths.metadata,
    )
    .await
    {
        Ok(metadata) => metadata,
        Err(error) => {
            core_artifact::emit_failure_progress(&app, &server_id, &error);
            if !matches!(error, core_artifact::ArtifactError::VersionMismatch) {
                set_core_artifact_error(&manager, &server_id, &error).await;
            }
            stop_bridge_listener(&manager, &server_id).await;
            return build_status(&app, &manager, &server_id).await;
        }
    };
    manager.core_artifact_errors.lock().await.remove(&server_id);
    metadata.removal_requested = false;
    metadata.restart_required = servers.servers.lock().await.contains_key(&server_id)
        && existing_normal_file(&paths.active_jar)?;
    write_json_file(&paths.metadata, &metadata)?;
    let config = write_bridge_config(
        &paths.config,
        &server_id,
        metadata
            .plugin_version
            .as_deref()
            .ok_or_else(|| "Verified Core artifact has no plugin version".to_string())?,
    )?;
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
    if !core_artifact::metadata_is_verified(&metadata)
        || core_artifact::status_for_files(&paths.active_jar, &paths.disabled_jar, Some(&metadata))
            .state
            != "installed"
    {
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
    manager.core_artifact_errors.lock().await.remove(&server_id);
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
    if !core_artifact::metadata_is_verified(&metadata)
        || core_artifact::status_for_files(&paths.active_jar, &paths.disabled_jar, Some(&metadata))
            .state
            != "installed"
    {
        return Err("Refusing to restore an unverified plugin JAR".to_string());
    }
    if existing_normal_file(&paths.active_jar)? {
        metadata.restart_required = servers.servers.lock().await.contains_key(&server_id);
        write_json_file(&paths.metadata, &metadata)?;
        let config = write_bridge_config(
            &paths.config,
            &server_id,
            metadata
                .plugin_version
                .as_deref()
                .ok_or_else(|| "Verified Core artifact has no plugin version".to_string())?,
        )?;
        ensure_bridge_listener(app.clone(), &manager, config).await?;
        manager.core_artifact_errors.lock().await.remove(&server_id);
        return build_status(&app, &manager, &server_id).await;
    }
    if !existing_normal_file(&paths.disabled_jar)? {
        return Err("MC-Vector Core paused artifact is missing".to_string());
    }
    fs::rename(&paths.disabled_jar, &paths.active_jar)
        .map_err(|error| format!("Failed to restore MC-Vector Core: {error}"))?;
    metadata.restart_required = servers.servers.lock().await.contains_key(&server_id);
    write_json_file(&paths.metadata, &metadata)?;
    let config = write_bridge_config(
        &paths.config,
        &server_id,
        metadata
            .plugin_version
            .as_deref()
            .ok_or_else(|| "Verified Core artifact has no plugin version".to_string())?,
    )?;
    ensure_bridge_listener(app.clone(), &manager, config).await?;
    manager.core_artifact_errors.lock().await.remove(&server_id);
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
    let metadata = load_metadata(&paths)?;
    if let Some(metadata) = metadata.as_ref() {
        validate_metadata(metadata)?;
    }
    let mut metadata = metadata.unwrap_or_else(default_metadata);

    let running = servers.servers.lock().await.contains_key(&server_id);
    if running {
        metadata.removal_requested = true;
        write_json_file(&paths.metadata, &metadata)?;
        return build_status(&app, &manager, &server_id).await;
    }

    let active = existing_normal_file(&paths.active_jar)?;
    let disabled = existing_normal_file(&paths.disabled_jar)?;
    if active
        && (!core_artifact::metadata_is_verified(&metadata)
            || core_artifact::status_for_files(
                &paths.active_jar,
                &paths.disabled_jar,
                Some(&metadata),
            )
            .state
                != "installed")
    {
        return Err("Refusing to delete an unknown same-named plugin JAR".to_string());
    }
    if disabled
        && (!core_artifact::metadata_is_verified(&metadata)
            || core_artifact::status_for_files(
                &paths.active_jar,
                &paths.disabled_jar,
                Some(&metadata),
            )
            .state
                != "installed")
    {
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

    manager.core_artifact_errors.lock().await.remove(&server_id);

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
    sequence: Option<u64>,
    allow_render: bool,
    scheduler_generation: Option<u64>,
    request_id: Option<String>,
    request_generation: Option<u64>,
) -> Result<tauri::ipc::Response, String> {
    render_map_tile_with_anchor(
        app,
        manager,
        server_id,
        world_id,
        zoom,
        tile_x,
        tile_y,
        priority,
        sequence,
        allow_render,
        scheduler_generation,
        request_id,
        request_generation,
        None,
    )
    .await
}

async fn render_map_tile_with_anchor(
    app: AppHandle,
    manager: Arc<MapBridgeManager>,
    server_id: String,
    world_id: String,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    _priority: TilePriority,
    sequence: Option<u64>,
    allow_render: bool,
    scheduler_generation: Option<u64>,
    request_id: Option<String>,
    request_generation: Option<u64>,
    world_anchor: Option<(f64, f64)>,
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
    let request_context = if request_id.is_some() || request_generation.is_some() {
        Some(RenderRequestContext {
            request_id,
            request_generation,
        })
    } else {
        None
    };

    let cached = if allow_render {
        manager.tile_cache.lock().await.get_fresh(&key)
    } else {
        manager.tile_cache.lock().await.get(&key)
    };
    if let Some(cached) = cached {
        if allow_render {
            emit_map_tile_ready(
                &app,
                &key,
                &cached.bytes,
                cached.metadata.rendered_chunk_count,
                None,
                assets.is_none(),
                Some((cached.metadata.has_terrain, cached.metadata.coverage_ratio)),
                cached.metadata.message.as_deref(),
                cached.metadata.source,
                cached.metadata.live_requested_count,
                cached.metadata.live_received_count,
                cached.metadata.unavailable_reason,
                request_context.as_ref(),
            );
        }
        return Ok(tauri::ipc::Response::new(cached.bytes));
    }
    if !allow_render {
        if let Some(cached) = read_disk_tile(&server_root, &key)? {
            manager
                .tile_cache
                .lock()
                .await
                .insert(key.clone(), cached.clone());
            return Ok(tauri::ipc::Response::new(cached.bytes));
        }
        emit_map_render_progress(
            &app,
            &key,
            RenderProgress::error("Map tile is not available in the completed or stale cache"),
            request_context.as_ref(),
        );
        return Err("Map tile is not available in the completed or stale cache".to_string());
    }
    if allow_render {
        if let Some(cached) = read_disk_tile(&server_root, &key)? {
            manager
                .tile_cache
                .lock()
                .await
                .insert(key.clone(), cached.clone());
            if !cached.metadata.stale {
                emit_map_tile_ready(
                    &app,
                    &key,
                    &cached.bytes,
                    cached.metadata.rendered_chunk_count,
                    None,
                    assets.is_none(),
                    Some((cached.metadata.has_terrain, cached.metadata.coverage_ratio)),
                    cached.metadata.message.as_deref(),
                    cached.metadata.source,
                    cached.metadata.live_requested_count,
                    cached.metadata.live_received_count,
                    cached.metadata.unavailable_reason,
                    request_context.as_ref(),
                );
                return Ok(tauri::ipc::Response::new(cached.bytes));
            }
        }
    }

    if let Some(receiver) = join_inflight_tile(&manager, &key).await? {
        return match receiver.await {
            Ok(Ok(tile)) => Ok(tauri::ipc::Response::new(tile)),
            Ok(Err(error)) => Err(error),
            Err(_) => Err("Map tile render request was cancelled".to_string()),
        };
    }

    let sequence = if allow_render && sequence.is_none() {
        match manager.tile_scheduler.submit(key.clone(), _priority)? {
            ScheduleResult::Accepted { sequence } => Some(sequence),
            ScheduleResult::Coalesced => {
                return Err("Map tile render request was coalesced".to_string());
            }
            ScheduleResult::Full => {
                emit_map_render_progress(
                    &app,
                    &key,
                    RenderProgress::queue_full(),
                    request_context.as_ref(),
                );
                return Err("Map tile render scheduler is full".to_string());
            }
        }
    } else {
        sequence
    };

    let tile_key = key.clone();
    let tile_permit = match sequence {
        Some(sequence) => {
            manager
                .tile_scheduler
                .acquire_submitted(key.clone(), sequence)
                .await
        }
        None => Err("Map tile render request has no scheduler sequence".to_string()),
    };
    let tile_result: Result<Vec<u8>, String> = async {
        let _tile_permit = tile_permit?;
        emit_map_render_progress(
            &app,
            &key,
            RenderProgress::rendering(0, 1),
            request_context.as_ref(),
        );

        let asset_missing = assets.is_none();
        let dimension = match key.world_id.as_str() {
            "overworld" => "minecraft:overworld",
            "world_nether" => "minecraft:the_nether",
            "world_the_end" => "minecraft:the_end",
            other => other,
        };
        let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
        let live_request = request_live_chunks_for_tile(
            &manager,
            &key.server_id,
            dimension,
            geometry,
            world_anchor,
        )
        .await;
        let live_requested_count = live_request.requested_count;
        let live_chunks = live_request.chunks;
        let unavailable_reason = live_request.unavailable_reason;

        let mut rendered = tokio::task::spawn_blocking(move || {
            render_world_tile_detailed(
                &world_root,
                zoom,
                tile_x,
                tile_y,
                assets.as_deref(),
                Some(&live_chunks),
                live_requested_count,
            )
            .map_err(|error| format!("Failed to render map tile: {error}"))
        })
        .await
        .map_err(|error| format!("Map tile worker failed: {error}"))??;
        rendered.unavailable_reason = unavailable_reason;
        let tile = rendered.png.clone();
        if let Some(scheduler_generation) = scheduler_generation {
            if !render_generation_is_current(
                &manager,
                &tile_key.server_id,
                &tile_key.world_id,
                scheduler_generation,
            )
            .await
            {
                return Err(
                    "Map tile completion belongs to an obsolete render generation".to_string(),
                );
            }
        }
        emit_map_tile_ready(
            &app,
            &tile_key,
            &tile,
            rendered.rendered_chunk_count,
            Some(rendered.decode_failed_chunk_count),
            asset_missing,
            Some((rendered.has_terrain, rendered.coverage_ratio)),
            rendered.message.as_deref(),
            rendered.source,
            rendered.live_requested_count,
            rendered.live_received_count,
            rendered.unavailable_reason,
            request_context.as_ref(),
        );
        let progress_state = if asset_missing {
            TileRenderState::AssetMissing
        } else if rendered.unavailable_reason.is_some() && !rendered.has_terrain {
            TileRenderState::PaperChunkUnavailable
        } else if rendered.has_terrain {
            TileRenderState::Terrain
        } else {
            TileRenderState::Empty
        };
        emit_map_render_progress(
            &app,
            &tile_key,
            RenderProgress::completed(progress_state, rendered.message.clone()),
            request_context.as_ref(),
        );

        let cached = CachedTile {
            bytes: tile.clone(),
            metadata: TileMetadata {
                rendered_chunk_count: rendered.rendered_chunk_count,
                has_terrain: rendered.has_terrain,
                coverage_ratio: rendered.coverage_ratio,
                message: rendered.message.clone(),
                source: rendered.source,
                live_requested_count: rendered.live_requested_count,
                live_received_count: rendered.live_received_count,
                unavailable_reason: rendered.unavailable_reason,
                stale: false,
            },
        };
        if should_cache_tile(&rendered) {
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
        }
        Ok(tile)
    }
    .await;

    if let Err(error) = &tile_result {
        emit_map_render_progress(
            &app,
            &key,
            RenderProgress::error(error.clone()),
            request_context.as_ref(),
        );
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
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let Some(paths) = map_paths(&root, false)? else {
        return Err("artifact_missing".to_string());
    };
    let metadata = load_metadata(&paths)?;
    let artifact_status =
        core_artifact::status_for_files(&paths.active_jar, &paths.disabled_jar, metadata.as_ref());
    if !existing_normal_file(&paths.active_jar)?
        || artifact_status.state != "installed"
        || artifact_status.verification != "verified"
    {
        return Err(artifact_status
            .error_reason
            .unwrap_or_else(|| "artifact_missing".to_string()));
    }
    let world_anchor = match (viewport.world_center_x, viewport.world_center_z) {
        (Some(world_x), Some(world_z)) => {
            if !world_x.is_finite() || !world_z.is_finite() {
                return Err("Map world center must be finite".to_string());
            }
            Some((world_x, world_z))
        }
        _ => None,
    };
    let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, viewport.zoom, 0, 0)?;
    let coordinates = viewport_tile_coordinates(&viewport)?;
    let requested = coordinates.len();
    let scheduler_generation =
        begin_render_generation(manager.inner(), &server_id, &world_id).await?;
    let request_id = viewport
        .request_id
        .clone()
        .filter(|request_id| !request_id.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let request_generation = viewport.request_generation.unwrap_or(scheduler_generation);
    manager
        .tile_scheduler
        .cancel_where(|key| key.server_id == server_id && key.world_id == world_id);
    let tile_plane_size = f64::from(TILE_SIZE) * geometry.blocks_per_pixel as f64;
    let center_tile_x = (viewport.center_x / tile_plane_size).floor() as i32;
    let center_tile_y = (viewport.center_z / tile_plane_size).floor() as i32;
    let shared_manager = Arc::new(manager.inner().clone());
    let mut accepted = 0;
    for (tile_x, tile_y) in coordinates {
        let app = app.clone();
        let manager = Arc::clone(&shared_manager);
        let server_id = server_id.clone();
        let world_id = world_id.clone();
        let request_id_for_tile = request_id.clone();
        let priority = if tile_x == center_tile_x && tile_y == center_tile_y {
            TilePriority::Viewport
        } else {
            TilePriority::Adjacent
        };
        tokio::spawn(async move {
            if let Err(error) = render_map_tile_with_anchor(
                app.clone(),
                manager,
                server_id.clone(),
                world_id,
                viewport.zoom,
                tile_x,
                tile_y,
                priority,
                None,
                true,
                Some(scheduler_generation),
                Some(request_id_for_tile),
                Some(request_generation),
                world_anchor,
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
        request_id,
        request_generation,
        requested,
        accepted,
        coalesced: 0,
        rejected: 0,
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
    let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, viewport.zoom, 0, 0)?;
    let blocks_per_pixel = geometry.blocks_per_pixel as f64;
    let tile_plane_size = f64::from(TILE_SIZE) * blocks_per_pixel;
    let min_x =
        ((viewport.center_x - width * blocks_per_pixel / 2.0) / tile_plane_size).floor() as i64 - 1;
    let max_x =
        ((viewport.center_x + width * blocks_per_pixel / 2.0) / tile_plane_size).floor() as i64 + 1;
    let min_y = ((viewport.center_z - height * blocks_per_pixel / 2.0) / tile_plane_size).floor()
        as i64
        - 1;
    let max_y = ((viewport.center_z + height * blocks_per_pixel / 2.0) / tile_plane_size).floor()
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
            source: TileRenderSource::Saved,
            live_requested_count: 0,
            live_received_count: 0,
            unavailable_reason: None,
            stale: true,
        }
    });
    let mut metadata = metadata;
    if !metadata.has_terrain {
        metadata.stale = true;
    }
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
    use crate::map::bridge::protocol::{HelloRequest, MAX_CHAT_MESSAGE_BYTES};
    use crate::map::projection::floor_mod;
    use crate::map::renderer::world_tile::{
        existing_chunk_coordinates_for_tile, render_overview_tile,
    };
    use crate::map::world::{ChunkLayer, ChunkSourceKind};
    use base64::Engine;
    use fastanvil::Region;
    use fastnbt::Value as NbtValue;
    use flate2::{write::ZlibEncoder, Compression};
    use image::{ImageFormat, Rgba, RgbaImage};
    use std::fs::OpenOptions;
    use std::io::{Cursor, Write};

    fn test_config() -> BridgeConfig {
        BridgeConfig {
            managed_by: "MC-Vector".to_string(),
            schema_version: 1,
            server_id: "server-1".to_string(),
            host: "127.0.0.1".to_string(),
            port: 45_678,
            token: "1234567890abcdef".to_string(),
            protocol_version: MAP_PROTOCOL_VERSION,
            plugin_version: "2.0.63".to_string(),
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

    fn write_sparse_saved_chunk(root: &std::path::Path) {
        let region_dir = root.join("region");
        fs::create_dir_all(&region_dir).expect("region directory should be created");
        let path = region_dir.join("r.0.0.mca");
        let region_file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(path)
            .expect("region file should be created");
        let mut region = Region::create(region_file).expect("region should be created");
        let bytes = fastnbt::to_bytes(&HashMap::from([
            ("DataVersion".to_string(), NbtValue::Int(4671)),
            ("Status".to_string(), NbtValue::String("full".to_string())),
            ("sections".to_string(), NbtValue::List(Vec::new())),
        ]))
        .expect("sparse chunk NBT should encode");
        region
            .write_chunk(0, 0, &bytes)
            .expect("sparse saved chunk should be written");
    }

    fn write_saved_terrain_fixture(root: &std::path::Path) {
        let region_dir = root.join("region");
        fs::create_dir_all(&region_dir).expect("region directory should be created");
        let path = region_dir.join("r.0.0.mca");
        let region_file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(path)
            .expect("region file should be created");
        let mut region = Region::create(region_file).expect("region should be created");

        let block_palette = NbtValue::Compound(HashMap::from([(
            "Name".to_string(),
            NbtValue::String("minecraft:grass_block".to_string()),
        )]));
        let block_states = NbtValue::Compound(HashMap::from([(
            "palette".to_string(),
            NbtValue::List(vec![block_palette]),
        )]));
        let biomes = NbtValue::Compound(HashMap::from([(
            "palette".to_string(),
            NbtValue::List(vec![NbtValue::String("minecraft:plains".to_string())]),
        )]));
        let section = NbtValue::Compound(HashMap::from([
            ("Y".to_string(), NbtValue::Byte(4)),
            ("block_states".to_string(), block_states),
            ("biomes".to_string(), biomes),
        ]));
        let bytes = fastnbt::to_bytes(&HashMap::from([
            ("DataVersion".to_string(), NbtValue::Int(3953)),
            ("Status".to_string(), NbtValue::String("full".to_string())),
            ("sections".to_string(), NbtValue::List(vec![section])),
        ]))
        .expect("terrain fixture NBT should encode");
        region
            .write_chunk(0, 0, &bytes)
            .expect("terrain fixture chunk should be written");
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
        metadata.artifact_provenance = "github_release".to_string();
        metadata.plugin_version = Some("2.0.63".to_string());
        metadata.protocol_version = Some(MAP_PROTOCOL_VERSION);
        metadata.sha256 = Some("0".repeat(64));
        metadata.byte_length = Some(1);
        metadata.release_tag = Some("v2.0.63".to_string());
        metadata.source_commit = Some("0123456789abcdef0123456789abcdef01234567".to_string());
        metadata.verified_at = Some(1);
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
        let error = write_bridge_config(&path, "server-1", "2.0.63")
            .expect_err("conflict must not be overwritten");
        assert!(error.contains("another server"));
        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn empty_world_tile_is_a_png() {
        let root = std::env::temp_dir().join(format!("mc-vector-map-test-{}", Uuid::new_v4()));
        let png = render_world_tile_detailed(&root, MAX_ZOOM, 0, 0, None, None, 0)
            .expect("PNG should render")
            .png;
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(png.len() > 100);
    }

    #[test]
    fn saved_anvil_fixture_renders_a_deterministic_nontransparent_iso_tile() {
        let root = std::env::temp_dir().join(format!(
            "mc-vector-map-saved-terrain-fixture-{}",
            Uuid::new_v4()
        ));
        write_saved_terrain_fixture(&root);
        let texture = RgbaImage::from_pixel(16, 16, Rgba([48, 160, 72, 255]));
        let mut texture_png = Cursor::new(Vec::new());
        texture
            .write_to(&mut texture_png, ImageFormat::Png)
            .expect("texture fixture should encode");
        let assets = MapAssets::from_test_entries(&HashMap::from([
            (
                "assets/minecraft/blockstates/grass_block.json".to_string(),
                br#"{"variants":{"":{"model":"minecraft:block/grass_block"}}}"#.to_vec(),
            ),
            (
                "assets/minecraft/models/block/grass_block.json".to_string(),
                br##"{"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{"down":{"texture":"#all"},"up":{"texture":"#all"},"north":{"texture":"#all"},"south":{"texture":"#all"},"west":{"texture":"#all"},"east":{"texture":"#all"}}}],"textures":{"all":"minecraft:block/grass_block"}}"##.to_vec(),
            ),
            (
                "assets/minecraft/textures/block/grass_block.png".to_string(),
                texture_png.into_inner(),
            ),
        ]))
        .expect("client asset fixture should load");

        let first = render_world_tile_detailed(&root, MAX_ZOOM, 0, 0, Some(&assets), None, 0)
            .expect("saved fixture should render");
        let second = render_world_tile_detailed(&root, MAX_ZOOM, 0, 0, Some(&assets), None, 0)
            .expect("saved fixture should render deterministically");

        assert!(first.png.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(first.has_terrain);
        assert!(first.coverage_ratio > 0.0);
        assert!(first.rendered_chunk_count > 0);
        assert_eq!(first.source, TileRenderSource::Saved);
        assert_eq!(first.png, second.png);
        assert_eq!(first.coverage_ratio, second.coverage_ratio);

        fs::remove_dir_all(root).expect("test root should be removed");
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

        let result = render_overview_tile(&root, 0, 0, 0, None, None, 0)
            .expect("overview should render despite a bad chunk");
        assert_eq!(result.rendered_chunk_count, 0);
        assert_eq!(result.decode_failed_chunk_count, 1);
        assert_eq!(
            tile_render_state(false, result.has_terrain, result.message.as_deref(), None),
            "error"
        );
        assert_eq!(tile_render_state(false, false, None, None), "empty");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn unavailable_live_reasons_are_redacted_and_do_not_look_like_empty_terrain() {
        assert_eq!(
            TileUnavailableReason::from_bridge_reason("not_loaded"),
            TileUnavailableReason::NotLoaded
        );
        assert_eq!(
            TileUnavailableReason::from_bridge_reason("private token /tmp/world"),
            TileUnavailableReason::InvalidSnapshot
        );
        assert_eq!(
            tile_render_state(false, false, None, Some(TileUnavailableReason::NotLoaded)),
            "paper_chunk_unavailable"
        );
        assert_eq!(
            TileUnavailableReason::NotLoaded.message(),
            "Paper chunk is not loaded yet"
        );
        assert!(!TileUnavailableReason::NotLoaded.message().contains("/"));
    }

    #[test]
    fn overview_tile_keeps_live_generated_chunk_visible() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-overview-test-{}", Uuid::new_v4()));
        let snapshot = live_test_snapshot(0, 0);
        let live_chunks = HashMap::from([((0, 0), snapshot)]);
        let detailed = render_world_tile_detailed(&root, 0, 0, 0, None, Some(&live_chunks), 1)
            .expect("overview should render");
        let (has_terrain, coverage) = png_coverage(&detailed.png);
        assert!(has_terrain);
        assert!(coverage > 0.0);
        assert_eq!(detailed.rendered_chunk_count, 1);
        assert_eq!(detailed.source, TileRenderSource::Live);
        assert_eq!(detailed.live_requested_count, 1);
        assert_eq!(detailed.live_received_count, 1);
    }

    #[test]
    fn detailed_tile_keeps_live_generated_chunk_visible() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-detailed-test-{}", Uuid::new_v4()));
        let snapshot = live_test_snapshot(0, 0);
        let live_chunks = HashMap::from([((0, 0), snapshot)]);

        let detailed =
            render_world_tile_detailed(&root, MAX_ZOOM, 0, 0, None, Some(&live_chunks), 1)
                .expect("detailed tile should render");
        let (has_terrain, coverage) = png_coverage(&detailed.png);

        assert!(has_terrain);
        assert!(coverage > 0.0);
        assert_eq!(detailed.rendered_chunk_count, 1);
        assert_eq!(detailed.source, TileRenderSource::Live);
        assert_eq!(detailed.live_requested_count, 1);
        assert_eq!(detailed.live_received_count, 1);
    }

    #[test]
    fn overview_live_replacement_does_not_report_saved_and_live_source() {
        let root = std::env::temp_dir().join(format!(
            "mc-vector-map-overview-source-test-{}",
            Uuid::new_v4()
        ));
        write_sparse_saved_chunk(&root);
        let live_chunks = HashMap::from([((0, 0), live_test_snapshot(0, 0))]);

        let result = render_overview_tile(&root, 0, 0, 0, None, Some(&live_chunks), 1)
            .expect("overview should render");

        assert_eq!(result.source, TileRenderSource::Live);
        assert_eq!(result.rendered_chunk_count, 1);
        assert_eq!(result.live_requested_count, 1);
        assert_eq!(result.live_received_count, 1);
        fs::remove_dir_all(root).expect("cleanup should succeed");
    }

    #[test]
    fn detailed_live_replacement_does_not_report_saved_and_live_source() {
        let root = std::env::temp_dir().join(format!(
            "mc-vector-map-detailed-source-test-{}",
            Uuid::new_v4()
        ));
        write_sparse_saved_chunk(&root);
        let live_chunks = HashMap::from([((0, 0), live_test_snapshot(0, 0))]);

        let result = render_world_tile_detailed(&root, MAX_ZOOM, 0, 0, None, Some(&live_chunks), 1)
            .expect("detailed tile should render");

        assert_eq!(result.source, TileRenderSource::Live);
        assert_eq!(result.rendered_chunk_count, 1);
        assert_eq!(result.live_requested_count, 1);
        assert_eq!(result.live_received_count, 1);
        fs::remove_dir_all(root).expect("cleanup should succeed");
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
    fn detailed_live_chunk_bounds_use_projected_tile_volume() {
        let bounds = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, MAX_ZOOM, 0, 0)
            .expect("valid detailed tile bounds");
        let (min_x, max_x, min_z, max_z, center_x, center_z) = live_chunk_bounds_for_tile(bounds);
        let projected_center = IsoHDPerspective::default().map_to_world([128.0, 128.0, 0.0]);
        let projected_chunk_x = floor_div(projected_center[0].floor() as i64, 16);
        let projected_chunk_z = floor_div(projected_center[2].floor() as i64, 16);

        assert!((min_x..=max_x).contains(&projected_chunk_x));
        assert!((min_z..=max_z).contains(&projected_chunk_z));
        assert!((min_x..=max_x).contains(&center_x));
        assert!((min_z..=max_z).contains(&center_z));
    }

    #[test]
    fn overview_live_chunk_bounds_keep_world_plane_contract() {
        let bounds = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, 0, 0, 0)
            .expect("valid overview tile bounds");
        let (min_x, max_x, min_z, max_z, center_x, center_z) = live_chunk_bounds_for_tile(bounds);

        assert!((min_x..=max_x).contains(&center_x));
        assert!((min_z..=max_z).contains(&center_z));
        assert!(max_x - min_x + 1 > MAX_LIVE_CHUNKS_PER_TILE as i64);
        assert!(max_z - min_z + 1 > MAX_LIVE_CHUNKS_PER_TILE as i64);
    }

    #[test]
    fn anchored_candidates_prioritize_the_world_center_at_zoom_zero() {
        let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, 0, 0, 0)
            .expect("valid overview geometry");
        let anchor = (32.5, 48.5);
        let anchor_chunk = world_anchor_chunk(Some(anchor)).expect("anchor chunk");
        let candidates = live_chunk_candidates(geometry, Some(anchor));

        assert_eq!(candidates.first(), Some(&anchor_chunk));
        assert!(candidates.len() <= MAX_LIVE_CHUNKS_PER_TILE);
        assert!(candidates.iter().all(|&(chunk_x, chunk_z)| geometry
            .world_bounds()
            .expect("world bounds")
            .intersects_chunk(chunk_x, chunk_z)));
    }

    #[test]
    fn anchored_candidates_prioritize_the_world_center_at_zoom_two() {
        let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, 2, 0, 0)
            .expect("valid overview geometry");
        let anchor = (1_024.5, 768.5);
        let anchor_chunk = world_anchor_chunk(Some(anchor)).expect("anchor chunk");
        let candidates = live_chunk_candidates(geometry, Some(anchor));
        let (min_x, max_x, min_z, max_z, _, _) = live_chunk_bounds_for_tile(geometry);

        assert_eq!(candidates.first(), Some(&anchor_chunk));
        assert!((min_x..=max_x).contains(&anchor_chunk.0));
        assert!((min_z..=max_z).contains(&anchor_chunk.1));
        assert!(candidates.len() <= MAX_LIVE_CHUNKS_PER_TILE);
    }

    #[test]
    fn anchored_candidates_prioritize_the_world_center_for_detailed_tiles() {
        let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, MAX_ZOOM, 0, 0)
            .expect("valid detailed geometry");
        let anchor_world = IsoHDPerspective::default().map_to_world([128.0, 128.0, 0.0]);
        let anchor = (anchor_world[0], anchor_world[2]);
        let anchor_chunk = world_anchor_chunk(Some(anchor)).expect("anchor chunk");
        let candidates = live_chunk_candidates(geometry, Some(anchor));

        assert_eq!(candidates.first(), Some(&anchor_chunk));
        assert!(candidates.len() <= MAX_LIVE_CHUNKS_PER_TILE);
        assert!(candidates.iter().all(|&(chunk_x, chunk_z)| {
            IsoHDPerspective::default()
                .projected_geometry_intersects_chunk(geometry, -64.0, 320.0, chunk_x, chunk_z)
        }));
    }

    #[test]
    fn detailed_candidates_keep_geometric_chunks_when_viewport_center_is_outside_tile() {
        let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, MAX_ZOOM, 0, 0)
            .expect("valid detailed geometry");
        let tile_center = world_center_for_tile(geometry);
        let viewport_center = (tile_center.0 + 16.0 * 20.0, tile_center.1 + 16.0 * 20.0);
        let candidates = live_chunk_candidates(geometry, Some(viewport_center));

        assert!(!candidates.is_empty());
        assert!(candidates.len() <= MAX_LIVE_CHUNKS_PER_TILE);
        assert!(candidates.iter().all(|&(chunk_x, chunk_z)| {
            IsoHDPerspective::default()
                .projected_geometry_intersects_chunk(geometry, -64.0, 320.0, chunk_x, chunk_z)
        }));
        assert!(candidates.iter().any(|&(chunk_x, chunk_z)| (chunk_x
            - floor_div(tile_center.0 as i64, 16))
        .abs()
            <= 20
            && (chunk_z - floor_div(tile_center.1 as i64, 16)).abs() <= 20));
    }

    #[test]
    fn empty_live_result_is_terminal_but_not_cacheable() {
        let result = crate::map::renderer::TileRenderResult {
            png: Vec::new(),
            rendered_chunk_count: 0,
            decode_failed_chunk_count: 0,
            has_terrain: false,
            coverage_ratio: 0.0,
            message: None,
            source: TileRenderSource::Live,
            live_requested_count: 16,
            live_received_count: 0,
            unavailable_reason: None,
        };

        assert!(!should_cache_tile(&result));
        assert_eq!(result.source, TileRenderSource::Live);

        let received_empty = crate::map::renderer::TileRenderResult {
            live_received_count: 1,
            ..result
        };
        assert!(!should_cache_tile(&received_empty));
    }

    #[test]
    fn render_event_context_exposes_the_canonical_plane_and_generation() {
        let overview = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            4,
            -2,
            3,
        );
        let detailed = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            8,
            -1,
            2,
        );
        let context = RenderRequestContext {
            request_id: Some("render-17".to_string()),
            request_generation: Some(17),
        };

        let mut overview_payload = serde_json::json!({});
        add_render_request_context(&mut overview_payload, &overview, Some(&context));
        assert_eq!(overview_payload["geometry"]["plane"], "WorldXZ");
        assert_eq!(overview_payload["geometry"]["tileX"], -2);
        assert_eq!(overview_payload["requestId"], "render-17");
        assert_eq!(overview_payload["requestGeneration"], 17);

        let mut detailed_payload = serde_json::json!({});
        add_render_request_context(&mut detailed_payload, &detailed, Some(&context));
        assert_eq!(detailed_payload["geometry"]["plane"], "IsoProjected");
        assert_eq!(detailed_payload["geometry"]["tileY"], 2);
        assert!(detailed_payload["geometry"]["planeBounds"]["minX"].is_number());
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
            4,
            0,
            0,
        );
        assert!(crate::map::tiles::tile_intersects_chunk(&key, 0, 0));
        assert!(crate::map::tiles::tile_intersects_chunk(&key, 15, 15));
        assert!(!crate::map::tiles::tile_intersects_chunk(&key, 256, 0));
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
            4,
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
            4,
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
            4,
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
        assert!(cache.get(&matching).is_some_and(|tile| tile.metadata.stale));
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
                source: TileRenderSource::Saved,
                live_requested_count: 0,
                live_received_count: 0,
                unavailable_reason: None,
                stale: false,
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
    fn disk_empty_tile_is_always_stale_and_must_be_retried() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-empty-cache-test-{}", Uuid::new_v4()));
        let key = TileCacheKey::new(
            "server-1",
            "overworld",
            "1.21.10",
            "fallback",
            "fallback",
            TILE_RENDERER_VERSION,
            DEFAULT_PERSPECTIVE,
            0,
            0,
            0,
        );
        let tile = CachedTile {
            bytes: b"\x89PNG\r\n\x1a\nempty".to_vec(),
            metadata: TileMetadata::default(),
        };
        write_disk_tile(&root, &key, &tile).expect("empty tile should be written");

        let cached = read_disk_tile(&root, &key)
            .expect("empty tile should be readable")
            .expect("empty tile should exist");
        assert!(cached.metadata.stale);

        remove_map_cache(&root).expect("managed cache should be removable");
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
            4,
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
            4,
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
            .is_some_and(|tile| tile.metadata.stale));
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
