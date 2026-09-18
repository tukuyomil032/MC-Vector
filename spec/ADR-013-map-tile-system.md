# ADR-013: Bounded Tile System

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Synchronous tile generation and duplicate viewport/prefetch requests caused
queue saturation and cache errors.

## Decision

Use a bounded viewport-first scheduler with in-flight request coalescing,
cancellation, memory LRU, atomic disk writes, versioned keys, stale retention,
and chunk-intersection invalidation.

## Consequences

`empty`, `rendering`, `stale`, and `error` are metadata states, not inferred
from PNG transparency. The scheduler is independently tested.
