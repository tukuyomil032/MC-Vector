# Generated renderer-specialist phase index

再生成コマンド: bun spec/map/plan/tools/generate-phase-files.mjs --write。検証コマンド: bun spec/map/plan/tools/generate-phase-files.mjs --check。Generatorは古くなったfileを自動削除せえへん。matrix縮小時も削除候補をdiffで人が確認する。

37 common phase、39 built-in renderer phase、48 exact releases × 5 stage = **316個の実装phase文書**。AST closureから追加されるwork unitにも個別文書を加える。

| 種別 | 対象 | Phase file | 固定対象 |
| --- | --- | --- | --- |
| common | P-000 | [Pinned source AST と依存closure](phase-000-source-ast-closure.md) | pinned Dynmap Java 106 candidate filesとその全call/resource dependencies |
| common | P-001 | [全renderer resource consumer closure](phase-001-resource-closure.md) | DynmapCore resources全件、Java resource loader/consumer、client JAR/pack resource |
| common | P-002 | [Minecraft exact release matrixとartifact lock](phase-002-version-matrix-lock.md) | Mojang official version manifestと48 exact stable release metadata |
| common | P-003 | [Apache-2.0 source attribution and distribution boundary](phase-003-license-source-boundary.md) | pinned Dynmap source/resource licenses, vendored Java reference snapshot, Rust origin manifest |
| common | P-004 | [Pinned Java reference renderer harness](phase-004-java-reference-harness.md) | actual Dynmap Java renderer closure at pinned revision; existing four empty-context patch traces only as bootstrap |
| common | P-005 | [Warning-clean Rust renderer crate boundary](phase-005-renderer-core-isolation.md) | src-tauri/crates/map-renderer-core/** and app integration boundary |
| common | P-006 | [Dynmap-equivalent source-independent chunk domain](phase-006-source-independent-domain.md) | Dynmap MapChunkCache/MapIterator/MapDataContext/DynmapBlockState contracts |
| common | P-007 | [Shared Saved Anvil/NBT decoder](phase-007-saved-anvil-common-decoder.md) | Anvil region/NBT primitives and every versioned chunk-layout dependency |
| common | P-008 | [Verified client JAR/resource pack loading](phase-008-versioned-assets.md) | TexturePackLoader and Minecraft resource-index/pack contracts |
| common | P-009 | [Matrix/vector and HD perspective transforms](phase-009-dynmap-matrix-perspective.md) | Matrix3D, Vector3D, HDPerspective, IsoHDPerspective, HDPerspectiveState |
| common | P-010 | [RenderPatch/patch factory geometry](phase-010-dynmap-patch-geometry.md) | PatchDefinition, PatchDefinitionFactory, RenderPatch, RenderPatchFactory, Polygon |
| common | P-011 | [MapIterator and voxel/ray traversal](phase-011-dynmap-voxel-traversal.md) | MapChunkCache, MapIterator, BlockStep, TileFlags, visibility limits |
| common | P-012 | [Versioned blockstate and model resolver](phase-012-blockstate-model-resolution.md) | DynmapBlockState, blockstate JSON/model references, version data definitions |
| common | P-013 | [HDBlockModels and custom/volumetric model registry](phase-013-hd-block-model-registry.md) | HDBlockModels, HDBlockModel, HDBlockPatchModel, HDBlockVolumetricModel, HDScaledBlockModels, CustomBlockModel, HDBlockStateTextureMap |
| common | P-014 | [TexturePack atlas, UV and alpha pipeline](phase-014-texture-pack-and-atlas.md) | TexturePack, TexturePackLoader, texture map/atlas/resampling |
| common | P-015 | [Connected Texture Mod (CTM) behavior](phase-015-ctm-texture-pack.md) | CTMTexturePack and CTMVertTextureRenderer |
| common | P-016 | [Biome tint, color multipliers and materials](phase-016-biome-color-material.md) | CustomColorMultiplier implementations, biome lookup, grass/foliage/water colors |
| common | P-017 | [HDLighting implementations](phase-017-hd-lighting.md) | HDLighting, DefaultHDLighting, LightLevelHDLighting, ShadowHDLighting, LightLevels |
| common | P-018 | [HDShader lifecycle and shader resources](phase-018-hd-shader.md) | HDShader, HDShaderState, Default/TexturePack/Underwater/Cave/Topo/ChunkStatus/ChunkVersion/Inhabited shaders |
| common | P-019 | [Dynmap CustomRenderer/MapDataContext API contract](phase-019-custom-renderer-api.md) | DynmapCoreAPI renderer six source files |
| common | P-020 | [Complete built-in renderer registry](phase-020-builtin-registry.md) | all 39 pinned hdmap/renderer Java classes and registration call sites |
| common | P-021 | [39 individual built-in renderer phases](phase-021-builtin-renderer-family-gate.md) | generated-index.md and 39 child pages under phases/builtins/ |
| common | P-022 | [Pixel rasterization and alpha compositing](phase-022-raster-compositing.md) | Dynmap buffered image, pixel writer, HD perspective render output |
| common | P-023 | [Full intermediate trace and pixel parity](phase-023-reference-pixel-parity.md) | all required symbols/resources/built-ins and immutable Java capture set |
| common | P-024 | [Paper snapshot provider, Core artifact and protocol](phase-024-paper-snapshot-protocol.md) | Paper plugin lifecycle boundary, bridge protocol, per-version child paper-snapshot pages |
| common | P-025 | [Saved Anvil and Paper live renderer equivalence](phase-025-saved-live-equivalence.md) | same chunk bytes through Anvil and Paper provider into ChunkView |
| common | P-026 | [WorldXZ/Iso tile geometry and zoom pyramid](phase-026-tile-geometry-pyramid.md) | Dynmap tile/perspective bounds plus MC-Vector zoom 0..8 contract |
| common | P-027 | [Verified tile cache, stale and retry states](phase-027-verified-tile-cache.md) | MC-Vector map-cache metadata and renderer/version/asset/chunk digest |
| common | P-028 | [Bounded tile scheduler and cancellation](phase-028-bounded-render-scheduler.md) | viewport generations, per-server worker lifecycle and render deduplication |
| common | P-029 | [Connect verified renderer to Tauri IPC](phase-029-tauri-ipc-diagnostics.md) | src-tauri/src/commands/map_render.rs, app state, map events |
| common | P-030 | [Map status, diagnostic and consent UI](phase-030-status-consent-ui.md) | src/map/**, MapView, MapSetupModal, App server map consent, i18n |
| common | P-031 | [Cursor-anchored continuous zoom and committed pan](phase-031-smooth-zoom-pan.md) | MapView viewport interactions and project/unproject functions |
| common | P-032 | [Cross-layer failure and consent safety](phase-032-failure-safety.md) | artifact/source/render/cache/IPC/UI failure transitions |
| common | P-033 | [Renderer input bounds, security and memory](phase-033-resource-security-performance.md) | ZIP/NBT/Anvil/model/texture/cache/network inputs and worker concurrency |
| common | P-034 | [Warning-clean Rust and exhaustive CI matrix](phase-034-ci-warning-quality.md) | Cargo workspace, Java/Gradle harness, TypeScript scripts and catalogs |
| common | P-035 | [All-version Paper/Tauri acceptance runs](phase-035-real-acceptance-orchestration.md) | all exact-version real-acceptance pages and evidence matrix |
| common | P-036 | [Strict final source-to-runtime closure audit](phase-036-final-coverage-audit.md) | AST/resource/builtin/version catalogs, Java references, Rust tests, all acceptance rows |
| built-in | BoxRenderer | [phase](builtins/box-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/BoxRenderer.java |
| built-in | BoxStateRenderer | [phase](builtins/box-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/BoxStateRenderer.java |
| built-in | CTMVertTextureRenderer | [phase](builtins/ctmvert-texture-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/CTMVertTextureRenderer.java |
| built-in | ChestRenderer | [phase](builtins/chest-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ChestRenderer.java |
| built-in | ChestStateRenderer | [phase](builtins/chest-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ChestStateRenderer.java |
| built-in | CopyStairBlockRenderer | [phase](builtins/copy-stair-block-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/CopyStairBlockRenderer.java |
| built-in | CuboidRenderer | [phase](builtins/cuboid-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/CuboidRenderer.java |
| built-in | DoorRenderer | [phase](builtins/door-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/DoorRenderer.java |
| built-in | DoorStateRenderer | [phase](builtins/door-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/DoorStateRenderer.java |
| built-in | FenceGateBlockRenderer | [phase](builtins/fence-gate-block-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceGateBlockRenderer.java |
| built-in | FenceGateBlockStateRenderer | [phase](builtins/fence-gate-block-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceGateBlockStateRenderer.java |
| built-in | FenceWallBlockRenderer | [phase](builtins/fence-wall-block-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceWallBlockRenderer.java |
| built-in | FenceWallBlockStateRenderer | [phase](builtins/fence-wall-block-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceWallBlockStateRenderer.java |
| built-in | FluidStateRenderer | [phase](builtins/fluid-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FluidStateRenderer.java |
| built-in | FrameRenderer | [phase](builtins/frame-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FrameRenderer.java |
| built-in | GlowLichenStateRenderer | [phase](builtins/glow-lichen-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/GlowLichenStateRenderer.java |
| built-in | HeadRenderer | [phase](builtins/head-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/HeadRenderer.java |
| built-in | ImmibisMicroRenderer | [phase](builtins/immibis-micro-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ImmibisMicroRenderer.java |
| built-in | PaneRenderer | [phase](builtins/pane-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/PaneRenderer.java |
| built-in | PaneStateRenderer | [phase](builtins/pane-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/PaneStateRenderer.java |
| built-in | PlantRenderer | [phase](builtins/plant-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/PlantRenderer.java |
| built-in | RPMicroRenderer | [phase](builtins/rpmicro-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RPMicroRenderer.java |
| built-in | RPRotatedBoxRenderer | [phase](builtins/rprotated-box-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RPRotatedBoxRenderer.java |
| built-in | RPSupportFrameRenderer | [phase](builtins/rpsupport-frame-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RPSupportFrameRenderer.java |
| built-in | RailCraftSlabBlockRenderer | [phase](builtins/rail-craft-slab-block-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RailCraftSlabBlockRenderer.java |
| built-in | RailCraftTrackRenderer | [phase](builtins/rail-craft-track-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RailCraftTrackRenderer.java |
| built-in | RedstoneWireRenderer | [phase](builtins/redstone-wire-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RedstoneWireRenderer.java |
| built-in | RedstoneWireStateRenderer | [phase](builtins/redstone-wire-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RedstoneWireStateRenderer.java |
| built-in | RotatedBoxRenderer | [phase](builtins/rotated-box-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RotatedBoxRenderer.java |
| built-in | RotatedPatchRenderer | [phase](builtins/rotated-patch-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RotatedPatchRenderer.java |
| built-in | SkullRenderer | [phase](builtins/skull-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/SkullRenderer.java |
| built-in | StairBlockRenderer | [phase](builtins/stair-block-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/StairBlockRenderer.java |
| built-in | StairStateRenderer | [phase](builtins/stair-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/StairStateRenderer.java |
| built-in | TFCLooseRockRenderer | [phase](builtins/tfcloose-rock-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/TFCLooseRockRenderer.java |
| built-in | TFCSupportRenderer | [phase](builtins/tfcsupport-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/TFCSupportRenderer.java |
| built-in | TFCWoodRenderer | [phase](builtins/tfcwood-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/TFCWoodRenderer.java |
| built-in | ThaumFurnaceRenderer | [phase](builtins/thaum-furnace-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ThaumFurnaceRenderer.java |
| built-in | VineStateRenderer | [phase](builtins/vine-state-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/VineStateRenderer.java |
| built-in | WallHeadRenderer | [phase](builtins/wall-head-renderer.md) | DynmapCore/src/main/java/org/dynmap/hdmap/renderer/WallHeadRenderer.java |
| version | 1.14 | [assets](versions/1.14/assets.md) | exact release |
| version | 1.14 | [anvil](versions/1.14/anvil.md) | exact release |
| version | 1.14 | [paper-snapshot](versions/1.14/paper-snapshot.md) | exact release |
| version | 1.14 | [reference-and-parity](versions/1.14/reference-and-parity.md) | exact release |
| version | 1.14 | [real-acceptance](versions/1.14/real-acceptance.md) | exact release |
| version | 1.14.1 | [assets](versions/1.14.1/assets.md) | exact release |
| version | 1.14.1 | [anvil](versions/1.14.1/anvil.md) | exact release |
| version | 1.14.1 | [paper-snapshot](versions/1.14.1/paper-snapshot.md) | exact release |
| version | 1.14.1 | [reference-and-parity](versions/1.14.1/reference-and-parity.md) | exact release |
| version | 1.14.1 | [real-acceptance](versions/1.14.1/real-acceptance.md) | exact release |
| version | 1.14.2 | [assets](versions/1.14.2/assets.md) | exact release |
| version | 1.14.2 | [anvil](versions/1.14.2/anvil.md) | exact release |
| version | 1.14.2 | [paper-snapshot](versions/1.14.2/paper-snapshot.md) | exact release |
| version | 1.14.2 | [reference-and-parity](versions/1.14.2/reference-and-parity.md) | exact release |
| version | 1.14.2 | [real-acceptance](versions/1.14.2/real-acceptance.md) | exact release |
| version | 1.14.3 | [assets](versions/1.14.3/assets.md) | exact release |
| version | 1.14.3 | [anvil](versions/1.14.3/anvil.md) | exact release |
| version | 1.14.3 | [paper-snapshot](versions/1.14.3/paper-snapshot.md) | exact release |
| version | 1.14.3 | [reference-and-parity](versions/1.14.3/reference-and-parity.md) | exact release |
| version | 1.14.3 | [real-acceptance](versions/1.14.3/real-acceptance.md) | exact release |
| version | 1.14.4 | [assets](versions/1.14.4/assets.md) | exact release |
| version | 1.14.4 | [anvil](versions/1.14.4/anvil.md) | exact release |
| version | 1.14.4 | [paper-snapshot](versions/1.14.4/paper-snapshot.md) | exact release |
| version | 1.14.4 | [reference-and-parity](versions/1.14.4/reference-and-parity.md) | exact release |
| version | 1.14.4 | [real-acceptance](versions/1.14.4/real-acceptance.md) | exact release |
| version | 1.15 | [assets](versions/1.15/assets.md) | exact release |
| version | 1.15 | [anvil](versions/1.15/anvil.md) | exact release |
| version | 1.15 | [paper-snapshot](versions/1.15/paper-snapshot.md) | exact release |
| version | 1.15 | [reference-and-parity](versions/1.15/reference-and-parity.md) | exact release |
| version | 1.15 | [real-acceptance](versions/1.15/real-acceptance.md) | exact release |
| version | 1.15.1 | [assets](versions/1.15.1/assets.md) | exact release |
| version | 1.15.1 | [anvil](versions/1.15.1/anvil.md) | exact release |
| version | 1.15.1 | [paper-snapshot](versions/1.15.1/paper-snapshot.md) | exact release |
| version | 1.15.1 | [reference-and-parity](versions/1.15.1/reference-and-parity.md) | exact release |
| version | 1.15.1 | [real-acceptance](versions/1.15.1/real-acceptance.md) | exact release |
| version | 1.15.2 | [assets](versions/1.15.2/assets.md) | exact release |
| version | 1.15.2 | [anvil](versions/1.15.2/anvil.md) | exact release |
| version | 1.15.2 | [paper-snapshot](versions/1.15.2/paper-snapshot.md) | exact release |
| version | 1.15.2 | [reference-and-parity](versions/1.15.2/reference-and-parity.md) | exact release |
| version | 1.15.2 | [real-acceptance](versions/1.15.2/real-acceptance.md) | exact release |
| version | 1.16 | [assets](versions/1.16/assets.md) | exact release |
| version | 1.16 | [anvil](versions/1.16/anvil.md) | exact release |
| version | 1.16 | [paper-snapshot](versions/1.16/paper-snapshot.md) | exact release |
| version | 1.16 | [reference-and-parity](versions/1.16/reference-and-parity.md) | exact release |
| version | 1.16 | [real-acceptance](versions/1.16/real-acceptance.md) | exact release |
| version | 1.16.1 | [assets](versions/1.16.1/assets.md) | exact release |
| version | 1.16.1 | [anvil](versions/1.16.1/anvil.md) | exact release |
| version | 1.16.1 | [paper-snapshot](versions/1.16.1/paper-snapshot.md) | exact release |
| version | 1.16.1 | [reference-and-parity](versions/1.16.1/reference-and-parity.md) | exact release |
| version | 1.16.1 | [real-acceptance](versions/1.16.1/real-acceptance.md) | exact release |
| version | 1.16.2 | [assets](versions/1.16.2/assets.md) | exact release |
| version | 1.16.2 | [anvil](versions/1.16.2/anvil.md) | exact release |
| version | 1.16.2 | [paper-snapshot](versions/1.16.2/paper-snapshot.md) | exact release |
| version | 1.16.2 | [reference-and-parity](versions/1.16.2/reference-and-parity.md) | exact release |
| version | 1.16.2 | [real-acceptance](versions/1.16.2/real-acceptance.md) | exact release |
| version | 1.16.3 | [assets](versions/1.16.3/assets.md) | exact release |
| version | 1.16.3 | [anvil](versions/1.16.3/anvil.md) | exact release |
| version | 1.16.3 | [paper-snapshot](versions/1.16.3/paper-snapshot.md) | exact release |
| version | 1.16.3 | [reference-and-parity](versions/1.16.3/reference-and-parity.md) | exact release |
| version | 1.16.3 | [real-acceptance](versions/1.16.3/real-acceptance.md) | exact release |
| version | 1.16.4 | [assets](versions/1.16.4/assets.md) | exact release |
| version | 1.16.4 | [anvil](versions/1.16.4/anvil.md) | exact release |
| version | 1.16.4 | [paper-snapshot](versions/1.16.4/paper-snapshot.md) | exact release |
| version | 1.16.4 | [reference-and-parity](versions/1.16.4/reference-and-parity.md) | exact release |
| version | 1.16.4 | [real-acceptance](versions/1.16.4/real-acceptance.md) | exact release |
| version | 1.16.5 | [assets](versions/1.16.5/assets.md) | exact release |
| version | 1.16.5 | [anvil](versions/1.16.5/anvil.md) | exact release |
| version | 1.16.5 | [paper-snapshot](versions/1.16.5/paper-snapshot.md) | exact release |
| version | 1.16.5 | [reference-and-parity](versions/1.16.5/reference-and-parity.md) | exact release |
| version | 1.16.5 | [real-acceptance](versions/1.16.5/real-acceptance.md) | exact release |
| version | 1.17 | [assets](versions/1.17/assets.md) | exact release |
| version | 1.17 | [anvil](versions/1.17/anvil.md) | exact release |
| version | 1.17 | [paper-snapshot](versions/1.17/paper-snapshot.md) | exact release |
| version | 1.17 | [reference-and-parity](versions/1.17/reference-and-parity.md) | exact release |
| version | 1.17 | [real-acceptance](versions/1.17/real-acceptance.md) | exact release |
| version | 1.17.1 | [assets](versions/1.17.1/assets.md) | exact release |
| version | 1.17.1 | [anvil](versions/1.17.1/anvil.md) | exact release |
| version | 1.17.1 | [paper-snapshot](versions/1.17.1/paper-snapshot.md) | exact release |
| version | 1.17.1 | [reference-and-parity](versions/1.17.1/reference-and-parity.md) | exact release |
| version | 1.17.1 | [real-acceptance](versions/1.17.1/real-acceptance.md) | exact release |
| version | 1.18 | [assets](versions/1.18/assets.md) | exact release |
| version | 1.18 | [anvil](versions/1.18/anvil.md) | exact release |
| version | 1.18 | [paper-snapshot](versions/1.18/paper-snapshot.md) | exact release |
| version | 1.18 | [reference-and-parity](versions/1.18/reference-and-parity.md) | exact release |
| version | 1.18 | [real-acceptance](versions/1.18/real-acceptance.md) | exact release |
| version | 1.18.1 | [assets](versions/1.18.1/assets.md) | exact release |
| version | 1.18.1 | [anvil](versions/1.18.1/anvil.md) | exact release |
| version | 1.18.1 | [paper-snapshot](versions/1.18.1/paper-snapshot.md) | exact release |
| version | 1.18.1 | [reference-and-parity](versions/1.18.1/reference-and-parity.md) | exact release |
| version | 1.18.1 | [real-acceptance](versions/1.18.1/real-acceptance.md) | exact release |
| version | 1.18.2 | [assets](versions/1.18.2/assets.md) | exact release |
| version | 1.18.2 | [anvil](versions/1.18.2/anvil.md) | exact release |
| version | 1.18.2 | [paper-snapshot](versions/1.18.2/paper-snapshot.md) | exact release |
| version | 1.18.2 | [reference-and-parity](versions/1.18.2/reference-and-parity.md) | exact release |
| version | 1.18.2 | [real-acceptance](versions/1.18.2/real-acceptance.md) | exact release |
| version | 1.19 | [assets](versions/1.19/assets.md) | exact release |
| version | 1.19 | [anvil](versions/1.19/anvil.md) | exact release |
| version | 1.19 | [paper-snapshot](versions/1.19/paper-snapshot.md) | exact release |
| version | 1.19 | [reference-and-parity](versions/1.19/reference-and-parity.md) | exact release |
| version | 1.19 | [real-acceptance](versions/1.19/real-acceptance.md) | exact release |
| version | 1.19.1 | [assets](versions/1.19.1/assets.md) | exact release |
| version | 1.19.1 | [anvil](versions/1.19.1/anvil.md) | exact release |
| version | 1.19.1 | [paper-snapshot](versions/1.19.1/paper-snapshot.md) | exact release |
| version | 1.19.1 | [reference-and-parity](versions/1.19.1/reference-and-parity.md) | exact release |
| version | 1.19.1 | [real-acceptance](versions/1.19.1/real-acceptance.md) | exact release |
| version | 1.19.2 | [assets](versions/1.19.2/assets.md) | exact release |
| version | 1.19.2 | [anvil](versions/1.19.2/anvil.md) | exact release |
| version | 1.19.2 | [paper-snapshot](versions/1.19.2/paper-snapshot.md) | exact release |
| version | 1.19.2 | [reference-and-parity](versions/1.19.2/reference-and-parity.md) | exact release |
| version | 1.19.2 | [real-acceptance](versions/1.19.2/real-acceptance.md) | exact release |
| version | 1.19.3 | [assets](versions/1.19.3/assets.md) | exact release |
| version | 1.19.3 | [anvil](versions/1.19.3/anvil.md) | exact release |
| version | 1.19.3 | [paper-snapshot](versions/1.19.3/paper-snapshot.md) | exact release |
| version | 1.19.3 | [reference-and-parity](versions/1.19.3/reference-and-parity.md) | exact release |
| version | 1.19.3 | [real-acceptance](versions/1.19.3/real-acceptance.md) | exact release |
| version | 1.19.4 | [assets](versions/1.19.4/assets.md) | exact release |
| version | 1.19.4 | [anvil](versions/1.19.4/anvil.md) | exact release |
| version | 1.19.4 | [paper-snapshot](versions/1.19.4/paper-snapshot.md) | exact release |
| version | 1.19.4 | [reference-and-parity](versions/1.19.4/reference-and-parity.md) | exact release |
| version | 1.19.4 | [real-acceptance](versions/1.19.4/real-acceptance.md) | exact release |
| version | 1.20 | [assets](versions/1.20/assets.md) | exact release |
| version | 1.20 | [anvil](versions/1.20/anvil.md) | exact release |
| version | 1.20 | [paper-snapshot](versions/1.20/paper-snapshot.md) | exact release |
| version | 1.20 | [reference-and-parity](versions/1.20/reference-and-parity.md) | exact release |
| version | 1.20 | [real-acceptance](versions/1.20/real-acceptance.md) | exact release |
| version | 1.20.1 | [assets](versions/1.20.1/assets.md) | exact release |
| version | 1.20.1 | [anvil](versions/1.20.1/anvil.md) | exact release |
| version | 1.20.1 | [paper-snapshot](versions/1.20.1/paper-snapshot.md) | exact release |
| version | 1.20.1 | [reference-and-parity](versions/1.20.1/reference-and-parity.md) | exact release |
| version | 1.20.1 | [real-acceptance](versions/1.20.1/real-acceptance.md) | exact release |
| version | 1.20.2 | [assets](versions/1.20.2/assets.md) | exact release |
| version | 1.20.2 | [anvil](versions/1.20.2/anvil.md) | exact release |
| version | 1.20.2 | [paper-snapshot](versions/1.20.2/paper-snapshot.md) | exact release |
| version | 1.20.2 | [reference-and-parity](versions/1.20.2/reference-and-parity.md) | exact release |
| version | 1.20.2 | [real-acceptance](versions/1.20.2/real-acceptance.md) | exact release |
| version | 1.20.3 | [assets](versions/1.20.3/assets.md) | exact release |
| version | 1.20.3 | [anvil](versions/1.20.3/anvil.md) | exact release |
| version | 1.20.3 | [paper-snapshot](versions/1.20.3/paper-snapshot.md) | exact release |
| version | 1.20.3 | [reference-and-parity](versions/1.20.3/reference-and-parity.md) | exact release |
| version | 1.20.3 | [real-acceptance](versions/1.20.3/real-acceptance.md) | exact release |
| version | 1.20.4 | [assets](versions/1.20.4/assets.md) | exact release |
| version | 1.20.4 | [anvil](versions/1.20.4/anvil.md) | exact release |
| version | 1.20.4 | [paper-snapshot](versions/1.20.4/paper-snapshot.md) | exact release |
| version | 1.20.4 | [reference-and-parity](versions/1.20.4/reference-and-parity.md) | exact release |
| version | 1.20.4 | [real-acceptance](versions/1.20.4/real-acceptance.md) | exact release |
| version | 1.20.5 | [assets](versions/1.20.5/assets.md) | exact release |
| version | 1.20.5 | [anvil](versions/1.20.5/anvil.md) | exact release |
| version | 1.20.5 | [paper-snapshot](versions/1.20.5/paper-snapshot.md) | exact release |
| version | 1.20.5 | [reference-and-parity](versions/1.20.5/reference-and-parity.md) | exact release |
| version | 1.20.5 | [real-acceptance](versions/1.20.5/real-acceptance.md) | exact release |
| version | 1.20.6 | [assets](versions/1.20.6/assets.md) | exact release |
| version | 1.20.6 | [anvil](versions/1.20.6/anvil.md) | exact release |
| version | 1.20.6 | [paper-snapshot](versions/1.20.6/paper-snapshot.md) | exact release |
| version | 1.20.6 | [reference-and-parity](versions/1.20.6/reference-and-parity.md) | exact release |
| version | 1.20.6 | [real-acceptance](versions/1.20.6/real-acceptance.md) | exact release |
| version | 1.21 | [assets](versions/1.21/assets.md) | exact release |
| version | 1.21 | [anvil](versions/1.21/anvil.md) | exact release |
| version | 1.21 | [paper-snapshot](versions/1.21/paper-snapshot.md) | exact release |
| version | 1.21 | [reference-and-parity](versions/1.21/reference-and-parity.md) | exact release |
| version | 1.21 | [real-acceptance](versions/1.21/real-acceptance.md) | exact release |
| version | 1.21.1 | [assets](versions/1.21.1/assets.md) | exact release |
| version | 1.21.1 | [anvil](versions/1.21.1/anvil.md) | exact release |
| version | 1.21.1 | [paper-snapshot](versions/1.21.1/paper-snapshot.md) | exact release |
| version | 1.21.1 | [reference-and-parity](versions/1.21.1/reference-and-parity.md) | exact release |
| version | 1.21.1 | [real-acceptance](versions/1.21.1/real-acceptance.md) | exact release |
| version | 1.21.2 | [assets](versions/1.21.2/assets.md) | exact release |
| version | 1.21.2 | [anvil](versions/1.21.2/anvil.md) | exact release |
| version | 1.21.2 | [paper-snapshot](versions/1.21.2/paper-snapshot.md) | exact release |
| version | 1.21.2 | [reference-and-parity](versions/1.21.2/reference-and-parity.md) | exact release |
| version | 1.21.2 | [real-acceptance](versions/1.21.2/real-acceptance.md) | exact release |
| version | 1.21.3 | [assets](versions/1.21.3/assets.md) | exact release |
| version | 1.21.3 | [anvil](versions/1.21.3/anvil.md) | exact release |
| version | 1.21.3 | [paper-snapshot](versions/1.21.3/paper-snapshot.md) | exact release |
| version | 1.21.3 | [reference-and-parity](versions/1.21.3/reference-and-parity.md) | exact release |
| version | 1.21.3 | [real-acceptance](versions/1.21.3/real-acceptance.md) | exact release |
| version | 1.21.4 | [assets](versions/1.21.4/assets.md) | exact release |
| version | 1.21.4 | [anvil](versions/1.21.4/anvil.md) | exact release |
| version | 1.21.4 | [paper-snapshot](versions/1.21.4/paper-snapshot.md) | exact release |
| version | 1.21.4 | [reference-and-parity](versions/1.21.4/reference-and-parity.md) | exact release |
| version | 1.21.4 | [real-acceptance](versions/1.21.4/real-acceptance.md) | exact release |
| version | 1.21.5 | [assets](versions/1.21.5/assets.md) | exact release |
| version | 1.21.5 | [anvil](versions/1.21.5/anvil.md) | exact release |
| version | 1.21.5 | [paper-snapshot](versions/1.21.5/paper-snapshot.md) | exact release |
| version | 1.21.5 | [reference-and-parity](versions/1.21.5/reference-and-parity.md) | exact release |
| version | 1.21.5 | [real-acceptance](versions/1.21.5/real-acceptance.md) | exact release |
| version | 1.21.6 | [assets](versions/1.21.6/assets.md) | exact release |
| version | 1.21.6 | [anvil](versions/1.21.6/anvil.md) | exact release |
| version | 1.21.6 | [paper-snapshot](versions/1.21.6/paper-snapshot.md) | exact release |
| version | 1.21.6 | [reference-and-parity](versions/1.21.6/reference-and-parity.md) | exact release |
| version | 1.21.6 | [real-acceptance](versions/1.21.6/real-acceptance.md) | exact release |
| version | 1.21.7 | [assets](versions/1.21.7/assets.md) | exact release |
| version | 1.21.7 | [anvil](versions/1.21.7/anvil.md) | exact release |
| version | 1.21.7 | [paper-snapshot](versions/1.21.7/paper-snapshot.md) | exact release |
| version | 1.21.7 | [reference-and-parity](versions/1.21.7/reference-and-parity.md) | exact release |
| version | 1.21.7 | [real-acceptance](versions/1.21.7/real-acceptance.md) | exact release |
| version | 1.21.8 | [assets](versions/1.21.8/assets.md) | exact release |
| version | 1.21.8 | [anvil](versions/1.21.8/anvil.md) | exact release |
| version | 1.21.8 | [paper-snapshot](versions/1.21.8/paper-snapshot.md) | exact release |
| version | 1.21.8 | [reference-and-parity](versions/1.21.8/reference-and-parity.md) | exact release |
| version | 1.21.8 | [real-acceptance](versions/1.21.8/real-acceptance.md) | exact release |
| version | 1.21.9 | [assets](versions/1.21.9/assets.md) | exact release |
| version | 1.21.9 | [anvil](versions/1.21.9/anvil.md) | exact release |
| version | 1.21.9 | [paper-snapshot](versions/1.21.9/paper-snapshot.md) | exact release |
| version | 1.21.9 | [reference-and-parity](versions/1.21.9/reference-and-parity.md) | exact release |
| version | 1.21.9 | [real-acceptance](versions/1.21.9/real-acceptance.md) | exact release |
| version | 1.21.10 | [assets](versions/1.21.10/assets.md) | exact release |
| version | 1.21.10 | [anvil](versions/1.21.10/anvil.md) | exact release |
| version | 1.21.10 | [paper-snapshot](versions/1.21.10/paper-snapshot.md) | exact release |
| version | 1.21.10 | [reference-and-parity](versions/1.21.10/reference-and-parity.md) | exact release |
| version | 1.21.10 | [real-acceptance](versions/1.21.10/real-acceptance.md) | exact release |
| version | 1.21.11 | [assets](versions/1.21.11/assets.md) | exact release |
| version | 1.21.11 | [anvil](versions/1.21.11/anvil.md) | exact release |
| version | 1.21.11 | [paper-snapshot](versions/1.21.11/paper-snapshot.md) | exact release |
| version | 1.21.11 | [reference-and-parity](versions/1.21.11/reference-and-parity.md) | exact release |
| version | 1.21.11 | [real-acceptance](versions/1.21.11/real-acceptance.md) | exact release |
| version | 26.1 | [assets](versions/26.1/assets.md) | exact release |
| version | 26.1 | [anvil](versions/26.1/anvil.md) | exact release |
| version | 26.1 | [paper-snapshot](versions/26.1/paper-snapshot.md) | exact release |
| version | 26.1 | [reference-and-parity](versions/26.1/reference-and-parity.md) | exact release |
| version | 26.1 | [real-acceptance](versions/26.1/real-acceptance.md) | exact release |
| version | 26.1.1 | [assets](versions/26.1.1/assets.md) | exact release |
| version | 26.1.1 | [anvil](versions/26.1.1/anvil.md) | exact release |
| version | 26.1.1 | [paper-snapshot](versions/26.1.1/paper-snapshot.md) | exact release |
| version | 26.1.1 | [reference-and-parity](versions/26.1.1/reference-and-parity.md) | exact release |
| version | 26.1.1 | [real-acceptance](versions/26.1.1/real-acceptance.md) | exact release |
| version | 26.1.2 | [assets](versions/26.1.2/assets.md) | exact release |
| version | 26.1.2 | [anvil](versions/26.1.2/anvil.md) | exact release |
| version | 26.1.2 | [paper-snapshot](versions/26.1.2/paper-snapshot.md) | exact release |
| version | 26.1.2 | [reference-and-parity](versions/26.1.2/reference-and-parity.md) | exact release |
| version | 26.1.2 | [real-acceptance](versions/26.1.2/real-acceptance.md) | exact release |
| version | 26.2 | [assets](versions/26.2/assets.md) | exact release |
| version | 26.2 | [anvil](versions/26.2/anvil.md) | exact release |
| version | 26.2 | [paper-snapshot](versions/26.2/paper-snapshot.md) | exact release |
| version | 26.2 | [reference-and-parity](versions/26.2/reference-and-parity.md) | exact release |
| version | 26.2 | [real-acceptance](versions/26.2/real-acceptance.md) | exact release |
| version | 26.3 | [assets](versions/26.3/assets.md) | exact release |
| version | 26.3 | [anvil](versions/26.3/anvil.md) | exact release |
| version | 26.3 | [paper-snapshot](versions/26.3/paper-snapshot.md) | exact release |
| version | 26.3 | [reference-and-parity](versions/26.3/reference-and-parity.md) | exact release |
| version | 26.3 | [real-acceptance](versions/26.3/real-acceptance.md) | exact release |
