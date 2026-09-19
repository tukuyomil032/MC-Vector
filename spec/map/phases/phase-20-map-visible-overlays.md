# Phase 20: Map-Visible Overlays

## Goal

Implement the non-terrain information that belongs in the in-app map view.

## Scope

World border, spawn, coordinate grid/search, time, weather, biome/height
legends, and overlay diagnostics that are directly useful while viewing a map.

## Owned files

`src-tauri/src/map/overlays`, `src-tauri/src/map/world`, and Map overlay UI.

## Dependencies

Phases 06, 18, and 19.

## Implementation tasks

- read world metadata from the correct Java Edition sources;
- keep overlays dimension- and map-type-scoped;
- add coordinate search and recentering without forcing chunk loads;
- render border/spawn/search markers independently of terrain tiles;
- expose missing metadata as a diagnostic, not a fake value.

## Focused tests

Level metadata parsing, negative coordinates, border clipping, time/weather
updates, coordinate search, and overlay lifecycle.

## Diff review checklist

No overlay can claim terrain readiness; malformed metadata does not crash tile
rendering; coordinate navigation uses the same tile transform as the renderer.

## Phase gate

Map-visible overlays remain accurate while switching dimensions, maps, zoom,
server state, and cache generations.

## Known non-goals

Chat transport and unrelated external integrations are out of scope.

## Follow-up phases

Phase 21 integrates all map state into the real Map UI.
