# R36: Saved/live renderer equivalence

## Purpose

Prove that saved Anvil input and a Paper snapshot carrying the same chunk data
enter the same source-independent renderer domain with equivalent block,
lighting, biome, height, and coordinate lookup results.

## Implementation

- Build one deterministic 1.21.4 stone chunk fixture for both sources.
- Write the saved side to an Anvil region and load it through
  `SavedAnvilSource`.
- Convert the live side through the protocol-v2 1.21.4 Paper adapter.
- Compare section block data and light data, global biome and height data, and
  representative block/light lookups.
- Preserve source identity as an outer diagnostic concern; renderer input data
  remains source-independent.

## Gate commands

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test saved_live_equivalence
git diff --check
```

## Completion boundary

The current evidence is deterministic 1.21.4 fixture equivalence. It does not
prove a real Paper process, all target versions, real world chunk parity,
renderer pixel parity, or the live bridge transport.

## Commit message

```text
test: verify saved and live renderer equivalence
```
