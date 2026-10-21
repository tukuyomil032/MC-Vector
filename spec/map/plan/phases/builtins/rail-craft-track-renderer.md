# B-rail-craft-track-renderer: Dynmap built-in renderer RailCraftTrackRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-rail-craft-track-renderer",
  "kind": "builtin",
  "document": "phases/builtins/rail-craft-track-renderer.md",
  "dependsOn": [
    "P-000",
    "P-004",
    "P-006",
    "P-009",
    "P-010",
    "P-011",
    "P-012",
    "P-013",
    "P-014",
    "P-015",
    "P-016",
    "P-017",
    "P-018",
    "P-019",
    "P-020"
  ],
  "commitMessage": "feat: port dynmap builtin RailCraftTrackRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RailCraftTrackRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/rail-craft-track-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-71ee223680f79288 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:34 |
| REG-9090ddff4b4f69ff | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:35 |
| REG-c38e4d3b8bfda5d5 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:36 |
| REG-277a6f58190ff48d | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:37 |
| REG-a584b8be76c3f9de | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:38 |
| REG-52d222f559892837 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:39 |
| REG-d3392e3f69c80916 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:40 |
| REG-1860b1a630710bc6 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:41 |
| REG-7ea19cd19f3108ac | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:42 |
| REG-46f39ecb460a3544 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:43 |
| REG-9ca677143d76d864 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:44 |
| REG-7d2e4e969f2ef266 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:45 |
| REG-60a282c0107fcd0e | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:46 |
| REG-cf23d31c2dd552d0 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:47 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-71ee223680f79288 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:34 | — | %tile.railcraft.track | 0 |  | maxTrackId, patch |
| REG-9090ddff4b4f69ff | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:35 | — | %tile.railcraft.track | 1 |  | maxTrackId, patch |
| REG-c38e4d3b8bfda5d5 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:36 | — | %tile.railcraft.track | 2 |  | maxTrackId, patch |
| REG-277a6f58190ff48d | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:37 | — | %tile.railcraft.track | 3 |  | maxTrackId, patch |
| REG-a584b8be76c3f9de | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:38 | — | %tile.railcraft.track | 4 |  | maxTrackId, patch |
| REG-52d222f559892837 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:39 | — | %tile.railcraft.track | 5 |  | maxTrackId, patch |
| REG-d3392e3f69c80916 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:40 | — | %tile.railcraft.track | 6 |  | maxTrackId, patch |
| REG-1860b1a630710bc6 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:41 | — | %tile.railcraft.track | 7 |  | maxTrackId, patch |
| REG-7ea19cd19f3108ac | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:42 | — | %tile.railcraft.track | 8 |  | maxTrackId, patch |
| REG-46f39ecb460a3544 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:43 | — | %tile.railcraft.track | 9 |  | maxTrackId, patch |
| REG-9ca677143d76d864 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:44 | — | %tile.railcraft.track | 10 |  | maxTrackId, patch |
| REG-7d2e4e969f2ef266 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:45 | — | %tile.railcraft.track | 11 |  | maxTrackId, patch |
| REG-60a282c0107fcd0e | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:46 | — | %tile.railcraft.track | 12 |  | maxTrackId, patch |
| REG-cf23d31c2dd552d0 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:47 | — | %tile.railcraft.track | 13 |  | maxTrackId, patch |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-71ee223680f79288 | FIX-CASE-REG-71ee223680f79288 | REF-CASE-REG-71ee223680f79288 | TEST-CASE-REG-71ee223680f79288 | EVID-CASE-REG-71ee223680f79288 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:34; guard=—; block=%tile.railcraft.track; data=0; state=; parameter keys=maxTrackId, patch |
| CASE-REG-9090ddff4b4f69ff | FIX-CASE-REG-9090ddff4b4f69ff | REF-CASE-REG-9090ddff4b4f69ff | TEST-CASE-REG-9090ddff4b4f69ff | EVID-CASE-REG-9090ddff4b4f69ff | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:35; guard=—; block=%tile.railcraft.track; data=1; state=; parameter keys=maxTrackId, patch |
| CASE-REG-c38e4d3b8bfda5d5 | FIX-CASE-REG-c38e4d3b8bfda5d5 | REF-CASE-REG-c38e4d3b8bfda5d5 | TEST-CASE-REG-c38e4d3b8bfda5d5 | EVID-CASE-REG-c38e4d3b8bfda5d5 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:36; guard=—; block=%tile.railcraft.track; data=2; state=; parameter keys=maxTrackId, patch |
| CASE-REG-277a6f58190ff48d | FIX-CASE-REG-277a6f58190ff48d | REF-CASE-REG-277a6f58190ff48d | TEST-CASE-REG-277a6f58190ff48d | EVID-CASE-REG-277a6f58190ff48d | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:37; guard=—; block=%tile.railcraft.track; data=3; state=; parameter keys=maxTrackId, patch |
| CASE-REG-a584b8be76c3f9de | FIX-CASE-REG-a584b8be76c3f9de | REF-CASE-REG-a584b8be76c3f9de | TEST-CASE-REG-a584b8be76c3f9de | EVID-CASE-REG-a584b8be76c3f9de | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:38; guard=—; block=%tile.railcraft.track; data=4; state=; parameter keys=maxTrackId, patch |
| CASE-REG-52d222f559892837 | FIX-CASE-REG-52d222f559892837 | REF-CASE-REG-52d222f559892837 | TEST-CASE-REG-52d222f559892837 | EVID-CASE-REG-52d222f559892837 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:39; guard=—; block=%tile.railcraft.track; data=5; state=; parameter keys=maxTrackId, patch |
| CASE-REG-d3392e3f69c80916 | FIX-CASE-REG-d3392e3f69c80916 | REF-CASE-REG-d3392e3f69c80916 | TEST-CASE-REG-d3392e3f69c80916 | EVID-CASE-REG-d3392e3f69c80916 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:40; guard=—; block=%tile.railcraft.track; data=6; state=; parameter keys=maxTrackId, patch |
| CASE-REG-1860b1a630710bc6 | FIX-CASE-REG-1860b1a630710bc6 | REF-CASE-REG-1860b1a630710bc6 | TEST-CASE-REG-1860b1a630710bc6 | EVID-CASE-REG-1860b1a630710bc6 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:41; guard=—; block=%tile.railcraft.track; data=7; state=; parameter keys=maxTrackId, patch |
| CASE-REG-7ea19cd19f3108ac | FIX-CASE-REG-7ea19cd19f3108ac | REF-CASE-REG-7ea19cd19f3108ac | TEST-CASE-REG-7ea19cd19f3108ac | EVID-CASE-REG-7ea19cd19f3108ac | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:42; guard=—; block=%tile.railcraft.track; data=8; state=; parameter keys=maxTrackId, patch |
| CASE-REG-46f39ecb460a3544 | FIX-CASE-REG-46f39ecb460a3544 | REF-CASE-REG-46f39ecb460a3544 | TEST-CASE-REG-46f39ecb460a3544 | EVID-CASE-REG-46f39ecb460a3544 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:43; guard=—; block=%tile.railcraft.track; data=9; state=; parameter keys=maxTrackId, patch |
| CASE-REG-9ca677143d76d864 | FIX-CASE-REG-9ca677143d76d864 | REF-CASE-REG-9ca677143d76d864 | TEST-CASE-REG-9ca677143d76d864 | EVID-CASE-REG-9ca677143d76d864 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:44; guard=—; block=%tile.railcraft.track; data=10; state=; parameter keys=maxTrackId, patch |
| CASE-REG-7d2e4e969f2ef266 | FIX-CASE-REG-7d2e4e969f2ef266 | REF-CASE-REG-7d2e4e969f2ef266 | TEST-CASE-REG-7d2e4e969f2ef266 | EVID-CASE-REG-7d2e4e969f2ef266 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:45; guard=—; block=%tile.railcraft.track; data=11; state=; parameter keys=maxTrackId, patch |
| CASE-REG-60a282c0107fcd0e | FIX-CASE-REG-60a282c0107fcd0e | REF-CASE-REG-60a282c0107fcd0e | TEST-CASE-REG-60a282c0107fcd0e | EVID-CASE-REG-60a282c0107fcd0e | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:46; guard=—; block=%tile.railcraft.track; data=12; state=; parameter keys=maxTrackId, patch |
| CASE-REG-cf23d31c2dd552d0 | FIX-CASE-REG-cf23d31c2dd552d0 | REF-CASE-REG-cf23d31c2dd552d0 | TEST-CASE-REG-cf23d31c2dd552d0 | EVID-CASE-REG-cf23d31c2dd552d0 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:47; guard=—; block=%tile.railcraft.track; data=13; state=; parameter keys=maxTrackId, patch |

