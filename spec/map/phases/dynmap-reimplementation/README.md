# Dynmap Renderer Reimplementation Track

This track supersedes the incomplete renderer implementation currently present
on `feat/map-integration`. It is intentionally separate from the historical
Phase 00-27 documents so that old focused-test claims are not mistaken for
proof of the new renderer.

## Goal

Rebuild the MC-Vector in-app map renderer from the pinned Dynmap v3.0 renderer
logic, using Rust-native source adapters for saved Anvil data and Paper live
snapshots. The target is the declared Dynmap in-app capability only; Dynmap's
web server, Bukkit commands, permissions, storage format, and configuration
compatibility remain out of scope.

## Source rule

The only renderer reference is Dynmap commit
`93b454efb8802dc7406d6873434f2aeec5c636f4`. A Rust implementation is not
accepted as Dynmap-derived merely because it produces an image. Projection,
ray traversal, patch intersection, model/texture resolution, UV handling,
lighting, alpha compositing, and tile bounds must each have a source mapping
and a fixture.

## Phase order

```text
R00 cutover and baseline
R01 source lock and license boundary
R02 renderer/domain contracts
R03 saved Anvil source
R04 Dynmap perspective renderer
R05 differential fixtures and golden evidence
R06 Paper live snapshot adapter
R07 tile pipeline and cache
R08 Map UI, pan, and smooth zoom
R09 real acceptance and release evidence
```

Every phase has its own focused gate and one logical commit. A later phase may
not hide a failed earlier gate with a fallback renderer or a UI success state.

## Evidence rule

The following are separate evidence classes:

- Rust focused/unit tests
- saved Anvil integration tests
- Dynmap differential/golden tests
- Paper Java tests and Paper smoke
- real Tauri IPC/filesystem tests
- manual Map UI verification
- server stop and port release

No phase may claim Dynmap parity from a transparent PNG, a non-zero coverage
value, a connected bridge, or a passing mock alone.

## Commit sequence

1. `docs: define dynmap reimplementation phases`
2. `revert: remove incomplete map implementation`
3. `chore: lock pinned dynmap renderer source`
4. `feat: define dynmap renderer domain contracts`
5. `feat: add saved anvil source adapter`
6. `feat: port dynmap perspective renderer`
7. `test: add dynmap differential fixtures`
8. `feat: add paper snapshot source adapter`
9. `feat: reconnect dynmap renderer to tile pipeline`
10. `feat: restore map ui after renderer parity`
11. `test: record real dynmap map acceptance`

Push, pull request creation, GitHub Release publication, and remote workflow
dispatch are not part of this track.
