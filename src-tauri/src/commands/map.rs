use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{SystemTime, UNIX_EPOCH};

use fastanvil::complete::Chunk as CompleteChunk;
use fastanvil::{Chunk as DimensionChunk, HeightMode};
use flate2::{write::ZlibEncoder, Compression};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::{JoinHandle, JoinSet};
use tokio::time::{timeout, Duration};
use uuid::Uuid;

use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use super::map_assets::{self, MapAssets};
use super::server::ServerManager;
use crate::map::projection::{floor_div, floor_mod, TileWorldBounds};
use crate::map::render::{render_iso_tile, shade_surface, Face, SurfaceSample};
use crate::map::tile_buffer::RgbaTileBuffer;
use crate::map::tiles::{
    MemoryTileCache, TileKey, TilePriority, TileScheduler, DEFAULT_PERSPECTIVE,
};
use crate::map::world::{
    decode_live_snapshot as decode_world_snapshot, enumerate_region_files,
    present_chunks_for_bounds, read_complete_chunk, read_level_metadata, ChunkKey, ChunkView,
};

const MAP_PROTOCOL_VERSION: u32 = 2;
const CORE_PLUGIN_VERSION: &str = "0.1.0";
const CORE_JAR_NAME: &str = "mc-vector-core.jar";
const CORE_DISABLED_JAR_NAME: &str = "mc-vector-core.jar.disabled";
const CORE_CONFIG_NAME: &str = "mc-vector-core.yml";
const CORE_METADATA_NAME: &str = "mc-vector-core.managed.json";
const MAX_BRIDGE_LINE_BYTES: usize = 1024 * 1024;
const MAX_ZOOM: u8 = 8;
const TILE_SIZE: u32 = 256;
const MAX_LIVE_CHUNKS_PER_TILE: usize = 64;
const MAX_LIVE_CHUNKS_PER_AXIS: i64 = 8;
const RAY_CHUNK_PADDING_BLOCKS: i64 = 512;
// This version intentionally invalidates the earlier representative-colour
// tiles. The renderer now resolves blockstate/model parents and samples the
// resolved top face before the tile path aggregates chunk footprints.
const TILE_RENDERER_VERSION: &str = "model-texture-surface-v6";
const MAX_TILE_CACHE_ENTRIES: usize = 256;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapStatus {
    pub server_id: String,
    pub component: String,
    pub artifact: Option<String>,
    pub restart_required: bool,
    pub bridge: String,
    pub config_state: String,
    pub config_reason: Option<String>,
    pub protocol_version: u32,
    pub plugin_version: Option<String>,
    pub configured_port: Option<u16>,
    pub last_heartbeat: Option<u64>,
    pub asset_state: String,
    pub asset_source: Option<String>,
    pub asset_identity: Option<String>,
    pub asset_message: Option<String>,
    pub message: Option<String>,
}

#[derive(Clone, Debug)]
struct BridgeConfigIssue {
    state: String,
    reason: String,
    message: String,
    managed_by: Option<String>,
    server_id: Option<String>,
}

#[derive(Clone, Debug)]
enum BridgeConfigInspection {
    Missing,
    Valid(BridgeConfig),
    Invalid(BridgeConfigIssue),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapWorldInfo {
    pub world_id: String,
    pub has_terrain: bool,
    pub generated_chunk_count: usize,
    pub min_chunk_x: Option<i64>,
    pub max_chunk_x: Option<i64>,
    pub min_chunk_z: Option<i64>,
    pub max_chunk_z: Option<i64>,
    pub center_x: i64,
    pub center_z: i64,
    pub spawn_x: Option<i64>,
    pub spawn_y: Option<i64>,
    pub spawn_z: Option<i64>,
    pub data_version: Option<i64>,
    pub recommended_zoom: u8,
}

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TileRenderResult {
    png: Vec<u8>,
    rendered_chunk_count: usize,
    has_terrain: bool,
    coverage_ratio: f32,
    message: Option<String>,
}

#[derive(Clone, Debug)]
struct RuntimeBridgeStatus {
    bridge: String,
    last_heartbeat: Option<u64>,
}

type TileCacheKey = TileKey;

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct LiveChunkKey {
    server_id: String,
    dimension: String,
    chunk_x: i64,
    chunk_z: i64,
}

#[derive(Clone, Debug)]
struct CachedLiveChunk {
    received_at: u64,
    snapshot: ChunkView,
}

type LiveChunkMap = HashMap<(i64, i64), ChunkView>;

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
    live_snapshots: Arc<Mutex<HashMap<LiveChunkKey, CachedLiveChunk>>>,
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
            live_snapshots: Arc::default(),
            tile_scheduler: Arc::new(TileScheduler::new(64, 2)),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeConfig {
    managed_by: String,
    schema_version: u32,
    server_id: String,
    host: String,
    port: u16,
    token: String,
    protocol_version: u32,
    plugin_version: String,
    minecraft_version: String,
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

#[derive(Clone, Debug)]
struct HelloRequest {
    protocol_version: u32,
    server_id: String,
    token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeStatusPayload {
    server_id: String,
    status: String,
    last_heartbeat: Option<u64>,
    message: Option<String>,
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

fn config_issue(
    state: &str,
    reason: &str,
    message: impl Into<String>,
    values: &HashMap<String, String>,
) -> BridgeConfigInspection {
    BridgeConfigInspection::Invalid(BridgeConfigIssue {
        state: state.to_string(),
        reason: reason.to_string(),
        message: message.into(),
        managed_by: values.get("managed-by").cloned(),
        server_id: values.get("server-id").cloned(),
    })
}

fn config_read_error(message: impl Into<String>) -> BridgeConfigInspection {
    BridgeConfigInspection::Invalid(BridgeConfigIssue {
        state: "invalid".to_string(),
        reason: "parse_error".to_string(),
        message: message.into(),
        managed_by: None,
        server_id: None,
    })
}

fn inspect_bridge_config(
    path: &Path,
    expected_server_id: Option<&str>,
) -> Result<BridgeConfigInspection, String> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if is_link_or_reparse_point(&metadata) {
            return Err(format!(
                "Refusing to read a symbolic link or reparse point: {}",
                path.display()
            ));
        }
    }
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(BridgeConfigInspection::Missing)
        }
        Err(error) => return Err(format!("Failed to read map bridge configuration: {error}")),
    };

