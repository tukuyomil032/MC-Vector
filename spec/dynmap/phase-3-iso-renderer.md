# Phase 3: IsoHDPerspective Renderer

## Goal

Implement a real oblique terrain renderer whose output is based on block
geometry and texture faces rather than chunk representative colours.

## Porting boundary

Selected algorithms from Dynmap v3.0 `IsoHDPerspective`, `TexturePack`,
`HDBlockModels`, and HD shader/lighting classes may be translated to Rust.
Every translation requires a `porting-manifest.md` entry, preserved Apache
attribution, and a focused fixture.

Dynmap lifecycle, platform adapter, web server, markers, and API code are not
ported.

## Render stages

1. Calculate the tile-space transform from azimuth, inclination, scale, and
   world height.
2. Calculate the world-space parallelogram and required chunk set.
3. Build a ray for each output pixel.
4. Traverse sections and voxels in parametric order.
5. Resolve the block state and model patches at each visited block.
6. Intersect the ray with patch faces and sort the nearest hits.
7. Sample transformed UV coordinates from the face texture.
8. Apply face shading, sky light, emitted light, biome tint, and shader state.
9. Continue through translucent layers when alpha leaves the pixel incomplete.
10. Compose the final pixel and mark coverage/provenance.

## Geometry rules

- use floor semantics for all negative world coordinates;
- treat a full cube as six faces, not one top colour;
- support partial element bounds from model JSON;
- preserve face visibility and UV flips;
- handle waterlogged and translucent patches separately;
- maintain tile-edge context so a ray can cross chunk boundaries;
- cap traversal and report a diagnostic rather than hanging on malformed data.

## Lighting and shaders

The first shader is the default HD behavior. The implementation keeps seams for
cave, topo, and underwater shaders. Lighting is a separate service so sky,
emitted, neighbor, and height values are testable independently.

## Tests

- world-to-tile and tile-to-world transforms;
- azimuth/inclination extremes;
- negative coordinates;
- ray/axis-aligned face intersection;
- partial model patches;
- nearest-hit sorting;
- transparent layer continuation;
- waterlogged block;
- biome tint;
- sky/block light;
- tile-edge rays crossing chunks;
- malformed model and traversal cap;
- golden images for terrain, water, foliage, snow, and buildings.

## Exit criteria

The renderer produces a recognizable oblique image for the fixture set. A tile
cannot pass this phase by containing only a few coloured pixels or by using a
CSS/PNG placeholder.
