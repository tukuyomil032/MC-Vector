# MC-Vector Reimplementation Design

## Responsibility mapping

| Dynmap responsibility | MC-Vector implementation |
| --- | --- |
| platform adapter | `MC-Vector Core` Java plugin |
| `MapChunkCache` | Rust `ChunkSource` |
| `MapIterator` | Rust `ChunkView` / `BlockIterator` |
| `MapManager` | Rust `TileScheduler` |
| `IsoHDPerspective` | Rust `IsoPerspectiveRenderer` |
| `TexturePack` | Rust `ResourcePackStack` / `TextureResolver` |
| HD shader | Rust `Shader` |
| lighting | Rust `LightingModel` |
| storage | Rust memory and disk cache |
| web tile response | Tauri binary command |
| player state | bridge events and React overlay |

## Rust interfaces

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
    fn request(&self, request: TileRequest) -> TileRequestHandle;
}
```

`RenderedTile` includes PNG bytes, renderer version, coverage ratio, rendered
chunk count, source provenance, render state, and diagnostic message.

## Java boundary

Java remains responsible for Paper lifecycle and observation only. It exposes a
protocol v2 request handler for already-loaded `ChunkSnapshot` data and refuses
to generate or load a chunk for the renderer.

The bridge remains local-only on `127.0.0.1`, authenticates server ID and
token, caps JSON line and snapshot payload sizes, and reconnects without
blocking Paper's main thread.

## Migration from the prototype

The following current functions are migration targets, not final renderer
boundaries:

- `chunk_representative_colour`
- `average_surface_colours`
- `render_overview_tile`
- fixed overview sampling in `render_world_tile_detailed`
- `MapAssets::sample_encoded_state` when it collapses a model to an average
  texture colour

They may remain behind tests during the migration, but the new renderer must
not call them as its successful parity path.

## Tauri and UI contract

Commands remain thin orchestration around a Rust map manager:

```text
get_map_status
get_map_world_info
get_map_asset_status
select_map_asset
request_map_render
get_map_tile
```

Events carry bridge status, player updates, tile invalidation, tile readiness,
asset status, progress, and errors. PNG data uses a binary Tauri response;
metadata uses structured events and status commands.
