# R15: Dynmap Biome Tint and Material Rules

## Purpose

Keep biome-dependent colour and material opacity in an explicit shader boundary
so missing biome data cannot become a guessed terrain colour.

## Scope

- Resolve grass, foliage, and water tint channels by biome ID.
- Preserve RGB tinting without modifying source alpha unexpectedly.
- Distinguish opaque, cutout, translucent, and emissive material behavior.
- Return an explicit missing-biome error for tintable materials without data.
- Keep the shader independent from Anvil/Paper source adapters.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover tint lookup, missing biome data, cutout alpha, emissive
alpha, and existing source-over compositing.

## Explicit non-goals

This phase does not claim complete Minecraft biome color tables, Dynmap shader
resource parity, or version-specific foliage/water palette verification.

## Completion condition

R15 is complete only when material and tint decisions are explicit and
warning-clean. The final color still requires verified texture and lighting
inputs.

## Commit

```text
feat: port dynmap biome tint and material rules
```
