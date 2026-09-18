# Phase 04: Empty Map Recovery

## Goal

Eliminate the blank/green/transparent success illusion and diagnose queue,
cache, listener, and status failures at their source.

## Scope

Fix duplicate tile submissions, cache directory/atomic-write errors, event
cleanup, status errors, and decode provenance.

## Owned files

Agent A: Map request/listener/UI diagnostics. Agent B: scheduler/cache/backend
diagnostics.

## Dependencies

Phase 03 boundaries.

## Implementation tasks

- coalesce `request_map_render` and visible `get_map_tile` requests;
- debounce viewport changes and join in-flight requests;
- create cache roots recursively and preserve old tiles on write failure;
- expose `terrain`, `empty`, `rendering`, `stale`, `error`, and asset states;
- make listener disposer idempotent and classify unrelated errors separately.

## Implemented evidence (2026-09-18)

- The Map request coordinator now limits active Tauri tile invokes to four,
  tags requests by viewport generation, coalesces shared tiles, and rejects
  only queued requests superseded by a newer viewport.
- The Rust scheduler waits for transient capacity pressure instead of turning a
  short burst into an immediate `Map tile render queue is full` command error.
- Focused verification passed: Map tests (38 tests), Rust tile tests (17
  tests), frontend formatter/linter, and `bun run build`.

The `request_map_render`/visible-tile admission contract is improved but not
yet a complete shared scheduler API: Phase 12 still owns backend cancellation
and end-to-end viewport stress evidence.

## Focused tests

Duplicate request, cache ENOENT/atomic write, stale retention, event cleanup,
and status-error UI tests.

## Diff review checklist

No green success fallback, no swallowed tile error, bounded queue admission, and
no listener `undefined` rejection.

## Phase gate

Focused checks pass, then the scheduled full frontend/Rust/Java gate passes.

## Known non-goals

The tile may still use the old renderer, but its state must be honest.

## Follow-up phases

Phase 05 replaces sparse world decoding.
