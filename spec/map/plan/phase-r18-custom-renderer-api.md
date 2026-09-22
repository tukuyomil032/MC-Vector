# R18: Dynmap CustomRenderer API Compatibility

## Purpose

Define the source-independent subset of Dynmap's CustomRenderer API required by
built-in model resolution and future renderer adapters.

## Scope

- Preserve block state ID/name/properties lookup.
- Provide current-block and neighbor context access through `MapDataContext`.
- Provide explicit `RenderPatchFactory` construction.
- Define renderer registration and duplicate-name rejection.
- Keep third-party renderer implementations out of the migration scope while
  preserving the API contract they would consume.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover state conversion, context/neighbor lookup, patch factory,
and duplicate registration.

## Explicit non-goals

This phase does not port every third-party CustomRenderer implementation or
introduce Bukkit lifecycle dependencies into the renderer crate.

## Completion condition

R18 is complete only when the API boundary is source-independent, typed, and
warning-clean. Individual built-in renderer coverage remains later work.

## Commit

```text
feat: add dynmap custom renderer api compatibility
```
