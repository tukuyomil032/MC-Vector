# R08: Dynmap Projection and Transform Contracts

## Purpose

Make the Dynmap-derived matrix, projection, inverse projection, ray boundary,
and world-coordinate tile contracts explicit before renderer traversal or Map
UI integration depends on them.

## Scope

- Preserve Dynmap pre-multiply order and checked matrix inversion.
- Reject invalid viewport and scale inputs instead of emitting undefined rays.
- Record a deterministic projection trace for world/map/screen round trips.
- Use Euclidean division for negative world coordinates.
- Keep tile boundaries half-open and checked for integer overflow.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover matrix round trips, cursor-anchor round trips, invalid
projection input, projection traces, negative tile coordinates, and overflow.

## Explicit non-goals

This phase does not claim Java Dynmap reference parity, complete patch/model
coverage, version-specific assets, tile scheduling, or smooth UI zoom. Those
remain later phase gates.

## Completion condition

R08 is complete only when the transform and tile-boundary contract passes its
focused warning/test gates. A mathematical round trip alone is not evidence of
renderer pixel parity.

## Commit

```text
feat: port dynmap projection and transform contracts
```
