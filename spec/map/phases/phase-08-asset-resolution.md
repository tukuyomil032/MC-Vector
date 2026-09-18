# Phase 08: Asset Resolution

## Goal

Replace block-name colour guessing with versioned blockstate, model, texture,
alpha, tint, and resource-pack resolution.

## Scope

JAR/ZIP stack, variants, multipart, parent models, texture variables, UV,
rotation, animation frame, tint, and unresolved diagnostics.

## Owned files

Agent B: Rust asset pipeline and fixtures. Agent A: asset status/selection UI.

## Dependencies

Phase 07 manifest and Phase 05 normalized block states.

## Implementation tasks

- apply pack precedence deterministically;
- resolve variants/multipart conditions and parent inheritance;
- parse PNG alpha and select deterministic animation frame;
- resolve biome tint and transparency classifications;
- produce unresolved-state counts and fallback quality;
- include asset hash/manifest/renderer versions in cache identity.

## Focused tests

Vanilla states, stairs/slabs/fences/doors, leaves/glass/water/snow, alpha/tint,
parent/multipart/rotation, override packs, and cache separation.

## Diff review checklist

No fixed-colour path as the primary path, no silent asset version mismatch,
and no unresolved state omitted from metadata.

## Phase gate

Full Rust/TypeScript gate passes and representative fixtures resolve to render
models with deterministic hashes.

## Known non-goals

Custom mod renderers and all block entities are not yet complete.

## Follow-up phases

Phase 09 adds selected Dynmap source and attribution artifacts.
