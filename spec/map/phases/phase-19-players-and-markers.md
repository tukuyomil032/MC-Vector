# Phase 19: Players and Markers

## Goal

Reproduce Dynmap's map-visible player and marker behavior inside the MC-Vector
map view.

## Scope

Player interpolation, visibility, names, persistent markers, marker groups,
icons, labels, world scoping, and lifecycle-safe updates.

## Owned files

`src-tauri/src/map/markers`, `src-tauri/src/map/application`, and
`src/map/components` marker/player layers and tests.

## Dependencies

Phases 06, 18, and 17.

## Implementation tasks

- consume the latest Java player snapshots without queue growth;
- interpolate positions for display while preserving captured coordinates;
- persist markers per server/world/map group;
- support marker visibility and group filtering;
- invalidate overlays without invalidating terrain tiles;
- show stale/disconnected player state instead of teleporting or silently
  removing players.

## Focused tests

Snapshot replacement, interpolation bounds, marker persistence, group
filtering, world scoping, reconnect behavior, and overlay-only invalidation.

## Diff review checklist

Player/marker updates never trigger terrain rendering; marker persistence never
writes outside the server-owned data directory; stale players are explicit.

## Phase gate

Players and persistent markers appear on every supported map type and remain
correct while panning, zooming, switching worlds, disconnecting, and
reconnecting.

## Known non-goals

No Bukkit command or permission compatibility.

## Follow-up phases

Phase 20 adds time, weather, border, and other map-visible overlays.
