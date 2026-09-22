# R33: Version-specific Anvil parity

## Purpose

Prove the first version-specific adapter boundary with a deterministic Anvil
region fixture for Minecraft 1.21.4. The test must exercise the same region
file path and compressed-chunk read path used by saved worlds before handing
the bytes to the version adapter and shared renderer domain contract.

## Implementation

- Generate a deterministic `r.0.0.mca` region containing a complete 1.21.4
  chunk fixture.
- Read the chunk through `RegionSource` rather than decoding the in-memory NBT
  directly.
- Validate `DataVersion`, chunk status, block palette, biome, and light data
  through `world::anvil_versions::v1_21_4`.
- Assert a stable source digest across repeated reads.
- Keep the generated fixture distinct from captured client/server artifacts,
  real user worlds, all-version coverage, and Dynmap pixel parity.

## Gate commands

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core world::anvil_versions::v1_21_4
git diff --check
```

## Completion boundary

This phase verifies only the 1.21.4 deterministic generated-region path. The
official artifact hashes, a captured real-world Anvil fixture, adapters for
Minecraft 1.14 through 26.3, and saved-terrain pixel parity remain pending
version-matrix phases.

## Commit message

```text
test: verify saved terrain for 1.21.4
```
