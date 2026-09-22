# Minecraft 1.21.4 Anvil adapter

## Status

`deterministic_region_fixture_verified`; the official client/server artifacts,
real captured Anvil world fixture, Paper artifact, and Dynmap reference capture
remain separate version-matrix gates.

## Adapter contract

- Minecraft version: `1.21.4`
- DataVersion: `4189`
- Chunk format: Anvil region plus compressed NBT
- Required chunk status: `minecraft:full`
- Rust adapter: `world::anvil_versions::v1_21_4`
- Shared decoder: `world::anvil`
- Shared output: `MapChunkCache`

The adapter rejects a neighboring DataVersion before section decoding. It does
not turn a malformed, incomplete, or unloaded chunk into an empty terrain
success. The common decoder remains responsible for section, palette, light,
biome, and heightmap validation.

## Evidence boundary

The focused evidence writes a deterministic Anvil region, reads its compressed
chunk through `RegionSource`, and passes the extracted bytes through the
1.21.4 adapter into the shared `MapChunkCache` contract. It also repeats the
source digest read to prove stable input bytes. This is a generated test
fixture, not a captured world, official artifact verification, version-wide
Anvil parity, or Dynmap pixel parity.

## Gate

```bash
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core world::anvil_versions::v1_21_4
```
