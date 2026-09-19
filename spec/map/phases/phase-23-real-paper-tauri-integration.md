# Phase 23: Real Paper and Tauri Integration

## Goal

Prove the complete data path on a real Paper 1.21.10 server and the real
MC-Vector Tauri app.

## Scope

Plugin load, protocol v2, live snapshots, dirty updates, asset selection,
rendered tiles, player/marker updates, lifecycle, and cache reuse.

## Owned files

Paper smoke harness, Rust integration fixtures, Tauri runtime diagnostics, and
integration evidence.

## Dependencies

Phases 06, 09, 17, 18A, 21, and 22.

## Implementation tasks

- verify connected, offline, paused, restored, and disabled component states;
- verify production-mode Core artifact download/verification without a local
  Gradle checkout, and distinguish Core installation from Minecraft asset
  selection;
- verify loaded snapshot success and unloaded-chunk rejection;
- place/break blocks and confirm only intersecting tiles update;
- select a real client JAR/resource pack and record parsed asset counts;
- restart the app and confirm disk cache reuse and app-data separation;
- preserve Paper operation when Rust listener is absent or stopped.

## Focused tests

Real Paper smoke, real Tauri dev session, loaded/unloaded snapshots, live
updates, cache restart, asset selection, and lifecycle transitions.

## Diff review checklist

No mock-only assertion is used as real evidence; all paths and protocol versions
are recorded; failures identify the layer that failed.

## Phase gate

An actual generated world displays actual terrain in the real Tauri Map screen,
and a live block change becomes visible without forcing an unloaded chunk.

## Known non-goals

Remote CI dispatch remains separate from local evidence.

## Follow-up phases

Phase 24 creates deterministic visual fixtures and comparison reports.
