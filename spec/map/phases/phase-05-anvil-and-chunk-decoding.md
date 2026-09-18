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
