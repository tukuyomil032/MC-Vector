# ADR-013: Canonical Map Tile Planes and Viewport Scheduling

- Status: Accepted for Phase 17 implementation
- Date: 2026-09-19

## Context

The Map UI had multiple tile submission paths. React could request a viewport,
then request individual tiles, while the Rust command could submit additional
work for the same keys. Detailed tiles were also interpreted as world X/Z
rectangles in some paths even though the renderer used an Iso projection.
The resulting contract mismatch produced thin terrain fragments, split tiles,
queue saturation, and a repeated generating state. A cache hit from
`get_map_tile` could also emit `map-tile-ready`, recursively starting the same
byte-fetch path again.

## Decision

### Plane contract

Use exactly two canonical tile planes:

- zoom 0–4: `WorldXZ`;
- zoom 5–8: `IsoProjected`, based on the source-derived Dynmap
  `IsoHDPerspective` transform.

The 4/5 boundary is explicit. Tile coordinates, viewport centers, image
placement, live chunk candidate discovery, and dirty invalidation all operate
on the selected plane. Detailed chunk candidates are found by inverse
projection and conservative projected-footprint intersection; they are not
derived from a world X/Z interpretation of a projected tile index.

### One submission path

`request_map_render` is the only viewport submission API. It creates a request
generation, coalesces work through the bounded Rust scheduler, and emits
context-bearing progress/ready events. `get_map_tile` is read-only: it returns
memory or disk cache bytes and never submits work. It does not emit a ready
event on a cache read, because the ready event is the trigger for the React
byte fetch.

### Generation and stale retention

Every viewport has a request ID and generation. The frontend ignores old
generation events. Rust rejects obsolete render completion before it replaces
the cache. A previously successful PNG remains available while a stale tile is
rendered or when the replacement fails.

### Targeted invalidation and lifecycle gating

Dirty chunks invalidate only intersecting tile keys and mark those cache
entries stale. Repeated invalidation keys are coalesced in the frontend. The
server/bridge/component/config state gates new viewport submissions; stopping
or disconnecting cancels pending scheduler work and status retry does not start
rendering by itself.

Queue saturation is exposed as `queue_full`, allowing the UI to retain a
previous image and report a bounded scheduler condition without treating it as
an uncaught render loop.

## Consequences

Positive:

- React, Rust rendering, live chunk requests, and invalidation share one tile
  identity and plane decision;
- zoom changes can retain old images until current-plane tiles are ready;
- cache reads cannot recursively trigger ready events;
- dirty changes do not force a blind nine-tile invalidation;
- queue saturation and render errors become distinguishable UI states.

Costs and limits:

- the frontend mirrors the Rust geometry contract and must update together
  with any future perspective change;
- current projected chunk intersection remains conservative rather than a full
  Dynmap polygon clip implementation;
- this ADR does not complete all block-model, texture, shader, dimension, or
  overlay work required for final Dynmap map-feature reproduction;
- real Paper/Tauri gate evidence is required before Phase 17 is closed.

## Rejected alternatives

- Keep direct per-tile React `get_map_tile` submissions: rejected because it
  duplicates scheduling and can saturate the queue.
- Treat all zooms as world X/Z: rejected because it cannot preserve the
  IsoProjected renderer contract.
- Delete the previous PNG on invalidation: rejected because a render failure
  would produce an avoidable blank map.
- Suppress warnings or hide queue errors: rejected because the phase requires
  observable, structured failure states.

## Verification obligations

- Rust geometry, scheduler, cache, generation, and invalidation tests;
- frontend viewport, event, stale-tile, and lifecycle tests;
- full Phase gate commands recorded in the Phase 17 evidence ledger;
- one real debug-app zoom/pan run with Paper stopped before app exit.

## Current verification status

As of 2026-09-19, the automated Rust/frontend Phase gate passed, including
145 Map Rust tests and the repository frontend suite (444 tests). The real
debug-app run selected the PrismLauncher 1.21.10 client JAR successfully, but
the Test Paper instance had no `mc-vector-core.jar` installed and therefore
initialized zero plugins. The real terrain zoom/pan and live-bridge portions
remain open. The server process was cleaned up after the UI stop attempt and
port 25565 was confirmed free before closing the debug app.
