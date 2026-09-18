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

The root `bridge/` directory is temporary migration input. It may be removed
only after Phase 2 path checks, Gradle, Paper smoke, and managed-JAR discovery
all use `src/map/paper/mc-vector-core`.

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
