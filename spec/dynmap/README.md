# Dynmap v3.0 Research Corpus

Status: active implementation reference. This corpus is not a claim that
MC-Vector is Dynmap-compatible yet.

## Fixed source reference

- Repository: `https://github.com/webbukkit/dynmap`
- Research branch: `v3.0`
- Immutable reference commit: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- First Paper fixture: Paper 1.21.10
- First target perspective: `IsoHDPerspective`
- Research date: 2026-09-18

The branch name remains useful for browsing, but implementation manifests and
release artifacts must use the immutable commit above or a later explicitly
reviewed commit. The reference commit is a research anchor, not a runtime
dependency.

## Reading order

1. [source scope and version](source-scope-and-version.md)
2. [architecture](architecture.md)
3. [world data and platform adapters](world-data-and-platform-adapters.md)
4. [render pipeline](render-pipeline.md)
5. [assets, blockstates, models, and textures](assets-blockstates-models-textures.md)
6. [Iso perspective and geometry](iso-perspective-and-geometry.md)
7. [shaders, lighting, and compositing](shaders-lighting-and-compositing.md)
8. [tile queue, storage, and updates](tile-queue-storage-and-updates.md)
9. [markers, overlays, and runtime features](markers-overlays-and-runtime-features.md)
10. [MC-Vector boundaries](mc-vector-boundaries.md)
11. [source porting](source-porting.md)
12. [launcher asset sources](launcher-asset-sources.md)
13. [license and attribution](license-and-attribution.md)
14. [verification fixtures](verification-fixtures.md)
15. [complete map capability contract](map-capability-complete.md)

## Evidence vocabulary

- `observed`: directly confirmed in the pinned source, official API, or a
  checked-in fixture.
- `inferred`: a design conclusion derived from observed behavior.
- `open`: not yet verified against the target Paper version, real asset, or
  real application.
- `implemented`: code exists, but does not imply that a gate passed.
- `verified`: the named test or manual evidence exists and is recorded.

## Scope rule

Dynmap is a large system. The corpus therefore records the complete data flow
before selecting code for reuse. MC-Vector may copy or translate Apache-licensed
rendering code only after the source path, commit, original header, license,
change summary, and fixture are registered in the porting manifest. Bukkit
lifecycle, platform adapters, embedded web server, web UI, commands, and
storage backends are not copied as runtime components.

## Current product truth

The existing MC-Vector map implementation is a prototype. It contains useful
bridge, cache, asset, and UI foundations, but a representative-colour or sparse
sampling path is not Dynmap parity. The complete capability inventory is in
[map-capability-complete.md](map-capability-complete.md). Completion requires
the full Phase 0-27 plan in `../map/phases/` and the evidence gates in
[verification-fixtures.md](verification-fixtures.md).

## Primary sources

- [Dynmap project guide](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/CLAUDE.md)
- [DynmapCore](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/DynmapCore.java)
- [MapManager](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/MapManager.java)
- [IsoHDPerspective](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java)
- [TexturePack](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java)
- [Dynmap shaders](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/resources/shaders.txt)
- [Dynmap repository and license policy](https://github.com/webbukkit/dynmap)
