# Phase 21: Map UI

## Goal

Replace the prototype/diagnostic canvas with a stable Dynmap-like in-app map
interface.

## Scope

Real tile layers, pan, zoom, recenter, map selection, players, markers,
overlays, asset diagnostics, render progress, stale tiles, empty states, and
accessibility.

## Owned files

`src/map/components`, `src/map/hooks`, `src/map/state`, `src/map/api`, and Map
styles/tests.

## Dependencies

Phases 09–20 and 17.

## Implementation tasks

- make initial loading different from background status refresh;
- never hide a successful tile because a status request is in flight;
- show explicit asset, bridge, world, tile, and renderer states;
- route all viewport requests through the scheduler contract;
- add keyboard and pointer navigation with bounded event listeners;
- retain the last successful tile during render/update failures.

## Focused tests

Polling without canvas flicker, request coalescing, listener cleanup, empty and
error states, stale tiles, pan/zoom, keyboard navigation, and accessibility.

## Diff review checklist

No green success fallback; no status poll causes a tile request by itself; no
unhandled listener rejection; no controlled-input warning.

## Phase gate

The UI remains stable when the server is stopped, started, disconnected, or
rendering, and real PNG terrain remains visible while replacement work runs.

## Known non-goals

No embedded HTTP/Web UI and no Dynmap browser compatibility.

## Follow-up phases

Phase 22 hardens lifecycle and diagnostic behavior; Phase 23 verifies the real
Paper/Tauri path.
