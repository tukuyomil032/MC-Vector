# Assets, Blockstates, Models, and Textures

## Dynmap asset responsibilities

`TexturePack.java`, `HDBlockModels.java`, `HDBlockStateTextureMap.java`,
`RenderPatch`, and renderer classes together resolve far more than a block name:

- block-state variants and multipart conditions;
- model parents and texture variables;
- face UVs, rotations, and patch visibility;
- texture layers and alpha;
- biome-tinted foliage, grass, water, and other layers;
- custom renderers for non-cubic blocks and fluids;
- version/resource-pack-specific mappings.

The asset registry is loaded before the render queue starts. Missing mappings
are diagnosed and can fall back, but they are not silently treated as vanilla
cubes.

## MC-Vector asset pipeline

```text
client JAR / resource-pack stack
  -> AssetManifest (version + SHA-256 + source)
  -> BlockStateLoader
  -> ModelLoader (parent/multipart/variants)
  -> TextureLoader (PNG/alpha/animation)
  -> TintResolver
  -> RenderModel / RenderPatch
```

Asset input is user-owned or user-selected. MC-Vector does not bundle
Minecraft client assets by default. A missing asset state must be visible in
the Map UI and must not be confused with a missing chunk.

## Supported states

```text
configured | auto_detected | user_selected | missing | version_mismatch
invalid   | fallback
```

The cache identity includes the exact Minecraft version, ordered pack hashes,
manifest version, and renderer version. A resource-pack change invalidates
resolved models and all dependent tiles.

## Special geometry boundary

The first model fixture set includes cubes, stairs, slabs, fences, fence gates,
doors, trapdoors, plants, signs, leaves, glass, snow layers, water, and lava.
Custom block entities and modded renderers remain explicit extension points;
they are not represented by a fixed colour table.

## Source evidence and open items

Observed source: `TexturePack.java`, `HDBlockModels.java`,
`HDBlockStateTextureMap.java`, `renderer/CustomRenderer.java`, and
`resources/shaders.txt`. The exact Minecraft 1.21.10 client asset format,
animation-frame policy, and legal distribution workflow are fixture/release
review gates.
