# R37: Tile geometry and tile pyramid

## Purpose

Define the backend tile-coordinate contract before reconnecting cache,
scheduling, Tauri IPC, or the Map UI. This phase keeps one world-coordinate
anchor stable across zoom `0..8`, handles negative coordinates with floor
division, and makes the projection-specific required-chunk boundary explicit.

## Scope

- `WorldXZ` and `IsoProjected` projection categories.
- Zoom levels `0..=8`.
- Half-open world bounds for every tile.
- Default extent `2048` at zoom `0`, down to `8` at zoom `8`.
- Adjacent tile bounds for north/east/south/west traversal.
- Display-center-prioritized chunk candidates with a hard maximum of `64`.
- One-chunk conservative edge padding for `IsoProjected` candidates.
- Stable behavior for negative world and chunk coordinates.

The `TilePyramid` is a pure renderer-core geometry contract. It does not yet
render PNGs, read cache entries, schedule work, select saved/live sources, or
drive frontend transforms.

## Rust destination

- `src-tauri/crates/map-renderer-core/src/renderer/dynmap/tile.rs`
- `src-tauri/crates/map-renderer-core/src/world/chunk_view.rs`

## Input and output contract

The caller supplies a world-coordinate display center, integer target zoom,
projection category, and a requested chunk limit. The pyramid returns either
validated half-open `TileBounds` or an ordered list of chunk coordinates. The
requested limit is capped at `MAX_REQUIRED_CHUNKS = 64`; candidates are sorted
by distance from the display center and then by chunk coordinate for
determinism.

`TileGeometryError` reports invalid zoom, invalid base extent, or arithmetic
overflow. Invalid coordinates are never silently wrapped.

## Failure states

- `InvalidZoom`: target is outside `0..=8`.
- `InvalidBaseExtent`: the configured zoom-zero extent is not a positive power
  of two large enough to represent zoom `8`.
- `Overflow`: tile, adjacent-tile, or world-bound arithmetic cannot be
  represented by the contract's integer coordinate type.

This phase intentionally does not classify missing terrain, unavailable live
chunks, empty renders, or renderer failures. Those belong to the source,
cache, scheduler, and diagnostics phases.

## Tests and fixture boundary

Focused tests cover:

- monotonic extents from zoom `0` through `8`;
- floor division for negative world/chunk coordinates;
- display-center priority over the geometric tile center;
- the `64`-chunk bound and Iso edge padding;
- exact half-open boundaries for adjacent tiles.

No PNG or runtime-generated golden is introduced here. Differential geometry
traces remain the responsibility of the Dynmap reference and fixture phases.

## Gate commands

```bash
bun run check
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## Completion boundary

R37 is complete when the pure tile geometry contract and its focused tests
pass. It does not prove exact Dynmap tile rasterization, adjacent rendered
pixels, cache correctness, scheduler cancellation, Tauri IPC, or UI zoom/pan.
Those remain explicit later phases.

## Commit message

```text
feat: add complete map tile geometry
```
