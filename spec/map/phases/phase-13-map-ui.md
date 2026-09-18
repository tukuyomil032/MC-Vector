# Phase 13: Map UI

## Goal

Show real tiles and honest diagnostic states in a Dynmap-like in-app viewer.

## Scope

Tauri commands/events, binary PNG response, canvas/tile layer, pan/zoom,
recenter, player markers, asset panel, management, accessibility, and i18n.

## Owned files

Agent A: `src/map/**` UI/API/tests. Agent B: command/event/status schemas and
binary tile backend.

## Dependencies

Phase 12 tile lifecycle and Phase 06 bridge state.

## Implementation tasks

- require confirmed component/config/asset status before tile requests;
- remove green CSS preview and silent `null` tile errors;
- display `terrain`, `empty`, `rendering`, `stale`, `error`,
  `asset_missing`, `bridge_incompatible`, and `paper_chunk_unavailable`;
- implement pan/zoom/recenter and player interpolation/labels;
- expose pause/restore/remove and repair actions;
- clean controlled inputs, event listeners, and unhandled promises.

## Focused tests

Status failure card, empty/error distinction, asset selection, stale tile,
tile-ready event, player layer, lifecycle controls, keyboard, accessibility,
Japanese/English.

## Diff review checklist

No tile request from bridge-connected-only state, no hidden error, no token in
UI, and no controlled-input warnings.

## Phase gate

`bun run build` passes and real PNG tiles are visible in the Map view.

## Known non-goals

Advanced marker groups and weather/chat overlays follow in Phase 14.

## Follow-up phases

Phase 14 adds application-level Dynmap map features.
