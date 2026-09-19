# Dynmap Map Capability: Complete Reimplementation Contract

This is the canonical inventory of the map capability MC-Vector must reproduce
from Dynmap v3.0. It is a requirements and evidence document, not a claim that
the current implementation is complete.

## Fixed reference and evidence rule

- Repository: `https://github.com/webbukkit/dynmap`
- Reference branch: `v3.0`
- Immutable research commit:
  `93b454efb8802dc7406d6873434f2aeec5c636f4`
- First runtime fixture: Paper 1.21.10
- First perspective: `IsoHDPerspective`
- Source paths, symbols, licenses, and fixtures are recorded in the documents
  linked by [`README.md`](README.md) and `porting-manifest.md`.

Evidence labels are strict:

- `observed`: confirmed in pinned source, official API, or a fixture;
- `translated`: an attributed Apache-licensed algorithm translated to Rust or
  TypeScript;
- `implemented`: code exists but the required gate is not passed;
- `verified`: the named test, real run, or golden comparison is recorded;
- `open`: still requires investigation or real-data evidence.

## Product boundary

The target is the map capability users experience in Dynmap's map view:

1. read live and saved world data;
2. resolve block states into geometry and textures;
3. project the world through map perspectives;
4. shade, light, tint, composite, and encode tiles;
5. schedule and persist incremental updates;
6. expose worlds, dimensions, players, markers, and map-visible overlays;
7. navigate the result in the MC-Vector application.

The target intentionally excludes Dynmap's embedded Jetty/web server, external
HTTP/API compatibility, Bukkit commands and permissions, Dynmap configuration
compatibility, server-administration integrations, unrelated proxy/RCON
integrations, and automatic redistribution of Mojang/Microsoft assets.

Those exclusions concern product surface only. A transparent PNG or a PNG
endpoint is not a completed map implementation.

## End-to-end data flow

```text
Paper world -> MC-Vector Core (Java)
  loaded snapshots, players, world state, dirty hints, heartbeat
       -> loopback JSON Lines protocol v2
Rust Map backend
  bridge -> live/cache/Anvil sources -> assets -> perspective/renderer
        -> shader/lighting/compositing -> bounded tile scheduler/cache
       -> binary PNG tiles plus structured status/progress/errors
React Map feature
  viewport, tile canvas, players, markers, world overlays, diagnostics
```

No NBT parsing, asset parsing, renderer work, PNG encoding, or synchronous
socket wait belongs on the Paper main thread.

## World, dimension, and map identity

Every source, event, tile, overlay, and cache record carries server ID, world
ID, dimension key, Minecraft/data version, source revision/capture time,
perspective ID, shader ID, and renderer version.

The backend exposes spawn X/Y/Z, generated chunk bounds/count, world border,
time/full time, storm/thunder state and durations, and the last known player
position per dimension. Initial centering prefers an online player, then spawn,
then generated-area center, then `(0, 0)`; it must not always use the origin.

The first verified world is `minecraft:overworld` on Paper 1.21.10. Nether and
End are required map capabilities and require their own fixtures because their
height, sky, fog, and map defaults differ.

### Source precedence

For each requested chunk use:

1. a fresh live `ChunkSnapshot`;
2. a cached live snapshot with known revision;
3. saved Anvil data;
4. the last successful tile as a stale visual fallback;
5. explicit `empty` or `error`.

An unavailable live snapshot must never force-load a chunk. An Anvil write in
progress gets bounded retries; one malformed chunk must not erase other valid
chunks in the tile.

## Map types, perspectives, and coordinates

Map type, perspective, shader, lighting, tile size, zoom range, image format,
and storage identity are independent concepts. The initial map exposes a
low-zoom overview and an Iso-style detailed map; later map types can select a
different perspective without changing world decoding or asset resolution.

There are three coordinate systems:

1. Minecraft world `(X, Y, Z)`;
2. projected map-plane `(mapX, mapY)`;
3. tile/screen `(tileX, tileY, pixelX, pixelY)`.

For the default `IsoHDPerspective(azimuth=135, inclination=60, scale=1)`:

- map-plane coordinates come from the Dynmap matrix, not a UI offset;
- the UI uses projected `mapX` horizontally and projected `mapY` vertically;
- tile indices use mathematical floor for negative values;
- inverse projection determines conservative candidate chunks;
- every player, marker, spawn, and border overlay uses the same projection and
  its own Y coordinate.

