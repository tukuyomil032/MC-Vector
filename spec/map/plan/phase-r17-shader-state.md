# R17: Dynmap Shader State and Lighting Resources

## Purpose

Define one shader-state contract for Dynmap-style built-in shaders so biome,
height, light, underwater, cave, and material requirements are explicit before
the tile renderer selects a final pixel.

## Scope

- Define shader state and a source-independent `HdShader` trait.
- Keep Default, TexturePack, Underwater, Cave, and Topo shader boundaries.
- Preserve alpha while applying shader-specific RGB output.
- Reject missing height data for topographic output.
- Keep shader selection independent from Paper and Tauri lifecycles.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover shader state transitions, underwater/cave tint, topo
height output, missing height, and existing material/alpha rules.

## Explicit non-goals

This phase does not claim exact `shaders.txt`/`lightings.txt` parity, Java
reference traces, or complete per-version shader resources.

## Completion condition

R17 is complete only when shader state and built-in boundaries are explicit and
warning-clean. Numeric shader parity remains a later differential gate.

## Commit

```text
feat: port dynmap shader state and lighting resources
```
