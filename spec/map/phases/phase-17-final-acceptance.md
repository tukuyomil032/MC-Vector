# Phase 17: Final Acceptance

## Goal

Decide honestly whether the completed feature is Dynmap-like, with code,
license, integration, and visual evidence rather than a passing placeholder.

## Scope

Final structure, unused/type checks, command/event registration, source
provenance, asset manifest, cache identity, Paper/Tauri/golden/CI evidence.

## Owned files

Main coordinates the final diff and evidence ledger; A/B fix only scoped
findings and review each other's changed diff.

## Dependencies

Phases 00-16 complete or explicitly recorded as blocked/open.

## Implementation tasks

- confirm `src/map`, `src/map/paper`, `src/map/dynmap/upstream`, and
  `src-tauri/src/map` boundaries;
- remove root `bridge/` and old god-file paths only after reference checks;
- run unused/type/warning checks and inspect command/event registrations;
- verify full vanilla/model/texture/tint/lighting target coverage;
- verify terrain, water, forest, snow, height, buildings, and special blocks;
- record every unverified item instead of declaring parity by inference.

## Focused tests

Full local matrix, real Paper, real Tauri, golden fixtures, accessibility/manual
checks, `git diff --check`, and distribution/license audit.

## Diff review checklist

No dead declarations, no old preview fallback, no transparent-success state,
no hidden protocol mismatch, no missing attribution, and no unverified claim in
the release note.

## Phase gate

Only when all mandatory evidence is present may the feature be labelled
“Dynmap-like renderer”. Otherwise the report lists the exact open gate.

## Known non-goals

This phase does not authorize push, PR, release, or external Dynmap support.

## Follow-up phases

Any later work must add a new phase/ADR rather than silently changing this
acceptance contract.
