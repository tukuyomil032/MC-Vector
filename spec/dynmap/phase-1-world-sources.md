# Phase 1: World Sources and Chunk Views

## Goal

Replace direct renderer-specific Anvil reads with a testable `ChunkSource`
boundary that combines saved data and bounded live Paper snapshots.

## Work items

### Region and Anvil source

- enumerate region header presence bits before attempting chunk reads;
- use mathematical floor division for negative coordinates;
- read compressed chunk payloads with bounded retries;
- parse 1.21.x sections, palettes, and block state arrays;
- preserve biome and light values needed by shaders;
- record region modification time and chunk revision;
- skip corrupt chunks while keeping the rest of a tile renderable;
- reject symlinked or escaped managed paths.

### Live source

- add a Java request queue for loaded chunk snapshots;
- check `World#isChunkLoaded` on the Paper main thread;
- never call a load or generation method for a map request;
- cap requests at one per tick and 128 pending;
- encode a bounded surface payload;
- decode and validate payload size, coordinates, dimension, and revision in Rust;
- keep the newest snapshot per chunk, not an unbounded history.

### Source precedence

```text
new live snapshot
  -> cached live snapshot
  -> saved Anvil chunk
  -> last successful tile
  -> explicit empty/error state
```

The source choice is recorded in `RenderedTile`. A saved Anvil chunk is not
silently treated as live data.

## Tests

- positive and negative region/chunk coordinates;
- sparse region headers;
- incomplete and corrupt chunk payloads;
- palette decoding with unknown tags;
- live payload size and malformed strings;
- loaded chunk accepted;
- unloaded chunk returns `not_loaded` without creating it;
- live snapshot wins over an older saved chunk;
- cached live snapshot expires according to a deterministic clock;
- region timestamp causes a saved chunk reread;
- Paper continues running when the Rust listener is absent.

## Exit criteria

The renderer receives a stable `ChunkView` and does not know whether the data
came from Paper or Anvil. A test can construct the same view without starting
Tauri or Paper.
