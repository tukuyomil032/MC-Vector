# Phase 26: Full Coverage Audit

## Goal

Demonstrate that the implementation covers the declared Dynmap map capability
instead of stopping at representative blocks or one perspective.

## Scope

Vanilla blockstates/models/textures, special renderers, all declared map types,
dimensions, updates, overlays, diagnostics, performance, and failure paths.

## Owned files

Coverage inventory, unresolved-block reports, performance reports, and focused
fixes required by the audit.

## Dependencies

Phases 18–25.

## Implementation tasks

- enumerate all versioned blockstates and record resolved/unresolved counts;
- audit multipart, parent models, rotations, UV, alpha, tint, light, and
  animation handling;
- audit every declared perspective/map type and dimension;
- audit incremental updates, cache identity, stale behavior, markers, and
  overlays;
- classify every remaining limitation as fixed, unsupported by contract, or
  blocking final acceptance.

## Focused tests

Full asset inventory, unresolved-state report, map-type matrix, dimension
matrix, performance budget, and failure-mode matrix.

## Diff review checklist

No “representative block” claim is promoted to full coverage; every exception
has a concrete reason and acceptance decision.

## Phase gate

No blocking gap remains inside the declared in-app map scope. Any excluded
Dynmap product surface is documented as an explicit non-goal.

## Known non-goals

Embedded web, HTTP/API, Bukkit command/permission, and unrelated integrations
remain out of scope even after this audit.

## Follow-up phases

Phase 27 is the final acceptance gate.
