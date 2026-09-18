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

## Evidence

The pinned Paper 1.21.10 build 130 fixture was verified locally on 2026-09-18.
The SHA-256 matched the CI pin
`158703f75a26f842ea656b3dc6d75bf3d1ec176b97a2c36384d0b80b3871af53`.

```text
PAPER_JAR=/private/tmp/paper-1.21.10-130.jar \
  SMOKE_TIMEOUT_MS=180000 \
  node scripts/paper-bridge-smoke.mjs

connected: Paper loaded MC-Vector Core and exchanged hello/telemetry/chunk snapshot messages
offline: Paper stayed running without a bridge listener
disabled: Paper ignored mc-vector-core.jar.disabled
exit code: 0
```

The connected scenario independently asserted the Paper/Minecraft version,
protocol v2 hello, heartbeat, player snapshot, non-empty loaded-chunk payload,
and `not_loaded` for the unloaded-chunk request. The smoke fixture does not
force-load the unloaded request.

`bun run tauri:dev` also compiled the debug binary and reached the running
Tauri process with Vite on `http://localhost:5173`. Interactive Map evidence,
cache reuse after app restart, and Debug/Production app-data separation remain
open because a Production MC-Vector instance was already running and was not
closed as part of this gate.

## Diff review checklist

No test-only shortcut in production path, no server auto-stop on removal, and
no app-data path guessed from development assumptions.

## Phase gate

Real Paper and `tauri dev` evidence must cover live map use and failure states.
The Paper portion is complete; the manual Tauri portion remains open.

## Known non-goals

Cross-platform release packaging is addressed in Phase 16.

## Follow-up phases

Phase 16 hardens CI, attribution, and distribution.
