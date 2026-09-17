# Renderer API and Wire Contracts

## Rust domain types

The renderer must use owned, serializable request types at the Tauri boundary
and separate domain types internally.

```rust
pub struct ChunkKey {
    pub dimension: String,
    pub chunk_x: i64,
    pub chunk_z: i64,
}

pub struct ChunkView {
    pub key: ChunkKey,
    pub min_y: i32,
    pub max_y: i32,
    pub revision: u64,
    pub source: ChunkSourceKind,
}

pub enum ChunkSourceKind {
    LiveSnapshot,
    SavedAnvil,
    CachedLive,
}

pub struct TileRenderRequest {
    pub server_id: String,
    pub world_id: String,
    pub zoom: u8,
    pub tile_x: i32,
    pub tile_y: i32,
    pub perspective: String,
}

pub struct RenderedTile {
    pub png: Vec<u8>,
    pub rendered_chunk_count: usize,
    pub coverage_ratio: f32,
    pub render_state: TileRenderState,
    pub renderer_version: String,
    pub source: ChunkSourceKind,
}
```

The concrete module names may evolve, but these ownership boundaries may not be
collapsed back into one untestable command function.

## Required traits

```rust
pub trait ChunkSource {
    fn get_chunk(&self, key: ChunkKey) -> Result<Option<ChunkView>, ChunkSourceError>;
}

pub trait AssetResolver {
    fn resolve_block(&self, state: &BlockState) -> Result<BlockModel, AssetError>;
}

pub trait PerspectiveRenderer {
    fn render_tile(
        &self,
        request: TileRenderRequest,
        source: &dyn ChunkSource,
        assets: &dyn AssetResolver,
    ) -> Result<RenderedTile, RenderError>;
}

pub trait TileScheduler {
    fn request(&self, request: TileRenderRequest) -> TileRequestHandle;
}
```

## Bridge messages

The bridge remains UTF-8 JSON Lines on loopback. Protocol v2 supports the
existing hello, heartbeat, player, and dirty messages plus bounded live
snapshot requests.

```json
{
  "type": "chunk_snapshot_request",
  "requestId": "request-id",
  "dimension": "minecraft:overworld",
  "chunkX": 12,
  "chunkZ": -4,
  "preferLive": true
}
```

Successful response:

```json
{
  "type": "chunk_snapshot",
  "requestId": "request-id",
  "dimension": "minecraft:overworld",
  "chunkX": 12,
  "chunkZ": -4,
  "capturedAt": 0,
  "codec": "deflate-base64",
  "payload": "..."
}
```

Unavailable response:

```json
{
  "type": "chunk_snapshot_unavailable",
  "requestId": "request-id",
  "reason": "not_loaded"
}
```

Limits:

- maximum JSON line: 1 MiB;
- maximum pending Java snapshot requests: 128;
- maximum snapshot requests processed by Paper: one per tick;
- request timeout and bounded retry on Rust;
- no forced chunk load or world generation;
- no token in logs or diagnostic messages.

## Tauri commands and events

Commands:

```text
get_map_status(serverId)
get_map_world_info(serverId, worldId)
get_map_asset_status(serverId)
select_map_asset(serverId, sourcePath)
request_map_render(serverId, worldId, viewport)
get_map_tile(serverId, worldId, zoom, tileX, tileY)
repair_map_bridge(serverId)
enable_map(serverId)
pause_map(serverId)
restore_map(serverId)
remove_map_component(serverId)
```

Events:

```text
map-bridge-status
map-players-updated
map-tile-invalidated
map-tile-ready
map-render-progress
map-asset-status
map-error
```

`get_map_tile` returns binary PNG data. Tile state and diagnostic metadata are
not embedded in the PNG; they are delivered through `map-tile-ready` or a
structured command result.

## State vocabulary

```text
terrain
empty
rendering
stale
error
asset_missing
bridge_incompatible
paper_chunk_unavailable
paused
```

`connected` is only a bridge transport state. It is not sufficient evidence
that a renderer can read a world or resolve assets.
