# R07: Tile Pipeline and Cache

## Goal

Reconnect the verified renderer to bounded tile scheduling, storage, updates,
and Tauri IPC without changing renderer semantics.

## Dependencies

R04, R05, and R06.

## Owned files

- `src-tauri/src/map/tiles/`
- `src-tauri/src/commands/map.rs`
- `src-tauri/src/commands/map/tiles.rs`
- `src-tauri/src/commands/map/world.rs`
- tile IPC contract tests

## Implementation tasks

- keep Tauri commands as validation/delegation adapters;
- resolve map type, perspective, tile bounds, scale, and source through the
  Dynmap-derived renderer pipeline;
- bound requested chunks and preserve neighboring chunks at tile boundaries;
- store PNG and metadata atomically;
- distinguish empty, rendering, stale, asset_missing,
  paper_chunk_unavailable, and renderer error;
- invalidate tiles on dirty chunks and renderer-version changes;
- never cache a transparent or zero-source result as fresh success.

## Focused checks

- saved-only tile;
- live-only tile;
- saved/live mixed tile;
- adjacent tile connection;
- stale invalidation;
- concurrent requests and cancellation;
- cache hit and malformed metadata;
- IPC payload redaction.

## Gate

The real renderer produces and reloads a valid terrain tile through Rust IPC,
while failed or empty source states remain retryable and diagnosable.
