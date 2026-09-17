# Perspectives, Shaders, and Lighting

## IsoHDPerspective reference

`IsoHDPerspective` defines a transform between Minecraft world coordinates and
tile space, configurable azimuth/inclination/scale, and a per-pixel ray that
walks through sections, blocks, and model patches. It maintains ray state,
light state, block state, and patch intersections while shaders decide when a
pixel is complete.

Reference:
[IsoHDPerspective.java](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java).

The important properties to preserve in the Rust port are:

- deterministic world-to-map and map-to-world transforms;
- correct floor behavior for negative coordinates;
- configurable azimuth, inclination, and scale;
- chunk bounds that cover the entire projected parallelogram;
- voxel traversal instead of top-block sampling;
- ordered patch hits along a ray;
- face orientation and UV flips;
- continuation through translucent surfaces;
- shader completion and fallback when the ray exits the world.

## Patch intersection

A model is a set of patches rather than necessarily a full cube. A patch
intersection supplies a ray parameter, UV coordinates, face direction, and
whether the face contributes shading. The renderer sorts the nearest hits and
lets shader state process them in order.

This is the key reason a representative colour cannot be upgraded into a
Dynmap renderer by adding more samples: the model geometry and hit ordering
are part of the image.

## Shader and lighting responsibilities

Dynmap's shader resources describe default, cave, topo, underwater, and related
pixel behaviors. Lighting determines sky and emitted light, transparency-aware
neighbor values, and face shading. The shader and lighting split must remain
explicit in MC-Vector so a future perspective does not duplicate world reads.

Reference:
[shaders.txt](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/resources/shaders.txt).

Initial Rust interfaces:

```rust
pub trait Shader {
    fn process_block(&mut self, state: &RayState, sample: &SurfaceSample) -> ShaderStep;
}

pub trait LightingModel {
    fn light_at(&self, sample: &SurfaceSample, source: &dyn ChunkSource) -> LightSample;
}
```

The first implementation targets the default HD shading behavior and exposes
the shader/lighting seam for cave, topo, and underwater modes later.
