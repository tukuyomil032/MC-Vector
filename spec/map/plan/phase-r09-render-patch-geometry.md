# R09: Dynmap Render Patch Geometry

## Purpose

Define the Rust equivalent of Dynmap's patch geometry boundary before voxel
traversal depends on it. Patch construction, UV clipping, face visibility,
metadata, and ray intersection must remain explicit and deterministic.

## Scope

- Preserve patch origin, U/V vectors, clipped UV limits, normal, and dominant
  block-step direction.
- Provide a small `PatchDefinitionFactory` for full unit patches without
  hiding geometry validation.
- Return patch identity, texture index, shade flag, UV, point, and distance
  from a successful intersection.
- Reject non-finite values, degenerate surfaces, invalid clips, parallel rays,
  and invisible backfaces.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover clipped bounds, UV interpolation, factory metadata,
parallel/backface rejection, degenerate geometry, and reversed clips.

## Explicit non-goals

This phase does not claim all built-in block renderers, model JSON resolution,
texture atlas parity, Java reference traces, or final PNG pixel parity.

## Completion condition

R09 is complete only when patch geometry and metadata pass the warning/test
gates. A successful patch intersection alone is not renderer completion.

## Commit

```text
feat: port dynmap render patch geometry
```
