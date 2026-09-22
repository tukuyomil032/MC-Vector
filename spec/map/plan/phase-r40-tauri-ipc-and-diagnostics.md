# R40: Tauri IPC and diagnostics

## Purpose

Create one redacted wire contract between the verified renderer core and the
Tauri/frontend boundary. The contract distinguishes bridge connectivity,
terrain availability, renderer progress, cache state, and final terrain
readiness. It must not turn an enabled-looking UI state into a renderer
success.

## Scope

- CamelCase `MapRenderRequest` decoding with viewport center and tile geometry.
- Structured `MapRenderResponse`, `map-render-progress`, and
  `map-tile-ready` event payloads.
- Renderer version and Minecraft asset/version identity fields.
- Bridge state, terrain state, render state, source, chunk counts, coverage,
  cache state, retryability, and redacted unavailable reasons.
- `request_map_render` Tauri registration and frontend wrapper/listener
  cleanup handles.
- Per-server generation tracking at the Tauri boundary.

At this phase the actual source adapter and render scheduler are not connected
to the Tauri command yet. A request therefore returns `blocked` with
`renderer_not_connected` and emits a progress event. It never emits a false
ready tile or a transparent success PNG.

## Rust destination

- `src-tauri/crates/map-renderer-core/src/ipc.rs`
- `src-tauri/src/commands/map_render.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`

## Frontend destination

- `src/lib/map-render-commands.ts`
- `tests/lib/map-render-commands.test.ts`

## Input and output contract

Requests are validated for non-empty identities, finite coordinates, zoom
`0..8`, and non-zero viewport dimensions. Enum values use snake_case while
field names use camelCase. The response and events contain only bounded
diagnostic enums, counters, hashes/versions, and tile bytes when a later phase
has a verified ready result.

Absolute paths, tokens, raw HTTP bodies, raw server responses, and internal
stack traces are not part of this contract.

## Failure states

- Invalid request, coordinate, or viewport is rejected before rendering.
- Renderer not connected is returned as `blocked`, not `ready`.
- Bridge/terrain/render/cache states remain independently observable.
- Event emission failure is returned as the redacted `map_event_emit_failed`
  code.

## Tests and fixture boundary

Rust tests cover camelCase/snake_case JSON, finite-coordinate validation, and
redacted blocked diagnostics. Frontend tests cover request forwarding and
progress/tile listener registration with cleanup handles. The Tauri library
also compiles with the new command registered.

## Gate commands

```bash
bun run check
bun run typecheck:tests
bun run test -- tests/lib/map-render-commands.test.ts
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## Completion boundary

R40 is complete when the IPC/diagnostics contract is typechecked, redacted,
and registered without claiming renderer success. It does not prove a real
Anvil/Paper render, event delivery from a running Tauri app, Map UI behavior,
or consent activation.

## Commit message

```text
feat: connect verified renderer to tauri diagnostics
```
