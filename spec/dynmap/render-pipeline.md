# Render Pipeline

## Observed Dynmap flow

1. A tile or update request enters `MapManager`.
2. The map type and perspective calculate required world/chunk bounds.
3. A `MapChunkCache` loads a bounded snapshot.
4. The perspective traverses each output pixel/ray through the cached world.
5. Block models produce render patches; the shader consumes hit state, UV,
   light, biome, and previous-block context.
6. The image is encoded and sent to `MapStorage`.
7. Tile state/update metadata is published to clients.

This is a streaming render pipeline, not a loop that picks two block colours
from an entire region. Required chunks, tile size, scale, perspective, shader,
lighting, and storage identity all participate in the result.

## MC-Vector pipeline

```text
Map request
  -> TileScheduler
  -> source resolver (live/cache/Anvil)
  -> asset/model resolver
  -> PerspectiveRenderer
  -> RGBA/PNG encoder
  -> atomic disk store + memory cache
  -> map-tile-ready event
```

The Tauri command only validates input and delegates to the map application
service. It must not synchronously scan Anvil files or construct PNGs.

## Failure semantics

| Stage | State |
| --- | --- |
| source has no generated chunks | `empty` |
| source is being read/rendered | `rendering` |
| prior image is shown while replacement runs | `stale` |
| source or renderer fails without a valid prior image | `error` |
| no user asset for full model rendering | `asset_missing` or `fallback` |
| bridge cannot provide a requested live chunk | `paper_chunk_unavailable` |

An empty PNG is not a success signal. Metadata carries `hasTerrain`, coverage,
chunk count, provenance, unresolved block count, and quality.

## Source evidence

The primary implementation references are `MapManager.java`,
`IsoHDPerspective.java`, `MapTile.java`, `MapType.java`, and the HD shader
classes at the pinned commit. The current MC-Vector implementation is accepted
as scaffolding only until it follows this data flow.