Resolution boundary shared by Rust and React:

- zoom `0..4`, where `blocksPerPixel >= 16`: world X/Z overview plane;
- zoom `5..8`, where `blocksPerPixel < 16`: Iso projected map plane.

Both sides use 256-pixel tiles, the same tile origin and zoom boundary, and the
same floor-division behavior. A valid PNG requested in the wrong coordinate
system is a contract failure.

## World data and Anvil decoding

The saved-world reader must:

1. locate the dimension `region/` directory;
2. index the 8 KiB region header and enumerate present local chunks;
3. convert region/local coordinates using signed floor division;
4. decompress the chunk payload by compression type;
5. parse `Level`, `sections`, `block_states.palette`, and packed `data`;
6. decode palette indices with Java's long-array bit order;
7. preserve section Y, block Y, biome, sky light, and block light;
8. record malformed/decode failures without failing the entire tile;
9. expose revision and source provenance to renderer and diagnostics.

Overview tiles enumerate all present chunks intersecting the tile or use a
persisted chunk summary. They may not sample two arbitrary points and call a
sparse world empty.

### Live protocol

Protocol v2 adds bounded requests:

```json
{
  "type": "chunk_snapshot_request",
  "requestId": "request-id",
  "dimension": "overworld",
  "chunkX": 12,
  "chunkZ": -4,
  "preferLive": true
}
```

The Java side returns a size-limited compressed snapshot or:

```json
{
  "type": "chunk_snapshot_unavailable",
  "requestId": "request-id",
  "dimension": "overworld",
  "chunkX": 12,
  "chunkZ": -4,
  "reason": "not_loaded"
}
```

The request queue is bounded at 128, captures are limited to one loaded chunk
per tick, request IDs are deduplicated, and oversized/malformed payloads are
rejected without affecting Paper gameplay.

## Assets, resource packs, and models

A selected path is not a usable asset state until it is opened, identified,
parsed, and included in the tile cache identity. Input order is explicit client
JAR/resource pack, explicit game directory, verified launcher discovery, manual
path, then a clearly labelled low-quality fallback.

The verified local PrismLauncher shared-library layout is:

```text
<PrismLauncher root>/libraries/com/mojang/minecraft/
  <version>/minecraft-<version>-client.jar
```

On macOS the standard root is:

```text
~/Library/Application Support/PrismLauncher
```

The resolver reads each instance's `mmc-pack.json` and custom `.minecraft` or
`minecraft` directory. Other launcher layouts are listed in
`launcher-asset-sources.md`; they are only called verified when a source-backed
fixture exists.

Resource packs are merged in declared priority order, with provenance and
SHA-256 retained for each resolved file. No pack is silently downloaded or
redistributed.

Required resolution includes blockstate variants, multipart/`when`/`OR`, parent
models, texture variables/layers, face UV, rotations, cullface, tint index,
PNG alpha, transparent/translucent textures, animated-texture static frames,
biome tint, and unresolved-state diagnostics. The special-geometry boundary
must cover stairs, slabs, fences, walls, doors, trapdoors, plants, signs,
rails, fluids, glass, snow, and other non-cube blocks.

The manifest records Minecraft version, source paths, source/pack hashes, pack
order, blockstate/model/texture counts, unresolved count, and quality. Cache
keys include this manifest identity, `rendererVersion`, perspective, shader,
world, dimension, zoom, and tile coordinates.

## Rendering pipeline

The detailed renderer is a deterministic pipeline:

1. select map type, perspective, shader, and tile request;
2. enumerate chunks intersecting the tile;
3. create a camera ray for each projected pixel;
4. traverse chunk and voxel boundaries front-to-back;
5. resolve block state and model patches;
6. intersect model faces and calculate UV;
7. sample texture layers with face rotation;
8. apply biome tint, sky light, block light, height and face shading;
9. alpha-composite water, leaves, glass, ice, plants, and other layers;
10. continue through transparent faces when the shader requires it;
11. preserve chunk/tile-edge continuity;
12. validate and encode PNG;
13. publish coverage, provenance, unresolved counts, quality, and state.

The low-zoom overview is a separate chunk-summary/downsampling path. The old
fixed representative-colour or two-sample path is not a completion path.

