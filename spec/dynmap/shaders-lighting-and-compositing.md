# Shaders, Lighting, and Compositing

## Observed shader contract

Dynmap shaders consume the current block, last block, hit face, UV/patch
state, biome colour multipliers, sky light, emitted/block light, and renderer
configuration. `shaders.txt` defines selectable shader profiles including
texture-pack, biome, cave, underwater, topology, transparency, and grid
variants. `TexturePackHDShader`, `DefaultHDShader`, `CaveHDShader`, and
underwater variants implement different visibility and composition rules.

`IsoHDPerspective` asks a shader whether traversal can stop. Transparent and
semi-transparent patches may require continuing the ray and compositing more
than one hit. Lighting uses the entered face and neighbouring light values;
it is not only a height multiplier.

## MC-Vector first shader profile

The first release implements one deterministic Iso HD profile with:

- texture alpha composition;
- face shading and directional light;
- sky/block/emitted light inputs when available;
- biome tint for supported layers;
- water, leaves, glass, ice, and snow transparency rules;
- a visible quality/fallback state for missing light or asset data.

The first translated lighting slice is now source-backed rather than a
height-based approximation. `TexturePackHDShader.processBlock` supplies the
directional face coefficients for the no-brightness-table branch, and
`ShadowHDLighting` supplies the 16-level shadow curve. MC-Vector keeps those
inputs in Rust-specific `Face::dynmap_shade`, `shadow_scale`, and
`shade_surface` functions; it does not copy Dynmap's Bukkit iterator or Java
lighting objects.

Cave, underwater, topology, and user-selectable shader profiles follow after
the default profile is golden-tested.

## Compositing rules

```text
nearest patch hit
  -> sample texture/UV
  -> apply biome tint
  -> apply light/shade
  -> alpha-composite
  -> continue through transparent material when required
```

The renderer must preserve premultiplied/straight-alpha semantics explicitly
and test transparent pixels. A missing texture may use a shaded fallback, but
the result must carry an unresolved-block diagnostic.

## Source references

- `DynmapCore/src/main/resources/shaders.txt`
- `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackHDShader.java`
- `DefaultHDShader.java`
- `CaveHDShader.java`
- `TexturePackHDUnderwaterShader.java`
- `DynmapCore/src/main/java/org/dynmap/utils/LightLevels.java`

The translated coefficients are covered by focused Rust tests, but full parity
is still `open`: neighbouring-light smoothing, world brightness tables,
night/day output, custom shader profiles, and cave/underwater behavior still
need golden fixtures for terrain, water, foliage, transparent buildings, and
caves.
