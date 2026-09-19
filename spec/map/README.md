# MC-Vector Map Implementation Plan

This directory is the executable plan for rebuilding the Map feature. Dynmap
facts belong in `../dynmap/`; this directory records MC-Vector decisions,
dependencies, ownership, phase gates, and commit boundaries.

The final target is **complete reproduction of Dynmap's in-app map capability**
inside MC-Vector. This does not mean copying Dynmap's server product surface.
The target includes map rendering, map types, perspectives, assets, world data,
updates, players, markers, overlays that are part of the map view, navigation,
and map lifecycle. It explicitly excludes the embedded web server, HTTP/API
compatibility, Bukkit commands and permissions, Dynmap configuration
compatibility, and unrelated external integrations.

## Feature boundary

```text
src/map/                    React + Paper + selected upstream source
src-tauri/src/map/          Rust domain/application/backend
src-tauri/src/commands/map/ thin Tauri v2 adapters
spec/dynmap/                primary-source research and license evidence
```

The root `bridge/` directory has been removed. Paper build, Paper smoke, and
managed-JAR discovery use `src/map/paper/mc-vector-core`.

## Phase order

```text
00 baseline/spec reset
01 frontend migration -> 02 Paper migration -> 03 Rust architecture
04 empty-map recovery -> 05 Anvil/chunk -> 06 live snapshot
07 launcher source audit -> 08 launcher adapters
09 asset validation -> 10 resource-pack stack
11 blockstate/model resolution -> 12 texture/tint/transparency
13 Dynmap source porting -> 14 Iso geometry
15 shaders/lighting -> 16 special block renderers
17 tile system -> 18A Core artifact distribution/lifecycle recovery -> 18 dimensions/map types
19 players/markers -> 20 map-visible overlays
21 Map UI -> 22 lifecycle and diagnostics
23 real Paper/Tauri integration -> 24 golden fixtures
25 CI/license/distribution -> 26 full coverage audit
27 final acceptance

Each numbered phase may contain several logical commits. The number of phases
is intentionally higher than the earlier draft so that a passing prototype
cannot be mistaken for final parity.
```

Phases may run side-by-side only where the owned files are disjoint. Each
implementation task is one logical commit; no push, PR, or remote CI dispatch
is implied by a local phase gate.

## Current implementation ledger

The ledger distinguishes landed code from a phase gate. A phase remains
`in-progress` until its documented gate and the required real-environment
evidence are recorded.

| Phase | Status | Evidence / remaining boundary |
| --- | --- | --- |
| 00 | phase-complete | Research corpus, implementation plan, and ADR-008 through ADR-015 are landed. |
| 01–03 | focused-tested | Feature roots, Paper path, Rust command boundaries, and module contracts are landed; full architectural extraction remains tracked in their phase documents. |
| 04–08 | focused-tested | Empty/error states, queue/cache recovery, Anvil/live bridge groundwork, launcher discovery, and asset resolution have focused tests. Full Phase 8 gate is recorded in the session handoff, not as real-Paper proof. |
| 09–16 | in-progress | Asset validation, model/texture resolution, selected Dynmap renderer work, geometry, lighting, and special block rendering remain incomplete until real client assets and golden fixtures prove them. |
| 17 | open | Projected tile scheduling has focused tests, but the real-app gate found a missing Core JAR precondition; Phase 17 remains open until its real Paper/Tauri zoom evidence is rerun. |
| 18A | open | Core artifact enablement, GitHub Release distribution, production download/verification, and the missing-JAR lifecycle defect are not implemented yet. |
| 18–22 | open | Dimensions, markers, overlays, UI state, and lifecycle behavior require real-data verification after the Core artifact prerequisite is reliable. |
| 23–26 | open | Real Paper/Tauri evidence, golden images, CI/license evidence, and all-block coverage are not complete. |
| 27 | open | Final acceptance is intentionally open until every mandatory map capability and real-environment gate passes. |

Do not use this ledger to describe the Map renderer as Dynmap-complete. The
only completion label for that claim is the Phase 27 gate.

## Agent model

- Main session: source research, contracts/spec/ADR, integration, shared files,
  targeted verification, and phase gates.
- Agent A: `src/map/**`, React, Paper Java, frontend/Java tests.
- Agent B: `src-tauri/src/map/**`, `src-tauri/src/commands/map/**`, Rust/Tauri,
  backend tests.

Agents do not edit shared files without returning a proposed diff. A and B
review each other's changed diff only; full builds/tests are reserved for the
listed gates.

## Review and verification cadence

Agents do not perform a full diff review after every small task. Changes are
grouped into subsystem batches with disjoint ownership. The main session
reviews the grouped diff at these boundaries:

- documentation and contract batch;
- frontend/runtime stability batch;
- launcher and asset batch;
- world-data and live-bridge batch;
- renderer batch;
- tile/storage batch;
- UI/lifecycle batch;
- integration and release batch.

Focused tests run after each logical implementation commit. Full repository
tests/builds run only at Phase 04, 09, 12, 15, 17, 22, 23, 25, 26, and 27
gates. A grouped diff review checks scope, contracts, dead code, registration,
error handling, and tests; it does not repeat the full suite unless the phase
gate requires it.

## Gate vocabulary

`implemented` means code exists. `focused-tested` means the changed module
passes its targeted checks. `phase-complete` requires the gate in the phase
document plus a recorded list of known non-goals. `Map-complete` is reserved
for Phase 27 and may not be inferred from a successful build, a transparent
PNG, a selected asset path, or a Paper hello message.
