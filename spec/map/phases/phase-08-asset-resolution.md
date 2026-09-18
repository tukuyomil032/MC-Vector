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
- when a blockstate/model is unresolved but matching block textures exist, build
  a face-aware textured cube fallback instead of immediately using a named
  colour; retain explicit low-quality colour fallback when no texture exists;
- produce unresolved-state counts and fallback quality;
- include asset hash/manifest/renderer versions in cache identity.

## Focused tests

Vanilla states, stairs/slabs/fences/doors, leaves/glass/water/snow, alpha/tint,
parent/multipart/rotation, override packs, and cache separation.

## Current evidence (2026-09-18)

The focused Rust asset and discovery fixtures cover variants, multipart
conditions, parent texture variables, model rotation and rescaling, UV lock,
texture alpha, deterministic animated-texture frames, vanilla colormap tint,
material alpha policy, resource-pack overlay precedence, ordered client-JAR
and resource-pack source layers, cache identity, and the supported launcher
candidate families. Candidate selection now persists `sourcePaths` while
retaining the legacy `sourcePath` field; later layers override matching
entries before blockstate/model/texture resolution. The Map-filtered Rust
suite passes 34 asset/discovery tests. Unresolved states with available
face-specific textures now resolve to a textured cube fallback, and water/lava
still textures are recognized without weakening the explicit missing-texture
diagnostic.

Implementation commit: `64ca6f9 feat(map): resolve ordered client and resource
pack layers`.

The local full checks also pass: `bun run check`, `bun run typecheck:tests`,
`bun run test` (51 files, 434 tests), `bun run build`, and
`cargo test --manifest-path src-tauri/Cargo.toml` (219 passed, 1 intentionally
ignored). The first full Rust run inside the restricted sandbox could not bind
the existing loopback download fixtures; the same command passed with the
required local loopback permission. This is environment evidence, not a Map
regression.

The Phase 08 gate remains open. The current fixtures are synthetic and do not
yet prove complete vanilla 1.21.x blockstate coverage, exact launcher install
layouts, active-pack ordering from each launcher's native configuration, custom
mod renderers, or golden images from a real client JAR. The UI can now persist
the discovered client-JAR-plus-pack stack, but manual stack editing and
launcher-specific active-pack metadata remain open. Those boundaries are
intentionally carried into Phases 09–11 and 15–17 rather than being inferred
from parser unit tests.

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
