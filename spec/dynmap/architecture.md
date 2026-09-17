# Dynmap v3.0 Architecture

## Observed module boundaries

The v3.0 project has a stable public API layer and a much larger internal core.
The internal core is bootstrapped by platform modules rather than being a
generic standalone renderer.

| Area | Observed responsibility | MC-Vector decision |
| --- | --- | --- |
| `DynmapCoreAPI` | Stable public interfaces for integrations | Do not depend on it at runtime |
| `DynmapCore` | Internal lifecycle and coordination | Reimplement only required renderer behavior |
| `MapManager` | Render workers, pending work, full-world and tile updates | Rust `TileScheduler` |
| `hdmap` | Perspective, block geometry, texture, shader, lighting | Rust renderer, with selected source porting |
| `spigot`/helpers | Platform-specific world access | Java `MC-Vector Core` adapter |
| `storage` | File tree and database tile backends | Rust disk cache first |
| `markers` | Persistent and runtime marker features | Later phase |
| `web` | Embedded Jetty HTTP server and UI routing | Tauri IPC and React |

The primary source for this module split is the project guide and the package
layout it describes:
[Dynmap v3.0 architecture](https://github.com/webbukkit/dynmap/blob/v3.0/CLAUDE.md).

## Render data flow

```text
Paper world
  -> Java platform adapter
  -> loaded chunk snapshot / dirty hint
  -> Rust ChunkSource
  -> ChunkView / BlockIterator
  -> TileScheduler
  -> PerspectiveRenderer
  -> model and texture resolver
  -> shader and lighting
  -> PNG tile
  -> memory and disk cache
  -> Tauri binary response
  -> React map surface
```

The important difference from the current prototype is that a chunk is not
reduced to one representative colour before projection. A rendered pixel may
visit several blocks and several model patches along a ray.

## Worker ownership

`MapManager` owns asynchronous render work in Dynmap. MC-Vector maps this to a
Rust-owned bounded scheduler. The Paper main thread is an observation boundary,
not a render worker. It may create a static snapshot for a loaded chunk, but it
must never perform texture decoding, PNG encoding, or a blocking socket wait.

## Configuration and non-goals

Dynmap's platform configuration, web server, commands, and marker persistence
are not imported into MC-Vector's first renderer. MC-Vector keeps its existing
per-server consent and managed-component lifecycle. Renderer configuration is
versioned independently from plugin lifecycle state.
