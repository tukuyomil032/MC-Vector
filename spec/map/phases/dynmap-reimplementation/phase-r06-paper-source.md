# R06: Paper Live Snapshot Source Adapter

## Goal

Feed Paper snapshot data into the same R02 chunk view used by the saved Anvil
renderer without placing renderer logic inside the plugin.

## Dependencies

R03, R04, R05.

## Owned files

- `src/map/paper/mc-vector-core/`
- `src-tauri/src/map/world/live_snapshot.rs`
- `src-tauri/src/map/bridge/`
- Java bridge and Rust protocol tests

## Implementation tasks

- define hello, heartbeat, snapshot request, and snapshot response contracts;
- include world/dimension/chunk coordinates in every request and response;
- encode loaded/unloaded/world-unavailable/queue-full/timeout/invalid-snapshot
  distinctly;
- convert loaded snapshots into the R02 chunk view, including palette, biome,
  height, sky light, and block light;
- keep Paper plugin responsibilities limited to data supply and lifecycle;
- ensure Core artifact version and protocol metadata are validated separately.

## Focused checks

- Java bridge unit tests;
- Rust protocol tests;
- request/response coordinate mismatch tests;
- loaded and unloaded snapshot tests;
- queue overflow, timeout, reconnect, and duplicate-request tests.

## Gate

A real loaded Paper chunk and an equivalent saved fixture enter the same Rust
renderer contract. Bridge connectivity alone is not a terrain success signal.
