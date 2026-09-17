# MC-Vector Renderer Implementation Roadmap

This is the execution document for the renderer parity work. The research
documents describe what Dynmap does; the phase documents below describe what
MC-Vector will build, in which order, and what evidence is required before the
next phase is accepted.

## Phase dependency graph

```text
Phase 0  Research corpus and provenance
   |
   +--> Phase 1  World sources and chunk views
   |       |
   |       +--> Phase 2  Assets, block states, models, textures
   |               |
   |               +--> Phase 3  IsoHDPerspective renderer
   |                       |
   |                       +--> Phase 4  Queue, cache, invalidation
   |                               |
   |                               +--> Phase 5  Tauri and React integration
   |                                       |
   |                                       +--> Phase 6  Paper, Tauri, visual QA
```

The bridge lifecycle can continue to receive maintenance during every phase,
but no phase may move rendering work to the Paper main thread.

## Phase gates

### Phase 0: research and contracts

Deliverables:

- all files listed in `README.md`;
- immutable Dynmap source reference;
- `porting-manifest.md` entries for each proposed port;
- `api-contracts.md`;
- phase documents 1 through 6;
- explicit prototype-to-target migration table.

Exit gate: an implementer can identify the source behavior, MC-Vector owner,
wire contract, test fixture, and failure state for every first-phase feature.

### Phase 1: world sources

Deliverables:

- `ChunkSource`, `ChunkView`, `BlockIterator`, and region index boundaries;
- Anvil/NBT fixtures for Paper 1.21.10;
- live snapshot request/response path;
- source provenance and revision metadata;
- negative-coordinate and corrupt-chunk tests.

Exit gate: the same chunk can be read from live snapshot and saved Anvil data,
with a deterministic precedence and no forced chunk loading.

### Phase 2: assets

Deliverables:

- asset manifest and source resolver;
- blockstate variants and multipart selection;
- parent model expansion;
- face UV and texture layer resolution;
- transparency and tint inputs;
- unresolved-state diagnostics.

Exit gate: fixture blocks including stairs, slabs, leaves, glass, water, snow,
and custom resource-pack overrides resolve to deterministic render models.

### Phase 3: renderer

Deliverables:

- projection transform;
- ray and voxel traversal;
- block patch intersections;
- texture sampling;
- alpha composition;
- default HD shader and lighting;
- PNG output and render metadata.

Exit gate: fixed terrain/building fixtures produce recognizable oblique images;
the output is no longer a chunk representative-colour map.

### Phase 4: tile system

Deliverables:

- bounded priority queue;
- request coalescing and cancellation;
- memory LRU and disk cache;
- atomic writes;
- dirty-chunk intersection invalidation;
- stale tile retention;
- progress and error events.

Exit gate: viewport tiles are prioritized, cache identity is versioned, and a
failed refresh never removes the last successful tile without a state reason.

### Phase 5: application integration

Deliverables:

- Tauri command/event contract;
- binary tile response;
- status and asset diagnostics;
- pan/zoom/marker overlay;
- explicit empty, stale, error, and asset-missing states;
- removal of the green preview path.

Exit gate: React never requests tiles from an unconfirmed component/config and
never renders a failure as a successful green map.

### Phase 6: real verification

Deliverables:

- real Paper smoke script;
- golden image fixture set;
- `tauri dev` manual scenario;
- platform-specific evidence;
- license and asset review record.

Exit gate: Paper 1.21.10, Rust, Tauri IPC, real tiles, live changes, cache
reuse, and UI failure states are all verified separately.

## Commit boundaries

The implementation should use focused commits:

1. renderer research corpus and contracts;
2. world source and fixtures;
3. asset resolver/model representation;
4. Iso renderer and selected ported algorithms;
5. scheduler/cache/invalidation;
6. Tauri/React integration;
7. real verification tooling and CI.

Generated JARs, local worlds, Minecraft assets, and cache PNGs are never
committed.
