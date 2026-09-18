# MC-Vector Map Integration Requirements

Status: active product contract. The implementation plan is
[`spec/map/README.md`](./map/README.md); Dynmap behavior and source evidence are
in [`spec/dynmap/README.md`](./dynmap/README.md).

## Product boundary

Map is an opt-in per-server feature composed of:

1. `MC-Vector Core`, an independently built Paper Java plugin under
   `src/map/paper/mc-vector-core`;
2. a Rust Map backend under `src-tauri/src/map`;
3. a React feature under `src/map`;
4. selected, attributed Dynmap renderer source under `src/map/dynmap`.

The root `bridge/` directory is migration-only and must disappear after Phase
02. Dynmap is not a runtime dependency. The Java plugin observes the server;
Rust owns world reads, assets, rendering, tiles, and cache.

## Compatibility

- First server target: Paper 1.21.10; other 1.21.x patches require fixtures.
- First renderer target: Dynmap v3.0 `IsoHDPerspective` behavior.
- First world target: Overworld, with dimensions added in Phase 14.
- First transport: loopback TCP/JSON Lines protocol v2.
- First asset input: user-selected or safely auto-detected client JAR/resource
  pack; assets are not silently bundled.

## User/lifecycle states

```text
consent: undecided | enabled | disabled
component: absent | active | paused | waiting_restart | remove_pending | conflict
bridge: not_applicable | connecting | connected | disconnected | incompatible | error
asset: configured | auto_detected | user_selected | missing | version_mismatch | invalid | fallback
tile: terrain | empty | rendering | stale | error | asset_missing | bridge_incompatible | paper_chunk_unavailable | paused
```

Map is shown for active, waiting-restart, paused, remove-pending, and conflict
states. It is hidden only when the managed component is absent and consent is
disabled. Pause renames only the managed artifact to `.jar.disabled`; full
removal waits for a stopped server and never removes an unknown same-named file.

## Paper bridge

The plugin sends hello, heartbeat, player join/quit/snapshot, and dirty chunk
hints. Rust may request one already-loaded chunk surface at a time. Paper caps
requests at 128 and captures at most one chunk per tick. Unloaded chunks are
rejected without generation. No Paper main-thread code performs synchronous
socket I/O, NBT parsing, model resolution, rendering, or PNG encoding.

## Rust data/render contract

Source precedence is fresh live snapshot, live cache, Anvil, last successful
tile, then explicit empty/error. Region headers and 1.21.x section/palette data
are decoded with negative-coordinate correctness, bounded retry, and source
provenance. The renderer uses models, textures, UV, alpha, tint, light, and
Iso-style geometry; fixed representative colours are not a completion path.

Tiles are 256x256 PNGs with bounded viewport-first scheduling, request
coalescing, memory/disk cache, atomic writes, versioned keys, and dirty-chunk
intersection invalidation. Images are returned as binary Tauri responses;
status/progress/errors are structured events.

## UI contract

The Map screen must distinguish real terrain, empty/generated range, rendering,
stale, render error, asset missing, bridge incompatibility, and Paper chunk
unavailability. It must not render a status failure or transparent tile as a
green successful preview. Pan, zoom, recenter, player/marker layers,
management, repair, pause, restore, removal, keyboard, and Japanese/English
states are covered by the phase gates.

## Verification boundary

The following are separate evidence claims: Rust tests, Java/MockBukkit tests,
frontend tests, Gradle/JAR build, real Paper smoke, real Tauri manual use,
golden image comparison, CI, and license/asset review. A passing build does not
prove a real Paper plugin was loaded; a mock does not prove a real Tauri app.

## Non-goals

No automatic push/PR/CI dispatch, no external Dynmap web server/API promise,
no forced chunk generation, no Java-side renderer, no unreviewed Minecraft asset
redistribution, and no claim of completion before Phase 17.
