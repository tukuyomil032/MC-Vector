# Dynmap Origin Manifest

Pinned source revision for every row:
`93b454efb8802dc7406d6873434f2aeec5c636f4`.

| Upstream unit | Rust destination | License | Port method | Fixture ID | Status |
| --- | --- | --- | --- | --- | --- |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java` | `src-tauri/crates/map-renderer-core/src/projection` | Apache-2.0 | Rust translation of renderer contract | R08 | inventory_required |
| `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java` | `src-tauri/crates/map-renderer-core/src/projection` | Apache-2.0 | Rust translation of transform, ray, and tile traversal | R08-R10 | inventory_required |
| `DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java` | `src-tauri/crates/map-renderer-core/src/geometry` | Apache-2.0 | Rust translation of patch intersection and UV clipping | R09 | inventory_required |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java` | `src-tauri/crates/map-renderer-core/src/models` | Apache-2.0 | Rust model registry fed by versioned assets | R13 | inventory_required |
| `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java` | `src-tauri/crates/map-renderer-core/src/textures` | Apache-2.0 | Rust texture/model resolution using verified assets | R14 | inventory_required |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDShader.java` | `src-tauri/crates/map-renderer-core/src/shaders` | Apache-2.0 | Rust shader and alpha contract | R17 | inventory_required |
| `DynmapCore/src/main/java/org/dynmap/hdmap/HDLighting.java` | `src-tauri/crates/map-renderer-core/src/lighting` | Apache-2.0 | Rust light input and shade contract | R16 | inventory_required |
| `DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java` | `src-tauri/crates/map-renderer-core/src/projection` | Apache-2.0 | Rust matrix operations | R08 | inventory_required |
| `DynmapCore/src/main/resources/shaders.txt` | `src-tauri/crates/map-renderer-core/src/shaders` | Apache-2.0 | Rust parser/constant mapping | R17 | inventory_required |

`locked` means the source path and destination are fixed. It does not mean the
Rust implementation is complete. R02-R05 must provide the contract,
translation, and differential evidence before any row is marked implemented.

The source snapshot is never a Paper plugin source set, a frontend import, or a
release asset. Bukkit lifecycle, Dynmap storage, web UI, and web server code
are explicitly excluded.

## Exact method mapping

The following legacy method-level rows are retained only as migration hints.
R02 replaces them with the complete symbol catalog under
`spec/map/coverage/source-symbols.json`; a class-level row is never sufficient
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
