# Phase 03: Rust Architecture

## Goal

Split the Rust Map backend into feature-owned domain, application, bridge,
source, asset, renderer, tile, diagnostic, and thin command boundaries.

## Scope

Refactor `commands/map.rs` and current Map modules without changing externally
observable behavior.

## Owned files

Agent B: `src-tauri/src/map/**`, `src-tauri/src/commands/map/**`, command
registration files and Rust tests.

## Dependencies

Phase 02 path contract and Tauri v2 command registration rules.

## Implementation tasks

- introduce domain types and error/provenance types;
- extract application services from Tauri commands;
- split bridge, sources, assets, renderer, and tiles modules;
- keep all commands registered and serialized with owned async arguments;
- remove dead helpers and preserve focused tests.

## Implemented evidence (2026-09-18)

- The asset service now lives at `src-tauri/src/map/assets/service.rs` and is
  re-exported by the Map feature module. Asset discovery, loading, status,
  manifest identity, and fallback colours no longer belong to the legacy
  `commands/map_assets.rs` module.
- `commands/map.rs` and `commands/map/assets.rs` keep their existing Tauri
  command names while depending on the feature-owned asset boundary.
- `cargo check` and the focused `map::assets::` test slice pass after the
  extraction. The command file remains larger than the target thin-command
  boundary, so the Phase 03 gate is not closed.

## Focused tests

`cargo fmt --check`, `cargo check`, affected Rust tests, and command registration
inspection.

## Diff review checklist

Commands remain thin, no filesystem access leaks across boundaries, no unused
types/imports, and no command silently disappears from `generate_handler!`.

## Phase gate

Rust check/tests pass and frontend IPC names still compile.

## Known non-goals

No new Anvil decoder or renderer algorithm.

## Follow-up phases

Phase 04 fixes the currently empty/error map path.
