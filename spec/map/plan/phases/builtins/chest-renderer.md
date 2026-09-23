# B-chest-renderer: Dynmap built-in renderer ChestRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-chest-renderer",
  "kind": "builtin",
  "document": "phases/builtins/chest-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin ChestRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ChestRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/chest-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-fc4ec5fa040578c3 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:909 |
| REG-6ba7bc9096d0cde8 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:949 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-fc4ec5fa040578c3 | DynmapCore/src/main/resources/models_0.txt:909 | — | chest, trapped_chest | * |  |  |
| REG-6ba7bc9096d0cde8 | DynmapCore/src/main/resources/models_0.txt:949 | — | ender_chest | * |  | doublechest |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-fc4ec5fa040578c3 | FIX-CASE-REG-fc4ec5fa040578c3 | REF-CASE-REG-fc4ec5fa040578c3 | TEST-CASE-REG-fc4ec5fa040578c3 | EVID-CASE-REG-fc4ec5fa040578c3 | DynmapCore/src/main/resources/models_0.txt:909; guard=—; block=chest, trapped_chest; data=*; state=; parameter keys= |
| CASE-REG-6ba7bc9096d0cde8 | FIX-CASE-REG-6ba7bc9096d0cde8 | REF-CASE-REG-6ba7bc9096d0cde8 | TEST-CASE-REG-6ba7bc9096d0cde8 | EVID-CASE-REG-6ba7bc9096d0cde8 | DynmapCore/src/main/resources/models_0.txt:949; guard=—; block=ender_chest; data=*; state=; parameter keys=doublechest |

### Exact implementation symbols

