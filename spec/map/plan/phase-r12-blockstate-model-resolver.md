# R12: Minecraft Blockstate and Model Resolution

## Purpose

Resolve version-bound blockstate and model JSON before geometry generation. The
resolver must preserve variant properties, multipart rules, parent inheritance,
texture variables, and rotations without silently selecting guessed data.

## Scope

- Resolve namespace-qualified blockstate paths from verified archive entries.
- Match variant property keys and multipart `when` clauses.
- Preserve deterministic variant arrays and model rotations/`uvlock`.
- Resolve model parents with cycle and depth detection.
- Merge inherited textures/elements and expose unresolved texture references.
- Return explicit missing/invalid/unsupported errors.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover property variants, multipart matching, parent texture
inheritance, and explicit parent-cycle failure.

## Explicit non-goals

This phase does not yet convert JSON elements into RenderPatch geometry or
claim full per-version Minecraft asset parity.

## Completion condition

R12 is complete only when JSON resolution is deterministic, bounded, and
warning-clean. A resolved model descriptor is not yet a rendered block.

## Commit

```text
feat: add minecraft blockstate and model resolution
```
