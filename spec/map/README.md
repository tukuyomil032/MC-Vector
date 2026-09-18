# MC-Vector Map Implementation Plan

This directory is the executable plan for rebuilding the Map feature. Dynmap
facts belong in `../dynmap/`; this directory records MC-Vector decisions,
dependencies, ownership, phase gates, and commit boundaries.

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
07 launcher discovery -> 08 asset resolution -> 09 source porting
10 Iso geometry -> 11 texture/shader/lighting -> 12 tiles
13 UI -> 14 Dynmap map features -> 15 real integration
16 CI/license/distribution -> 17 final acceptance
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
| 00 | phase-complete | Research corpus, 18 phase documents, and ADR-008 through ADR-015 are landed. |
| 01–03 | focused-tested | Feature roots, Paper path, Rust command boundaries, and module contracts are landed; full architectural extraction remains tracked in their phase documents. |
| 04–08 | focused-tested | Empty/error states, queue/cache recovery, Anvil/live bridge groundwork, launcher discovery, and asset resolution have focused tests. Full Phase 8 gate is recorded in the session handoff, not as real-Paper proof. |
| 09–11 | in-progress | Pinned Dynmap snapshots, Iso geometry, model UV handling, tint, alpha, and lighting are present; golden-image and all-block coverage are not complete. |
| 12–14 | in-progress | Bounded tiles, world layers, player interpolation, and server-scoped marker persistence are present; complete overlay UI and real-session gate remain. |
| 15 | focused-tested | Pinned Paper 1.21.10 smoke passes connected/offline/disabled scenarios and live snapshot assertions. Tauri dev compiled and launched; manual Map interaction, cache reuse, and app-data separation remain open. |
| 16 | in-progress | CI workflows, Gradle wrapper, Paper workflow, and attribution artifacts are present; local gate is recorded, while distribution review and remote CI evidence remain. |
| 17 | pending | Final acceptance waits for the real Tauri manual evidence and the remaining renderer/asset parity gates. |

Do not use this ledger to describe the Map renderer as Dynmap-complete. The
only completion label for that claim is the Phase 17 gate.

## Agent model

- Main session: source research, contracts/spec/ADR, integration, shared files,
  targeted verification, and phase gates.
- Agent A: `src/map/**`, React, Paper Java, frontend/Java tests.
- Agent B: `src-tauri/src/map/**`, `src-tauri/src/commands/map/**`, Rust/Tauri,
  backend tests.

Agents do not edit shared files without returning a proposed diff. A and B
review each other's changed diff only; full builds/tests are reserved for the
listed gates.

## Gate vocabulary

`implemented` means code exists. `focused-tested` means the changed module
passes its targeted checks. `phase-complete` requires the gate in the phase
document plus a recorded list of known non-goals. `Dynmap-like complete` is
reserved for Phase 17.
