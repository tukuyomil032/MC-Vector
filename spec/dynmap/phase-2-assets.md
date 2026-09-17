# Phase 2: Assets, Block States, and Models

## Goal

Replace average-texture sampling with deterministic block state, model, face,
UV, transparency, and tint resolution.

## Asset manifest

The manifest contains:

- exact Minecraft version;
- source path and source kind;
- SHA-256 identity;
- resource-pack stack order;
- loader/parser version;
- block state count;
- model count;
- texture count;
- resolved and unresolved state counts;
- quality state and diagnostics.

The manifest identity is part of every tile key.

## Resolution stages

```text
state name + properties
  -> blockstate variant or multipart
  -> parent model expansion
  -> texture variable substitution
  -> element faces and UV
  -> element rotation and cull side
  -> tint and transparency
  -> render patches
```

The implementation supports the `minecraft` namespace first, but keeps custom
namespaces intact. A malformed custom state must produce a diagnostic and a
fallback patch, not erase a complete map tile.

## Required model cases

Fixtures cover:

- full cubes;
- top and side texture differences;
- stairs and slabs;
- fences and walls;
- doors and trapdoors;
- signs and plants;
- glass and leaves;
- waterlogged blocks;
- snow overlay;
- rotated models;
- multipart models;
- parent models with texture variables;
- custom resource-pack overrides.

## Sampling rules

The renderer samples texture faces after UV transform. It does not reduce an
entire texture to a single average before geometry is known. Static tile
generation uses a deterministic animation frame. Texture failures are
classified as `asset_missing`, `asset_invalid`, or `fallback`.

## Tests

- variant selection by sorted state properties;
- multipart selection;
- parent expansion and variable substitution;
- UV and rotation;
- alpha and cull side;
- tint index and biome colour;
- source hash changes tile identity;
- missing parent/texture diagnostics;
- JAR and directory sources produce the same manifest;
- no asset source does not become an empty-world state.

## Exit criteria

The asset resolver returns a model/patch representation that the renderer can
consume without knowing how the source was packaged. No successful renderer
path depends on block-name-only fixed colours.
