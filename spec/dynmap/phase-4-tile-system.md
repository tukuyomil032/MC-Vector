# Phase 4: Tile Scheduler, Cache, and Invalidation

## Goal

Make tile generation asynchronous, bounded, visible to the UI, and resilient
to partial failures.

## Priority

1. Visible viewport tiles.
2. Adjacent tiles for a smooth pan.
3. Tiles near online players.
4. Explicit refresh requests.
5. Background full-world work.

The queue coalesces identical keys, has a fixed maximum, and supports
cancellation of superseded requests. A renderer worker must never hold a
global lock while reading a large region or writing a PNG.

## Cache layers

### Memory

- bounded LRU;
- keyed by full renderer identity;
- stores PNG and metadata;
- evicts without deleting disk state.

### Disk

```text
map-cache/<server>/<world>/<minecraft-version>/<asset-hash>/
  <renderer-version>/<perspective>/<zoom>/<tile-x>/<tile-y>.png
```

- write to a same-directory temporary file;
- flush and atomically rename;
- reject invalid PNGs on read;
- preserve last successful tile on failed replacement;
- never reuse prototype tiles after renderer version changes.

## Invalidation

`chunk_dirty` is a hint. Rust compares region timestamps and chunk revisions.
Only tiles whose world-space rectangle intersects the dirty chunk are marked
stale. Player movement updates the marker layer and does not invalidate
terrain.

## Progress and errors

The scheduler emits queued, rendering, ready, stale, empty, asset-missing, and
error states. Progress is scoped to a viewport request, not a fictional
whole-world percentage when no full render was scheduled.

## Tests

- viewport request wins over background work;
- duplicate requests share one render;
- queue cap rejects or coalesces without unbounded memory;
- cancellation does not remove a good tile;
- atomic write never leaves a partial valid-looking tile;
- dirty chunk invalidates intersecting tiles only;
- cache identity separates asset and renderer versions;
- stale tile stays visible while regeneration fails;
- app restart loads a valid disk tile.

## Exit criteria

The map remains responsive during rendering, and every visible tile has a
truthful state that the UI can display.
