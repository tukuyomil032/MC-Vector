# Dynmap Porting Manifest

Status: source boundary established. A row marked `planned` is not an
implementation or a distribution approval. A copied snapshot is limited to
the exact pinned ref and path shown below.

| sourceRepository | sourceRef | sourcePath / symbols | destination | license | method | fixture or reason | reviewStatus |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | [`DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java`](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java): perspective interface and required data queries | `src/map/dynmap/upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java` | Apache-2.0 | Verbatim research snapshot; not compiled or linked at runtime | No renderer fixture; source hash and path integrity are recorded in `SOURCE-REF.md` | source-snapshot |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | [`DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java`](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java): patch geometry and UV/visibility fields | `src/map/dynmap/upstream/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java` | Apache-2.0 | Verbatim research snapshot; no Bukkit runtime integration | No renderer fixture; source hash and path integrity are recorded in `SOURCE-REF.md` | source-snapshot |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | [`DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java`](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java): transform, ray, voxel/patch traversal | `src-tauri/src/map/renderer/dynmap/iso_hd.rs` | Apache-2.0 | Selective Rust translation of matrix construction, map/world conversion, tile floor math, and tile ray generation; Bukkit/runtime code excluded | `map::renderer::dynmap::iso_hd::tests` covers normalization, round-trip, negative/floor coordinates, fixed ray direction, and tile boundaries; voxel/patch traversal remains separate | translated-geometry |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | [`DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java`](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java): 3x3 matrix multiply, rotations, shear, scale, transform | `src-tauri/src/map/renderer/dynmap/iso_hd.rs::Matrix3` | Apache-2.0 | Idiomatic Rust translation used by the Iso perspective; no Java class dependency | `map::renderer::dynmap::iso_hd::tests::world_and_map_coordinates_round_trip_for_negative_world_coordinates` | translated-geometry |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | [`DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java`](https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java): model and texture mapping rules | `src-tauri/src/map/assets` | Apache-2.0 | Planned selective translation; not copied in this boundary task | Large source and asset/resource dependency graph; requires blockstate/model/texture fixtures | planned |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java`, `renderer/*`, `utils/PatchDefinition.java`, `RenderPatch*` | `src-tauri/src/map/domain` and renderer | Apache-2.0 | Translate representation only after fixture coverage | Stairs/slabs/rotations fixture required; only `PatchDefinition.java` is snapshot-copied here | planned |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | `DynmapCore/src/main/java/org/dynmap/hdmap/*Shader.java`, `DynmapCore/src/main/resources/shaders.txt` | `src-tauri/src/map/renderer` | Apache-2.0 | Reimplement coefficients and rules with attribution | Light/alpha/tint fixtures required; not copied here | planned |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | `LICENSE` | `src/map/dynmap/LICENSE-APACHE-2.0` | Apache-2.0 | Verbatim license artifact | Exact pinned source fetched and retained | license-artifact |

## Boundary rules

- Every copied or translated item keeps this exact source ref; the moving
  `v3.0` branch is not a provenance ref.
- Copied snapshots remain research-only until a destination, change summary,
  and equivalent fixture are recorded for a translation.
- Dynmap Bukkit/platform adapters, lifecycle, storage, web UI, commands, and
  user assets are not copied into this boundary.
- `LICENSE-APACHE-2.0`, `NOTICE`, and `SOURCE-REF.md` travel with this source
  boundary if the selected snapshot is redistributed.
