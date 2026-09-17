# World Data and Platform Adapters

## Dynmap abstraction

Dynmap separates platform access from rendering with `MapChunkCache` and
`MapIterator`. The renderer can ask for a block, light level, biome, and nearby
position without knowing whether the platform is Spigot, Fabric, or Forge.
The v3.0 project guide identifies these interfaces as the platform-to-core
boundary.

The abstraction exists because the hot renderer needs deterministic, local
iteration over a tile's required chunks. It cannot safely call arbitrary live
world APIs for every pixel.

## MC-Vector source model

Rust exposes one logical source with multiple implementations:

```text
ChunkSource
  ├─ LiveSnapshotSource    loaded Paper chunks only
  ├─ AnvilSource           saved region/chunk data
  ├─ LiveCache              recently received snapshots
  └─ LastSuccessfulTile    degraded visual fallback
```

The source returns both data and provenance. A tile must be able to report
whether it was produced from live data, saved data, stale data, or a degraded
fallback.

## Java adapter contract

`MC-Vector Core` is a conventional `JavaPlugin` using Bukkit/Paper public APIs.
It sends:

- hello and capability negotiation;
- join and quit events;
- coalesced player snapshots;
- dirty chunk hints;
- heartbeat messages;
- bounded requests for already-loaded chunk snapshots.

It does not create a chunk for Map. Before obtaining a snapshot, it checks the
world and loaded status on the Paper main thread. The snapshot is then encoded
off the main thread or handed to the bridge writer without synchronous socket
I/O on the main thread.

The initial live payload is deliberately bounded: column block states, biome,
height, sky light, block light, and no more than sixteen surface layers. This
is a transport optimization, not the final renderer's complete world model.
Saved Anvil data remains the authoritative fallback for chunks outside the
loaded live window.

## Rust Anvil boundary

The Rust reader must handle:

- region header presence bits;
- negative region and chunk coordinates;
- compressed chunk payloads;
- 1.21.x `sections`, `block_states`, and palette/long-array layouts;
- incomplete writes and corrupt chunks;
- region modification time and retry;
- unknown NBT tags without dropping the complete tile.

`fastanvil` is used for region framing and chunk access where its API matches
the fixture. `fastnbt` is used for explicit 1.21.x structures where a generic
chunk type is insufficient. Library behavior is verified against checked-in
fixtures rather than assumed from the crate name.

## Coordinate rules

- World X and Z are the horizontal axes.
- Tile/chunk conversion uses mathematical floor division for negative values.
- A chunk spans `[chunkX * 16, chunkX * 16 + 15]` and the same for Z.
- Every source records the dimension identifier and chunk revision.
- Missing data is distinct from an air-only generated chunk and from a read
  failure.
