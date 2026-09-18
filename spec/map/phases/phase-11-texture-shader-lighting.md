# Phase 11: Texture, Shader, and Lighting

## Goal

Use resolved model textures, alpha, biome tint, light, and shader rules to make
terrain and buildings visually readable like Dynmap's HD path.

## Scope

Texture sampling, face rotation, alpha compositing, biome tint, sky/block light,
height/directional shading, fluids, foliage, glass, ice, snow, and special blocks.

## Owned files

Agent B: Rust renderer and special block models. Agent A: golden fixture runner,
diagnostics display, and unresolved-block UI.

## Dependencies

Phase 08 asset resolver and Phase 10 geometry.

## Implementation tasks

- implement default texture-pack HD shader behavior;
- sample UVs with alpha and apply tint/light/shade;
- continue rays through transparent/translucent patches;
- add water/lava/leaves/glass/ice/snow and common non-cube renderers;
- count unresolved blocks and expose quality metadata.

## Implemented evidence (2026-09-18)

- The model-face sampler already applies a resolved biome tint when the face
  carries a Minecraft `tintindex`, while preserving the source texture alpha.
- The renderer now applies a material policy after sampling: cutout blocks use
  a 128 alpha-test threshold and translucent blocks retain their texture alpha
  for compositing. Focused tests cover both policies and the tint/alpha
  boundary.
- The Paper smoke fixture now validates the advertised `world_status` and
  `chat_messages` capabilities, and validates the structured world-status
  payload. This is bridge evidence, not renderer parity evidence.

These are focused slices only. The Phase 11 gate remains open until all-block
model coverage, custom block renderers, shader/lighting parity, resource-pack
golden images, and real Paper/Tauri visual evidence are available.

## Focused tests

Terrain, water, forest, snow, height, buildings, stairs, slabs, fences, doors,
leaves, glass, and resource-pack override golden fixtures.

## Diff review checklist

No fixed palette in the main route, deterministic alpha math, explicit missing
texture fallback, and no fixture assertion that only checks “PNG exists”.

## Phase gate

Full Rust/Java/frontend gate passes and golden output is visually recognizable.

## Known non-goals

Cave/underwater/topology selectable shaders may remain later.

## Follow-up phases

Phase 12 industrializes tile scheduling and persistence.
