# B-copy-stair-block-renderer: Dynmap built-in renderer CopyStairBlockRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-copy-stair-block-renderer",
  "kind": "builtin",
  "document": "phases/builtins/copy-stair-block-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin CopyStairBlockRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/CopyStairBlockRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/copy-stair-block-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| none | No static `customblock` record names this class in the pinned `models_<n>.txt` or `renderdata/*.txt` search set. | — | — | — | — | — |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

No pinned static configuration case exists for this class. The dynamic-definition fixture must supply one explicit valid `customblock` row and one malformed row; values must be derived from this class's constructor and initializer source, not guessed.

### Exact implementation symbols

This file contributes 30 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_X_MINUS | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_X_MINUS:int` | 18–18 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_X_PLUS | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_X_PLUS:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Y_MINUS | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Y_MINUS:int` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Y_PLUS | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Y_PLUS:int` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Z_MINUS | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Z_MINUS:int` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Z_PLUS | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#TEXTURE_Z_PLUS:int` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#corner1 | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#corner1:int[]` | 169–169 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#corner2 | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#corner2:int[]` | 172–172 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#icorner1 | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#icorner1:int[]` | 170–170 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#icorner2 | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#icorner2:int[]` | 173–173 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#match1 | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#match1:int[]` | 168–168 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#match2 | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#match2:int[]` | 171–171 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#off_x | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#off_x:int[]` | 166–166 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#off_z | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#off_z:int[]` | 167–167 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#patchlist | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#patchlist:int[]` | 63–63 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#stair_ids | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#stair_ids:BitSet` | 22–22 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#step_1_4_meshes | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#step_1_4_meshes:RenderPatch[][]` | 29–29 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#step_3_4_meshes | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#step_3_4_meshes:RenderPatch[][]` | 27–27 |
| field:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#stepmeshes | field | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#stepmeshes:RenderPatch[][]` | 25–25 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 65–67 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildCornerStepMeshes(RenderPatchFactory,int) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 95–119 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 121–149 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildStepMeshes(RenderPatchFactory,int) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 69–93 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` | 180–222 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getMaximumTextureCount()->int` | 53–56 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 175–178 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getTileEntityFieldsNeeded()->String[]` | 58–61 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 39–51 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#setID(String) | method | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#setID(String)->void` | 31–38 |
| type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer | class | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer` | 14–223 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#setID(String) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#setID(String)->void` | 31–38 | FLOW-486b6d1fc67ce9c8, FLOW-e5efc7710d33dfd9 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 39–51 | FLOW-674e57d73a5acb4e, FLOW-cfe70047d971d3b5 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getMaximumTextureCount()->int` | 53–56 | none |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getTileEntityFieldsNeeded()->String[]` | 58–61 | none |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 65–67 | none |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildStepMeshes(RenderPatchFactory,int) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 69–93 | FLOW-8de8c8a5a1114cf4, FLOW-751cbcf736fd960a |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildCornerStepMeshes(RenderPatchFactory,int) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 95–119 | FLOW-c1e2cb8ef15a4f3f, FLOW-b8c48a8e57ea6b11 |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 121–149 | FLOW-3d7e21e581f509bc, FLOW-524e8a73076d8ebe |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 175–178 | none |
| method:type:org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` | 180–222 | FLOW-63e28f55217aec26, FLOW-1d0fa742df185ee9, FLOW-8e3081f085b9975d, FLOW-3f8be8907d628014, FLOW-a767a759d26cfced, FLOW-266576b36654729e, FLOW-096170085831af21, FLOW-ff873371f8c51ec6, FLOW-470141322ce8be39, FLOW-3d0bafd67a8ff882 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-486b6d1fc67ce9c8 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#setID(String)->void` 33–37 | if | `(bbs.isNotAir())` | CASE-FLOW-486b6d1fc67ce9c8-true (condition evaluates true; fixture FIX-CASE-FLOW-486b6d1fc67ce9c8-true; reference REF-CASE-FLOW-486b6d1fc67ce9c8-true; test TEST-CASE-FLOW-486b6d1fc67ce9c8-true; evidence plan EVID-CASE-FLOW-486b6d1fc67ce9c8-true)<br>CASE-FLOW-486b6d1fc67ce9c8-false (condition false; no else arm; fixture FIX-CASE-FLOW-486b6d1fc67ce9c8-false; reference REF-CASE-FLOW-486b6d1fc67ce9c8-false; test TEST-CASE-FLOW-486b6d1fc67ce9c8-false; evidence plan EVID-CASE-FLOW-486b6d1fc67ce9c8-false) |
| FLOW-e5efc7710d33dfd9 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#setID(String)->void` 34–36 | for_loop | `i < bbs.getStateCount()` | CASE-FLOW-e5efc7710d33dfd9-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-e5efc7710d33dfd9-iterate; reference REF-CASE-FLOW-e5efc7710d33dfd9-iterate; test TEST-CASE-FLOW-e5efc7710d33dfd9-iterate; evidence plan EVID-CASE-FLOW-e5efc7710d33dfd9-iterate)<br>CASE-FLOW-e5efc7710d33dfd9-exit (condition is false; fixture FIX-CASE-FLOW-e5efc7710d33dfd9-exit; reference REF-CASE-FLOW-e5efc7710d33dfd9-exit; test TEST-CASE-FLOW-e5efc7710d33dfd9-exit; evidence plan EVID-CASE-FLOW-e5efc7710d33dfd9-exit) |
| FLOW-674e57d73a5acb4e | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 41–42 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-674e57d73a5acb4e-true (condition evaluates true; fixture FIX-CASE-FLOW-674e57d73a5acb4e-true; reference REF-CASE-FLOW-674e57d73a5acb4e-true; test TEST-CASE-FLOW-674e57d73a5acb4e-true; evidence plan EVID-CASE-FLOW-674e57d73a5acb4e-true)<br>CASE-FLOW-674e57d73a5acb4e-false (condition false; no else arm; fixture FIX-CASE-FLOW-674e57d73a5acb4e-false; reference REF-CASE-FLOW-674e57d73a5acb4e-false; test TEST-CASE-FLOW-674e57d73a5acb4e-false; evidence plan EVID-CASE-FLOW-674e57d73a5acb4e-false) |
| FLOW-cfe70047d971d3b5 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 45–49 | for_loop | `i < 8` | CASE-FLOW-cfe70047d971d3b5-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-cfe70047d971d3b5-iterate; reference REF-CASE-FLOW-cfe70047d971d3b5-iterate; test TEST-CASE-FLOW-cfe70047d971d3b5-iterate; evidence plan EVID-CASE-FLOW-cfe70047d971d3b5-iterate)<br>CASE-FLOW-cfe70047d971d3b5-exit (condition is false; fixture FIX-CASE-FLOW-cfe70047d971d3b5-exit; reference REF-CASE-FLOW-cfe70047d971d3b5-exit; test TEST-CASE-FLOW-cfe70047d971d3b5-exit; evidence plan EVID-CASE-FLOW-cfe70047d971d3b5-exit) |
| FLOW-8de8c8a5a1114cf4 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 72–77 | if | `((dat & 4) != 0)` | CASE-FLOW-8de8c8a5a1114cf4-true (condition evaluates true; fixture FIX-CASE-FLOW-8de8c8a5a1114cf4-true; reference REF-CASE-FLOW-8de8c8a5a1114cf4-true; test TEST-CASE-FLOW-8de8c8a5a1114cf4-true; evidence plan EVID-CASE-FLOW-8de8c8a5a1114cf4-true)<br>CASE-FLOW-8de8c8a5a1114cf4-false (condition evaluates false; fixture FIX-CASE-FLOW-8de8c8a5a1114cf4-false; reference REF-CASE-FLOW-8de8c8a5a1114cf4-false; test TEST-CASE-FLOW-8de8c8a5a1114cf4-false; evidence plan EVID-CASE-FLOW-8de8c8a5a1114cf4-false) |
| FLOW-751cbcf736fd960a | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 78–91 | switch_statement | `(dat & 3)` | CASE-FLOW-751cbcf736fd960a-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-751cbcf736fd960a-case-0; reference REF-CASE-FLOW-751cbcf736fd960a-case-0; test TEST-CASE-FLOW-751cbcf736fd960a-case-0; evidence plan EVID-CASE-FLOW-751cbcf736fd960a-case-0)<br>CASE-FLOW-751cbcf736fd960a-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-751cbcf736fd960a-case-1; reference REF-CASE-FLOW-751cbcf736fd960a-case-1; test TEST-CASE-FLOW-751cbcf736fd960a-case-1; evidence plan EVID-CASE-FLOW-751cbcf736fd960a-case-1)<br>CASE-FLOW-751cbcf736fd960a-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-751cbcf736fd960a-case-2; reference REF-CASE-FLOW-751cbcf736fd960a-case-2; test TEST-CASE-FLOW-751cbcf736fd960a-case-2; evidence plan EVID-CASE-FLOW-751cbcf736fd960a-case-2)<br>CASE-FLOW-751cbcf736fd960a-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-751cbcf736fd960a-case-3; reference REF-CASE-FLOW-751cbcf736fd960a-case-3; test TEST-CASE-FLOW-751cbcf736fd960a-case-3; evidence plan EVID-CASE-FLOW-751cbcf736fd960a-case-3)<br>CASE-FLOW-751cbcf736fd960a-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-751cbcf736fd960a-unmatched; reference REF-CASE-FLOW-751cbcf736fd960a-unmatched; test TEST-CASE-FLOW-751cbcf736fd960a-unmatched; evidence plan EVID-CASE-FLOW-751cbcf736fd960a-unmatched) |
| FLOW-c1e2cb8ef15a4f3f | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 98–103 | if | `((dat & 4) != 0)` | CASE-FLOW-c1e2cb8ef15a4f3f-true (condition evaluates true; fixture FIX-CASE-FLOW-c1e2cb8ef15a4f3f-true; reference REF-CASE-FLOW-c1e2cb8ef15a4f3f-true; test TEST-CASE-FLOW-c1e2cb8ef15a4f3f-true; evidence plan EVID-CASE-FLOW-c1e2cb8ef15a4f3f-true)<br>CASE-FLOW-c1e2cb8ef15a4f3f-false (condition evaluates false; fixture FIX-CASE-FLOW-c1e2cb8ef15a4f3f-false; reference REF-CASE-FLOW-c1e2cb8ef15a4f3f-false; test TEST-CASE-FLOW-c1e2cb8ef15a4f3f-false; evidence plan EVID-CASE-FLOW-c1e2cb8ef15a4f3f-false) |
| FLOW-b8c48a8e57ea6b11 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 104–117 | switch_statement | `(dat & 3)` | CASE-FLOW-b8c48a8e57ea6b11-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-b8c48a8e57ea6b11-case-0; reference REF-CASE-FLOW-b8c48a8e57ea6b11-case-0; test TEST-CASE-FLOW-b8c48a8e57ea6b11-case-0; evidence plan EVID-CASE-FLOW-b8c48a8e57ea6b11-case-0)<br>CASE-FLOW-b8c48a8e57ea6b11-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-b8c48a8e57ea6b11-case-1; reference REF-CASE-FLOW-b8c48a8e57ea6b11-case-1; test TEST-CASE-FLOW-b8c48a8e57ea6b11-case-1; evidence plan EVID-CASE-FLOW-b8c48a8e57ea6b11-case-1)<br>CASE-FLOW-b8c48a8e57ea6b11-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-b8c48a8e57ea6b11-case-2; reference REF-CASE-FLOW-b8c48a8e57ea6b11-case-2; test TEST-CASE-FLOW-b8c48a8e57ea6b11-case-2; evidence plan EVID-CASE-FLOW-b8c48a8e57ea6b11-case-2)<br>CASE-FLOW-b8c48a8e57ea6b11-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-b8c48a8e57ea6b11-case-3; reference REF-CASE-FLOW-b8c48a8e57ea6b11-case-3; test TEST-CASE-FLOW-b8c48a8e57ea6b11-case-3; evidence plan EVID-CASE-FLOW-b8c48a8e57ea6b11-case-3)<br>CASE-FLOW-b8c48a8e57ea6b11-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-b8c48a8e57ea6b11-unmatched; reference REF-CASE-FLOW-b8c48a8e57ea6b11-unmatched; test TEST-CASE-FLOW-b8c48a8e57ea6b11-unmatched; evidence plan EVID-CASE-FLOW-b8c48a8e57ea6b11-unmatched) |
| FLOW-3d7e21e581f509bc | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 124–129 | if | `((dat & 4) != 0)` | CASE-FLOW-3d7e21e581f509bc-true (condition evaluates true; fixture FIX-CASE-FLOW-3d7e21e581f509bc-true; reference REF-CASE-FLOW-3d7e21e581f509bc-true; test TEST-CASE-FLOW-3d7e21e581f509bc-true; evidence plan EVID-CASE-FLOW-3d7e21e581f509bc-true)<br>CASE-FLOW-3d7e21e581f509bc-false (condition evaluates false; fixture FIX-CASE-FLOW-3d7e21e581f509bc-false; reference REF-CASE-FLOW-3d7e21e581f509bc-false; test TEST-CASE-FLOW-3d7e21e581f509bc-false; evidence plan EVID-CASE-FLOW-3d7e21e581f509bc-false) |
| FLOW-524e8a73076d8ebe | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 130–147 | switch_statement | `(dat & 3)` | CASE-FLOW-524e8a73076d8ebe-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-524e8a73076d8ebe-case-0; reference REF-CASE-FLOW-524e8a73076d8ebe-case-0; test TEST-CASE-FLOW-524e8a73076d8ebe-case-0; evidence plan EVID-CASE-FLOW-524e8a73076d8ebe-case-0)<br>CASE-FLOW-524e8a73076d8ebe-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-524e8a73076d8ebe-case-1; reference REF-CASE-FLOW-524e8a73076d8ebe-case-1; test TEST-CASE-FLOW-524e8a73076d8ebe-case-1; evidence plan EVID-CASE-FLOW-524e8a73076d8ebe-case-1)<br>CASE-FLOW-524e8a73076d8ebe-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-524e8a73076d8ebe-case-2; reference REF-CASE-FLOW-524e8a73076d8ebe-case-2; test TEST-CASE-FLOW-524e8a73076d8ebe-case-2; evidence plan EVID-CASE-FLOW-524e8a73076d8ebe-case-2)<br>CASE-FLOW-524e8a73076d8ebe-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-524e8a73076d8ebe-case-3; reference REF-CASE-FLOW-524e8a73076d8ebe-case-3; test TEST-CASE-FLOW-524e8a73076d8ebe-case-3; evidence plan EVID-CASE-FLOW-524e8a73076d8ebe-case-3)<br>CASE-FLOW-524e8a73076d8ebe-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-524e8a73076d8ebe-unmatched; reference REF-CASE-FLOW-524e8a73076d8ebe-unmatched; test TEST-CASE-FLOW-524e8a73076d8ebe-unmatched; evidence plan EVID-CASE-FLOW-524e8a73076d8ebe-unmatched) |
| FLOW-63e28f55217aec26 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 184–200 | if | `(stair_ids.get(corner.globalStateIndex))` | CASE-FLOW-63e28f55217aec26-true (condition evaluates true; fixture FIX-CASE-FLOW-63e28f55217aec26-true; reference REF-CASE-FLOW-63e28f55217aec26-true; test TEST-CASE-FLOW-63e28f55217aec26-true; evidence plan EVID-CASE-FLOW-63e28f55217aec26-true)<br>CASE-FLOW-63e28f55217aec26-false (condition false; no else arm; fixture FIX-CASE-FLOW-63e28f55217aec26-false; reference REF-CASE-FLOW-63e28f55217aec26-false; test TEST-CASE-FLOW-63e28f55217aec26-false; evidence plan EVID-CASE-FLOW-63e28f55217aec26-false) |
| FLOW-1d0fa742df185ee9 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 186–199 | if | `(cornerdat == match1[data])` | CASE-FLOW-1d0fa742df185ee9-true (condition evaluates true; fixture FIX-CASE-FLOW-1d0fa742df185ee9-true; reference REF-CASE-FLOW-1d0fa742df185ee9-true; test TEST-CASE-FLOW-1d0fa742df185ee9-true; evidence plan EVID-CASE-FLOW-1d0fa742df185ee9-true)<br>CASE-FLOW-1d0fa742df185ee9-false (condition evaluates false; fixture FIX-CASE-FLOW-1d0fa742df185ee9-false; reference REF-CASE-FLOW-1d0fa742df185ee9-false; test TEST-CASE-FLOW-1d0fa742df185ee9-false; evidence plan EVID-CASE-FLOW-1d0fa742df185ee9-false) |
| FLOW-8e3081f085b9975d | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 189–191 | if | `((!stair_ids.get(side.globalStateIndex)) \|\| ((side.stateIndex & 7) != data))` | CASE-FLOW-8e3081f085b9975d-true (condition evaluates true; fixture FIX-CASE-FLOW-8e3081f085b9975d-true; reference REF-CASE-FLOW-8e3081f085b9975d-true; test TEST-CASE-FLOW-8e3081f085b9975d-true; evidence plan EVID-CASE-FLOW-8e3081f085b9975d-true)<br>CASE-FLOW-8e3081f085b9975d-false (condition false; no else arm; fixture FIX-CASE-FLOW-8e3081f085b9975d-false; reference REF-CASE-FLOW-8e3081f085b9975d-false; test TEST-CASE-FLOW-8e3081f085b9975d-false; evidence plan EVID-CASE-FLOW-8e3081f085b9975d-false) |
| FLOW-3f8be8907d628014 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 193–199 | if | `(cornerdat == match2[data])` | CASE-FLOW-3f8be8907d628014-true (condition evaluates true; fixture FIX-CASE-FLOW-3f8be8907d628014-true; reference REF-CASE-FLOW-3f8be8907d628014-true; test TEST-CASE-FLOW-3f8be8907d628014-true; evidence plan EVID-CASE-FLOW-3f8be8907d628014-true)<br>CASE-FLOW-3f8be8907d628014-false (condition false; no else arm; fixture FIX-CASE-FLOW-3f8be8907d628014-false; reference REF-CASE-FLOW-3f8be8907d628014-false; test TEST-CASE-FLOW-3f8be8907d628014-false; evidence plan EVID-CASE-FLOW-3f8be8907d628014-false) |
| FLOW-a767a759d26cfced | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 196–198 | if | `((!stair_ids.get(side.globalStateIndex)) \|\| ((side.stateIndex & 7) != data))` | CASE-FLOW-a767a759d26cfced-true (condition evaluates true; fixture FIX-CASE-FLOW-a767a759d26cfced-true; reference REF-CASE-FLOW-a767a759d26cfced-true; test TEST-CASE-FLOW-a767a759d26cfced-true; evidence plan EVID-CASE-FLOW-a767a759d26cfced-true)<br>CASE-FLOW-a767a759d26cfced-false (condition false; no else arm; fixture FIX-CASE-FLOW-a767a759d26cfced-false; reference REF-CASE-FLOW-a767a759d26cfced-false; test TEST-CASE-FLOW-a767a759d26cfced-false; evidence plan EVID-CASE-FLOW-a767a759d26cfced-false) |
| FLOW-266576b36654729e | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 203–219 | if | `(stair_ids.get(corner.globalStateIndex))` | CASE-FLOW-266576b36654729e-true (condition evaluates true; fixture FIX-CASE-FLOW-266576b36654729e-true; reference REF-CASE-FLOW-266576b36654729e-true; test TEST-CASE-FLOW-266576b36654729e-true; evidence plan EVID-CASE-FLOW-266576b36654729e-true)<br>CASE-FLOW-266576b36654729e-false (condition false; no else arm; fixture FIX-CASE-FLOW-266576b36654729e-false; reference REF-CASE-FLOW-266576b36654729e-false; test TEST-CASE-FLOW-266576b36654729e-false; evidence plan EVID-CASE-FLOW-266576b36654729e-false) |
| FLOW-096170085831af21 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 205–218 | if | `(cornerdat == match1[data])` | CASE-FLOW-096170085831af21-true (condition evaluates true; fixture FIX-CASE-FLOW-096170085831af21-true; reference REF-CASE-FLOW-096170085831af21-true; test TEST-CASE-FLOW-096170085831af21-true; evidence plan EVID-CASE-FLOW-096170085831af21-true)<br>CASE-FLOW-096170085831af21-false (condition evaluates false; fixture FIX-CASE-FLOW-096170085831af21-false; reference REF-CASE-FLOW-096170085831af21-false; test TEST-CASE-FLOW-096170085831af21-false; evidence plan EVID-CASE-FLOW-096170085831af21-false) |
| FLOW-ff873371f8c51ec6 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 208–210 | if | `((!stair_ids.get(side.globalStateIndex)) \|\| ((side.stateIndex & 7) != data))` | CASE-FLOW-ff873371f8c51ec6-true (condition evaluates true; fixture FIX-CASE-FLOW-ff873371f8c51ec6-true; reference REF-CASE-FLOW-ff873371f8c51ec6-true; test TEST-CASE-FLOW-ff873371f8c51ec6-true; evidence plan EVID-CASE-FLOW-ff873371f8c51ec6-true)<br>CASE-FLOW-ff873371f8c51ec6-false (condition false; no else arm; fixture FIX-CASE-FLOW-ff873371f8c51ec6-false; reference REF-CASE-FLOW-ff873371f8c51ec6-false; test TEST-CASE-FLOW-ff873371f8c51ec6-false; evidence plan EVID-CASE-FLOW-ff873371f8c51ec6-false) |
| FLOW-470141322ce8be39 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 212–218 | if | `(cornerdat == match2[data])` | CASE-FLOW-470141322ce8be39-true (condition evaluates true; fixture FIX-CASE-FLOW-470141322ce8be39-true; reference REF-CASE-FLOW-470141322ce8be39-true; test TEST-CASE-FLOW-470141322ce8be39-true; evidence plan EVID-CASE-FLOW-470141322ce8be39-true)<br>CASE-FLOW-470141322ce8be39-false (condition false; no else arm; fixture FIX-CASE-FLOW-470141322ce8be39-false; reference REF-CASE-FLOW-470141322ce8be39-false; test TEST-CASE-FLOW-470141322ce8be39-false; evidence plan EVID-CASE-FLOW-470141322ce8be39-false) |
| FLOW-3d0bafd67a8ff882 | `org.dynmap.hdmap.renderer.CopyStairBlockRenderer#getBaseRenderPatchList(MapDataContext)->RenderPatch[]` 215–217 | if | `((!stair_ids.get(side.globalStateIndex)) \|\| ((side.stateIndex & 7) != data))` | CASE-FLOW-3d0bafd67a8ff882-true (condition evaluates true; fixture FIX-CASE-FLOW-3d0bafd67a8ff882-true; reference REF-CASE-FLOW-3d0bafd67a8ff882-true; test TEST-CASE-FLOW-3d0bafd67a8ff882-true; evidence plan EVID-CASE-FLOW-3d0bafd67a8ff882-true)<br>CASE-FLOW-3d0bafd67a8ff882-false (condition false; no else arm; fixture FIX-CASE-FLOW-3d0bafd67a8ff882-false; reference REF-CASE-FLOW-3d0bafd67a8ff882-false; test TEST-CASE-FLOW-3d0bafd67a8ff882-false; evidence plan EVID-CASE-FLOW-3d0bafd67a8ff882-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins CopyStairBlockRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer CopyStairBlockRenderer --fixture-set copy-stair-block-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer CopyStairBlockRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin CopyStairBlockRenderer
```
