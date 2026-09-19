# Phase 22: Lifecycle and Diagnostics

## Goal

Make Map lifecycle behavior deterministic and make every blocking failure
actionable in the app and logs.

## Scope

Bridge disconnects, server stop/start, component pause/restore/remove, asset
repair, IPC errors, listener ownership, command throttling, and diagnostics.

## Owned files

Map lifecycle services, event registration helpers, server-property error
boundaries, and diagnostics tests.

## Dependencies

Phases 04, 17, 21, and existing server lifecycle contracts.

## Implementation tasks

- stop render admission when bridge/configuration is unavailable;
- preserve old images while reporting stale/disconnected state;
- make event listener registration/disposal idempotent;
- separate ordinary missing `server.properties` from Map errors;
- deduplicate or throttle status/telemetry calls without masking failures;
- redact tokens and paths where required while retaining safe diagnostic codes;
- expose repair and retry actions with bounded backoff.

## Focused tests

Server-stop loop, repeated mount/unmount, HMR-like disposal, IPC rejection,
command throttle isolation, repair states, and redacted diagnostics.

## Diff review checklist

No infinite timer, no render request after terminal pause/remove, no swallowed
Promise rejection, no secret leakage, and no unrelated server error in Map UI.

## Phase gate

The reported console errors are either eliminated or mapped to a stable,
user-visible state with a reproducible diagnostic code.

## Known non-goals

No remote telemetry service or external monitoring integration.

## Follow-up phases

Phase 23 performs real Paper/Tauri verification; Phase 24 adds image evidence.
