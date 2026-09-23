# B-cuboid-renderer: Dynmap built-in renderer CuboidRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-cuboid-renderer",
  "kind": "builtin",
  "document": "phases/builtins/cuboid-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin CuboidRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/CuboidRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/cuboid-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-5f0fa4a1cc0a59af | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1382 |
| REG-1c863b3aa5e9c603 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1384 |
| REG-b8723affae7faad0 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1386 |
| REG-f1e81120bc236000 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1388 |
| REG-b7a0cada690561ba | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1418 |
| REG-0e3aa58a5a4a2bac | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1420 |
| REG-d5d439c72952b2c0 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1422 |
| REG-a462b6dae2c9b998 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1424 |
| REG-bcd914a1a0e90277 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1443 |
| REG-d5c3bf5a1848c70a | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1444 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-5f0fa4a1cc0a59af | DynmapCore/src/main/resources/models_1.txt:1382 | — | turtle_egg | 0, 1, 2 |  | cuboid0 |
| REG-1c863b3aa5e9c603 | DynmapCore/src/main/resources/models_1.txt:1384 | — | turtle_egg | 3, 4, 5 |  | cuboid0, cuboid1 |
| REG-b8723affae7faad0 | DynmapCore/src/main/resources/models_1.txt:1386 | — | turtle_egg | 6, 7, 8 |  | cuboid0, cuboid1, cuboid2 |
| REG-f1e81120bc236000 | DynmapCore/src/main/resources/models_1.txt:1388 | — | turtle_egg | 9, 10, 11 |  | cuboid0, cuboid1, cuboid2, cuboid3 |
| REG-b7a0cada690561ba | DynmapCore/src/main/resources/models_1.txt:1418 | — | sea_pickle | 0, 1 |  | cuboid0 |
| REG-0e3aa58a5a4a2bac | DynmapCore/src/main/resources/models_1.txt:1420 | — | sea_pickle | 2, 3 |  | cuboid0, cuboid1 |
| REG-d5d439c72952b2c0 | DynmapCore/src/main/resources/models_1.txt:1422 | — | sea_pickle | 4, 5 |  | cuboid0, cuboid1, cuboid2 |
| REG-a462b6dae2c9b998 | DynmapCore/src/main/resources/models_1.txt:1424 | — | sea_pickle | 6, 7 |  | cuboid0, cuboid1, cuboid2, cuboid3 |
| REG-bcd914a1a0e90277 | DynmapCore/src/main/resources/models_1.txt:1443 | — | white_banner, orange_banner, magenta_banner, light_blue_banner, yellow_banner, lime_banner, pink_banner, gray_banner, light_gray_banner, cyan_banner, purple_banner, blue_banner, brown_banner, green_banner, red_banner, black_banner | 0-15 |  | cuboid0, cuboid1, cuboid2, rotlist |
| REG-d5c3bf5a1848c70a | DynmapCore/src/main/resources/models_1.txt:1444 | — | white_wall_banner, orange_wall_banner, magenta_wall_banner, light_blue_wall_banner, yellow_wall_banner, lime_wall_banner, pink_wall_banner, gray_wall_banner, light_gray_wall_banner, cyan_wall_banner, purple_wall_banner, blue_wall_banner, brown_wall_banner, green_wall_banner, red_wall_banner, black_wall_banner | 0-3 |  | cuboid0, cuboid1, rotlist |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-5f0fa4a1cc0a59af | FIX-CASE-REG-5f0fa4a1cc0a59af | REF-CASE-REG-5f0fa4a1cc0a59af | TEST-CASE-REG-5f0fa4a1cc0a59af | EVID-CASE-REG-5f0fa4a1cc0a59af | DynmapCore/src/main/resources/models_1.txt:1382; guard=—; block=turtle_egg; data=0, 1, 2; state=; parameter keys=cuboid0 |
| CASE-REG-1c863b3aa5e9c603 | FIX-CASE-REG-1c863b3aa5e9c603 | REF-CASE-REG-1c863b3aa5e9c603 | TEST-CASE-REG-1c863b3aa5e9c603 | EVID-CASE-REG-1c863b3aa5e9c603 | DynmapCore/src/main/resources/models_1.txt:1384; guard=—; block=turtle_egg; data=3, 4, 5; state=; parameter keys=cuboid0, cuboid1 |
| CASE-REG-b8723affae7faad0 | FIX-CASE-REG-b8723affae7faad0 | REF-CASE-REG-b8723affae7faad0 | TEST-CASE-REG-b8723affae7faad0 | EVID-CASE-REG-b8723affae7faad0 | DynmapCore/src/main/resources/models_1.txt:1386; guard=—; block=turtle_egg; data=6, 7, 8; state=; parameter keys=cuboid0, cuboid1, cuboid2 |
| CASE-REG-f1e81120bc236000 | FIX-CASE-REG-f1e81120bc236000 | REF-CASE-REG-f1e81120bc236000 | TEST-CASE-REG-f1e81120bc236000 | EVID-CASE-REG-f1e81120bc236000 | DynmapCore/src/main/resources/models_1.txt:1388; guard=—; block=turtle_egg; data=9, 10, 11; state=; parameter keys=cuboid0, cuboid1, cuboid2, cuboid3 |
| CASE-REG-b7a0cada690561ba | FIX-CASE-REG-b7a0cada690561ba | REF-CASE-REG-b7a0cada690561ba | TEST-CASE-REG-b7a0cada690561ba | EVID-CASE-REG-b7a0cada690561ba | DynmapCore/src/main/resources/models_1.txt:1418; guard=—; block=sea_pickle; data=0, 1; state=; parameter keys=cuboid0 |
| CASE-REG-0e3aa58a5a4a2bac | FIX-CASE-REG-0e3aa58a5a4a2bac | REF-CASE-REG-0e3aa58a5a4a2bac | TEST-CASE-REG-0e3aa58a5a4a2bac | EVID-CASE-REG-0e3aa58a5a4a2bac | DynmapCore/src/main/resources/models_1.txt:1420; guard=—; block=sea_pickle; data=2, 3; state=; parameter keys=cuboid0, cuboid1 |
| CASE-REG-d5d439c72952b2c0 | FIX-CASE-REG-d5d439c72952b2c0 | REF-CASE-REG-d5d439c72952b2c0 | TEST-CASE-REG-d5d439c72952b2c0 | EVID-CASE-REG-d5d439c72952b2c0 | DynmapCore/src/main/resources/models_1.txt:1422; guard=—; block=sea_pickle; data=4, 5; state=; parameter keys=cuboid0, cuboid1, cuboid2 |
| CASE-REG-a462b6dae2c9b998 | FIX-CASE-REG-a462b6dae2c9b998 | REF-CASE-REG-a462b6dae2c9b998 | TEST-CASE-REG-a462b6dae2c9b998 | EVID-CASE-REG-a462b6dae2c9b998 | DynmapCore/src/main/resources/models_1.txt:1424; guard=—; block=sea_pickle; data=6, 7; state=; parameter keys=cuboid0, cuboid1, cuboid2, cuboid3 |
| CASE-REG-bcd914a1a0e90277 | FIX-CASE-REG-bcd914a1a0e90277 | REF-CASE-REG-bcd914a1a0e90277 | TEST-CASE-REG-bcd914a1a0e90277 | EVID-CASE-REG-bcd914a1a0e90277 | DynmapCore/src/main/resources/models_1.txt:1443; guard=—; block=white_banner, orange_banner, magenta_banner, light_blue_banner, yellow_banner, lime_banner, pink_banner, gray_banner, light_gray_banner, cyan_banner, purple_banner, blue_banner, brown_banner, green_banner, red_banner, black_banner; data=0-15; state=; parameter keys=cuboid0, cuboid1, cuboid2, rotlist |
| CASE-REG-d5c3bf5a1848c70a | FIX-CASE-REG-d5c3bf5a1848c70a | REF-CASE-REG-d5c3bf5a1848c70a | TEST-CASE-REG-d5c3bf5a1848c70a | EVID-CASE-REG-d5c3bf5a1848c70a | DynmapCore/src/main/resources/models_1.txt:1444; guard=—; block=white_wall_banner, orange_wall_banner, magenta_wall_banner, light_blue_wall_banner, yellow_wall_banner, lime_wall_banner, pink_wall_banner, gray_wall_banner, light_gray_wall_banner, cyan_wall_banner, purple_wall_banner, blue_wall_banner, brown_wall_banner, green_wall_banner, red_wall_banner, black_wall_banner; data=0-3; state=; parameter keys=cuboid0, cuboid1, rotlist |

