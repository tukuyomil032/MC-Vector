# Phase 06: Paper Live Snapshot

## Goal

Add a bounded protocol v2 path for already-loaded Paper chunks while keeping
all blocking/network work off the Paper main thread.

## Scope

Java request queue/encoder, Rust decoder/source priority, revisions, and real
Paper smoke coverage.

## Owned files

Agent A: Java plugin/tests/smoke. Agent B: Rust bridge decoder/source/cache.

## Dependencies

Phase 05 chunk model and Phase 02 Java project.

## Implementation tasks

- implement `chunk_snapshot_request`, success, and unavailable messages;
- cap pending requests at 128 and one snapshot capture per tick;
- check loaded status and never generate a chunk;
- enforce request IDs, payload limits, timeout, and provenance;
- prefer fresh live data, then cached live, then Anvil.

## Focused tests

Loaded/unloaded requests, queue bounds, duplicate IDs, payload rejection,
reconnect, main-thread safety, and protocol fixtures.

## Diff review checklist

No synchronous socket I/O in event/tick code, token redaction, explicit v2
capability negotiation, and no stale live snapshot treated as current.

## Phase gate

Real Paper smoke verifies hello, loaded snapshot, unloaded refusal, heartbeat,
and listener-unavailable startup.

## Known non-goals

No Java NBT/model/PNG renderer.

## Follow-up phases

Phase 07 discovers user asset sources.