    let mut values = HashMap::<String, String>::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            return Ok(config_issue(
                "invalid",
                "parse_error",
                "Map bridge configuration could not be parsed",
                &values,
            ));
        };
        let value = value.trim().trim_matches(['\'', '"']);
        values.insert(key.trim().to_string(), value.to_string());
    }

    let managed_by = values.get("managed-by").cloned();
    let configured_server_id = values.get("server-id").cloned();
    if managed_by.as_deref() != Some("MC-Vector") {
        return Ok(config_issue(
            "conflict",
            "managed_by_mismatch",
            "The map bridge configuration is not managed by MC-Vector",
            &values,
        ));
    }
    if expected_server_id
        .is_some_and(|server_id| configured_server_id.as_deref() != Some(server_id))
    {
        return Ok(config_issue(
            "conflict",
            "server_mismatch",
            "The map bridge configuration belongs to another server",
            &values,
        ));
    }

    if values
        .get("schema-version")
        .and_then(|value| value.parse::<u32>().ok())
        != Some(1)
    {
        return Ok(config_issue(
            "stale",
            "schema_mismatch",
            "The map bridge configuration uses an unsupported schema version",
            &values,
        ));
    }

    let required = |key: &str| {
        values
            .get(key)
            .cloned()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| format!("Map bridge configuration is missing {key}"))
    };
    let port = match required("port").and_then(|value| {
        value
            .parse::<u16>()
            .map_err(|_| "Map bridge port is invalid".to_string())
    }) {
        Ok(port) => port,
        Err(message) => {
            return Ok(config_issue("stale", "parse_error", message, &values));
        }
    };
    let protocol_version = match required("protocol-version").and_then(|value| {
        value
            .parse::<u32>()
            .map_err(|_| "Map bridge protocol version is invalid".to_string())
    }) {
        Ok(protocol_version) => protocol_version,
        Err(message) => {
            return Ok(config_issue("stale", "parse_error", message, &values));
        }
    };
    let schema_version = match required("schema-version").and_then(|value| {
        value
            .parse::<u32>()
            .map_err(|_| "Map bridge schema version is invalid".to_string())
    }) {
        Ok(schema_version) => schema_version,
        Err(message) => {
            return Ok(config_issue("stale", "schema_mismatch", message, &values));
        }
    };
    let config = match (|| {
        Ok::<_, String>(BridgeConfig {
            managed_by: required("managed-by")?,
            schema_version,
            server_id: required("server-id")?,
            host: required("host")?,
            port,
            token: required("token")?,
            protocol_version,
            plugin_version: required("plugin-version")?,
            minecraft_version: required("minecraft-version")?,
        })
    })() {
        Ok(config) => config,
        Err(message) => {
            return Ok(config_issue("stale", "missing_required", message, &values));
        }
    };

    if config.host != "127.0.0.1" || config.port == 0 {
        return Ok(config_issue(
            "stale",
            "host_or_port_invalid",
            "The map bridge must bind to a valid loopback address",
            &values,
        ));
    }
    if config.protocol_version != MAP_PROTOCOL_VERSION {
        return Ok(config_issue(
            "stale",
            "protocol_mismatch",
            "The map bridge configuration uses an older protocol version",
            &values,
        ));
    }
    if config.token.len() < 16 {
        return Ok(config_issue(
            "stale",
            "token_invalid",
            "The map bridge authentication token is missing or too short",
            &values,
        ));
    }

    Ok(BridgeConfigInspection::Valid(config))
}

fn read_bridge_config(path: &Path) -> Result<Option<BridgeConfig>, String> {
    match inspect_bridge_config(path, None) {
        Err(error) => {
            log::debug!("Map bridge configuration is unavailable: {error}");
            Ok(None)
        }
        Ok(BridgeConfigInspection::Missing) => Ok(None),
        Ok(BridgeConfigInspection::Valid(config)) => Ok(Some(config)),
        Ok(BridgeConfigInspection::Invalid(_)) => Ok(None),
    }
}

fn validate_bridge_config(config: &BridgeConfig, server_id: &str) -> Result<(), String> {
    if config.managed_by != "MC-Vector" || config.schema_version != 1 {
        return Err("Map bridge configuration is not managed by MC-Vector".to_string());
    }
    if config.server_id != server_id {
        return Err("Map bridge configuration belongs to another server".to_string());
    }
    if config.host != "127.0.0.1" || config.port == 0 {
        return Err("Map bridge must bind to a valid loopback address".to_string());
    }
    if config.protocol_version != MAP_PROTOCOL_VERSION || config.token.len() < 16 {
        return Err("Map bridge configuration has an unsupported protocol or token".to_string());
    }
    Ok(())
}

