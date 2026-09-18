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
- expose manual selection when auto-detection fails.

## Focused tests

PrismLauncher standard/custom/portable, official Launcher, manual path,
version mismatch, invalid archive, symlink and traversal cases.

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
