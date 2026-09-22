# R34: Paper snapshot bridge protocol

## Purpose

Freeze the Paper-to-Rust data boundary before implementing a transport or
version-specific Paper adapter. Paper supplies lifecycle and chunk snapshot
data; the Rust renderer remains the only renderer.

## Contract

- Protocol version `2` is explicit in hello responses.
- Hello validates server identity, plugin version presence, and Minecraft
  version before a bridge becomes `Connected`.
- Every snapshot response carries request ID, server, Minecraft version, world,
  dimension, and chunk coordinates.
- `Loaded` requires a non-empty block/biome section payload and matching
  snapshot coordinates.
- `NotLoaded`, `WorldUnavailable`, `QueueFull`, `Timeout`, and
  `InvalidSnapshot` are unavailable states, not generated-terrain results.
- Bridge connectivity and terrain readiness are represented separately.
- Raw paths, tokens, HTTP bodies, and internal stack traces are not part of the
  wire contract.

## Implementation

`map-renderer-core::bridge` defines the transport-neutral messages and identity
validation. It intentionally does not open sockets, depend on Bukkit/Paper, or
convert directly into a renderer result. Version adapters and the eventual
transport must first validate this contract, then construct the shared
`MapChunkCache` domain model.

## Focused evidence

- JSON round-trip preserves the tagged message shape.
- A loaded snapshot validates all request identity fields.
- A mismatched chunk coordinate is rejected.
- A not-loaded response is accepted only as an explicit unavailable state.
- An incompatible protocol is rejected before identity checks.

## Gate commands

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core bridge
git diff --check
```

## Completion boundary

This phase defines and tests the Rust protocol contract only. A real Paper
plugin, socket transport, version-specific snapshot adapter, live snapshot,
saved/live equivalence, and Tauri integration remain later phases.

## Commit message

```text
feat: define paper snapshot bridge protocol
```
