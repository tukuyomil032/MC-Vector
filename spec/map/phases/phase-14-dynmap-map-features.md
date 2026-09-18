# Phase 14: Dynmap Map Features

## Goal

Extend the in-app map beyond terrain while keeping overlays independent from
the renderer and external Dynmap web/API compatibility.

## Scope

World/dimension layers, player tracking, persistent/custom markers and groups,
spawn/border, coordinate search, and optional chat/time/weather overlays.

## Owned files

Agent A: React controls/overlays. Agent B: Rust persistence, world metadata,
dimension/overlay events. Main updates comparison/ADR decisions.

## Dependencies

Phase 13 real Map UI, Phase 06 bridge, and marker research corpus.

## Implementation tasks

- add Overworld/Nether/End/custom dimension layer selection;
- persist markers safely under server ownership;
- add player following and interpolation separate from terrain tiles;
- add world border/spawn/search and overlay state with clear availability;
- publish a protocol v2 `world_status` snapshot from Paper and expose it as a
  server-scoped Tauri event for time/weather overlays;
- document what is not compatible with Dynmap's external API.

## Implemented evidence (2026-09-18)

- `get_map_world_info` reads the Java Edition `Data.BorderCenterX`,
  `Data.BorderCenterZ`, `Data.BorderSize`, `Data.BorderWarningBlocks`, and
  `Data.BorderWarningTime` fields and the React Map canvas renders a validated
  border rectangle.
- Map supports dimension-aware world selection, coordinate jumps, player
  interpolation, and server-scoped persistent markers.
- Paper protocol v2 emits one `world_status` message per periodic snapshot with
  a `worlds` array containing world id, dimension, time, full time, storm state,
  thunder state, weather durations, and capture time.
- Rust validates and forwards that message as `map-world-status`; React displays
  Minecraft time and weather for the selected dimension.
- Paper emits asynchronous `chat_message` events without world or socket work
  in the chat callback; Rust validates and forwards them as
  `map-chat-message`, and React displays a bounded recent chat overlay.
- Map validates `spawnX`/`spawnZ` against the selected world and renders a
  labeled spawn overlay without treating missing or non-finite metadata as an
  error.
- Map exposes the available marker groups for the selected world and filters
  the visible marker overlay without mutating persisted marker data. The
  filter is keyboard-accessible and reports the number of visible markers.

These are focused implementation slices, not the Phase 14 completion gate.
Marker persistence/group CRUD, real Paper/Tauri live-session evidence, and
complete overlay behavior remain open. Spawn visualization and marker-group
filtering now have focused implementation evidence. Chat delivery is
implemented, but its real-session evidence is still part of the Phase 15 gate.

## Focused tests

Dimension source, marker CRUD/path safety, player follow, border/search,
overlay lifecycle, and pause/remove behavior.

## Diff review checklist

No overlay data embedded into renderer assumptions, no marker path escape, and
no claim of external Dynmap API compatibility.

## Phase gate

Supported dimensions and overlay states work in a real Map session without
regressing terrain or lifecycle.

## Known non-goals

Public Dynmap web server/API and every third-party Dynmap extension.

## Follow-up phases

Phase 15 validates the complete Paper/Tauri path.
