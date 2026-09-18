# Dynmap Architecture

## Observed component graph

```text
platform plugin
  -> DynmapCore lifecycle/configuration
      -> MapManager / world scheduling
          -> MapChunkCache + MapIterator
              -> perspective
                  -> block models / TexturePack
                      -> shader + lighting
                          -> image encoder
                              -> MapStorage / web update
```

Dynmap also has independent marker, API, command, servlet, and platform
adapter subsystems. They are not incidental helpers; they are product
boundaries that explain why copying one renderer class is insufficient.

## Source evidence

- `DynmapCore.java` initializes block state, models, texture mappings, map
  types, components, storage, and platform callbacks.
- `MapManager.java` coordinates worlds, render queues, tile updates, full
  renders, zoom-out generation, and storage interactions.
- `MapChunkCache` and `MapIterator` present a stable read-only view to the
  renderer while platform code decides how snapshots are acquired.
- `IsoHDPerspective` consumes the iterator and model registry; it does not read
  Bukkit objects directly during each pixel traversal.

## MC-Vector mapping

| Dynmap responsibility | MC-Vector owner | Boundary |
| --- | --- | --- |
| Plugin lifecycle | `src/map/paper/mc-vector-core` | Java/Paper API |
| Platform chunk acquisition | `src/map/paper` + `src-tauri/src/map/bridge` | JSON Lines v2 |
| World-file read | `src-tauri/src/map/sources` | Rust trait |
| Chunk iterator | `src-tauri/src/map/domain` | immutable `ChunkView` |
| Model and texture registry | `src-tauri/src/map/assets` | versioned asset manifest |
| Perspective and traversal | `src-tauri/src/map/renderer/dynmap` | Rust renderer trait |
| Queue and tile storage | `src-tauri/src/map/tiles` | bounded async scheduler |
| App IPC | `src-tauri/src/commands/map` | Tauri v2 commands/events |
| Viewer | `src/map/components` | React feature |
| Markers and overlays | `src-tauri/src/map/markers`, `overlays` | MC-Vector data model |

## Non-copy boundary

MC-Vector must not depend at runtime on Dynmap, Bukkit internals, Jetty,
Dynmap's web assets, or Dynmap's database/storage implementations. The Java
plugin remains small by design because it is a source adapter, not because the
whole feature is small.

## Review rule

Any new module that crosses this graph must name its owner, input contract,
failure state, and test fixture. A helper that silently reaches across the
Paper process, renderer, and UI is a design defect.
