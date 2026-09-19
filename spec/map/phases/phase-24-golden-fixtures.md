# Phase 24: Golden Fixtures

## Goal

Turn visual parity into repeatable evidence rather than subjective screenshots.

## Scope

Fixed worlds and golden images for terrain, models, textures, lighting,
transparency, map types, dimensions, negative coordinates, and boundaries.

## Owned files

Rust renderer fixtures, golden image runner, visual comparison reports, and
fixture documentation.

## Dependencies

Phases 09–16, 18, and 23.

## Implementation tasks

- create flat, mountain, water, forest, snow, building, and special-block
  fixtures;
- include stairs, slabs, fences, doors, leaves, glass, ice, and water;
- include chunk boundaries, negative coordinates, sparse regions, and empty
  space;
- pin asset manifest, renderer, perspective, and shader identity;
- define acceptable pixel/geometry thresholds and inspect failures manually.

## Focused tests

Golden image generation, deterministic reruns, hash mismatch, fixture loading,
and per-layer comparison.

## Diff review checklist

No fixture silently regenerates its own expected image; all expected changes are
reviewed and attributed to source, asset, or renderer changes.

## Phase gate

All declared map types have stable golden evidence covering the required
terrain, buildings, special blocks, alpha, tint, and lighting behavior.

## Known non-goals

Golden images do not prove external web/API compatibility.

## Follow-up phases

Phase 25 packages CI, attribution, and distribution evidence.