### Exact implementation symbols

This file contributes 10 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.CuboidRenderer#crossedPatchDefault | field | `org.dynmap.hdmap.renderer.CuboidRenderer#crossedPatchDefault:int[]` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.CuboidRenderer#cuboidPatchDefault | field | `org.dynmap.hdmap.renderer.CuboidRenderer#cuboidPatchDefault:int[]` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.CuboidRenderer#models | field | `org.dynmap.hdmap.renderer.CuboidRenderer#models:RenderPatch[][]` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.CuboidRenderer#textureCount | field | `org.dynmap.hdmap.renderer.CuboidRenderer#textureCount:int` | 21–21 |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#clamp(double) | method | `org.dynmap.hdmap.renderer.CuboidRenderer#clamp(double)->double` | 26–30 |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.CuboidRenderer#getMaximumTextureCount()->int` | 116–119 |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.CuboidRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 121–125 |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 31–114 |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.CuboidRenderer#isOnlyBlockStateSensitive()->boolean` | 126–129 |
| type:org.dynmap.hdmap.renderer.CuboidRenderer | class | `org.dynmap.hdmap.renderer.CuboidRenderer` | 19–130 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#clamp(double) | `org.dynmap.hdmap.renderer.CuboidRenderer#clamp(double)->double` | 26–30 | FLOW-014d7096d3507255, FLOW-502b278282c29a21 |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 31–114 | FLOW-e5db8164044874d9, FLOW-4f0851608806ead5, FLOW-bc97bac673bb3045, FLOW-aa9d2a7016c588a9, FLOW-f7d5e074313ac19d, FLOW-ee99d9c2bc8e8661, FLOW-a4cff4fa49f95075, FLOW-dad6de5e4326b2be, FLOW-4dfef158c561066e, FLOW-1946c3d74f4640b3, FLOW-4a6a8413c84ffd52, FLOW-9b30f6d6d97b0c77, FLOW-25b01c6be4df5e6e, FLOW-7433ce2af501a0ca, FLOW-c1a97ae68fd109d0, FLOW-33667da1fb6f9dbb |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.CuboidRenderer#getMaximumTextureCount()->int` | 116–119 | none |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.CuboidRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 121–125 | none |
| method:type:org.dynmap.hdmap.renderer.CuboidRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.CuboidRenderer#isOnlyBlockStateSensitive()->boolean` | 126–129 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-014d7096d3507255 | `org.dynmap.hdmap.renderer.CuboidRenderer#clamp(double)->double` 27–27 | if | `(f < 0.0)` | CASE-FLOW-014d7096d3507255-true (condition evaluates true; fixture FIX-CASE-FLOW-014d7096d3507255-true; reference REF-CASE-FLOW-014d7096d3507255-true; test TEST-CASE-FLOW-014d7096d3507255-true; evidence plan EVID-CASE-FLOW-014d7096d3507255-true)<br>CASE-FLOW-014d7096d3507255-false (condition false; no else arm; fixture FIX-CASE-FLOW-014d7096d3507255-false; reference REF-CASE-FLOW-014d7096d3507255-false; test TEST-CASE-FLOW-014d7096d3507255-false; evidence plan EVID-CASE-FLOW-014d7096d3507255-false) |
| FLOW-502b278282c29a21 | `org.dynmap.hdmap.renderer.CuboidRenderer#clamp(double)->double` 28–28 | if | `(f > 1.0)` | CASE-FLOW-502b278282c29a21-true (condition evaluates true; fixture FIX-CASE-FLOW-502b278282c29a21-true; reference REF-CASE-FLOW-502b278282c29a21-true; test TEST-CASE-FLOW-502b278282c29a21-true; evidence plan EVID-CASE-FLOW-502b278282c29a21-true)<br>CASE-FLOW-502b278282c29a21-false (condition false; no else arm; fixture FIX-CASE-FLOW-502b278282c29a21-false; reference REF-CASE-FLOW-502b278282c29a21-false; test TEST-CASE-FLOW-502b278282c29a21-false; evidence plan EVID-CASE-FLOW-502b278282c29a21-false) |
| FLOW-e5db8164044874d9 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 33–34 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-e5db8164044874d9-true (condition evaluates true; fixture FIX-CASE-FLOW-e5db8164044874d9-true; reference REF-CASE-FLOW-e5db8164044874d9-true; test TEST-CASE-FLOW-e5db8164044874d9-true; evidence plan EVID-CASE-FLOW-e5db8164044874d9-true)<br>CASE-FLOW-e5db8164044874d9-false (condition false; no else arm; fixture FIX-CASE-FLOW-e5db8164044874d9-false; reference REF-CASE-FLOW-e5db8164044874d9-false; test TEST-CASE-FLOW-e5db8164044874d9-false; evidence plan EVID-CASE-FLOW-e5db8164044874d9-false) |
| FLOW-4f0851608806ead5 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 37–87 | enhanced_for_loop | `String key : custparm.keySet()` | CASE-FLOW-4f0851608806ead5-each_element (execute body once per iterable element; fixture FIX-CASE-FLOW-4f0851608806ead5-each_element; reference REF-CASE-FLOW-4f0851608806ead5-each_element; test TEST-CASE-FLOW-4f0851608806ead5-each_element; evidence plan EVID-CASE-FLOW-4f0851608806ead5-each_element)<br>CASE-FLOW-4f0851608806ead5-empty_or_exhausted (no remaining element; fixture FIX-CASE-FLOW-4f0851608806ead5-empty_or_exhausted; reference REF-CASE-FLOW-4f0851608806ead5-empty_or_exhausted; test TEST-CASE-FLOW-4f0851608806ead5-empty_or_exhausted; evidence plan EVID-CASE-FLOW-4f0851608806ead5-empty_or_exhausted) |
| FLOW-bc97bac673bb3045 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 39–86 | if | `(key.startsWith("cuboid") \|\| key.startsWith("cross"))` | CASE-FLOW-bc97bac673bb3045-true (condition evaluates true; fixture FIX-CASE-FLOW-bc97bac673bb3045-true; reference REF-CASE-FLOW-bc97bac673bb3045-true; test TEST-CASE-FLOW-bc97bac673bb3045-true; evidence plan EVID-CASE-FLOW-bc97bac673bb3045-true)<br>CASE-FLOW-bc97bac673bb3045-false (condition false; no else arm; fixture FIX-CASE-FLOW-bc97bac673bb3045-false; reference REF-CASE-FLOW-bc97bac673bb3045-false; test TEST-CASE-FLOW-bc97bac673bb3045-false; evidence plan EVID-CASE-FLOW-bc97bac673bb3045-false) |
| FLOW-aa9d2a7016c588a9 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 42–45 | if | `(toks.length < 2)` | CASE-FLOW-aa9d2a7016c588a9-true (condition evaluates true; fixture FIX-CASE-FLOW-aa9d2a7016c588a9-true; reference REF-CASE-FLOW-aa9d2a7016c588a9-true; test TEST-CASE-FLOW-aa9d2a7016c588a9-true; evidence plan EVID-CASE-FLOW-aa9d2a7016c588a9-true)<br>CASE-FLOW-aa9d2a7016c588a9-false (condition false; no else arm; fixture FIX-CASE-FLOW-aa9d2a7016c588a9-false; reference REF-CASE-FLOW-aa9d2a7016c588a9-false; test TEST-CASE-FLOW-aa9d2a7016c588a9-false; evidence plan EVID-CASE-FLOW-aa9d2a7016c588a9-false) |
| FLOW-f7d5e074313ac19d | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 48–51 | if | `((mins.length < 3) \|\| (maxs.length < 3))` | CASE-FLOW-f7d5e074313ac19d-true (condition evaluates true; fixture FIX-CASE-FLOW-f7d5e074313ac19d-true; reference REF-CASE-FLOW-f7d5e074313ac19d-true; test TEST-CASE-FLOW-f7d5e074313ac19d-true; evidence plan EVID-CASE-FLOW-f7d5e074313ac19d-true)<br>CASE-FLOW-f7d5e074313ac19d-false (condition false; no else arm; fixture FIX-CASE-FLOW-f7d5e074313ac19d-false; reference REF-CASE-FLOW-f7d5e074313ac19d-false; test TEST-CASE-FLOW-f7d5e074313ac19d-false; evidence plan EVID-CASE-FLOW-f7d5e074313ac19d-false) |
| FLOW-ee99d9c2bc8e8661 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 59–59 | conditional_expression | `(isCrossed)` | CASE-FLOW-ee99d9c2bc8e8661-true (condition evaluates true; fixture FIX-CASE-FLOW-ee99d9c2bc8e8661-true; reference REF-CASE-FLOW-ee99d9c2bc8e8661-true; test TEST-CASE-FLOW-ee99d9c2bc8e8661-true; evidence plan EVID-CASE-FLOW-ee99d9c2bc8e8661-true)<br>CASE-FLOW-ee99d9c2bc8e8661-false (condition evaluates false; fixture FIX-CASE-FLOW-ee99d9c2bc8e8661-false; reference REF-CASE-FLOW-ee99d9c2bc8e8661-false; test TEST-CASE-FLOW-ee99d9c2bc8e8661-false; evidence plan EVID-CASE-FLOW-ee99d9c2bc8e8661-false) |
| FLOW-a4cff4fa49f95075 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 60–74 | if | `(toks.length > 2)` | CASE-FLOW-a4cff4fa49f95075-true (condition evaluates true; fixture FIX-CASE-FLOW-a4cff4fa49f95075-true; reference REF-CASE-FLOW-a4cff4fa49f95075-true; test TEST-CASE-FLOW-a4cff4fa49f95075-true; evidence plan EVID-CASE-FLOW-a4cff4fa49f95075-true)<br>CASE-FLOW-a4cff4fa49f95075-false (condition false; no else arm; fixture FIX-CASE-FLOW-a4cff4fa49f95075-false; reference REF-CASE-FLOW-a4cff4fa49f95075-false; test TEST-CASE-FLOW-a4cff4fa49f95075-false; evidence plan EVID-CASE-FLOW-a4cff4fa49f95075-false) |
| FLOW-dad6de5e4326b2be | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 61–61 | conditional_expression | `isCrossed` | CASE-FLOW-dad6de5e4326b2be-true (condition evaluates true; fixture FIX-CASE-FLOW-dad6de5e4326b2be-true; reference REF-CASE-FLOW-dad6de5e4326b2be-true; test TEST-CASE-FLOW-dad6de5e4326b2be-true; evidence plan EVID-CASE-FLOW-dad6de5e4326b2be-true)<br>CASE-FLOW-dad6de5e4326b2be-false (condition evaluates false; fixture FIX-CASE-FLOW-dad6de5e4326b2be-false; reference REF-CASE-FLOW-dad6de5e4326b2be-false; test TEST-CASE-FLOW-dad6de5e4326b2be-false; evidence plan EVID-CASE-FLOW-dad6de5e4326b2be-false) |
| FLOW-4dfef158c561066e | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 63–73 | for_loop | `j < patches.length` | CASE-FLOW-4dfef158c561066e-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-4dfef158c561066e-iterate; reference REF-CASE-FLOW-4dfef158c561066e-iterate; test TEST-CASE-FLOW-4dfef158c561066e-iterate; evidence plan EVID-CASE-FLOW-4dfef158c561066e-iterate)<br>CASE-FLOW-4dfef158c561066e-exit (condition is false; fixture FIX-CASE-FLOW-4dfef158c561066e-exit; reference REF-CASE-FLOW-4dfef158c561066e-exit; test TEST-CASE-FLOW-4dfef158c561066e-exit; evidence plan EVID-CASE-FLOW-4dfef158c561066e-exit) |
| FLOW-1946c3d74f4640b3 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 64–69 | if | `(j >= pidx.length)` | CASE-FLOW-1946c3d74f4640b3-true (condition evaluates true; fixture FIX-CASE-FLOW-1946c3d74f4640b3-true; reference REF-CASE-FLOW-1946c3d74f4640b3-true; test TEST-CASE-FLOW-1946c3d74f4640b3-true; evidence plan EVID-CASE-FLOW-1946c3d74f4640b3-true)<br>CASE-FLOW-1946c3d74f4640b3-false (condition evaluates false; fixture FIX-CASE-FLOW-1946c3d74f4640b3-false; reference REF-CASE-FLOW-1946c3d74f4640b3-false; test TEST-CASE-FLOW-1946c3d74f4640b3-false; evidence plan EVID-CASE-FLOW-1946c3d74f4640b3-false) |
| FLOW-4a6a8413c84ffd52 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 70–72 | if | `(patches[j] >= textureCount)` | CASE-FLOW-4a6a8413c84ffd52-true (condition evaluates true; fixture FIX-CASE-FLOW-4a6a8413c84ffd52-true; reference REF-CASE-FLOW-4a6a8413c84ffd52-true; test TEST-CASE-FLOW-4a6a8413c84ffd52-true; evidence plan EVID-CASE-FLOW-4a6a8413c84ffd52-true)<br>CASE-FLOW-4a6a8413c84ffd52-false (condition false; no else arm; fixture FIX-CASE-FLOW-4a6a8413c84ffd52-false; reference REF-CASE-FLOW-4a6a8413c84ffd52-false; test TEST-CASE-FLOW-4a6a8413c84ffd52-false; evidence plan EVID-CASE-FLOW-4a6a8413c84ffd52-false) |
| FLOW-9b30f6d6d97b0c77 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 76–85 | if | `(isCrossed)` | CASE-FLOW-9b30f6d6d97b0c77-true (condition evaluates true; fixture FIX-CASE-FLOW-9b30f6d6d97b0c77-true; reference REF-CASE-FLOW-9b30f6d6d97b0c77-true; test TEST-CASE-FLOW-9b30f6d6d97b0c77-true; evidence plan EVID-CASE-FLOW-9b30f6d6d97b0c77-true)<br>CASE-FLOW-9b30f6d6d97b0c77-false (condition evaluates false; fixture FIX-CASE-FLOW-9b30f6d6d97b0c77-false; reference REF-CASE-FLOW-9b30f6d6d97b0c77-false; test TEST-CASE-FLOW-9b30f6d6d97b0c77-false; evidence plan EVID-CASE-FLOW-9b30f6d6d97b0c77-false) |
| FLOW-25b01c6be4df5e6e | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 91–111 | if | `(rotlist != null)` | CASE-FLOW-25b01c6be4df5e6e-true (condition evaluates true; fixture FIX-CASE-FLOW-25b01c6be4df5e6e-true; reference REF-CASE-FLOW-25b01c6be4df5e6e-true; test TEST-CASE-FLOW-25b01c6be4df5e6e-true; evidence plan EVID-CASE-FLOW-25b01c6be4df5e6e-true)<br>CASE-FLOW-25b01c6be4df5e6e-false (condition evaluates false; fixture FIX-CASE-FLOW-25b01c6be4df5e6e-false; reference REF-CASE-FLOW-25b01c6be4df5e6e-false; test TEST-CASE-FLOW-25b01c6be4df5e6e-false; evidence plan EVID-CASE-FLOW-25b01c6be4df5e6e-false) |
| FLOW-7433ce2af501a0ca | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 94–106 | for_loop | `idx < pidx.length` | CASE-FLOW-7433ce2af501a0ca-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-7433ce2af501a0ca-iterate; reference REF-CASE-FLOW-7433ce2af501a0ca-iterate; test TEST-CASE-FLOW-7433ce2af501a0ca-iterate; evidence plan EVID-CASE-FLOW-7433ce2af501a0ca-iterate)<br>CASE-FLOW-7433ce2af501a0ca-exit (condition is false; fixture FIX-CASE-FLOW-7433ce2af501a0ca-exit; reference REF-CASE-FLOW-7433ce2af501a0ca-exit; test TEST-CASE-FLOW-7433ce2af501a0ca-exit; evidence plan EVID-CASE-FLOW-7433ce2af501a0ca-exit) |
| FLOW-c1a97ae68fd109d0 | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 98–105 | if | `(rot != 0)` | CASE-FLOW-c1a97ae68fd109d0-true (condition evaluates true; fixture FIX-CASE-FLOW-c1a97ae68fd109d0-true; reference REF-CASE-FLOW-c1a97ae68fd109d0-true; test TEST-CASE-FLOW-c1a97ae68fd109d0-true; evidence plan EVID-CASE-FLOW-c1a97ae68fd109d0-true)<br>CASE-FLOW-c1a97ae68fd109d0-false (condition evaluates false; fixture FIX-CASE-FLOW-c1a97ae68fd109d0-false; reference REF-CASE-FLOW-c1a97ae68fd109d0-false; test TEST-CASE-FLOW-c1a97ae68fd109d0-false; evidence plan EVID-CASE-FLOW-c1a97ae68fd109d0-false) |
| FLOW-33667da1fb6f9dbb | `org.dynmap.hdmap.renderer.CuboidRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 99–101 | for_loop | `i < model.length` | CASE-FLOW-33667da1fb6f9dbb-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-33667da1fb6f9dbb-iterate; reference REF-CASE-FLOW-33667da1fb6f9dbb-iterate; test TEST-CASE-FLOW-33667da1fb6f9dbb-iterate; evidence plan EVID-CASE-FLOW-33667da1fb6f9dbb-iterate)<br>CASE-FLOW-33667da1fb6f9dbb-exit (condition is false; fixture FIX-CASE-FLOW-33667da1fb6f9dbb-exit; reference REF-CASE-FLOW-33667da1fb6f9dbb-exit; test TEST-CASE-FLOW-33667da1fb6f9dbb-exit; evidence plan EVID-CASE-FLOW-33667da1fb6f9dbb-exit) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins CuboidRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer CuboidRenderer --fixture-set cuboid-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer CuboidRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin CuboidRenderer
```
