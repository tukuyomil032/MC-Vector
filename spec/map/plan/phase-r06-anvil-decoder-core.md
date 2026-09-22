# R06: Deterministic Anvil Decoder Core

## Purpose

Implement the shared saved-world decoder boundary required by the renderer
domain. Region-sector access and Minecraft NBT decoding remain in the adapter;
the renderer receives only the source-independent `MapChunkCache` contract.

## Scope

- Validate the chunk `DataVersion` and embedded chunk coordinates.
- Decode sections, block palettes, heightmaps, biomes, sky light, and block
  light through the existing `fastanvil`/`fastnbt` boundary.
- Preserve missing block/light/asset data as explicit partial availability.
- Reject malformed, truncated, empty, or coordinate-mismatched input instead of
  converting it to an empty terrain result.
- Keep the source digest deterministic for the same region bytes.

## Explicit non-goals

This phase does not claim version-specific Anvil parity for every Minecraft
release, resource-pack/model resolution, Dynmap ray traversal, Java reference
parity, Paper snapshots, tile scheduling, or Map UI integration. Those remain
gates in later phases.

## Evidence and gates

Run the following from the repository root:

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo check --offline --manifest-path src-tauri/Cargo.toml --lib
git diff --check
```

The focused tests cover a valid 1.21-era fixture, deterministic region
round-tripping, malformed NBT, and missing required chunk-header fields.

## Completion condition

R06 is complete only when the decoder tests and warning gate pass, required
chunk identity is validated, and missing source data is represented as an
explicit domain state. A passing synthetic fixture is not evidence of
version-matrix completion or renderer pixel parity.

## Commit

```text
feat: add deterministic anvil decoder core
```
