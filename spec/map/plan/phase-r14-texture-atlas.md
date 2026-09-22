# R14: Dynmap Texture Pack, Atlas, UV, and Alpha Pipeline

## Purpose

Decode verified Minecraft texture assets into deterministic RGBA samples. The
texture path and alpha contract must remain separate from model geometry UVs.

## Scope

- Decode PNG RGB/RGBA/grayscale inputs into RGBA8 pixels.
- Preserve transparent and translucent alpha values.
- Resolve namespace texture paths only through verified archive entries.
- Bound decoded pixel count and reject malformed/oversized images.
- Reject animated `.mcmeta` textures until an explicit animation policy exists.
- Keep UV wrapping and rotation deterministic.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover PNG decode, alpha preservation, malformed input, missing
texture errors, and the explicit animated-texture boundary.

## Explicit non-goals

This phase does not claim full client-JAR extraction matrix coverage,
resampling parity for every Dynmap texture mode, or all Minecraft version asset
format differences.

## Completion condition

R14 is complete only when decoded pixels are bounded, deterministic, and
alpha-preserving under the warning/test gates. Missing assets remain failures.

## Commit

```text
feat: port dynmap texture and uv pipeline
```
