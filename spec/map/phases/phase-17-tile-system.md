# Phase 17: Projected Tile Continuity and Viewport Scheduler

## Goal

Make one viewport request produce one coherent set of canonical map tiles and
keep completed or stale images visible while replacement tiles are rendered.
This phase addresses the observed thin terrain fragments, four-way tile
splitting, repeated generating state, and requests that continued after the
Paper server stopped.

This is an implementation phase, not the final Dynmap map-feature acceptance
phase. Full block-state coverage, complete model/render parity, all map types,
and the remaining Dynmap map features stay open for later phases.

## Scope

- define one tile-plane contract shared by React and Rust;
- use `WorldXZ` for overview zooms 0–4;
- use `IsoProjected` for detailed zooms 5–8;
- make `request_map_render` the only API that submits new render work;
- make `get_map_tile` a completed/stale-cache read only;
- propagate request ID, request generation, and tile geometry in render events;
- coalesce viewport requests and discard obsolete generations;
- invalidate only tiles intersecting the changed chunk;
- preserve stale PNGs during render and cache failures;
- stop new tile work when the server, bridge, component, or configuration is
  unavailable;
- expose queue saturation as a structured diagnostic state.

## Canonical tile contract

The tile plane is selected from the same zoom rule in both runtimes:

| Zoom | Plane | Coordinate meaning |
| --- | --- | --- |
| 0–4 | `WorldXZ` | world X/Z coordinates |
| 5–8 | `IsoProjected` | the X/Y map-plane coordinates produced by the
  source-derived `IsoHDPerspective` |

`tileX` and `tileY` are floor-divided coordinates on the selected plane. A
tile is always 256×256 pixels and uses `2^(8 - zoom)` map units per pixel.
Negative coordinates use mathematical floor division; truncation toward zero
is not valid.

Rust owns the authoritative `MapTileGeometry` implementation in
`src-tauri/src/map/projection.rs`. React mirrors the contract in
`src/map/state/map-types.ts` for viewport placement and diagnostics. Every
`map-tile-ready` and `map-render-progress` payload contains `geometry` with at
least:

```text
plane, tileSize, zoom, maxZoom, tileX, tileY, blocksPerPixel,
planeOrigin, planeBounds
```

Detailed tile discovery inverse-projects the tile volume through
`IsoHDPerspective`, obtains a conservative world X/Z candidate range, and then
filters candidates using the projected chunk footprint. It must not interpret
an `IsoProjected` tile index as a world X/Z index.

## Request and event lifecycle

`request_map_render(serverId, worldId, viewport)` is the sole submission API.
It creates a monotonically increasing scheduler generation, accepts the
caller-provided request ID/generation when present, and schedules visible
viewport tiles through the bounded Rust scheduler.

`get_map_tile(serverId, worldId, zoom, tileX, tileY)` only returns a completed
or stale PNG from memory or disk. A cache hit does not emit another
`map-tile-ready` event and does not submit work. This separation is required to
prevent a ready-event → byte-fetch → ready-event loop.

Render events carry:

```text
serverId, worldId, zoom, tileX, tileY,
requestId, requestGeneration, geometry,
renderState, hasTerrain, coverageRatio, renderedChunkCount
```

React fetches image bytes only after a current-generation `map-tile-ready`
event. An event from an older request generation cannot replace a newer tile.
When a tile is rendering or fails, the last successful PNG remains mounted and
the diagnostic state is layered over it.

## Scheduler and invalidation rules

The Rust scheduler is bounded and coalesces the same `TileKey` while it is
queued or active. Viewport work is prioritized ahead of adjacent and
background work. A queue-full result is reported as `queue_full`; it is not an
uncaught repeated exception and does not erase an existing tile.

`chunk_dirty` invalidates only cached keys whose tile geometry intersects the
changed chunk. Overview tiles use world-rectangle intersection. Detailed tiles
use the projected chunk footprint with a conservative epsilon at shared
boundaries. Memory and disk entries are marked stale rather than deleting the
last successful PNG. Repeated dirty notifications for the same tile are
coalesced before the frontend changes its viewport invalidation generation.

When the runtime status is offline, disconnected, paused, absent, in conflict,
or still loading, React does not submit a new viewport. Bridge disconnection
also cancels pending scheduler work. A five-second status retry is allowed,
but status retry alone cannot start tile generation.

## Owned files

### Rust

- `src-tauri/src/commands/map.rs`
- `src-tauri/src/commands/map/tiles.rs`
- `src-tauri/src/map/projection.rs`
- `src-tauri/src/map/renderer/**`
- `src-tauri/src/map/tiles/**`
- `src-tauri/src/map/application.rs`

### React

- `src/map/components/MapView.tsx`
- `src/map/state/map-types.ts`
- `src/map/state/map-request-coordinator.ts`
- `src/map/hooks/use-map-events.ts`
- `src/i18n/locales/{ja,en}.ts`
- `tests/map/**`