## Tile scheduling, storage, and updates

All visible, prefetch, player-nearby, and background work uses one bounded
scheduler in this priority order: visible viewport, adjacent tiles, player
area, background/full render. `get_map_tile` and viewport prefetch coalesce on
the same `TileKey`; viewport changes are debounced and obsolete work can be
cancelled.

The cache key contains:

```text
serverId, worldId, dimension, minecraftVersion, resourcePackHash,
assetManifestVersion, rendererVersion, perspectiveId, shaderId,
zoom, tileX, tileY
```

Memory storage is an LRU. Disk storage writes a validated PNG to a temporary
file and then atomically renames it. Directory/storage failure is a diagnostic;
it must not turn a valid in-memory image into an empty success state.

Dirty chunks invalidate only intersecting tiles. Region revision/mtime checks
cover changes that Paper events miss. The previous successful tile remains
visible while its replacement renders or retries.

## Runtime map features

The in-app map must expose world/dimension and map-type selection, pan, zoom,
recenter, coordinate search, player-follow, interpolated online players and
labels, spawn, world border, persistent markers and marker groups, time,
weather, and map-visible chat/overlay state. Render progress, last update,
source quality, and actionable errors are part of the map view.

It does not need Dynmap web pages, external API consumers, Bukkit commands, or
server administration UI.

### Responsibilities

Java/Paper owns lifecycle observation, handshake, loaded-only snapshots,
player/world state, dirty hints, heartbeat, bounded queues, and reconnect.
Rust owns protocol validation, Anvil/NBT, source precedence, assets, geometry,
shader/lighting/compositing, scheduling, cache, invalidation, status, and
binary tiles. React owns viewport interaction, tile/overlay composition,
management, diagnostics, accessibility, and localization.

## Observable states and failure semantics

Every tile resolves to a structured state:

```text
terrain | empty | rendering | stale | error | asset_missing |
bridge_incompatible | paper_chunk_unavailable | paused
```

The UI distinguishes no generated chunks, missing/mismatched assets, bridge
incompatibility, unloaded live chunks, decode failure, renderer failure,
storage failure, and stale-image regeneration. Transparent pixels are valid
only for genuinely empty/transparent content; a transparent PNG without an
`empty` or diagnostic state is not successful.

Background status polling must not replace a working tile with a full-screen
“generating” card. Status, tile rendering, and listeners have separate
lifecycle state and idempotent cleanup.

## Verification matrix and completion rule

Focused tests cover region headers, negative coordinates, sections/palettes,
live payloads, source precedence, model/blockstate/texture/UV/alpha/tint,
Iso rays/voxel traversal/face hits, overview coverage, scheduler coalescing,
cancellation, LRU, atomic writes, dirty invalidation, launcher fixtures, UI
diagnostics, event cleanup, and Java loaded-only snapshot behavior.

Real evidence covers Paper 1.21.10 plugin load, hello, loaded/unloaded snapshot,
live block changes, Prism asset parsing, real Tauri non-empty rendering, cache
reuse after restart, distinct Debug/Production app-data, and golden images for
terrain, water, forest, snow, height, buildings, special blocks, boundaries,
negative coordinates, resource packs, and empty ranges.

Only Phase 27 in `spec/map/phases/phase-27-final-acceptance.md` may label the
feature `Map-complete` or `Dynmap-equivalent within the declared in-app scope`.
Passing a build, selecting a JAR, receiving a player marker, or producing any
PNG is not enough.

## Related documents

- [`../map/README.md`](../map/README.md): executable Phase 0–27 plan;
- [`../map-integration-requirements.md`](../map-integration-requirements.md):
  product contract;
- [`architecture.md`](architecture.md), [`render-pipeline.md`](render-pipeline.md),
  [`assets-blockstates-models-textures.md`](assets-blockstates-models-textures.md),
  [`iso-perspective-and-geometry.md`](iso-perspective-and-geometry.md):
  implementation evidence;
- [`tile-queue-storage-and-updates.md`](tile-queue-storage-and-updates.md),
  [`launcher-asset-sources.md`](launcher-asset-sources.md),
  [`verification-fixtures.md`](verification-fixtures.md), and
  [`porting-manifest.md`](porting-manifest.md): operational gates.
