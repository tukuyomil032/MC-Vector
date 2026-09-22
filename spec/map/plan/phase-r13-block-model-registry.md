# R13: Dynmap Block Model Registry Boundary

## Purpose

Convert resolved Minecraft model elements into the renderer's patch model
without putting JSON parsing or asset lookup inside ray traversal.

## Scope

- Convert cuboid `from`/`to` bounds into six oriented patch geometries.
- Preserve face direction, cullface, shade, texture index, UV bounds, and UV
  rotation.
- Resolve texture variables through the inherited model texture map.
- Reject invalid bounds, faces, texture references, UV arrays, and rotations.
- Keep model registry output immutable and source-independent.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover a six-face cube, texture-variable lookup, UV rotation,
cullface metadata, and missing-texture failure.

## Explicit non-goals

Scaled/volumetric/custom model families, all Dynmap built-in renderers, and
version-wide model fixture parity remain later gates.

## Completion condition

R13 is complete only when model JSON is converted to explicit patches under the
warning/test gates. This does not yet prove final texture sampling or pixel
parity.

## Commit

```text
feat: port dynmap block model registry
```
