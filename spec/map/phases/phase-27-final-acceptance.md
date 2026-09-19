# Phase 27: Final Acceptance

## Goal

Decide whether MC-Vector has achieved complete reproduction of the declared
Dynmap in-app map capability.

## Scope

All code, contracts, assets, renderer behavior, map types, dimensions, live
updates, UI, real environments, golden evidence, CI, license, and release
boundaries.

## Owned files

Final evidence ledger, release notes, unresolved-risk report, and any narrowly
scoped fixes required by the gate.

## Dependencies

Phases 00–26 complete or explicitly blocked with user-visible evidence.

## Implementation tasks

- run the complete local verification matrix;
- run real Paper 1.21.10 and real Tauri manual verification;
- inspect golden-image reports and all-block coverage;
- verify launcher fixtures, especially the Prism shared-library layout;
- verify no loading loop, transparent-success state, queue flood, cache ENOENT,
  or listener rejection remains;
- verify source attribution and non-bundling of user-owned assets;
- publish a truthful pass/fail ledger with no inferred completion claims.

## Focused tests

Full frontend, Rust, Java, Tauri, Paper, golden, lifecycle, accessibility,
license, and distribution checks.

## Diff review checklist

No dead declarations, stale path assumptions, unregistered command/event,
unverified renderer claim, or excluded product surface hidden as complete.

## Phase gate

Only when every mandatory map capability is demonstrated on real data and every
blocking gate passes may the feature be labelled **Map-complete** or
**Dynmap-equivalent within the declared in-app scope**.

## Known non-goals

Embedded web server, HTTP/API compatibility, Bukkit commands/permissions,
Dynmap configuration compatibility, and unrelated external integrations are
not required for this acceptance decision.

## Follow-up phases

Any new capability outside this contract requires a new ADR and phase.
