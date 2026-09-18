# World Data and Platform Adapters

## Dynmap model

Dynmap separates acquisition from rendering. Platform adapters obtain a stable
chunk snapshot and expose it through `MapChunkCache` and `MapIterator`. The
renderer asks for block state, biome, light, height, tile-entity data, and
neighbouring positions without knowing whether the source was a live server or
an adapter-specific cache.

The iterator is mutable for performance, but the renderer sees a bounded
read-only world view. Loaded/unloaded handling, visibility limits, and chunk
cache reuse are adapter responsibilities.

## MC-Vector source precedence

```text
new live ChunkSnapshot
  > cached live snapshot
  > stable Anvil/NBT read
  > last successful tile
  > explicit empty/error state
```

Live requests must only use already-loaded Paper chunks. The plugin checks
`World#isChunkLoaded` and returns `not_loaded`; it never forces generation.
Paper main-thread snapshot capture is bounded to one chunk per tick and the
network write remains on the bridge worker.

## Normalized Rust data

```rust
pub trait ChunkSource {
    fn get_chunk(&self, key: ChunkKey) -> Result<Option<ChunkView>, ChunkSourceError>;
}

pub struct ChunkView {
    pub key: ChunkKey,
    pub sections: Vec<ChunkSection>,
    pub revision: ChunkRevision,
    pub captured_at: Option<i64>,
    pub source: ChunkSourceKind,
}
```

The exact public names may evolve, but the source/provenance distinction may
not be removed. A tile rendered from stale Anvil data must not be presented as
a fresh live snapshot.

## Anvil requirements

- Validate region header offsets and sector lengths before reading.
- Handle negative region and chunk coordinates with floor division.
- Support the compression types present in the verified fixture.
- Decode 1.21.x `sections`, `block_states.palette`, and packed data.
- Retry unstable or truncated chunks without discarding the whole tile.
- Preserve per-chunk failure reasons and decoded counts.
- Never write back to a Minecraft world.

## Source evidence and open items

Primary Dynmap paths: `DynmapCore/src/main/java/org/dynmap/utils/MapChunkCache.java`,
`MapIterator.java`, `DynmapChunk.java`, and platform-specific
`bukkit-helper/*`. Paper `ChunkSnapshot` is the live adapter reference. The
exact 1.21.10 payload shape and `fastanvil`/`fastnbt` compatibility remain
fixture-gated open items.
