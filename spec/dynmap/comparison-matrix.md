# Dynmap to MC-Vector Comparison Matrix

| Capability | Dynmap v3.0 reference | MC-Vector status | Target |
| --- | --- | --- | --- |
| Platform adapter | Spigot, Fabric, Forge helpers | Paper Java bridge | reimplement-first |
| Chunk cache | `MapChunkCache` | live snapshot plus Anvil source | reimplement-first |
| Block iteration | `MapIterator` | Rust `ChunkView` / iterator | reimplement-first |
| Iso projection | `IsoHDPerspective` | current prototype is top-down | reimplement-first |
| Block geometry | HD/scaled/custom patches | average surface colour | reimplement-first |
| Texture resolution | `TexturePack` and loaders | average texture colour | reimplement-first |
| Biome tint | shader/model-aware | name-based tint | reimplement-first |
| Lighting | HD lighting implementations | simple height/light adjustment | reimplement-first |
| Shader modes | default, cave, topo, underwater | fallback surface colour | reimplement-later |
| Tile scheduling | render worker and pending state | per-command render gate | reimplement-first |
| Tile storage | file/database backends | memory plus disk PNG cache | reimplement-first |
| Dirty updates | touch/update queue | chunk invalidation hints | reimplement-first |
| Zoom-out | scheduled zoom-out rendering | representative overview | reimplement-first |
| Player markers | Dynmap marker/player subsystem | React player overlay | reimplement-first |
| Persistent markers | marker API and storage | not implemented | reimplement-later |
| Chat | web/chat integration | not implemented | reimplement-later |
| Time and weather | map/world UI data | not implemented | reimplement-later |
| Embedded web server | Jetty routing and web assets | Tauri IPC and React | not-target |
| Dynmap API | stable public API plus internal core | no runtime dependency | not-target |
| Multi-platform server | Spigot/Fabric/Forge | Paper 1.21.x first | reimplement-later |
| Custom resource packs | texture/model stack | local source selection | reimplement-first |
| Full world generation | asynchronous full render | no immediate full scan | reimplement-later |

The `reimplement-first` entries are the renderer parity gate. A later feature
must not be used to hide a missing first-phase renderer capability.
