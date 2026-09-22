# Dynmap Porting Manifest

Status: initial inventory. A row is not approved for distribution until
`reviewStatus` becomes `approved` and the named fixture exists.

| sourceRepository | sourceRef | sourcePath / symbols | destination | license | method | fixture | reviewStatus |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `webbukkit/dynmap` | `93b454efb8802dc7406d6873434f2aeec5c636f4` | `DynmapCore/.../IsoHDPerspective.java`: transform, ray, voxel/patch traversal | `src-tauri/src/map/renderer/dynmap/iso_hd.rs` | Apache-2.0 | translate and adapt | geometry + golden terrain | planned |
| `webbukkit/dynmap` | same | `DynmapCore/.../TexturePack.java`: model/texture mapping rules | `src-tauri/src/map/assets` | Apache-2.0 | translate rules; no Bukkit | blockstate/model/texture fixtures | planned |
| `webbukkit/dynmap` | same | `HDBlockModels.java`, `PatchDefinition.java`, `RenderPatch*` | `src-tauri/src/map/domain` and renderer | Apache-2.0 | translate data model | stairs/slabs/rotations | planned |
| `webbukkit/dynmap` | same | `*HDShader.java`, `resources/shaders.txt` | `src-tauri/src/map/renderer` | Apache-2.0 | reimplement coefficients/rules | light/alpha/tint fixtures | planned |
| `webbukkit/dynmap` | same | `MapManager.java`, `MapStorage*` | no direct copy | Apache-2.0 | study only; independent scheduler/store | queue/cache fixtures | excluded |
| `webbukkit/dynmap` | same | `bukkit-helper/*`, `spigot/*` | `src/map/paper` + Rust bridge | Apache-2.0 | independent Paper adapter | real Paper smoke | excluded |
| `webbukkit/dynmap` | same | `markers/*`, `servlet/*`, `web/*` | `src-tauri/src/map/markers`, React overlays | Apache-2.0 | later independent feature | marker/overlay fixtures | later |

## Required metadata for new rows

Every new row must include the original copyright header, exact file/symbol,
source URL, source commit, destination path, translation/copy method, concrete
MC-Vector changes, a fixture or explicit reason for no fixture, and a license
review result. Do not register a copied file after the implementation has
already been merged.
