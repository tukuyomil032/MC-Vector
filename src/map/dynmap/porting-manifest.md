# Dynmap Porting Manifest

Pinned source revision for every row:
`93b454efb8802dc7406d6873434f2aeec5c636f4`.

| Upstream unit | Rust destination | License | Port method | Fixture ID | Status |
| --- | --- | --- | --- | --- | --- |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java` | `src-tauri/src/map/renderer/dynmap/perspective.rs` | Apache-2.0 | Rust translation of renderer contract | `iso_flat_1_21_10` | locked |
| `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java` | `src-tauri/src/map/renderer/dynmap/iso.rs` | Apache-2.0 | Rust translation of transform, ray, and tile traversal | `iso_flat_1_21_10` | locked |
| `DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java` | `src-tauri/src/map/renderer/dynmap/patch.rs` | Apache-2.0 | Rust translation of patch intersection and UV clipping | `patch_shapes` | locked |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java` | `src-tauri/src/map/renderer/dynmap/models.rs` | Apache-2.0 | Rust model registry fed by Minecraft assets | `models_stairs_slabs` | locked |
| `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java` | `src-tauri/src/map/renderer/dynmap/textures.rs` | Apache-2.0 | Rust texture/model resolution using user assets | `textures_uv_alpha` | locked |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDShader.java` | `src-tauri/src/map/renderer/dynmap/shader.rs` | Apache-2.0 | Rust shader and alpha contract | `lighting_alpha` | locked |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDLighting.java` | `src-tauri/src/map/renderer/dynmap/lighting.rs` | Apache-2.0 | Rust light input and shade contract | `lighting_alpha` | locked |
| `DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java` | `src-tauri/src/map/renderer/dynmap/transform.rs` | Apache-2.0 | Rust matrix operations | `iso_transform_round_trip` | locked |
| `DynmapCore/src/main/resources/shaders.txt` | `src-tauri/src/map/renderer/dynmap/shader.rs` | Apache-2.0 | Rust parser/constant mapping | `lighting_alpha` | locked |

`locked` means the source path and destination are fixed. It does not mean the
Rust implementation is complete. R02-R05 must provide the contract,
translation, and differential evidence before any row is marked implemented.

The source snapshot is never a Paper plugin source set, a frontend import, or a
release asset. Bukkit lifecycle, Dynmap storage, web UI, and web server code
are explicitly excluded.

## Exact method mapping

The following method-level entries are the only renderer symbols admitted to
R02-R04. A class-level source row without a method row is not sufficient
evidence for a port.

| Upstream method | Rust destination function | Fixture ID |
| --- | --- | --- |
| `IsoHDPerspective#getTileCoords`, `getAdjecentTiles` | `tile_bounds`, `adjacent_tiles` | `tile_boundary_adjacency` |
| `IsoHDPerspective#getRequiredChunks` | `required_chunks_for_tile` | `iso_required_chunks` |
| `IsoHDPerspective#render` | `render_iso_tile` | `iso_flat_1_21_10` |
| `IsoHDPerspective#isBiomeDataNeeded`, `isRawBiomeDataNeeded`, `isHightestBlockYDataNeeded`, `isBlockTypeDataNeeded` | `required_chunk_fields` | `chunk_view_requirements` |
| `IsoHDPerspective#addClientConfiguration`, `transformWorldToMapCoord` | `map_projection_contract` | `iso_transform_round_trip` |
| `Matrix3D#multiply`, `scale`, `rotateXY`, `rotateXZ`, `rotateYZ`, `shearZ`, `transform` | `Matrix3::multiply`, `scale`, `rotate_xy`, `rotate_xz`, `rotate_yz`, `shear_z`, `transform` | `iso_transform_round_trip` |
| `PatchDefinition#update`, `validate`, `getTextureIndex`, `updateModelFace` | `Patch::update`, `validate`, `texture_index`, `update_model_face` | `patch_shapes` |
| `HDBlockModels#getNeededTextureCount`, `getModelsForScale`, `loadModels`, `checkVersionRange` | `ModelRegistry::needed_texture_count`, `models_for_scale`, `load_models`, `check_version_range` | `models_stairs_slabs` |
| `TexturePack#loadTextureMapping`, `getTextureIDAt`, `getCurrentBlockMaterials`, `getMaterialTypeByTile` | `TextureResolver::load_mapping`, `texture_id_at`, `block_materials`, `material_type` | `textures_uv_alpha` |
| `HDShader#getStateInstance`, `isBiomeDataNeeded`, `isRawBiomeDataNeeded`, `isHightestBlockYDataNeeded`, `isBlockTypeDataNeeded`, `isSkyLightLevelNeeded`, `isEmittedLightLevelNeeded`, `getCurrentBlockMaterials` | `DynmapShader::state`, `needs_biome`, `needs_raw_biome`, `needs_height`, `needs_block_type`, `needs_sky_light`, `needs_emitted_light`, `current_block_materials` | `lighting_alpha` |
| `HDLighting#applyLighting`, `isBiomeDataNeeded`, `isRawBiomeDataNeeded`, `isHightestBlockYDataNeeded`, `isBlockTypeDataNeeded`, `isNightAndDayEnabled`, `isSkyLightLevelNeeded`, `isEmittedLightLevelNeeded`, `getBrightnessTable` | `DynmapLighting::apply`, `needs_biome`, `needs_raw_biome`, `needs_height`, `needs_block_type`, `night_and_day`, `needs_sky_light`, `needs_emitted_light`, `brightness_table` | `lighting_alpha` |
