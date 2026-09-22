# R09: Real Acceptance and Release Evidence

## Goal

Record separate proof for the renderer, bridge, real Tauri app, UI behavior,
server shutdown, and release boundaries.

## Dependencies

R00-R08.

## Owned files

- `spec/map/evidence/dynmap-reimplementation.md`
- Paper/Tauri acceptance scripts
- narrowly scoped test fixtures and evidence metadata

## Acceptance sequence

1. verify the clean cutover result;
2. render a saved Anvil terrain tile;
3. select the Minecraft client JAR as a rendering asset;
4. verify the Core artifact and plugin identity;
5. load Paper 1.21.10;
6. exchange hello and heartbeat;
7. render a live loaded chunk;
8. run zoom 8→7→6→5→4→3→2→1→0;
9. verify cursor anchor and adjacent-tile pan;
10. verify failure behavior for missing asset, malformed Anvil, offline bridge,
    unavailable snapshot, and checksum/conflict states;
11. stop Paper from the application;
12. confirm Java exits;
13. confirm port `25565` is free;
14. close the debug app only after the previous checks pass.

## Evidence separation

Record Rust tests, differential fixtures, Java tests, Paper smoke, real Tauri,
manual UI, stop/port release, and release-like artifacts as separate rows.

## Gate

Only this phase may mark the new implementation Dynmap-equivalent within the
declared in-app scope. Any missing row remains open; no passing build or mock
test may substitute for it.
