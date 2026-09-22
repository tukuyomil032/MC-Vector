# Dynmap Source Porting Boundary

Every translated Rust module must retain the following provenance fields in a
module-level comment or an adjacent manifest entry:

```text
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: Dynmap contributors
Origin: <pinned Dynmap source path>
Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
Ported-to: MC-Vector Rust
Changes: <short, concrete summary>
```

The Rust implementation is an independent translation. It must preserve the
source processing order and equations while replacing Java, Bukkit, and Dynmap
runtime types with the R02 domain contracts.

The mapping is fixed before code is written:

| Reference | Rust destination | First fixture gate |
| --- | --- | --- |
| `HDPerspective` | `src-tauri/src/map/renderer/dynmap/perspective.rs` | `iso_flat_1_21_10` |
| `IsoHDPerspective` | `src-tauri/src/map/renderer/dynmap/iso.rs` | `iso_flat_1_21_10` |
| `PatchDefinition` | `src-tauri/src/map/renderer/dynmap/patch.rs` | `patch_shapes` |
| `HDBlockModels` | `src-tauri/src/map/renderer/dynmap/models.rs` | `models_stairs_slabs` |
| `TexturePack` | `src-tauri/src/map/renderer/dynmap/textures.rs` | `textures_uv_alpha` |
| `HDShader` | `src-tauri/src/map/renderer/dynmap/shader.rs` | `lighting_alpha` |
| `HDLighting` | `src-tauri/src/map/renderer/dynmap/lighting.rs` | `lighting_alpha` |
| `Matrix3D` | `src-tauri/src/map/renderer/dynmap/transform.rs` | `iso_transform_round_trip` |
| `shaders.txt` | `src-tauri/src/map/renderer/dynmap/shader.rs` | `lighting_alpha` |

The manifest is not allowed to mark a symbol complete merely because a Rust
file exists. The corresponding R03-R05 fixture and differential evidence must
pass first.
