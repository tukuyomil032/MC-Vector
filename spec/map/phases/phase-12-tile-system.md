# Phase 12: Tile System

## Goal

Make map rendering bounded, viewport-first, restartable, cacheable, and
incrementally invalidated.

## Scope

Priority queue, request coalescing, cancellation, memory/disk cache, atomic
writes, stale retention, progress, and dirty-chunk invalidation.

## Owned files

Agent B: Rust scheduler/cache/store. Agent A: progress/stale/error event handling.

## Dependencies

Phase 11 renderer and Phase 04 error-state contract.

## Implementation tasks

- prioritize visible, adjacent, player, then background tiles;
- join in-flight duplicate requests and cap queue capacity;
- atomically persist validated PNG and metadata;
- keep last successful tile during replacement/error;
- invalidate only tiles intersecting dirty chunks;
- version cache by world/asset/renderer/perspective identity.

## Implemented evidence (2026-09-18)

- Tile scheduling no longer fails immediately when the bounded pending queue is
  temporarily full; it waits for a permit while preserving viewport priority,
  eviction, duplicate detection, and cancellation cleanup.
- Atomic PNG/metadata storage treats a file that disappears between metadata
  inspection and read as a cache miss and retries one `NotFound` directory/file
  race before reporting a real storage error.
- Frontend viewport generations cap active invokes and clean up stale pending
  requests before they reach the Rust scheduler.
- Focused Rust tile tests (17) and Map frontend tests (38) pass.

This is a recovery slice, not the Phase 12 completion gate. Backend request
cancellation, scheduler stress under repeated pan/zoom, persistent cache reuse
in a real Tauri session, and full dirty-tile evidence remain open.

## Focused tests

Priority, duplicate coalescing, cancellation, LRU, disk reuse, atomic failure,
stale tile, dirty intersection, and zoom-out regeneration.

## Diff review checklist

No unbounded spawn, no queue full spam, no partial PNG as valid, and no old
renderer tile reuse.

## Phase gate

Cache and scheduler tests pass; stale tiles remain usable and UI receives
progress/ready/error transitions.

## Known non-goals

No remote tile server or Dynmap storage backend.

## Follow-up phases

Phase 13 replaces the preview Map UI.