fn allocate_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Failed to allocate a map bridge port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Failed to inspect allocated map bridge port: {error}"))
}

fn write_bridge_config(path: &Path, server_id: &str) -> Result<BridgeConfig, String> {
    match inspect_bridge_config(path, Some(server_id))? {
        BridgeConfigInspection::Valid(existing) => return Ok(existing),
        BridgeConfigInspection::Invalid(issue)
            if issue.managed_by.as_deref() == Some("MC-Vector")
                && issue.server_id.as_deref() == Some(server_id) => {}
        BridgeConfigInspection::Invalid(issue) => return Err(issue.message),
        BridgeConfigInspection::Missing => {}
    }

    let config = BridgeConfig {
        managed_by: "MC-Vector".to_string(),
        schema_version: 1,
        server_id: server_id.to_string(),
        host: "127.0.0.1".to_string(),
        port: allocate_port()?,
        token: Uuid::new_v4().to_string(),
        protocol_version: MAP_PROTOCOL_VERSION,
        plugin_version: CORE_PLUGIN_VERSION.to_string(),
        minecraft_version: "1.21.x".to_string(),
    };

    let content = format!(
        "managed-by: MC-Vector\nschema-version: 1\nserver-id: {}\nhost: 127.0.0.1\nport: {}\ntoken: {}\nprotocol-version: {}\nplugin-version: {}\nminecraft-version: 1.21.x\n",
        config.server_id,
        config.port,
        config.token,
        config.protocol_version,
        config.plugin_version,
    );
    let temporary = path.with_extension(format!("yml.tmp-{}", Uuid::new_v4()));
    fs::write(&temporary, content)
        .map_err(|error| format!("Failed to stage map bridge configuration: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Failed to replace map bridge configuration: {error}"
        ));
    }
    Ok(config)
}

fn locate_core_artifact(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(CORE_JAR_NAME));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../bridge/mc-vector-core/build/libs")
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
        !(key.server_id == server_id
            && dimension_matches_world(&key.world_id, dimension)
            && crate::map::tiles::tile_intersects_chunk(key, chunk_x, chunk_z))
    });
    manager.live_snapshots.lock().await.retain(|key, _| {
        !(key.server_id == server_id
            && key.dimension == dimension
            && key.chunk_x == chunk_x
            && key.chunk_z == chunk_z)
    });
}

