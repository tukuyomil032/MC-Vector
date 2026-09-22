# R41: Restore Map UI after renderer verification

## Purpose

Reconnect a truthful Map route to the existing application shell after the renderer IPC contract exists. This phase exposes bridge, terrain, renderer, cache, source, and chunk diagnostics without treating a connected Core bridge as a successful terrain render.

## Scope

- Add `map` to the application view contract, sidebar, view labels, and keyboard cycle.
- Add a Map diagnostics view backed by the R40 structured IPC command and progress event.
- Keep the view explicit about the current `renderer_not_connected` blocked state.
- Add Japanese and English translations and an accessible status panel.
- Add only the Map route/icon/style/test surface required for this diagnostic view.

## Deliberate non-goals

- No terrain PNG is rendered in this phase.
- No consent or Map activation state is introduced.
- No tile cache is presented as ready.
- No pan, smooth zoom, old-layer retention, or cursor anchoring is implemented here.
- No Core bridge or renderer readiness is inferred from a server status or a selected client asset.

## Contract and failure behavior

The view sends one diagnostic `MapRenderRequest` for the active server and listens only for the matching request ID. A structured blocked response remains visible when the renderer is not connected. Exceptions are converted into the same redacted blocked presentation; raw error bodies, paths, and tokens are never rendered.

## Verification

```bash
bun run check
bun run typecheck:tests
bun run test -- tests/renderer/components/MapView.test.tsx
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml --lib
git diff --check
```

The phase is complete only when the route compiles, the blocked state is covered by a frontend test, and the full application still builds through the repository checks. It is not evidence that terrain rendering works.

## Commit

```text
feat: restore map ui after renderer verification
```
