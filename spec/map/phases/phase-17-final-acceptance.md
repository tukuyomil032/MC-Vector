# Phase 17: Final Acceptance

## Goal

Decide honestly whether the completed feature is Dynmap-like, with code,
license, integration, and visual evidence rather than a passing placeholder.

## Scope

Final structure, unused/type checks, command/event registration, source
provenance, asset manifest, cache identity, Paper/Tauri/golden/CI evidence.

## Owned files

Main coordinates the final diff and evidence ledger; A/B fix only scoped
findings and review each other's changed diff.

## Dependencies

Phases 00-16 complete or explicitly recorded as blocked/open.

## Implementation tasks

- confirm `src/map`, `src/map/paper`, `src/map/dynmap/upstream`, and
  `src-tauri/src/map` boundaries;
- remove root `bridge/` and old god-file paths only after reference checks;
- run unused/type/warning checks and inspect command/event registrations;
- verify full vanilla/model/texture/tint/lighting target coverage;
- verify terrain, water, forest, snow, height, buildings, and special blocks;
- record every unverified item instead of declaring parity by inference.

## Focused tests

Full local matrix, real Paper, real Tauri, golden fixtures, accessibility/manual
checks, `git diff --check`, and distribution/license audit.

## Evidence recorded on 2026-09-18

The following local gates currently pass:

- `bun run check`
- `bun run test` (47 files, 423 tests)
- `bun run typecheck:tests`
- `bun run build`
- `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml` (201 passed, 1 ignored)
- `cargo check --manifest-path src-tauri/Cargo.toml` (no Rust warnings)
- `src/map/paper/mc-vector-core/gradlew --no-daemon clean test jar`
- Paper 1.21.10 smoke: connected, listener-absent, and `.jar.disabled`
  scenarios, including hello, heartbeat, player snapshot, loaded snapshot,
  and unloaded-chunk rejection
- CI workflow action and distribution-boundary checks

The Tauri debug target also compiled and launched through `bun run tauri:dev`.
Manual Map interaction was not recorded in that run because a production
MC-Vector instance was already open and was deliberately left untouched. The
following gates therefore remain open: real Tauri Map interaction, disk-cache
reuse after restart, debug/production app-data separation, golden-image
comparison, complete vanilla block/model coverage, and full Dynmap feature
parity. Remote CI was not dispatched.

## Diff review checklist

No dead declarations, no old preview fallback, no transparent-success state,
no hidden protocol mismatch, no missing attribution, and no unverified claim in
the release note.

## Phase gate

Only when all mandatory evidence is present may the feature be labelled
“Dynmap-like renderer”. Otherwise the report lists the exact open gate.

Current result: **open**. The local code/test matrix and Paper smoke evidence
are strong enough to continue implementation, but they do not prove Dynmap
parity or complete the real-Tauri and visual acceptance gates.

## Known non-goals

This phase does not authorize push, PR, release, or external Dynmap support.

## Follow-up phases

Any later work must add a new phase/ADR rather than silently changing this
acceptance contract.
