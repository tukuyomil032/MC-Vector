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
