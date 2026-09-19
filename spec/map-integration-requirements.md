# MC-Vector Map Integration Requirements

Status: active product contract. The complete map capability inventory is
[`spec/dynmap/map-capability-complete.md`](./dynmap/map-capability-complete.md).
The implementation plan is
[`spec/map/README.md`](./map/README.md); Dynmap behavior and source evidence are
in [`spec/dynmap/README.md`](./dynmap/README.md).

The completion target is complete reproduction of the in-app map capability,
not a partial renderer prototype. The final gate is Phase 27. Earlier phases
are implementation checkpoints and must not be presented as completion.

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

`MC-Vector Core` is a separately distributed runtime component. A production
application must not require a developer checkout or a local Gradle
`build/libs` directory. When Map is enabled and no verified managed Core JAR is
installed, the Rust backend downloads the exact versioned Core asset from the
MC-Vector GitHub Release that matches the application version, verifies its
manifest, SHA-256, size, plugin identity, and protocol compatibility, then
installs it atomically. A failed download or verification never persists Map
consent as enabled and never starts the bridge as if the component were active.
Development builds may use an explicitly identified local artifact for testing,
but that provenance must remain distinguishable from `github_release`.

## Product boundary

### In scope: map capability

- top-down and Iso-style map perspectives supported by the selected Dynmap
  map types;
- all supported dimensions and world layers;
- client-JAR/resource-pack driven blockstate, model, texture, UV, alpha, tint,
  light, shader, and special-block rendering;
- Anvil and live loaded-chunk data, incremental updates, tile scheduling,
  caching, stale tiles, and diagnostic states;
- pan, zoom, recenter, coordinate navigation, map selection, player markers,
  persistent map markers, marker groups, world border, and map-visible time or
  weather overlays;
- Paper bridge behavior required to keep the map current without forcing
  chunk generation or blocking the Paper main thread;
- real Paper, real Tauri, golden-image, and asset-resolution verification.

### Explicitly out of scope

- Dynmap's embedded web server or Jetty surface;
- external HTTP/API compatibility;
- Bukkit commands, permissions, Dynmap configuration compatibility, or
  server-administration integrations that are not needed by the in-app map;
- unrelated chat, proxy, RCON, or external-service integrations;
- automatic redistribution of Mojang/Microsoft Minecraft assets.

## Compatibility

- First server target: Paper 1.21.10; other 1.21.x patches require fixtures.
- First renderer target: Dynmap v3.0 `IsoHDPerspective` behavior.
- First world target: Overworld, with dimensions added in Phase 14.
- First transport: loopback TCP/JSON Lines protocol v2.
- First asset input: user-selected or safely auto-detected client JAR/resource
  pack; assets are not silently bundled.
- Detailed zoom requests use the default `IsoHDPerspective` projected map
  plane, while zoom 0–4 overview requests use world X/Z. Both sides use
  256-pixel tiles, the same zoom boundary, and mathematical floor for negative
  coordinates.

## User/lifecycle states

```text
consent: undecided | enabled | disabled
component: absent | active | paused | waiting_restart | remove_pending | conflict
bridge: not_applicable | connecting | connected | disconnected | incompatible | error
asset: configured | auto_detected | user_selected | missing | version_mismatch | invalid | fallback
tile: terrain | empty | rendering | stale | error | asset_missing | bridge_incompatible | paper_chunk_unavailable | paused
coreArtifact: missing | download_required | downloading | verifying | installed | outdated | invalid | conflict | error
```

Map is shown for active, waiting-restart, paused, remove-pending, and conflict
states. It is hidden only when the managed component is absent and consent is
disabled. Pause renames only the managed artifact to `.jar.disabled`; full
removal waits for a stopped server and never removes an unknown same-named file.
Minecraft asset selection and Core plugin installation are independent states:
selecting a client JAR never proves that Paper has loaded `MC-Vector Core`.
`enable_map` is successful only after `coreArtifact=installed` or an already
verified managed artifact is restored. If the server is running when an
artifact is installed, the result is `waiting_restart` and the server is not
silently restarted.

## Core release contract

The application release tag `vX.Y.Z` is the compatibility anchor for the Core
plugin. The matching GitHub Release publishes:

```text
mc-vector-core-X.Y.Z.jar
mc-vector-core-X.Y.Z.jar.sha256
mc-vector-core-X.Y.Z.manifest.json
```

The manifest records the release tag, app/plugin versions, protocol version,
supported Paper versions, artifact size, SHA-256, and source commit. The
installed server filename remains `plugins/mc-vector-core.jar`; the installed
managed metadata records the versioned release asset and `github_release`
provenance. Unknown same-named JARs are never replaced. The complete build and
release gate is Phase 25, while the immediate enablement/download repair is
Phase 18A.

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

## Completion rule

Phase 27 is the only completion gate. It requires the map capability to be
verified on real Paper and real Tauri with user-owned assets, golden fixtures,
all declared map types, incremental updates, a verified Core release artifact,
and no known blocking runtime errors. A selected JAR without parsed
blockstate/model/texture counts is not a valid asset state. A generated PNG
without non-transparent terrain or a structured tile state is not a valid map
result. A Map component reported enabled without a verified managed Core JAR is
an acceptance failure, not a degraded success state.

## Non-goals

No automatic push/PR/CI dispatch, no external Dynmap web server/API promise,
no forced chunk generation, no Java-side renderer, no unreviewed Minecraft asset
redistribution, and no claim of completion before Phase 27.
