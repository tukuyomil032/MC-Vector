# R01: Renderer Core Isolation and Warning Boundary

## Purpose

Move the incomplete renderer vertical slice out of the Tauri application crate
so unfinished code cannot flood the application build with misleading
`dead_code` warnings. This is a structural quality gate, not a way to hide
warnings.

## Required boundary

Create `map-renderer-core` as an independent Rust library crate. The app must
not compile the renderer through an unconnected `mod map;` declaration until
the verified pipeline is reconnected in R40.

The renderer crate must be checked with warnings as errors. Blanket
`allow(dead_code)`, `allow(unused)`, underscore-only suppression, and warning
filter changes are prohibited.

## Migration

Move the current source-independent modules into the crate while preserving
their behavior and tests:

- `assets/model_view.rs`;
- `world/chunk_view.rs`;
- `world/region.rs`;
- `world/anvil.rs`;
- `renderer/png.rs`;
- `renderer/dynmap/`.

Keep Tauri commands, Paper code, frontend code, and runtime state out of the
crate. The crate may depend on serde/PNG/Anvil libraries, but it must not
depend on Tauri types.

## Verification

```bash
cargo check --manifest-path src-tauri/Cargo.toml --lib
cargo check -p map-renderer-core
cargo clippy -p map-renderer-core -- -D warnings
cargo test -p map-renderer-core
```

The application check must no longer report the 112 provisional Map
`dead_code` warnings. Existing unrelated warnings in backup/download/server
remain separate work and must not be bundled into this commit.

## Completion

- crate builds independently;
- focused tests execute from the new crate;
- application crate no longer declares the unconnected renderer module;
- renderer crate passes the warning gate without suppression;
- no renderer algorithm is changed while relocating it.

```text
ref: isolate map renderer core from tauri application
```
