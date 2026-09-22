# ADR-MAP-0003: Isolated Rust renderer core

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Renderer domain and algorithms live in `src-tauri/crates/map-renderer-core`, independent of Tauri commands, Java/Paper types, app state, UI and filesystem cache. App integration calls only verified core APIs. `cargo check`, `cargo test` and `cargo clippy -- -D warnings` are gates for the renderer crate.

## Consequences

No `allow(dead_code)`/`allow(unused)` blanket, underscore renaming, feature-policy weakening, or unconnected renderer module hidden inside the app crate. Existing warnings outside this crate stay separately attributable; they cannot be waived as renderer success.