async fn read_bridge_line<R>(reader: &mut R) -> Result<Option<Vec<u8>>, String>
where
    R: AsyncBufRead + Unpin,
{
    let mut line = Vec::new();
    let bytes = reader
        .read_until(b'\n', &mut line)
        .await
        .map_err(|error| format!("Bridge read failed: {error}"))?;
    if bytes == 0 {
        return Ok(None);
    }
    if line.len() > MAX_BRIDGE_LINE_BYTES {
        return Err("Bridge message is too large".to_string());
    }
    Ok(Some(line))
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
    let cache_key = LiveChunkKey {
        server_id: server_id.to_string(),
        dimension: dimension.to_string(),
        chunk_x,
        chunk_z,
    };
    let now = current_timestamp();
    if let Some(cached) = manager.live_snapshots.lock().await.get(&cache_key).cloned() {
        if now.saturating_sub(cached.received_at) <= 2 {
            return Some(cached.snapshot);
        }
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
                cache_key,
                CachedLiveChunk {
                    received_at: current_timestamp(),
                    snapshot: snapshot.clone(),
                },
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

fn parse_hello(value: &Value) -> Result<HelloRequest, String> {
    if value.get("type").and_then(Value::as_str) != Some("hello") {
        return Err("The first bridge message must be hello".to_string());
    }
    let protocol_version = value
        .get("protocolVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Bridge hello is missing protocolVersion".to_string())?
        as u32;
    let server_id = value
        .get("serverId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Bridge hello is missing serverId".to_string())?
        .to_string();
    let token = value
        .get("token")
        .and_then(Value::as_str)
        .ok_or_else(|| "Bridge hello is missing token".to_string())?
        .to_string();
    Ok(HelloRequest {
        protocol_version,
        server_id,
        token,
    })
}

fn validate_hello(hello: &HelloRequest, config: &BridgeConfig) -> Result<(), String> {
    if hello.protocol_version != MAP_PROTOCOL_VERSION
        || hello.protocol_version != config.protocol_version
    {
        return Err("Unsupported bridge protocol version".to_string());
    }
    if hello.server_id != config.server_id {
        return Err("Bridge server ID does not match the listener".to_string());
    }
    if hello.token != config.token {
        return Err("Bridge authentication failed".to_string());
    }
    Ok(())
}

fn hello_rejection_reason(error: &str) -> &'static str {
    if error.contains("Unsupported bridge protocol version") {
        "protocol_mismatch"
    } else if error.contains("server ID") {
        "server_mismatch"
    } else if error.contains("authentication failed") {
        "authentication_failed"
    } else {
        "invalid_hello"
    }
}

fn hello_ack(accepted: bool, reason: Option<&str>) -> String {
    if accepted {
        return format!(
            "{{\"type\":\"hello_ack\",\"accepted\":true,\"protocolVersion\":{MAP_PROTOCOL_VERSION}}}\n"
        );
    }

    format!(
        "{{\"type\":\"hello_ack\",\"accepted\":false,\"reason\":\"{}\"}}\n",
        reason.unwrap_or("invalid_hello")
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

#[tauri::command]
pub async fn get_map_status(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
) -> Result<MapStatus, String> {
    build_status(&app, &manager, &server_id).await
}

#[tauri::command]
pub async fn get_map_world_info(
    app: AppHandle,
    server_id: String,
    world_id: String,
) -> Result<MapWorldInfo, String> {
    let app_data = app_data_dir(&app)?;
    let server_root = server_dir(&app_data, &server_id)?;
    let world_root = resolve_world_directory(&server_root, &world_id)?;
    tokio::task::spawn_blocking(move || inspect_world_info(&world_root, &world_id))
        .await
        .map_err(|error| format!("Map world inspection worker failed: {error}"))?
}

#[tauri::command]
pub async fn repair_map_bridge(
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
    asset_missing: bool,
    coverage: Option<(bool, f32)>,
    diagnostic: Option<&str>,
) {
    let (has_terrain, coverage_ratio) = coverage.unwrap_or_else(|| png_coverage(png));
    let render_state = if asset_missing {
        "asset_missing"
    } else if diagnostic.is_some() {
        "error"
    } else if has_terrain {
        "terrain"
    } else {
        "empty"
    };
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

#[tauri::command]
pub async fn get_map_asset_status(
    app: AppHandle,
    server_id: String,
) -> Result<map_assets::AssetStatus, String> {
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    tokio::task::spawn_blocking(move || map_assets::source_status(&root))
        .await
        .map_err(|error| format!("Map asset status worker failed: {error}"))?
}

#[tauri::command]
pub async fn select_map_asset(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
    source_path: String,
) -> Result<map_assets::AssetStatus, String> {
    let app_data = app_data_dir(&app)?;
    let root = server_dir(&app_data, &server_id)?;
    let config = map_assets::AssetConfig {
        source_path: Some(source_path),
    };
    map_assets::write_config(&root, &config)?;
    manager
        .asset_cache
        .lock()
        .map_err(|_| "Map asset cache is poisoned".to_string())?
        .remove(&server_id);
    manager
        .tile_cache
        .lock()
        .await
        .remove_where(|key| key.server_id == server_id);
    tokio::task::spawn_blocking(move || map_assets::source_status(&root))
        .await
        .map_err(|error| format!("Map asset status worker failed: {error}"))?
}

#[tauri::command]
pub async fn enable_map(
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

#[tauri::command]
pub async fn pause_map(
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

#[tauri::command]
pub async fn restore_map(
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

#[tauri::command]
pub async fn remove_map_component(
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
        .retain(|key, _| key.server_id != server_id);
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

    if let Some(tile) = manager.tile_cache.lock().await.get(&key) {
        emit_map_tile_ready(&app, &key, &tile, 0, assets.is_none(), None, None);
        return Ok(tauri::ipc::Response::new(tile));
    }
    if let Some(tile) = read_disk_tile(&server_root, &key)? {
        manager
            .tile_cache
            .lock()
            .await
            .insert(key.clone(), tile.clone());
        emit_map_tile_ready(&app, &key, &tile, 0, assets.is_none(), None, None);
        return Ok(tauri::ipc::Response::new(tile));
    }

    if let Some(receiver) = join_inflight_tile(&manager, &key).await? {
        return match receiver.await {
            Ok(Ok(tile)) => Ok(tauri::ipc::Response::new(tile)),
            Ok(Err(error)) => Err(error),
            Err(_) => Err("Map tile render request was cancelled".to_string()),
        };
    }

    let tile_key = key.clone();
    let tile_permit = manager
        .tile_scheduler
        .acquire(key.clone(), TilePriority::Viewport)
        .await;
    let tile_result: Result<Vec<u8>, String> = async {
        let _tile_permit = tile_permit?;

        let asset_missing = assets.is_none();
        let dimension = if key.world_id == "overworld" {
            "minecraft:overworld"
        } else {
            key.world_id.as_str()
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
            asset_missing,
            Some((rendered.has_terrain, rendered.coverage_ratio)),
            rendered.message.as_deref(),
        );

        manager
            .tile_cache
            .lock()
            .await
            .insert(tile_key.clone(), tile.clone());
        write_disk_tile(&server_root, &tile_key, &tile)?;
        Ok(tile)
    }
    .await;

    finish_inflight_tile(&manager, &key, tile_result)
        .await
        .map(tauri::ipc::Response::new)
}

#[tauri::command]
pub async fn get_map_tile(
    app: AppHandle,
    manager: State<'_, MapBridgeManager>,
    server_id: String,
    world_id: String,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
) -> Result<tauri::ipc::Response, String> {
    render_map_tile(
        app,
        Arc::new(manager.inner().clone()),
        server_id,
        world_id,
        zoom,
        tile_x,
        tile_y,
    )
    .await
}

#[tauri::command]
pub async fn request_map_render(
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
    let shared_manager = Arc::new(manager.inner().clone());
    let mut accepted = 0;
    for (tile_x, tile_y) in coordinates {
        let app = app.clone();
        let manager = Arc::clone(&shared_manager);
        let server_id = server_id.clone();
        let world_id = world_id.clone();
        tokio::spawn(async move {
            if let Err(error) = render_map_tile(
                app.clone(),
                manager,
                server_id.clone(),
                world_id,
                viewport.zoom,
                tile_x,
                tile_y,
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
                match fs::create_dir(&current) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                    Err(error) => {
                        return Err(format!(
                            "Failed to create map tile cache directory: {error}"
                        ));
                    }
                }
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

fn read_disk_tile(server_root: &Path, key: &TileCacheKey) -> Result<Option<Vec<u8>>, String> {
    let Some(directory) = tile_cache_directory(server_root, key, false)? else {
        return Ok(None);
    };
    let path = directory.join(format!("{}.png", key.tile_y));
    crate::map::tiles::read_png(&path)
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

fn write_disk_tile(server_root: &Path, key: &TileCacheKey, bytes: &[u8]) -> Result<(), String> {
    let Some(directory) = tile_cache_directory(server_root, key, true)? else {
        return Err("Map tile cache directory could not be created".to_string());
    };
    let path = directory.join(format!("{}.png", key.tile_y));
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
            return Err(format!(
                "Refusing to replace a non-regular cached map tile: {}",
                path.display()
            ));
        }
    }
    crate::map::tiles::write_png_atomic(&path, bytes)
}

type Rgba = [u8; 4];

fn existing_chunk_coordinates_for_tile(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
) -> Result<Vec<(i64, i64)>, String> {
    let bounds = TileWorldBounds::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    let tile_min_x = bounds.origin_x;
    let tile_min_z = bounds.origin_z;
    let tile_max_x = bounds.max_x();
    let tile_max_z = bounds.max_z();
    let min_chunk_x = floor_div(tile_min_x, 16);
    let max_chunk_x = floor_div(tile_max_x, 16);
    let min_chunk_z = floor_div(tile_min_z, 16);
    let max_chunk_z = floor_div(tile_max_z, 16);
    present_chunks_for_bounds(
        world_root,
        min_chunk_x,
        max_chunk_x,
        min_chunk_z,
        max_chunk_z,
    )
}

fn ray_chunk_coordinates_for_tile(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
) -> Result<Vec<(i64, i64)>, String> {
    let bounds = TileWorldBounds::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    let min_chunk_x = floor_div(bounds.origin_x - RAY_CHUNK_PADDING_BLOCKS, 16);
    let max_chunk_x = floor_div(bounds.max_x() + RAY_CHUNK_PADDING_BLOCKS, 16);
    let min_chunk_z = floor_div(bounds.origin_z - RAY_CHUNK_PADDING_BLOCKS, 16);
    let max_chunk_z = floor_div(bounds.max_z() + RAY_CHUNK_PADDING_BLOCKS, 16);
    present_chunks_for_bounds(
        world_root,
        min_chunk_x,
        max_chunk_x,
        min_chunk_z,
        max_chunk_z,
    )
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
        recommended_zoom,
    })
}

fn render_chunk<'a>(
    world_root: &Path,
    chunk_x: i64,
    chunk_z: i64,
    chunks: &'a mut HashMap<(i64, i64), Result<Option<CompleteChunk>, String>>,
    diagnostic: &mut Option<String>,
) -> Option<&'a CompleteChunk> {
    if !chunks.contains_key(&(chunk_x, chunk_z)) {
        let key = ChunkKey::new("minecraft:overworld", chunk_x, chunk_z);
        let rendered = read_complete_chunk(world_root, &key);
        if let Err(error) = &rendered {
            if diagnostic.is_none() {
                *diagnostic = Some(format!(
                    "Failed to read chunk ({chunk_x}, {chunk_z}): {error}"
                ));
            }
        }
        chunks.insert((chunk_x, chunk_z), rendered);
    }
    chunks
        .get(&(chunk_x, chunk_z))
        .and_then(|result| result.as_ref().ok())
        .and_then(Option::as_ref)
}

fn fallback_terrain_colour(_world_x: i64, _world_z: i64) -> Rgba {
    [0, 0, 0, 0]
}

fn chunk_surface_sample(
    chunk: &CompleteChunk,
    local_x: usize,
    local_z: usize,
) -> Option<SurfaceSample> {
    let range = chunk.y_range();
    if range.start >= range.end {
        return None;
    }

    // `fastanvil::complete::Chunk::surface_height(..., Calculate)` is still a
    // `todo!()` in fastanvil 0.32. The real Paper 1.21 chunks can contain a
    // heightmap that is absent or outside the decoded section range, so never
    // call that implementation here. Trust a valid persisted heightmap and
    // otherwise scan the decoded section ourselves.
    let trusted_top = chunk.surface_height(local_x, local_z, HeightMode::Trust);
    let top = if trusted_top > range.start
        && trusted_top <= range.end
        && !(trusted_top == 0 && range.start < 0)
    {
        trusted_top
    } else {
        range.end
    };
    for y in (range.start..top).rev() {
        let Some(block) = chunk.block(local_x, y, local_z) else {
            continue;
        };
        if matches!(
            block.name(),
            "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
        ) {
            continue;
        }
        let biome = chunk
            .biome(local_x, y, local_z)
            .map(|biome| format!("{biome:?}").to_ascii_lowercase())
            .unwrap_or_default();
        return Some(SurfaceSample {
            state: block.encoded_description().to_string(),
            biome,
            y: y as i32,
            sky_light: 15,
            block_light: 0,
        });
    }
    None
}

fn complete_block_sample(
    chunk: &CompleteChunk,
    local_x: usize,
    y: i32,
    local_z: usize,
) -> Option<SurfaceSample> {
    let y = y as isize;
    let block = chunk.block(local_x, y, local_z)?;
    if is_air_state(block.name()) {
        return None;
    }
    let biome = chunk
        .biome(local_x, y, local_z)
        .map(|biome| format!("{biome:?}").to_ascii_lowercase())
        .unwrap_or_else(|| "minecraft:plains".to_string());
    Some(SurfaceSample {
        state: block.encoded_description().to_string(),
        biome,
        y: y as i32,
        sky_light: 15,
        block_light: 0,
    })
}

fn complete_chunk_max_surface_y(chunk: &CompleteChunk) -> Option<i32> {
    let range = chunk.y_range();
    if range.start >= range.end {
        return None;
    }
    let trusted_maximum = chunk.heightmap.iter().copied().max().unwrap_or_default() as i32;
    if trusted_maximum > range.start as i32
        && trusted_maximum <= range.end as i32
        && !(trusted_maximum == 0 && range.start < 0)
    {
        return Some(trusted_maximum.clamp(range.start as i32, range.end as i32 - 1));
    }

    // Partial Paper saves can contain block data while omitting or zeroing the
    // persisted motion-blocking heightmap. The renderer must not treat those
    // chunks as empty, otherwise the traversal fast-forward skips all terrain.
    // Scan only the highest non-air block in each column; this is slower than a
    // valid heightmap but still bounded to 256 columns and is done once per
    // render request through the chunk cache.
    let mut maximum = None;
    for local_z in 0..16 {
        for local_x in 0..16 {
            let Some(y) = (range.start..range.end).rev().find(|y| {
                chunk
                    .block(local_x, *y, local_z)
                    .map(|block| !is_air_state(block.name()))
                    .unwrap_or(false)
            }) else {
                continue;
            };
            maximum = Some(maximum.map_or(y as i32, |current: i32| current.max(y as i32)));
        }
    }
    maximum
}

fn live_chunk_max_surface_y(snapshot: &ChunkView) -> Option<i32> {
    snapshot
        .columns
        .iter()
        .flat_map(|column| column.iter())
        .filter(|layer| !is_air_state(&layer.state))
        .map(|layer| layer.y)
        .max()
}

fn live_block_sample(
    snapshot: &ChunkView,
    local_x: usize,
    y: i32,
    local_z: usize,
) -> Option<SurfaceSample> {
    snapshot
        .column(local_x, local_z)?
        .iter()
        .find(|layer| layer.y == y && !is_air_state(&layer.state))
        .map(|layer| SurfaceSample {
            state: layer.state.clone(),
            biome: layer.biome.clone(),
            y: layer.y,
            sky_light: layer.sky_light,
            block_light: layer.block_light,
        })
}

fn is_air_state(state: &str) -> bool {
    matches!(
        state.split('|').next().unwrap_or(state),
        "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
    )
}

fn live_surface_sample(
    snapshot: &ChunkView,
    local_x: usize,
    local_z: usize,
) -> Option<SurfaceSample> {
    snapshot
        .surface_layer(local_x, local_z)
        .map(|layer| SurfaceSample {
            state: layer.state.clone(),
            biome: layer.biome.clone(),
            y: layer.y,
            sky_light: layer.sky_light,
            block_light: layer.block_light,
        })
}

fn surface_base_colour(sample: &SurfaceSample, assets: Option<&MapAssets>, u: f32, v: f32) -> Rgba {
    surface_face_colour(sample, assets, Face::Up, u, v)
}

fn surface_face_colour(
    sample: &SurfaceSample,
    assets: Option<&MapAssets>,
    face: Face,
    u: f32,
    v: f32,
) -> Rgba {
    let face_name = match face {
        Face::Down => "down",
        Face::Up => "up",
        Face::North => "north",
        Face::South => "south",
        Face::West => "west",
        Face::East => "east",
    };
    assets
        .map(|assets| {
            assets.sample_state_face_at_with_biome(&sample.state, &sample.biome, face_name, u, v)
        })
        .unwrap_or_else(|| map_assets::fallback_block_colour(&sample.state))
}

fn shaded_surface_colour(
    sample: &SurfaceSample,
    assets: Option<&MapAssets>,
    u: f32,
    v: f32,
    face: Face,
    height_gradient: f32,
) -> Rgba {
    shade_surface(
        surface_base_colour(sample, assets, u, v),
        sample.y,
        sample.sky_light,
        sample.block_light,
        face,
        height_gradient,
    )
}

fn surface_colour(
    chunk: &CompleteChunk,
    local_x: usize,
    local_z: usize,
    assets: Option<&MapAssets>,
) -> Rgba {
    let Some(sample) = chunk_surface_sample(chunk, local_x, local_z) else {
        return fallback_terrain_colour(0, 0);
    };
    shaded_surface_colour(&sample, assets, 0.5, 0.5, Face::Up, 1.0)
}

fn live_surface_colour(
    snapshot: &ChunkView,
    local_x: usize,
    local_z: usize,
    assets: Option<&MapAssets>,
) -> Rgba {
    let Some(sample) = live_surface_sample(snapshot, local_x, local_z) else {
        return fallback_terrain_colour(0, 0);
    };
    shaded_surface_colour(&sample, assets, 0.5, 0.5, Face::Up, 1.0)
}

fn average_surface_colours(colours: impl IntoIterator<Item = Rgba>) -> Rgba {
    let mut sums = [0u64; 4];
    let mut count = 0u64;
    for colour in colours {
        if colour[3] == 0 {
            continue;
        }
        for (sum, value) in sums.iter_mut().zip(colour) {
            *sum += u64::from(value);
        }
        count += 1;
    }
    if count == 0 {
        return fallback_terrain_colour(0, 0);
    }
    [
        (sums[0] / count) as u8,
        (sums[1] / count) as u8,
        (sums[2] / count) as u8,
        (sums[3] / count) as u8,
    ]
}

fn chunk_representative_colour(chunk: &CompleteChunk, assets: Option<&MapAssets>) -> Rgba {
    average_surface_colours((0..16).flat_map(|local_z| {
        (0..16).map(move |local_x| surface_colour(chunk, local_x, local_z, assets))
    }))
}

fn render_overview_tile(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    assets: Option<&MapAssets>,
    live_chunks: Option<&LiveChunkMap>,
) -> Result<TileRenderResult, String> {
    let bounds = TileWorldBounds::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    let mut chunks: HashMap<(i64, i64), Result<Option<CompleteChunk>, String>> = HashMap::new();
    let mut diagnostic = None;
    let mut coordinates = existing_chunk_coordinates_for_tile(world_root, zoom, tile_x, tile_y)?;
    if let Some(live_chunks) = live_chunks {
        for snapshot in live_chunks.values() {
            if !coordinates.contains(&(snapshot.key.chunk_x, snapshot.key.chunk_z))
                && bounds.intersects_chunk(snapshot.key.chunk_x, snapshot.key.chunk_z)
            {
                coordinates.push((snapshot.key.chunk_x, snapshot.key.chunk_z));
            }
        }
    }

    let mut tile_buffer = RgbaTileBuffer::new(TILE_SIZE as usize, TILE_SIZE as usize);
    let mut rendered_chunk_count = 0;
    for (chunk_x, chunk_z) in coordinates {
        let colour = if let Some(snapshot) =
            live_chunks.and_then(|chunks| chunks.get(&(chunk_x, chunk_z)))
        {
            average_surface_colours((0..16).flat_map(|local_z| {
                (0..16).map(move |local_x| live_surface_colour(snapshot, local_x, local_z, assets))
            }))
        } else {
            render_chunk(world_root, chunk_x, chunk_z, &mut chunks, &mut diagnostic)
                .map(|chunk| chunk_representative_colour(chunk, assets))
                .unwrap_or_else(|| fallback_terrain_colour(0, 0))
        };
        if colour[3] == 0 {
            continue;
        }
        rendered_chunk_count += 1;

        // A chunk can cover less than one output pixel at overview zooms. The
        // old implementation wrote only the chunk centre, which made sparse
        // generated terrain disappear whenever the fixed sample missed it.
        // Rasterize the complete chunk footprint instead and aggregate all
        // present chunks landing in the same overview pixel.
        let Some((pixel_x, pixel_z)) = bounds.chunk_pixel_range(chunk_x, chunk_z) else {
            continue;
        };
        tile_buffer.add_rect(pixel_x, pixel_z, colour);
    }

    let has_terrain = tile_buffer.covered_pixels() > 0;
    let coverage_ratio = tile_buffer.coverage_ratio();
    let png = encode_png_rgba(TILE_SIZE, TILE_SIZE, &tile_buffer.into_scanlines())?;
    Ok(TileRenderResult {
        png,
        rendered_chunk_count,
        has_terrain,
        coverage_ratio,
        message: diagnostic,
    })
}

fn render_world_tile_detailed(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    assets: Option<&MapAssets>,
    live_chunks: Option<&LiveChunkMap>,
) -> Result<TileRenderResult, String> {
    let blocks_per_pixel = 1_i64 << (MAX_ZOOM - zoom);
    if blocks_per_pixel >= 16 {
        return render_overview_tile(world_root, zoom, tile_x, tile_y, assets, live_chunks);
    }
    let saved_chunk_coordinates = ray_chunk_coordinates_for_tile(world_root, zoom, tile_x, tile_y)?;
    if live_chunks.is_none_or(HashMap::is_empty) && saved_chunk_coordinates.is_empty() {
        // Avoid walking tens of thousands of air voxels for a tile whose
        // region headers already prove that no saved chunk intersects it.
        return render_overview_tile(world_root, zoom, tile_x, tile_y, assets, live_chunks);
    }

    let bounds = TileWorldBounds::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    let mut chunks: HashMap<(i64, i64), Result<Option<CompleteChunk>, String>> = HashMap::new();
    let mut diagnostic = None;
    let mut rendered_chunks = HashSet::new();
    let live_chunks = live_chunks.cloned().unwrap_or_default();
    let all_saved_chunk_coordinates = enumerate_region_files(world_root)?
        .into_iter()
        .flat_map(|index| index.present_chunks().iter().copied().collect::<Vec<_>>())
        .collect::<HashSet<_>>();
    let mut max_surface_cache = HashMap::new();
    for &(chunk_x, chunk_z) in &saved_chunk_coordinates {
        let max_surface = render_chunk(world_root, chunk_x, chunk_z, &mut chunks, &mut diagnostic)
            .and_then(complete_chunk_max_surface_y);
        max_surface_cache.insert((chunk_x, chunk_z), max_surface);
    }
    for ((chunk_x, chunk_z), snapshot) in &live_chunks {
        max_surface_cache.insert((*chunk_x, *chunk_z), live_chunk_max_surface_y(snapshot));
    }
    let mut model_cache: HashMap<(String, String), Option<Vec<crate::map::assets::RenderFace>>> =
        HashMap::new();
    let assets_for_models = assets;
    let min_y = live_chunks
        .values()
        .map(|snapshot| snapshot.min_y)
        .min()
        .unwrap_or(-64);
    let max_y = live_chunks
        .values()
        .map(|snapshot| snapshot.max_y)
        .max()
        .unwrap_or(320);
    let rendered = render_iso_tile(
        bounds,
        min_y,
        max_y,
        |world_x, y, world_z| {
            let chunk_x = floor_div(world_x, 16);
            let chunk_z = floor_div(world_z, 16);
            let local_x = floor_mod(world_x, 16) as usize;
            let local_z = floor_mod(world_z, 16) as usize;
            if let Some(snapshot) = live_chunks.get(&(chunk_x, chunk_z)) {
                let sample = live_block_sample(snapshot, local_x, y, local_z);
                if sample.is_some() {
                    rendered_chunks.insert((chunk_x, chunk_z));
                }
                return sample;
            }
            let sample = render_chunk(world_root, chunk_x, chunk_z, &mut chunks, &mut diagnostic)
                .and_then(|chunk| complete_block_sample(chunk, local_x, y, local_z));
            if sample.is_some() {
                rendered_chunks.insert((chunk_x, chunk_z));
            }
            sample
        },
        |world_x, world_z| {
            let key = (floor_div(world_x, 16), floor_div(world_z, 16));
            max_surface_cache.get(&key).copied().map_or_else(
                || (!all_saved_chunk_coordinates.contains(&key)).then_some(min_y - 1),
                |max_surface| max_surface.or(Some(min_y - 1)),
            )
        },
        |sample| {
            let Some(assets) = assets_for_models else {
                return None;
            };
            let key = (sample.state.clone(), sample.biome.clone());
            model_cache
                .entry(key)
                .or_insert_with(|| assets.model_faces(&sample.state))
                .clone()
        },
        |sample, face, u, v| {
            assets_for_models
                .map(|assets| assets.sample_model_face(&sample.state, &sample.biome, face, u, v))
                .unwrap_or_else(|| map_assets::fallback_block_colour(&sample.state))
        },
    )?;
    let pixels = rgba_pixels_to_scanlines(&rendered.pixels, TILE_SIZE as usize, TILE_SIZE as usize);
    let png = encode_png_rgba(TILE_SIZE, TILE_SIZE, &pixels)?;
    let has_terrain = rendered.coverage_ratio > 0.0;
    Ok(TileRenderResult {
        png,
        rendered_chunk_count: rendered_chunks.len(),
        has_terrain,
        coverage_ratio: rendered.coverage_ratio,
        message: diagnostic,
    })
}

fn rgba_pixels_to_scanlines(pixels: &[u8], width: usize, height: usize) -> Vec<u8> {
    let mut scanlines = Vec::with_capacity(height * (1 + width * 4));
    for row in pixels.chunks_exact(width * 4).take(height) {
        scanlines.push(0);
        scanlines.extend_from_slice(row);
    }
    scanlines
}

fn encode_png_rgba(width: u32, height: u32, raw_scanlines: &[u8]) -> Result<Vec<u8>, String> {
    let expected = height as usize * (1 + width as usize * 4);
    if raw_scanlines.len() != expected {
        return Err("PNG scanline buffer has an invalid size".to_string());
    }
    let mut compressed = ZlibEncoder::new(Vec::new(), Compression::fast());
    compressed
        .write_all(raw_scanlines)
        .map_err(|error| format!("Failed to compress map tile: {error}"))?;
    let compressed = compressed
        .finish()
        .map_err(|error| format!("Failed to finish map tile compression: {error}"))?;

    let mut png = Vec::new();
    png.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    append_png_chunk(&mut png, *b"IHDR", &header);
    append_png_chunk(&mut png, *b"IDAT", &compressed);
    append_png_chunk(&mut png, *b"IEND", &[]);
    Ok(png)
}

fn append_png_chunk(png: &mut Vec<u8>, kind: [u8; 4], data: &[u8]) {
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    png.extend_from_slice(&kind);
    png.extend_from_slice(data);
    let mut crc_input = Vec::with_capacity(kind.len() + data.len());
    crc_input.extend_from_slice(&kind);
    crc_input.extend_from_slice(data);
    png.extend_from_slice(&crc32(&crc_input).to_be_bytes());
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use crate::map::world::{ChunkLayer, ChunkSourceKind};
    use base64::Engine;

    use super::*;

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
        write_disk_tile(&root, &key, png).expect("tile should be written");
        assert_eq!(
            read_disk_tile(&root, &key).expect("tile should be read"),
            Some(png.to_vec())
        );
        remove_map_cache(&root).expect("managed cache should be removable");
        assert!(!root.join("map-cache").exists());
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
        assert!(MAX_BRIDGE_LINE_BYTES >= 64 * 1024);
    }
}
