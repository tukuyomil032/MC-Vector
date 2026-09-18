# Phase 05: Anvil and Chunk Decoding

## Goal

Read real 1.21.x region/chunk data, including sparse and negative-coordinate
worlds, without turning decode failures into transparent success.

## Scope

Region index, Anvil payload, NBT sections, packed palettes, retry, source
provenance, and overview metadata.

## Owned files

Agent B: `src-tauri/src/map/sources`, `world`, fixtures, and Rust tests. Agent A
prepares Java/Paper fixture notes only.

## Dependencies

Phase 03/04 and verified `fastanvil`/`fastnbt` API decisions.

## Implementation tasks

- enumerate existing chunks from region headers;
- decode `sections`, palette, packed indices, height, biome, and light data;
- use floor division for negative coordinates;
- retry unstable/truncated chunks and keep per-chunk failure reasons;
- calculate spawn/generated-range center and coverage metadata.

## Focused tests

Real/synthetic region fixtures, negative coordinates, sparse overview, malformed
payload, retry, and non-transparent terrain metadata.

## Current evidence (2026-09-18)

The saved-chunk renderer now keeps `fastanvil::JavaChunk` instead of converting
through `fastanvil::complete::Chunk`. This preserves sparse post-1.18 chunks
with no section tower and avoids the complete representation's section unwrap;
surface height falls back to a bounded decoded-section scan when heightmap data
is absent or stale. The focused Anvil suite covers missing regions, region
payload reads, and a minimal post-18 sparse chunk (`3 passed`). The focused
renderer/world source compiles warning-free.

Implementation commit: `c55472d fix(map): preserve sparse Anvil chunk
representations`.

The implementation is intentionally not a Phase gate completion until the Anvil fixture is
reviewed against a real Paper 1.21.10 world. The current synthetic NBT proves
the sparse conversion boundary only; it does not prove full vanilla block
state, biome, light, or heightmap coverage.

## Diff review checklist

No forced chunk generation, no fixed sample-only overview, no unchecked sector
offsets, and no decoder count hidden from diagnostics.

## Phase gate

Real fixture yields `decodedChunkCount > 0`; zoom 0-2 containing terrain is not
fully transparent; empty and decode-error states differ.

## Known non-goals

No full model/texture rendering yet.

## Follow-up phases

Phase 06 adds live Paper snapshots.
