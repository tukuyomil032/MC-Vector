# Phase 07: Launcher Asset Discovery

## Goal

Resolve user-owned Minecraft client/resource-pack sources across common
launchers without unsafe path assumptions.

## Scope

PrismLauncher first, then official Launcher, MultiMC family, Modrinth,
CurseForge, GDLauncher, ATLauncher, and manual selection.

## Owned files

Agent B: Rust resolver, candidate model, hashing, path safety, fixtures. Agent A:
candidate/selection UI and diagnostics.

## Dependencies

Phase 00 launcher research and Phase 05 version metadata.

## Implementation tasks

- enumerate candidates in documented order;
- support standard/custom/portable roots and instance metadata;
- canonicalize paths and reject traversal/suspicious inputs;
- calculate SHA-256 and exact Minecraft version identity;
- expose manual selection when auto-detection fails;
- expose launcher identity through the Rust/TypeScript contract without
  bundling any Minecraft asset;
- keep launcher discovery as candidate generation: source validation and
  explicit user selection remain separate operations.

## Implemented evidence

`src-tauri/src/map/assets/discovery.rs` now has candidate adapters for:

- PrismLauncher standard, custom, and portable roots;
- the official Launcher versions directory;
- MultiMC-compatible `instances` roots;
- Modrinth App `profiles`/`instances` roots;
- CurseForge `minecraft/Instances`, `Instances`, and `instances` roots;
- GDLauncher `instances`/`profiles` roots; and
- ATLauncher `instances` roots.

The adapters inspect only canonical directories, select a conventional
`.minecraft`, `minecraft`, or `game` child when present, and reuse the same
artifact, version, resource-pack, SHA-256, and symlink/traversal validation as
the existing Prism and manual paths. `AssetLauncher` and the TypeScript
`MapAssetLauncher` union carry the new launcher identities across the IPC
boundary. Candidate priority remains Prism, official Launcher, the additional
launcher families, and manual selection.

Focused evidence currently includes the standard/custom/portable Prism and
official fixtures, invalid archive/version-mismatch/manual-path checks,
symlink rejection, and one fixture covering all five additional launcher
families. `cargo test --manifest-path src-tauri/Cargo.toml --lib
map::assets::discovery` passes 4 tests; `cargo check` and Rust formatting also
pass.

These are supported candidate roots, not a claim that every launcher release
uses one stable layout. Real installations and portable/custom layouts remain
part of the Phase 07 gate. A failed or unrecognized layout must continue to
fall through to the explicit file picker rather than being treated as a valid
asset source.

## Focused tests

PrismLauncher standard/custom/portable, official Launcher, MultiMC, Modrinth
App, CurseForge, GDLauncher, ATLauncher, manual path, version mismatch,
invalid archive, symlink and traversal cases.

## Diff review checklist

No hardcoded home-only path, no asset copied into repository, no path escaping,
and no automatic candidate silently overriding an explicit user choice.

## Phase gate

Candidate discovery and manual selection produce a validated manifest or a
visible diagnostic state.

## Known non-goals

No blockstate/model parsing yet.

## Follow-up phases

Phase 08 resolves the selected asset stack.
