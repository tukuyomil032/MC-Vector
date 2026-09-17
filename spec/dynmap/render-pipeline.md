# Render Pipeline

## Dynmap stages

The v3.0 render path is not a chunk-colour map. A tile request determines the
chunks required by the selected perspective, creates a platform cache, and
then renders pixels through a perspective and shader pipeline. `MapManager`
coordinates work while `IsoHDPerspective` performs the hot ray-tracing path.

```text
Tile request
  -> required chunk bounds
  -> MapChunkCache / MapIterator
  -> pixel ray
  -> voxel traversal
  -> model patches and face intersections
  -> texture / tint / light
  -> shader state
  -> alpha composition
  -> tile flags and PNG
  -> persistent storage
```

Sources:

- [MapManager.java](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/java/org/dynmap/MapManager.java)
- [IsoHDPerspective.java](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java)

## Current MC-Vector gap

The current code has two different paths:

- overview zooms enumerate present chunks but write a representative chunk
  colour at one pixel;
- close zooms sample a small fixed grid per output pixel and render a surface
  colour.

This avoids a whole-world scan, but it cannot reproduce buildings, partial
blocks, face orientation, occlusion, or Dynmap's oblique projection. A sparse
sample can also miss a generated chunk entirely.

The replacement must not call `chunk_representative_colour` or
`average_surface_colours` as the final pixel renderer.

## MC-Vector render contract

```rust
pub trait PerspectiveRenderer {
    fn render_tile(
        &self,
        request: TileRenderRequest,
        source: &dyn ChunkSource,
        assets: &dyn AssetResolver,
    ) -> Result<RenderedTile, RenderError>;
}
```

`RenderedTile` includes the PNG plus coverage, rendered chunk count, source
provenance, render state, and renderer version. The binary PNG is returned
through Tauri; metadata is emitted as structured state.

## Failure behavior

- An empty generated range returns `empty`, not a green success surface.
- A missing asset returns `asset_missing` with an explicit quality message.
- A read failure returns `error` or retains the last successful tile as
  `stale`.
- An incomplete chunk causes a bounded retry.
- A tile is replaced only after a complete PNG is atomically available.
- Old cache entries from the prototype renderer are not treated as new
  renderer output.
