# Map Renderer Phase Index

Each phase is one implementation task and one English commit. A phase cannot
be marked complete until its source coverage, fixtures, focused checks, and
failure conditions are recorded.

| Phase | Focus | Commit |
| --- | --- | --- |
| R00 | Canonical plan and obsolete document cleanup | `chore: replace obsolete map plans with canonical renderer plan` |
| R01 | Renderer core crate isolation and warning boundary | `ref: isolate map renderer core from tauri application` |
| R02 | Dynmap source dependency closure catalog | `chore: catalog complete dynmap renderer source closure` |
| R03 | Apache-2.0 source boundary and attribution | `chore: lock dynmap renderer source and attribution` |
| R04 | Source-independent renderer domain contracts | `feat: define complete renderer domain contracts` |
| R05 | Minecraft version matrix and primary-source verification | `chore: establish minecraft version compatibility matrix` |
| R06 | Common Saved Anvil decoder | `feat: add deterministic anvil decoder core` |
| R07 | Per-version Anvil adapters | `feat: add anvil adapter for <minecraft-version>` |
| R08 | Dynmap matrix, vector, and projection | `feat: port dynmap projection and transform contracts` |
| R09 | Patch geometry and RenderPatchFactory | `feat: port dynmap render patch geometry` |
| R10 | Voxel traversal and hit selection | `feat: port dynmap voxel traversal and hit selection` |
| R11 | Client JAR/resource-pack asset loading | `feat: add versioned minecraft asset loading` |
| R12 | Blockstate and model resolution | `feat: add minecraft blockstate and model resolution` |
| R13 | Dynmap block model registry | `feat: port dynmap block model registry` |
| R14 | TexturePack, atlas, UV, and alpha | `feat: port dynmap texture and uv pipeline` |
| R15 | Biome tint, multipliers, and materials | `feat: port dynmap biome tint and material rules` |
| R16 | HD lighting pipeline | `feat: port dynmap hd lighting pipeline` |
| R17 | HD shader state and resources | `feat: port dynmap shader state and lighting resources` |
| R18 | CustomRenderer API compatibility | `feat: add dynmap custom renderer api compatibility` |
| R19 | Built-in renderer catalog and registry | `chore: catalog dynmap built-in renderers` |
| R20 | Basic geometry built-in renderers | `feat: port dynmap basic built-in renderers` |
| R21 | Stairs, slabs, and rotated geometry | `feat: port dynmap stair and slab renderers` |
| R22 | Doors, trapdoors, and fence gates | `feat: port dynmap door and gate renderers` |
| R23 | Fences, walls, panes, and connections | `feat: port dynmap connected geometry renderers` |
| R24 | Foliage, plants, vines, and glow blocks | `feat: port dynmap foliage and plant renderers` |
| R25 | Fluids and translucent terrain | `feat: port dynmap fluid renderers` |
| R26 | Rails and redstone | `feat: port dynmap rail and redstone renderers` |
| R27 | Containers, heads, and entity-facing models | `feat: port dynmap container and head renderers` |
| R28 | Remaining built-in renderer closure | `feat: complete dynmap built-in renderer coverage` |
| R29 | Java Dynmap reference harness | `test: add dynmap java reference harness` |
| R30 | Versioned fixture catalog and golden assets | `test: add versioned dynmap renderer fixtures` |
| R31 | Differential trace and pixel parity | `test: enforce dynmap renderer pixel parity` |
| R32 | Version-specific asset adapters | `feat: add asset adapter for <minecraft-version>` |
| R33 | Version-specific saved terrain parity | `test: verify saved terrain for <minecraft-version>` |
| R34 | Paper snapshot bridge protocol | `feat: define paper snapshot bridge protocol` |
| R35 | Version-specific Paper snapshot adapters | `feat: add paper snapshot adapter for <minecraft-version>` |
| R36 | Saved/live renderer equivalence | `test: verify saved and live renderer equivalence` |
| R37 | Tile geometry and tile pyramid | `feat: add complete map tile geometry` |
| R38 | Verified tile cache and failure tiles | `feat: add verified map tile cache and failure states` |
| R39 | Bounded scheduler and cancellation | `feat: add bounded map render scheduler` |
| R40 | Tauri IPC and diagnostics | `feat: connect verified renderer to tauri diagnostics` |
| R41 | Map UI after renderer verification | `feat: restore map ui after renderer verification` |
| R42 | Cursor anchored smooth zoom and pan | `feat: restore cursor anchored map zoom and pan` |
| R43 | Failure and consent safety | `fix: enforce map renderer failure safety` |
| R44 | Performance, memory, and security hardening | `fix: harden map renderer resource and concurrency limits` |
| R45 | Warning-clean Rust quality gate | `test: enforce warning clean map renderer core` |
| R46 | Versioned CI verification matrix | `ci: add versioned map renderer verification matrix` |
| R47 | Real Paper/Tauri acceptance | `test: record real map renderer acceptance` |
| R48 | Final source/fixture/version coverage audit | `test: close map renderer coverage audit` |

R07, R32, R33, and R35 expand into one child phase and one commit per exact
version entry created by R05. A family representative is never substituted
for a missing version entry.
