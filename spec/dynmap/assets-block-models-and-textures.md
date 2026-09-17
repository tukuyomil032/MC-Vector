# Assets, Block Models, and Textures

## Why a single colour is insufficient

Dynmap's HD pipeline resolves a block state into geometry and texture layers.
The visible result depends on the state properties, model variant, face
orientation, transparency, biome tint, and lighting. Averaging a 16x16 texture
into one RGBA value destroys the information required for stairs, slabs,
fences, doors, roofs, glass, water, and partially occluded structures.

The relevant reference components are `TexturePack`, `HDBlockModels`,
`HDScaledBlockModels`, and custom renderers in `hdmap/renderer/`:
[TexturePack.java](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java).

## Asset stack

MC-Vector accepts a user-owned Minecraft client JAR or resource pack. The
resolved stack is ordered and hashed:

```text
base vanilla assets
  -> selected resource pack 1
  -> selected resource pack 2
  -> server-provided pack after explicit user approval
```

The manifest records Minecraft version, source paths, SHA-256 identities,
stack order, loader version, resolved state count, unresolved state count, and
quality status. Minecraft assets are not silently bundled into the application.

## Resolution pipeline

```text
BlockState
  -> blockstate variants / multipart
  -> parent model expansion
  -> texture variable substitution
  -> model faces and UV
  -> rotation and cull face
  -> transparency and tint
  -> renderer patches
```

The resolver must support `minecraft` first and preserve namespace-qualified
keys for custom resource packs. Missing parents, missing textures, malformed
JSON, and unsupported model elements are recorded as diagnostics rather than
causing the complete tile to disappear.

## Tint and transparency

Tint indices are resolved with biome data where the model requires it. At
minimum the initial renderer must distinguish grass, foliage, water, leaves,
ice, glass, and lava from opaque blocks. Alpha composition is performed per
intersected face/layer; a texture's average alpha is not a substitute for
transparency ordering.

Animated textures use a deterministic frame for static tile generation. The
frame policy is versioned so a cache generated with one policy cannot be
silently reused by another renderer.

## Fallback policy

Fallback colour is allowed only when the asset resolver cannot resolve a block
state. The tile metadata and UI must report degraded quality. It must never be
confused with an empty world or an asset-free successful render.