This file contributes 25 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_EAST | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_EAST:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_NORTH | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_NORTH:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_SOUTH | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_SOUTH:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_WEST | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#LEFT_WEST:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_EAST | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_EAST:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_NORTH | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_NORTH:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_SOUTH | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_SOUTH:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_WEST | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#RIGHT_WEST:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_EAST | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_EAST:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_NORTH | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_NORTH:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_SOUTH | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_SOUTH:ChestData` | 18–18 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_WEST | enum_constant | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData#SINGLE_WEST:ChestData` | 18–18 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#LEFT_PATCHES | field | `org.dynmap.hdmap.renderer.ChestRenderer#LEFT_PATCHES:int[]` | 28–28 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#OFF1 | field | `org.dynmap.hdmap.renderer.ChestRenderer#OFF1:double` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#OFF14 | field | `org.dynmap.hdmap.renderer.ChestRenderer#OFF14:double` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#OFF15 | field | `org.dynmap.hdmap.renderer.ChestRenderer#OFF15:double` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#RIGHT_PATCHES | field | `org.dynmap.hdmap.renderer.ChestRenderer#RIGHT_PATCHES:int[]` | 29–29 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#SINGLE_PATCHES | field | `org.dynmap.hdmap.renderer.ChestRenderer#SINGLE_PATCHES:int[]` | 27–27 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#double_chest | field | `org.dynmap.hdmap.renderer.ChestRenderer#double_chest:boolean` | 31–31 |
| field:type:org.dynmap.hdmap.renderer.ChestRenderer#models | field | `org.dynmap.hdmap.renderer.ChestRenderer#models:RenderPatch[][]` | 21–21 |
| method:type:org.dynmap.hdmap.renderer.ChestRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.ChestRenderer#getMaximumTextureCount()->int` | 84–92 |
| method:type:org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 94–150 |
| method:type:org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 32–82 |
| type:org.dynmap.hdmap.renderer.ChestRenderer | class | `org.dynmap.hdmap.renderer.ChestRenderer` | 16–151 |
| type:org.dynmap.hdmap.renderer.ChestRenderer$ChestData | enum | `org.dynmap.hdmap.renderer.ChestRenderer$ChestData` | 17–19 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 32–82 | FLOW-7a622c303ae48b99, FLOW-f3715d90abd2dc77, FLOW-daa840ad9ed87081, FLOW-a71c6f8183fd1bb4, FLOW-65c7dbdf0de551be |
| method:type:org.dynmap.hdmap.renderer.ChestRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.ChestRenderer#getMaximumTextureCount()->int` | 84–92 | FLOW-107b888c85ee99a2 |
| method:type:org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 94–150 | FLOW-ae4499855800362e, FLOW-2cb6e94183696228, FLOW-cc7ff519305c653a, FLOW-385a8dec98da229c, FLOW-35ee23e39c9a4675, FLOW-ce815b59d0c91d9a, FLOW-0aa3dc9dc7910929, FLOW-4dc73bea247b29f3, FLOW-c027deaa88858bd6, FLOW-5561576a5691f125 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-7a622c303ae48b99 | `org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 34–35 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-7a622c303ae48b99-true (condition evaluates true; fixture FIX-CASE-FLOW-7a622c303ae48b99-true; reference REF-CASE-FLOW-7a622c303ae48b99-true; test TEST-CASE-FLOW-7a622c303ae48b99-true; evidence plan EVID-CASE-FLOW-7a622c303ae48b99-true)<br>CASE-FLOW-7a622c303ae48b99-false (condition false; no else arm; fixture FIX-CASE-FLOW-7a622c303ae48b99-false; reference REF-CASE-FLOW-7a622c303ae48b99-false; test TEST-CASE-FLOW-7a622c303ae48b99-false; evidence plan EVID-CASE-FLOW-7a622c303ae48b99-false) |
| FLOW-f3715d90abd2dc77 | `org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 47–51 | for_loop | `i < 6` | CASE-FLOW-f3715d90abd2dc77-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-f3715d90abd2dc77-iterate; reference REF-CASE-FLOW-f3715d90abd2dc77-iterate; test TEST-CASE-FLOW-f3715d90abd2dc77-iterate; evidence plan EVID-CASE-FLOW-f3715d90abd2dc77-iterate)<br>CASE-FLOW-f3715d90abd2dc77-exit (condition is false; fixture FIX-CASE-FLOW-f3715d90abd2dc77-exit; reference REF-CASE-FLOW-f3715d90abd2dc77-exit; test TEST-CASE-FLOW-f3715d90abd2dc77-exit; evidence plan EVID-CASE-FLOW-f3715d90abd2dc77-exit) |
| FLOW-daa840ad9ed87081 | `org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 52–79 | if | `(double_chest)` | CASE-FLOW-daa840ad9ed87081-true (condition evaluates true; fixture FIX-CASE-FLOW-daa840ad9ed87081-true; reference REF-CASE-FLOW-daa840ad9ed87081-true; test TEST-CASE-FLOW-daa840ad9ed87081-true; evidence plan EVID-CASE-FLOW-daa840ad9ed87081-true)<br>CASE-FLOW-daa840ad9ed87081-false (condition false; no else arm; fixture FIX-CASE-FLOW-daa840ad9ed87081-false; reference REF-CASE-FLOW-daa840ad9ed87081-false; test TEST-CASE-FLOW-daa840ad9ed87081-false; evidence plan EVID-CASE-FLOW-daa840ad9ed87081-false) |
| FLOW-a71c6f8183fd1bb4 | `org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 61–65 | for_loop | `i < 6` | CASE-FLOW-a71c6f8183fd1bb4-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-a71c6f8183fd1bb4-iterate; reference REF-CASE-FLOW-a71c6f8183fd1bb4-iterate; test TEST-CASE-FLOW-a71c6f8183fd1bb4-iterate; evidence plan EVID-CASE-FLOW-a71c6f8183fd1bb4-iterate)<br>CASE-FLOW-a71c6f8183fd1bb4-exit (condition is false; fixture FIX-CASE-FLOW-a71c6f8183fd1bb4-exit; reference REF-CASE-FLOW-a71c6f8183fd1bb4-exit; test TEST-CASE-FLOW-a71c6f8183fd1bb4-exit; evidence plan EVID-CASE-FLOW-a71c6f8183fd1bb4-exit) |
| FLOW-65c7dbdf0de551be | `org.dynmap.hdmap.renderer.ChestRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 74–78 | for_loop | `i < 6` | CASE-FLOW-65c7dbdf0de551be-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-65c7dbdf0de551be-iterate; reference REF-CASE-FLOW-65c7dbdf0de551be-iterate; test TEST-CASE-FLOW-65c7dbdf0de551be-iterate; evidence plan EVID-CASE-FLOW-65c7dbdf0de551be-iterate)<br>CASE-FLOW-65c7dbdf0de551be-exit (condition is false; fixture FIX-CASE-FLOW-65c7dbdf0de551be-exit; reference REF-CASE-FLOW-65c7dbdf0de551be-exit; test TEST-CASE-FLOW-65c7dbdf0de551be-exit; evidence plan EVID-CASE-FLOW-65c7dbdf0de551be-exit) |
| FLOW-107b888c85ee99a2 | `org.dynmap.hdmap.renderer.ChestRenderer#getMaximumTextureCount()->int` 86–91 | if | `(double_chest)` | CASE-FLOW-107b888c85ee99a2-true (condition evaluates true; fixture FIX-CASE-FLOW-107b888c85ee99a2-true; reference REF-CASE-FLOW-107b888c85ee99a2-true; test TEST-CASE-FLOW-107b888c85ee99a2-true; evidence plan EVID-CASE-FLOW-107b888c85ee99a2-true)<br>CASE-FLOW-107b888c85ee99a2-false (condition evaluates false; fixture FIX-CASE-FLOW-107b888c85ee99a2-false; reference REF-CASE-FLOW-107b888c85ee99a2-false; test TEST-CASE-FLOW-107b888c85ee99a2-false; evidence plan EVID-CASE-FLOW-107b888c85ee99a2-false) |
| FLOW-ae4499855800362e | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 97–99 | if | `(!double_chest)` | CASE-FLOW-ae4499855800362e-true (condition evaluates true; fixture FIX-CASE-FLOW-ae4499855800362e-true; reference REF-CASE-FLOW-ae4499855800362e-true; test TEST-CASE-FLOW-ae4499855800362e-true; evidence plan EVID-CASE-FLOW-ae4499855800362e-true)<br>CASE-FLOW-ae4499855800362e-false (condition false; no else arm; fixture FIX-CASE-FLOW-ae4499855800362e-false; reference REF-CASE-FLOW-ae4499855800362e-false; test TEST-CASE-FLOW-ae4499855800362e-false; evidence plan EVID-CASE-FLOW-ae4499855800362e-false) |
| FLOW-2cb6e94183696228 | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 102–148 | switch_statement | `(blkdata)` | CASE-FLOW-2cb6e94183696228-case-0 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-2cb6e94183696228-case-0; reference REF-CASE-FLOW-2cb6e94183696228-case-0; test TEST-CASE-FLOW-2cb6e94183696228-case-0; evidence plan EVID-CASE-FLOW-2cb6e94183696228-case-0)<br>CASE-FLOW-2cb6e94183696228-case-1 (selector matches source case label(s): 4; labels=4; fixture FIX-CASE-FLOW-2cb6e94183696228-case-1; reference REF-CASE-FLOW-2cb6e94183696228-case-1; test TEST-CASE-FLOW-2cb6e94183696228-case-1; evidence plan EVID-CASE-FLOW-2cb6e94183696228-case-1)<br>CASE-FLOW-2cb6e94183696228-case-2 (selector matches source case label(s): 5; labels=5; fixture FIX-CASE-FLOW-2cb6e94183696228-case-2; reference REF-CASE-FLOW-2cb6e94183696228-case-2; test TEST-CASE-FLOW-2cb6e94183696228-case-2; evidence plan EVID-CASE-FLOW-2cb6e94183696228-case-2)<br>CASE-FLOW-2cb6e94183696228-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-2cb6e94183696228-case-3; reference REF-CASE-FLOW-2cb6e94183696228-case-3; test TEST-CASE-FLOW-2cb6e94183696228-case-3; evidence plan EVID-CASE-FLOW-2cb6e94183696228-case-3)<br>CASE-FLOW-2cb6e94183696228-case-4 (default selector arm; labels=default; labels=default; fixture FIX-CASE-FLOW-2cb6e94183696228-case-4; reference REF-CASE-FLOW-2cb6e94183696228-case-4; test TEST-CASE-FLOW-2cb6e94183696228-case-4; evidence plan EVID-CASE-FLOW-2cb6e94183696228-case-4) |
| FLOW-cc7ff519305c653a | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 104–112 | if | `(ctx.getBlockTypeAt(-1, 0, 0).baseState == blktype)` | CASE-FLOW-cc7ff519305c653a-true (condition evaluates true; fixture FIX-CASE-FLOW-cc7ff519305c653a-true; reference REF-CASE-FLOW-cc7ff519305c653a-true; test TEST-CASE-FLOW-cc7ff519305c653a-true; evidence plan EVID-CASE-FLOW-cc7ff519305c653a-true)<br>CASE-FLOW-cc7ff519305c653a-false (condition evaluates false; fixture FIX-CASE-FLOW-cc7ff519305c653a-false; reference REF-CASE-FLOW-cc7ff519305c653a-false; test TEST-CASE-FLOW-cc7ff519305c653a-false; evidence plan EVID-CASE-FLOW-cc7ff519305c653a-false) |
| FLOW-385a8dec98da229c | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 107–112 | if | `(ctx.getBlockTypeAt(1, 0, 0).baseState == blktype)` | CASE-FLOW-385a8dec98da229c-true (condition evaluates true; fixture FIX-CASE-FLOW-385a8dec98da229c-true; reference REF-CASE-FLOW-385a8dec98da229c-true; test TEST-CASE-FLOW-385a8dec98da229c-true; evidence plan EVID-CASE-FLOW-385a8dec98da229c-true)<br>CASE-FLOW-385a8dec98da229c-false (condition evaluates false; fixture FIX-CASE-FLOW-385a8dec98da229c-false; reference REF-CASE-FLOW-385a8dec98da229c-false; test TEST-CASE-FLOW-385a8dec98da229c-false; evidence plan EVID-CASE-FLOW-385a8dec98da229c-false) |
| FLOW-35ee23e39c9a4675 | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 115–123 | if | `(ctx.getBlockTypeAt(0, 0, -1).baseState == blktype)` | CASE-FLOW-35ee23e39c9a4675-true (condition evaluates true; fixture FIX-CASE-FLOW-35ee23e39c9a4675-true; reference REF-CASE-FLOW-35ee23e39c9a4675-true; test TEST-CASE-FLOW-35ee23e39c9a4675-true; evidence plan EVID-CASE-FLOW-35ee23e39c9a4675-true)<br>CASE-FLOW-35ee23e39c9a4675-false (condition evaluates false; fixture FIX-CASE-FLOW-35ee23e39c9a4675-false; reference REF-CASE-FLOW-35ee23e39c9a4675-false; test TEST-CASE-FLOW-35ee23e39c9a4675-false; evidence plan EVID-CASE-FLOW-35ee23e39c9a4675-false) |
| FLOW-ce815b59d0c91d9a | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 118–123 | if | `(ctx.getBlockTypeAt(0, 0, 1).baseState == blktype)` | CASE-FLOW-ce815b59d0c91d9a-true (condition evaluates true; fixture FIX-CASE-FLOW-ce815b59d0c91d9a-true; reference REF-CASE-FLOW-ce815b59d0c91d9a-true; test TEST-CASE-FLOW-ce815b59d0c91d9a-true; evidence plan EVID-CASE-FLOW-ce815b59d0c91d9a-true)<br>CASE-FLOW-ce815b59d0c91d9a-false (condition evaluates false; fixture FIX-CASE-FLOW-ce815b59d0c91d9a-false; reference REF-CASE-FLOW-ce815b59d0c91d9a-false; test TEST-CASE-FLOW-ce815b59d0c91d9a-false; evidence plan EVID-CASE-FLOW-ce815b59d0c91d9a-false) |
| FLOW-0aa3dc9dc7910929 | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 126–134 | if | `(ctx.getBlockTypeAt(0, 0, -1).baseState == blktype)` | CASE-FLOW-0aa3dc9dc7910929-true (condition evaluates true; fixture FIX-CASE-FLOW-0aa3dc9dc7910929-true; reference REF-CASE-FLOW-0aa3dc9dc7910929-true; test TEST-CASE-FLOW-0aa3dc9dc7910929-true; evidence plan EVID-CASE-FLOW-0aa3dc9dc7910929-true)<br>CASE-FLOW-0aa3dc9dc7910929-false (condition evaluates false; fixture FIX-CASE-FLOW-0aa3dc9dc7910929-false; reference REF-CASE-FLOW-0aa3dc9dc7910929-false; test TEST-CASE-FLOW-0aa3dc9dc7910929-false; evidence plan EVID-CASE-FLOW-0aa3dc9dc7910929-false) |
| FLOW-4dc73bea247b29f3 | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 129–134 | if | `(ctx.getBlockTypeAt(0, 0, 1).baseState == blktype)` | CASE-FLOW-4dc73bea247b29f3-true (condition evaluates true; fixture FIX-CASE-FLOW-4dc73bea247b29f3-true; reference REF-CASE-FLOW-4dc73bea247b29f3-true; test TEST-CASE-FLOW-4dc73bea247b29f3-true; evidence plan EVID-CASE-FLOW-4dc73bea247b29f3-true)<br>CASE-FLOW-4dc73bea247b29f3-false (condition evaluates false; fixture FIX-CASE-FLOW-4dc73bea247b29f3-false; reference REF-CASE-FLOW-4dc73bea247b29f3-false; test TEST-CASE-FLOW-4dc73bea247b29f3-false; evidence plan EVID-CASE-FLOW-4dc73bea247b29f3-false) |
| FLOW-c027deaa88858bd6 | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 138–146 | if | `(ctx.getBlockTypeAt(-1, 0, 0).baseState == blktype)` | CASE-FLOW-c027deaa88858bd6-true (condition evaluates true; fixture FIX-CASE-FLOW-c027deaa88858bd6-true; reference REF-CASE-FLOW-c027deaa88858bd6-true; test TEST-CASE-FLOW-c027deaa88858bd6-true; evidence plan EVID-CASE-FLOW-c027deaa88858bd6-true)<br>CASE-FLOW-c027deaa88858bd6-false (condition evaluates false; fixture FIX-CASE-FLOW-c027deaa88858bd6-false; reference REF-CASE-FLOW-c027deaa88858bd6-false; test TEST-CASE-FLOW-c027deaa88858bd6-false; evidence plan EVID-CASE-FLOW-c027deaa88858bd6-false) |
| FLOW-5561576a5691f125 | `org.dynmap.hdmap.renderer.ChestRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 141–146 | if | `(ctx.getBlockTypeAt(1, 0, 0).baseState == blktype)` | CASE-FLOW-5561576a5691f125-true (condition evaluates true; fixture FIX-CASE-FLOW-5561576a5691f125-true; reference REF-CASE-FLOW-5561576a5691f125-true; test TEST-CASE-FLOW-5561576a5691f125-true; evidence plan EVID-CASE-FLOW-5561576a5691f125-true)<br>CASE-FLOW-5561576a5691f125-false (condition evaluates false; fixture FIX-CASE-FLOW-5561576a5691f125-false; reference REF-CASE-FLOW-5561576a5691f125-false; test TEST-CASE-FLOW-5561576a5691f125-false; evidence plan EVID-CASE-FLOW-5561576a5691f125-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins ChestRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer ChestRenderer --fixture-set chest-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer ChestRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin ChestRenderer
```
