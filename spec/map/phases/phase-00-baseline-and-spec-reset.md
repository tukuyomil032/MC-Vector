# Phase 00: Baseline and Spec Reset

## Goal

Replace the mixed legacy Map/Dynmap plan with a source-backed research corpus,
an executable 28-phase plan, and ADRs that can be used without guesswork.

## Scope

Record the clean branch baseline, pin Dynmap commit
`93b454efb8802dc7406d6873434f2aeec5c636f4`, rewrite Map contracts, and replace
all `spec/dynmap/**` content.

## Owned files

`spec/**` only, including the new ADR-008 through ADR-015 documents.

## Dependencies

None. Research must use the pinned Dynmap source and official Paper/Tauri
references where the contract depends on them.

## Implementation tasks

- delete old `spec/dynmap/**` documents before recreating the corpus;
- create source scope, architecture, world, renderer, asset, geometry, shader,
  tile, overlay, boundary, porting, launcher, license, and fixture documents;
- create Phase 0-27 documents with this common structure;
- update `map-integration-requirements.md` and ADR-000 index;
- record open/provisional items instead of silently deciding them.

## Focused tests

Check links, duplicate phase names, pinned commit consistency, and `git diff
--check`. No application code changes belong here.

## Diff review checklist

- no legacy Phase document remains under `spec/dynmap`;
- research and implementation plan are separated;
- every port candidate has source path, commit, license, destination, and fixture;
- no claim of completed renderer parity is present.

## Phase gate

The corpus and all phase/ADR references exist and are internally consistent.

## Known non-goals

No React, Rust, Java, Gradle, or Tauri implementation change.

## Follow-up phases

Phase 1 begins feature migration.
