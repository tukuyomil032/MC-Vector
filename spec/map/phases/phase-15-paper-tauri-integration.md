# Phase 15: Paper and Tauri Integration

## Goal

Prove the feature across a real Paper server, Rust bridge, Tauri IPC, assets,
tiles, and the user-facing Map screen.

## Scope

Paper 1.21.10 smoke, live changes, disabled JAR, app-data separation, cache
reuse, asset selection, and manual Map interaction.

## Owned files

Agent A: Paper smoke and Java lifecycle. Agent B: runtime integration and
backend fixtures. Main: logs, manual UI, and evidence ledger.

## Dependencies

Phases 06, 08, 12, 13, and 14.

## Implementation tasks

- run `bun run tauri:dev` with a real managed server;
- verify hello/heartbeat/player/snapshot and loaded/unloaded behavior;
- place/break blocks and observe dirty tile updates;
- stop listener/server safely and test reconnection;
- restart app and verify cache reuse and distinct Debug/Production data roots;
- capture redacted logs and screenshots without user assets in the repo.

## Focused tests

Real Paper smoke and real Tauri/manual scenario. Keep each result separately
labelled; a mock cannot substitute for either.

## Diff review checklist

No test-only shortcut in production path, no server auto-stop on removal, and
no app-data path guessed from development assumptions.

## Phase gate

Real Paper and `tauri dev` evidence covers live map use and failure states.

## Known non-goals

Cross-platform release packaging is addressed in Phase 16.

## Follow-up phases

Phase 16 hardens CI, attribution, and distribution.
