# Tile Queue, Storage, and Updates

## Observed Dynmap responsibilities

`MapManager` owns render scheduling and world update coordination. Map types
calculate required chunks and tile coordinates; update queues distinguish full
render work from incremental changes and zoom-out generation. `MapStorage`
abstracts file-tree and database backends, while clients receive update
metadata through the selected web component.

## MC-Vector scheduler

```text
viewport tile > adjacent prefetch > player vicinity > background full render
```

The scheduler is bounded and deduplicates by a complete `TileKey`:

```text
server / world / dimension / Minecraft version / pack hash /
asset manifest / renderer / perspective / zoom / tile x / tile y
```

One in-flight request is shared by all callers. Cancellation removes obsolete
background work but never deletes the last successful tile. Dirty chunk
notifications invalidate only intersecting tile keys and trigger a debounced
re-render.

## Storage rules

- Keep memory LRU and disk persistence separate.
- Write to a temporary file and atomically rename only after PNG validation.
- Store render metadata next to the image.
- Keep stale images while a replacement is rendering or fails.
- Never reuse prototype tiles under the production renderer version.
- Do not store cache inside the Minecraft world.

## State machine

```text
missing -> queued -> rendering -> terrain
                         |       -> empty
                         |       -> error
terrain -> invalidated -> stale -> rendering
```

Asset and bridge failures are orthogonal state dimensions; they must not be
encoded as transparent PNG success.

## Source references

Primary sources: `MapManager.java`, `MapTile.java`, `MapType.java`,
`MapStorage.java`, `FileTreeMapStorage.java`, and update/client component
classes. MC-Vector implements an app-data disk store rather than copying
Dynmap's storage backends or web update protocol.
