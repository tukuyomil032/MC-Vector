# R35: Paper snapshot adapter for 1.21.4

## Purpose

Convert a validated protocol-v2 loaded snapshot for Minecraft 1.21.4 into the
same `MapChunkCache` contract used by the saved Anvil source. The adapter must
reject unavailable snapshots, wrong DataVersion values, malformed palettes,
short packed state arrays, invalid light arrays, and identity mismatches.

## Implementation

- Decode the 1.21.4 packed block-state indices into 4096 section entries.
- Expand nibble-packed sky and block light into renderer samples.
- Bind Minecraft version, world, dimension, and chunk coordinates to
  `ChunkIdentity`.
- Preserve explicit unavailable responses as bridge errors instead of turning
  them into loaded or empty terrain.
- Keep this adapter under the bridge/source boundary; renderer modules do not
  depend on Paper types.

## Gate commands

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core bridge::snapshots::v1_21_4
git diff --check
```

## Completion boundary

This verifies the 1.21.4 Rust conversion contract with an in-memory protocol
fixture. It is not a real Paper process, a version-wide Paper matrix, or saved
and live pixel equivalence. Those remain explicit later gates.

## Commit message

```text
feat: add paper snapshot adapter for 1.21.4
```
