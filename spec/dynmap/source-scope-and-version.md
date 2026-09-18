# Source Scope and Version

## Purpose

This document fixes what was actually inspected. It prevents a moving GitHub
branch, a search snippet, or an old prototype from becoming an undocumented
implementation assumption.

## Pinned revision

`93b454efb8802dc7406d6873434f2aeec5c636f4` is the observed head of the
`v3.0` branch used for this corpus. The revision contains the renderer and
platform changes that are relevant to the porting boundary. Every imported
file must keep this revision in `src/map/dynmap/porting-manifest.md`.

## Source groups inspected

| Group | Source paths | Decision |
| --- | --- | --- |
| Lifecycle and coordination | `DynmapCore/src/main/java/org/dynmap/DynmapCore.java`, `MapManager.java` | Read for architecture; reimplement in MC-Vector |
| World abstraction | `DynmapCore/src/main/java/org/dynmap/utils/MapChunkCache.java`, `MapIterator.java`, `DynmapChunk.java` | Translate data contracts; do not copy Bukkit code |
| Perspective | `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java`, `HDPerspective.java` | Port math and traversal selectively |
| Block models | `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java`, `renderer/*`, `utils/PatchDefinition.java` | Port representation only after fixture coverage |
| Assets | `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java`, `HDBlockStateTextureMap.java` | Translate model/texture rules; keep user asset input separate |
| Shaders | `DynmapCore/src/main/java/org/dynmap/hdmap/*Shader.java`, `DynmapCore/src/main/resources/shaders.txt` | Reimplement shader contract and coefficients with attribution |
| Queue and storage | `MapManager.java`, `storage/*`, `MapTile.java`, `MapType.java` | Reimplement queue/cache semantics; no backend copy |
| Runtime overlays | `markers/*`, `servlet/*`, `web/*`, `DynmapMapCommands.java` | Later or out of scope for renderer Phase 0-13 |
| Platform adapters | `bukkit-helper/*`, `spigot/*`, `fabric/*`, `forge/*` | Study API boundaries; MC-Vector Java plugin is independent |

## Important scale evidence

At the pinned source, `IsoHDPerspective.java` is approximately 1,485 lines,
`TexturePack.java` approximately 3,552 lines, and `MapManager.java` approximately
1,958 lines. `CLAUDE.md` describes `DynmapCore.java` as a roughly 3,100-line
coordination hub. These sizes are evidence that the current few-hundred-line
bridge cannot itself reproduce Dynmap. The Java bridge is intentionally only a
telemetry adapter; the renderer belongs in Rust.

## Version policy

The first supported server fixture is Paper 1.21.10. Dynmap v3.0 is the
algorithm reference, not a claim that its old platform adapters can run on
Paper 1.21.x. Minecraft block assets are versioned separately and must be
validated against the exact server/client version.

## Open questions

- Which Dynmap renderer changes after this commit are required for the selected
  Paper 1.21.x asset format?
- Which client JAR/resource-pack versions can be legally accepted as user input?
- Which custom model renderers are needed before the golden image gate passes?
