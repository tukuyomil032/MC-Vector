# Phase 5: Tauri and React Map Integration

## Goal

Replace the renderer connection preview with a real tile surface and explicit
diagnostic states while preserving per-server lifecycle behavior.

## Tauri boundary

Commands:

```text
get_map_status(serverId)
get_map_world_info(serverId, worldId)
get_map_asset_status(serverId)
select_map_asset(serverId, sourcePath)
request_map_render(serverId, worldId, viewport)
get_map_tile(serverId, worldId, zoom, tileX, tileY)
repair_map_bridge(serverId)
enable_map(serverId)
pause_map(serverId)
restore_map(serverId)
remove_map_component(serverId)
```

Events:

```text
map-bridge-status
map-players-updated
map-tile-invalidated
map-tile-ready
map-render-progress
map-asset-status
map-error
```

Every command is registered in the Tauri handler and returns an owned,
serializable result or a structured error. PNG bytes are returned separately
from JSON metadata.

## UI states

The map surface distinguishes:

- real terrain tile;
- tile rendering;
- previous tile shown while stale;
- no generated terrain in the requested range;
- asset missing or invalid;
- Paper chunk not loaded;
- bridge incompatible/disconnected;
- tile generation error;
- component paused or waiting for restart.

The old green grid and silent `null` tile failure path are removed. A connected
bridge by itself is not enough to start tile requests.

## Interaction

- pan by pointer drag and keyboard-accessible buttons;
- zoom around the map center;
- recenter on the first online Overworld player;
- otherwise use spawn, generated chunk bounds, then `(0, 0)`;
- display player markers in a separate overlay;
- preserve old terrain while a replacement tile is rendering;
- show asset selection and bridge repair actions in Management.

## Tests

- status failure does not show a successful green surface;
- connected bridge with invalid component/config does not request tiles;
- empty tile displays generated-terrain guidance;
- asset missing is separate from empty;
- stale tile remains while a refresh fails;
- tile-ready event updates metadata without replacing the wrong tile;
- player markers do not invalidate terrain;
- negative tile coordinates pan correctly;
- keyboard and accessibility labels remain available;
- Japanese and English strings exist for every state.

## Exit criteria

The UI presents the renderer's actual state and never implies Dynmap-like
terrain when only the bridge is connected.
