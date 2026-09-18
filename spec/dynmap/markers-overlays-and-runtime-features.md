# Markers, Overlays, and Runtime Features

## Dynmap feature inventory

The renderer is only one part of Dynmap. The repository also contains:

- marker API and marker sets;
- player markers and faces;
- sign/area/icon/line/circle markers;
- chat and server event components;
- time and weather-aware UI data;
- web client update components;
- commands and API compatibility layers;
- embedded or externally served web assets.

These features depend on runtime server state and persistence that do not
belong inside the Rust terrain renderer.

## MC-Vector phases

Phase 0-13 focus on terrain, assets, live chunk telemetry, tile state, and the
in-app viewer. Phase 14 adds world/dimension layers, player tracking, marker
groups, borders, coordinate search, and optional overlays. External Dynmap web
server/API compatibility remains a separate future compatibility layer and is
not a hidden requirement for the in-app map.

## Boundary

Java may send player and server observations through the MC-Vector protocol.
Rust owns durable marker data and tile invalidation. React owns interaction and
visual layers. No Dynmap web JavaScript or embedded Jetty is copied into the
Tauri frontend.

## Source references

Observed source groups: `DynmapCore/src/main/java/org/dynmap/markers/*`,
`web/*`, `servlet/*`, `DynmapMapCommands.java`, and the API modules. These are
research inputs for the later phases, not Phase 0 runtime dependencies.
