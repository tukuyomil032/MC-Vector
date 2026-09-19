# Phase 18: Dimensions and Map Types

## Goal

Implement the map-type and dimension model required for an in-app Dynmap-like
map, without coupling the renderer to one hard-coded Overworld surface.

## Scope

Overworld, Nether, and The End world identity; surface, cave/height-aware, and
other selected map types; world metadata; map selection and availability.

## Owned files

`src-tauri/src/map/domain`, `src-tauri/src/map/sources`, `src/map/api`, and
focused Map state tests.

## Dependencies

Phases 05, 06, 11, 14, and 17.

## Implementation tasks

- define stable world and map-type IDs;
- discover world folders and dimension paths without assuming one folder name;
- associate each map type with a perspective, shader, source policy, and cache
  identity;
- keep unavailable dimensions explicit instead of returning transparent tiles;
- preserve center, zoom, and tile state when switching maps.

## Focused tests

World identity, Nether/End path resolution, unavailable map state, cache-key
separation, and map selection persistence.

## Diff review checklist

No dimension-specific path assumptions leak into renderer math; no map type can
reuse another map type's cache; no unavailable world starts a render loop.

## Phase gate

All three vanilla dimensions can be listed, selected, and diagnosed with
separate tile identities; only declared map types are marked available.

## Known non-goals

No external Dynmap web map URLs or server-side command compatibility.

## Follow-up phases

Phase 19 adds player and marker layers; Phase 20 adds map-visible overlays.
