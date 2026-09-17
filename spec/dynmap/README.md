# Dynmap v3.0 Research Corpus

Status: implementation reference, not a compatibility claim

This corpus records the Dynmap v3.0 architecture and the decisions required to
reimplement the renderer inside MC-Vector. It is intentionally separate from
the current Map prototype. The prototype is useful for bridge and lifecycle
tests, but it is not a Dynmap-equivalent renderer.

## Fixed reference

- Repository: https://github.com/webbukkit/dynmap
- Reference branch: `v3.0`
- Primary source date: 2026-09-18
- First MC-Vector server target: Paper 1.21.10, with a versioned 1.21.x matrix
- First renderer target: `IsoHDPerspective`
- Implementation language: Rust renderer plus Java Paper adapter

The exact upstream commit used for a release must be recorded in
`porting-manifest.md`. A branch name is useful for research, but a release
must not depend on a moving branch.

## Evidence labels

- `observed`: directly supported by the referenced source file or fixture.
- `inferred`: a design conclusion derived from observed behavior.
- `open`: not yet verified by a fixture or the target Paper version.

## Reading order

1. [architecture](architecture.md)
2. [world data and platform adapters](world-data-and-platform-adapters.md)
3. [render pipeline](render-pipeline.md)
4. [assets, block models, and textures](assets-block-models-and-textures.md)
5. [perspectives, shaders, and lighting](perspective-shaders-lighting.md)
6. [tile queue, storage, and updates](tile-queue-storage-and-updates.md)
7. [MC-Vector reimplementation](mc-vector-reimplementation.md)
8. [porting manifest](porting-manifest.md)
9. [verification and fixtures](verification-and-fixtures.md)
10. [license and assets](license-assets-and-attribution.md)
11. [comparison matrix](comparison-matrix.md)
12. [implementation roadmap](implementation-roadmap.md)
13. [API and wire contracts](api-contracts.md)
14. [Phase 1: world sources](phase-1-world-sources.md)
15. [Phase 2: assets](phase-2-assets.md)
16. [Phase 3: IsoHDPerspective renderer](phase-3-iso-renderer.md)
17. [Phase 4: tile system](phase-4-tile-system.md)
18. [Phase 5: Tauri and React](phase-5-tauri-ui.md)
19. [Phase 6: real verification](phase-6-paper-tauri-verification.md)

## Product boundary

The first parity effort covers the terrain renderer: world data, block state,
models, textures, projection, ray traversal, shaders, lighting, tile storage,
and incremental updates. Markers, chat, time/weather, the embedded web server,
and Dynmap API compatibility remain later features.

Dynmap is not a runtime dependency. Selected Apache-licensed rendering logic
may be translated or ported when its source, commit, license, and MC-Vector
changes are recorded in `porting-manifest.md`.

## Official sources

- [Project guide](https://github.com/webbukkit/dynmap/blob/v3.0/CLAUDE.md)
- [MapManager](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/java/org/dynmap/MapManager.java)
- [IsoHDPerspective](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java)
- [TexturePack](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java)
- [Dynmap shaders](https://github.com/webbukkit/dynmap/blob/v3.0/DynmapCore/src/main/resources/shaders.txt)

## Current gap

The current Rust path still contains `chunk_representative_colour`,
`average_surface_colours`, and overview sampling. Those functions are retained
only until the source and test-backed renderer replaces them. They are not a
release acceptance path for Dynmap parity.
