# MC-Vector Map Renderer Plan

This is the canonical implementation plan for the MC-Vector map renderer.
The old short phase track is retired. Its commits remain in Git history, but
its documents are not evidence of renderer parity.

## Goal

Reproduce the renderer behavior required by MC-Vector from Dynmap v3.0 commit
`93b454efb8802dc7406d6873434f2aeec5c636f4`, using Rust-native source
adapters for every Minecraft Java Edition version registered in the inclusive
`1.14` through `26.3` compatibility matrix.

The renderer target includes Dynmap's required domain contracts, projection,
patch geometry, model and texture resolution, shaders, lighting, built-in
renderers, saved Anvil input, Paper live snapshots, tile/cache semantics, and
the MC-Vector Tauri/React integration.

## Boundary

Included:

- Dynmap renderer dependency closure at symbol and resource level;
- Dynmap `CustomRenderer` and `RenderPatch` API contracts needed by built-ins;
- all Dynmap built-in renderers;
- versioned Minecraft client/server JAR and resource-pack adapters;
- versioned Anvil and Paper snapshot adapters;
- MC-Vector cache, failure tile, stale, retry, scheduler, IPC, and Map UI.

Excluded:

- Bukkit plugin lifecycle and commands;
- Dynmap's embedded web server and web UI;
- Dynmap's storage backend and database schema;
- individual third-party mod/plugin renderer implementations.

The excluded systems are replaced by MC-Vector contracts. Their renderer
inputs and failure semantics are not omitted.

## Completion rule

No phase may claim completion from a PNG existing, a non-zero coverage ratio,
or a connected bridge. Every required source symbol and resource must map to a
Rust destination, a fixed fixture, a Dynmap reference capture, and an evidence
row. Every version matrix entry must pass its own adapter and renderer gates.

## Required checks

The renderer core must remain warning-clean without `allow(dead_code)` or
`allow(unused)` escapes:

```bash
cargo check -p map-renderer-core
cargo clippy -p map-renderer-core -- -D warnings
cargo test -p map-renderer-core
```

Build, focused tests, Java reference tests, Paper smoke, real Tauri, manual
UI, shutdown, and port-release evidence remain separate evidence classes.