### Documentation

- `spec/map/phases/phase-17-tile-system.md`
- `spec/ADR-013-map-tile-system.md`

## Focused tests

Rust tests cover:

- plane selection at zoom 4/5;
- negative floor division;
- inverse-projected detailed chunk candidates;
- chunk-boundary intersection and exact invalidation;
- event geometry, request ID, and request generation;
- stale memory/disk retention;
- scheduler coalescing and queue bounds;
- obsolete generation rejection.

Frontend tests cover:

- one viewport submission instead of direct 3×3 tile submissions;
- debounce and request generation guards;
- fetching bytes only after a ready event;
- stale tile retention;
- exact invalidation deduplication;
- offline/bridge/config gating;
- WorldXZ/IsoProjected placement across zoom 8→7→6→5→4;
- safe listener cleanup.

## Diff review checklist

- `get_map_tile` contains no render submission and no ready-event emission on a
  cache read;
- only `request_map_render` calls the scheduler for viewport work;
- Rust and React use the same zoom boundary and map-plane units;
- event context cannot let an old generation replace a current tile;
- dirty events do not invalidate all visible tiles unconditionally;
- stale PNGs survive render and disk-cache failures;
- queue-full is represented as a diagnostic state;
- no dead wrapper, import, event payload, or suppression was added;
- no unrelated renderer or Java scope was mixed into this phase.

## Phase gate

The phase may be marked complete only after:

1. focused Rust tests pass;
2. focused frontend tests, typecheck, lint, and formatting checks pass;
3. repository checks, frontend test/build, Rust format, and the Map Rust test
   gate pass (with unrelated baseline failures recorded separately);
4. the debug app `com.tukuyomi032.mcvector.debug` is tested with Paper
   running;
5. zoom 8→7→6→5→4 and adjacent-tile panning do not split or lose terrain;
6. server stop is performed through the app, Java exits, and port 25565 is
   confirmed free before the debug app is closed.

## Known non-goals

This phase does not claim:

- complete Dynmap visual or feature parity;
- all vanilla block models and block states;
- complete texture, shader, biome tint, or special-renderer coverage;
- Nether/End parity, persistent marker parity, or external Dynmap API/Web
  server compatibility;
- final real-Paper evidence for every supported Minecraft patch;
- push, pull request, release, or CI dispatch.

## Evidence ledger

Evidence is recorded only after the Phase gate. Focused test results before
the gate are implementation evidence, not a completion claim. The final
report must list exact commands, pass/fail counts, debug-app observations,
Paper process shutdown evidence, port 25565 evidence, commits, and known
unrelated failures.

### Current run: 2026-09-19

Automated implementation evidence:

- `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml --lib` passed without new
  warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml 'map::' --lib` passed:
  145 passed, 0 failed.
- Focused frontend Vitest passed: 31 tests passed across the three Map suites.
- `bun run typecheck:tests`, targeted Oxlint/Oxfmt, and `git diff --check`
  passed.
- The Phase gate sequence
  (`bun run check && bun run test && bun run typecheck:tests && bun run build
  && cargo fmt ... && cargo test ... 'map::' --lib`) passed. Frontend totals
  were 52 files and 444 tests; Vite build completed with the existing bundle
  size warnings.

Real-app evidence is incomplete and therefore this Phase is not closed:

- `bun run tauri:dev` required an escalated local-loopback permission for
  Vite on `::1:5173`, then launched `com.tukuyomi032.mcvector.debug`.
- The file picker confirmed the user-owned PrismLauncher asset at
  `/Users/hosiyomi322/Library/Application Support/PrismLauncher/libraries/com/mojang/minecraft/1.21.10/minecraft-1.21.10-client.jar`.
- The Test Paper server started, but its plugin directory contained no
  `mc-vector-core.jar`; the Map management view reported `MC-Vector Core
  artifact is not installed yet`, and Paper initialized zero plugins. As a
  result, the requested terrain zoom sweep and live bridge verification could
  not be performed.
- The server was stopped through the app UI first. The UI did not release the
  Java child promptly, so the explicitly identified Paper process was then
  terminated as cleanup. A final `lsof -nP -iTCP:25565 -sTCP:LISTEN` returned
  no listener before the debug app was closed.

The missing managed Paper artifact is a precondition failure outside this
phase's projected-tile changes. The phase remains open until Phase 18A installs
or downloads the Core JAR and a subsequent run completes the required zoom/pan
and live bridge checks. No final Dynmap parity claim is made.

## Follow-up phases

The final Dynmap map-feature reproduction remains open after Phase 17. The
immediate next phase is Phase 18A: repair artifact-authoritative enablement and
add GitHub Release distribution/on-demand production installation. Only after
that prerequisite is reliable should the dimension, overlay, renderer, and
remaining real-data acceptance contracts proceed. Phase 17 completion must
never be reported as final parity.