### Exact implementation symbols

This file contributes 8 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#basepatches | field | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#basepatches:RenderPatch[][]` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#maxTrackId | field | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#maxTrackId:int` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#tileEntityAttribs | field | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#tileEntityAttribs:String[]` | 13–13 |
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getMaximumTextureCount()->int` | 49–52 |
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 59–72 |
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getTileEntityFieldsNeeded()->String[]` | 54–57 |
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 19–47 |
| type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer | class | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer` | 12–73 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 19–47 | FLOW-f56eff2d88a95762, FLOW-9cb02b7255a8dcfe, FLOW-42441ac78803e8b6, FLOW-15217577d335efd8, FLOW-3a767bc2faba3a19 |
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getMaximumTextureCount()->int` | 49–52 | none |
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getTileEntityFieldsNeeded()->String[]` | 54–57 | none |
| method:type:org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 59–72 | FLOW-ff427f2ce3d423e3, FLOW-06599339281b5432 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-f56eff2d88a95762 | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 21–22 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-f56eff2d88a95762-true (condition evaluates true; fixture FIX-CASE-FLOW-f56eff2d88a95762-true; reference REF-CASE-FLOW-f56eff2d88a95762-true; test TEST-CASE-FLOW-f56eff2d88a95762-true; evidence plan EVID-CASE-FLOW-f56eff2d88a95762-true)<br>CASE-FLOW-f56eff2d88a95762-false (condition false; no else arm; fixture FIX-CASE-FLOW-f56eff2d88a95762-false; reference REF-CASE-FLOW-f56eff2d88a95762-false; test TEST-CASE-FLOW-f56eff2d88a95762-false; evidence plan EVID-CASE-FLOW-f56eff2d88a95762-false) |
| FLOW-9cb02b7255a8dcfe | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 25–30 | if | `(cnt != null)` | CASE-FLOW-9cb02b7255a8dcfe-true (condition evaluates true; fixture FIX-CASE-FLOW-9cb02b7255a8dcfe-true; reference REF-CASE-FLOW-9cb02b7255a8dcfe-true; test TEST-CASE-FLOW-9cb02b7255a8dcfe-true; evidence plan EVID-CASE-FLOW-9cb02b7255a8dcfe-true)<br>CASE-FLOW-9cb02b7255a8dcfe-false (condition evaluates false; fixture FIX-CASE-FLOW-9cb02b7255a8dcfe-false; reference REF-CASE-FLOW-9cb02b7255a8dcfe-false; test TEST-CASE-FLOW-9cb02b7255a8dcfe-false; evidence plan EVID-CASE-FLOW-9cb02b7255a8dcfe-false) |
| FLOW-42441ac78803e8b6 | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 32–35 | if | `(patchid == null)` | CASE-FLOW-42441ac78803e8b6-true (condition evaluates true; fixture FIX-CASE-FLOW-42441ac78803e8b6-true; reference REF-CASE-FLOW-42441ac78803e8b6-true; test TEST-CASE-FLOW-42441ac78803e8b6-true; evidence plan EVID-CASE-FLOW-42441ac78803e8b6-true)<br>CASE-FLOW-42441ac78803e8b6-false (condition false; no else arm; fixture FIX-CASE-FLOW-42441ac78803e8b6-false; reference REF-CASE-FLOW-42441ac78803e8b6-false; test TEST-CASE-FLOW-42441ac78803e8b6-false; evidence plan EVID-CASE-FLOW-42441ac78803e8b6-false) |
| FLOW-15217577d335efd8 | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 38–41 | if | `(basepatches[0][0] == null)` | CASE-FLOW-15217577d335efd8-true (condition evaluates true; fixture FIX-CASE-FLOW-15217577d335efd8-true; reference REF-CASE-FLOW-15217577d335efd8-true; test TEST-CASE-FLOW-15217577d335efd8-true; evidence plan EVID-CASE-FLOW-15217577d335efd8-true)<br>CASE-FLOW-15217577d335efd8-false (condition false; no else arm; fixture FIX-CASE-FLOW-15217577d335efd8-false; reference REF-CASE-FLOW-15217577d335efd8-false; test TEST-CASE-FLOW-15217577d335efd8-false; evidence plan EVID-CASE-FLOW-15217577d335efd8-false) |
| FLOW-3a767bc2faba3a19 | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 42–44 | for_loop | `i <= maxTrackId` | CASE-FLOW-3a767bc2faba3a19-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-3a767bc2faba3a19-iterate; reference REF-CASE-FLOW-3a767bc2faba3a19-iterate; test TEST-CASE-FLOW-3a767bc2faba3a19-iterate; evidence plan EVID-CASE-FLOW-3a767bc2faba3a19-iterate)<br>CASE-FLOW-3a767bc2faba3a19-exit (condition is false; fixture FIX-CASE-FLOW-3a767bc2faba3a19-exit; reference REF-CASE-FLOW-3a767bc2faba3a19-exit; test TEST-CASE-FLOW-3a767bc2faba3a19-exit; evidence plan EVID-CASE-FLOW-3a767bc2faba3a19-exit) |
| FLOW-ff427f2ce3d423e3 | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 63–65 | if | `(idxv instanceof Number)` | CASE-FLOW-ff427f2ce3d423e3-true (condition evaluates true; fixture FIX-CASE-FLOW-ff427f2ce3d423e3-true; reference REF-CASE-FLOW-ff427f2ce3d423e3-true; test TEST-CASE-FLOW-ff427f2ce3d423e3-true; evidence plan EVID-CASE-FLOW-ff427f2ce3d423e3-true)<br>CASE-FLOW-ff427f2ce3d423e3-false (condition false; no else arm; fixture FIX-CASE-FLOW-ff427f2ce3d423e3-false; reference REF-CASE-FLOW-ff427f2ce3d423e3-false; test TEST-CASE-FLOW-ff427f2ce3d423e3-false; evidence plan EVID-CASE-FLOW-ff427f2ce3d423e3-false) |
| FLOW-06599339281b5432 | `org.dynmap.hdmap.renderer.RailCraftTrackRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 67–69 | if | `(trackId > maxTrackId)` | CASE-FLOW-06599339281b5432-true (condition evaluates true; fixture FIX-CASE-FLOW-06599339281b5432-true; reference REF-CASE-FLOW-06599339281b5432-true; test TEST-CASE-FLOW-06599339281b5432-true; evidence plan EVID-CASE-FLOW-06599339281b5432-true)<br>CASE-FLOW-06599339281b5432-false (condition false; no else arm; fixture FIX-CASE-FLOW-06599339281b5432-false; reference REF-CASE-FLOW-06599339281b5432-false; test TEST-CASE-FLOW-06599339281b5432-false; evidence plan EVID-CASE-FLOW-06599339281b5432-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins RailCraftTrackRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer RailCraftTrackRenderer --fixture-set rail-craft-track-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer RailCraftTrackRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin RailCraftTrackRenderer
```
