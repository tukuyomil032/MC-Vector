# B-rail-craft-slab-block-renderer: Dynmap built-in renderer RailCraftSlabBlockRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-rail-craft-slab-block-renderer",
  "kind": "builtin",
  "document": "phases/builtins/rail-craft-slab-block-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin RailCraftSlabBlockRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RailCraftSlabBlockRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/rail-craft-slab-block-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-27b89540f1f9b405 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:246 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-27b89540f1f9b405 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:246 | — | %tile.railcraft.slab | * |  | textmap0, textmap1, textmap10, textmap11, textmap12, textmap13, textmap14, textmap15, textmap16, textmap17, textmap18, textmap19, textmap2, textmap20, textmap21, textmap22, textmap23, textmap24, textmap25, textmap26, textmap27, textmap28, textmap29, textmap3, textmap30, textmap31, textmap32, textmap33, textmap34, textmap35, textmap4, textmap5, textmap6, textmap7, textmap8, textmap9, texturecnt |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-27b89540f1f9b405 | FIX-CASE-REG-27b89540f1f9b405 | REF-CASE-REG-27b89540f1f9b405 | TEST-CASE-REG-27b89540f1f9b405 | EVID-CASE-REG-27b89540f1f9b405 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:246; guard=—; block=%tile.railcraft.slab; data=*; state=; parameter keys=textmap0, textmap1, textmap10, textmap11, textmap12, textmap13, textmap14, textmap15, textmap16, textmap17, textmap18, textmap19, textmap2, textmap20, textmap21, textmap22, textmap23, textmap24, textmap25, textmap26, textmap27, textmap28, textmap29, textmap3, textmap30, textmap31, textmap32, textmap33, textmap34, textmap35, textmap4, textmap5, textmap6, textmap7, textmap8, textmap9, texturecnt |

### Exact implementation symbols

This file contributes 17 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#TEXTURE_BOTTOM | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#TEXTURE_BOTTOM:int` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#TEXTURE_SIDES | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#TEXTURE_SIDES:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#TEXTURE_TOP | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#TEXTURE_TOP:int` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#patchlist | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#patchlist:int[]` | 72–72 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#stair_ids | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#stair_ids:BitSet` | 18–18 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#stepmeshes | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#stepmeshes:RenderPatch[][]` | 21–21 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#textsetcnt | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#textsetcnt:int` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#texturemap | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#texturemap:String[]` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#tilefields | field | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#tilefields:String[]` | 24–24 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 74–76 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#buildStepMeshes(RenderPatchFactory,int) | method | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 78–92 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getMaximumTextureCount()->int` | 62–65 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 94–130 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getTileEntityFieldsNeeded()->String[]` | 67–70 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 37–60 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#setID(String) | method | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#setID(String)->void` | 27–35 |
| type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer | class | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer` | 14–131 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#setID(String) | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#setID(String)->void` | 27–35 | FLOW-da73c415bcff7e59, FLOW-7f85b523d1137f5b |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 37–60 | FLOW-da90049edcb95f73, FLOW-ddb0d608f2a67b71, FLOW-8a151bed2775e688, FLOW-a66225567a2acc34, FLOW-cf20a7a804368bbb |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getMaximumTextureCount()->int` | 62–65 | none |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getTileEntityFieldsNeeded()->String[]` | 67–70 | none |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 74–76 | none |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#buildStepMeshes(RenderPatchFactory,int) | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 78–92 | FLOW-d4057af32db09741 |
| method:type:org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 94–130 | FLOW-3467abfa2bed2486, FLOW-2af09bf51a641d5c, FLOW-b514e9c99324792b, FLOW-16cd5400dc65efd6, FLOW-31bddddb02aa25dc, FLOW-8e2ea137318f5068, FLOW-32a3d74e84136f4e, FLOW-70328023e25a1d8a |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-da73c415bcff7e59 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#setID(String)->void` 29–34 | if | `(bss.isNotAir())` | CASE-FLOW-da73c415bcff7e59-true (condition evaluates true; fixture FIX-CASE-FLOW-da73c415bcff7e59-true; reference REF-CASE-FLOW-da73c415bcff7e59-true; test TEST-CASE-FLOW-da73c415bcff7e59-true; evidence plan EVID-CASE-FLOW-da73c415bcff7e59-true)<br>CASE-FLOW-da73c415bcff7e59-false (condition false; no else arm; fixture FIX-CASE-FLOW-da73c415bcff7e59-false; reference REF-CASE-FLOW-da73c415bcff7e59-false; test TEST-CASE-FLOW-da73c415bcff7e59-false; evidence plan EVID-CASE-FLOW-da73c415bcff7e59-false) |
| FLOW-7f85b523d1137f5b | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#setID(String)->void` 30–33 | for_loop | `i < bss.getStateCount()` | CASE-FLOW-7f85b523d1137f5b-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-7f85b523d1137f5b-iterate; reference REF-CASE-FLOW-7f85b523d1137f5b-iterate; test TEST-CASE-FLOW-7f85b523d1137f5b-iterate; evidence plan EVID-CASE-FLOW-7f85b523d1137f5b-iterate)<br>CASE-FLOW-7f85b523d1137f5b-exit (condition is false; fixture FIX-CASE-FLOW-7f85b523d1137f5b-exit; reference REF-CASE-FLOW-7f85b523d1137f5b-exit; test TEST-CASE-FLOW-7f85b523d1137f5b-exit; evidence plan EVID-CASE-FLOW-7f85b523d1137f5b-exit) |
| FLOW-da90049edcb95f73 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 39–40 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-da90049edcb95f73-true (condition evaluates true; fixture FIX-CASE-FLOW-da90049edcb95f73-true; reference REF-CASE-FLOW-da90049edcb95f73-true; test TEST-CASE-FLOW-da90049edcb95f73-true; evidence plan EVID-CASE-FLOW-da90049edcb95f73-true)<br>CASE-FLOW-da90049edcb95f73-false (condition false; no else arm; fixture FIX-CASE-FLOW-da90049edcb95f73-false; reference REF-CASE-FLOW-da90049edcb95f73-false; test TEST-CASE-FLOW-da90049edcb95f73-false; evidence plan EVID-CASE-FLOW-da90049edcb95f73-false) |
| FLOW-ddb0d608f2a67b71 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 43–45 | for_loop | `i < 3` | CASE-FLOW-ddb0d608f2a67b71-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-ddb0d608f2a67b71-iterate; reference REF-CASE-FLOW-ddb0d608f2a67b71-iterate; test TEST-CASE-FLOW-ddb0d608f2a67b71-iterate; evidence plan EVID-CASE-FLOW-ddb0d608f2a67b71-iterate)<br>CASE-FLOW-ddb0d608f2a67b71-exit (condition is false; fixture FIX-CASE-FLOW-ddb0d608f2a67b71-exit; reference REF-CASE-FLOW-ddb0d608f2a67b71-exit; test TEST-CASE-FLOW-ddb0d608f2a67b71-exit; evidence plan EVID-CASE-FLOW-ddb0d608f2a67b71-exit) |
| FLOW-8a151bed2775e688 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 47–50 | if | `(cnt != null)` | CASE-FLOW-8a151bed2775e688-true (condition evaluates true; fixture FIX-CASE-FLOW-8a151bed2775e688-true; reference REF-CASE-FLOW-8a151bed2775e688-true; test TEST-CASE-FLOW-8a151bed2775e688-true; evidence plan EVID-CASE-FLOW-8a151bed2775e688-true)<br>CASE-FLOW-8a151bed2775e688-false (condition evaluates false; fixture FIX-CASE-FLOW-8a151bed2775e688-false; reference REF-CASE-FLOW-8a151bed2775e688-false; test TEST-CASE-FLOW-8a151bed2775e688-false; evidence plan EVID-CASE-FLOW-8a151bed2775e688-false) |
| FLOW-a66225567a2acc34 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 53–58 | for_loop | `i < textsetcnt` | CASE-FLOW-a66225567a2acc34-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-a66225567a2acc34-iterate; reference REF-CASE-FLOW-a66225567a2acc34-iterate; test TEST-CASE-FLOW-a66225567a2acc34-iterate; evidence plan EVID-CASE-FLOW-a66225567a2acc34-iterate)<br>CASE-FLOW-a66225567a2acc34-exit (condition is false; fixture FIX-CASE-FLOW-a66225567a2acc34-exit; reference REF-CASE-FLOW-a66225567a2acc34-exit; test TEST-CASE-FLOW-a66225567a2acc34-exit; evidence plan EVID-CASE-FLOW-a66225567a2acc34-exit) |
| FLOW-cf20a7a804368bbb | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 55–57 | if | `(texturemap[i] == null)` | CASE-FLOW-cf20a7a804368bbb-true (condition evaluates true; fixture FIX-CASE-FLOW-cf20a7a804368bbb-true; reference REF-CASE-FLOW-cf20a7a804368bbb-true; test TEST-CASE-FLOW-cf20a7a804368bbb-true; evidence plan EVID-CASE-FLOW-cf20a7a804368bbb-true)<br>CASE-FLOW-cf20a7a804368bbb-false (condition false; no else arm; fixture FIX-CASE-FLOW-cf20a7a804368bbb-false; reference REF-CASE-FLOW-cf20a7a804368bbb-false; test TEST-CASE-FLOW-cf20a7a804368bbb-false; evidence plan EVID-CASE-FLOW-cf20a7a804368bbb-false) |
| FLOW-d4057af32db09741 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 80–90 | switch_statement | `(dat)` | CASE-FLOW-d4057af32db09741-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-d4057af32db09741-case-0; reference REF-CASE-FLOW-d4057af32db09741-case-0; test TEST-CASE-FLOW-d4057af32db09741-case-0; evidence plan EVID-CASE-FLOW-d4057af32db09741-case-0)<br>CASE-FLOW-d4057af32db09741-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-d4057af32db09741-case-1; reference REF-CASE-FLOW-d4057af32db09741-case-1; test TEST-CASE-FLOW-d4057af32db09741-case-1; evidence plan EVID-CASE-FLOW-d4057af32db09741-case-1)<br>CASE-FLOW-d4057af32db09741-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-d4057af32db09741-case-2; reference REF-CASE-FLOW-d4057af32db09741-case-2; test TEST-CASE-FLOW-d4057af32db09741-case-2; evidence plan EVID-CASE-FLOW-d4057af32db09741-case-2)<br>CASE-FLOW-d4057af32db09741-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-d4057af32db09741-unmatched; reference REF-CASE-FLOW-d4057af32db09741-unmatched; test TEST-CASE-FLOW-d4057af32db09741-unmatched; evidence plan EVID-CASE-FLOW-d4057af32db09741-unmatched) |
| FLOW-3467abfa2bed2486 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 100–102 | if | `(o == null)` | CASE-FLOW-3467abfa2bed2486-true (condition evaluates true; fixture FIX-CASE-FLOW-3467abfa2bed2486-true; reference REF-CASE-FLOW-3467abfa2bed2486-true; test TEST-CASE-FLOW-3467abfa2bed2486-true; evidence plan EVID-CASE-FLOW-3467abfa2bed2486-true)<br>CASE-FLOW-3467abfa2bed2486-false (condition false; no else arm; fixture FIX-CASE-FLOW-3467abfa2bed2486-false; reference REF-CASE-FLOW-3467abfa2bed2486-false; test TEST-CASE-FLOW-3467abfa2bed2486-false; evidence plan EVID-CASE-FLOW-3467abfa2bed2486-false) |
| FLOW-2af09bf51a641d5c | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 103–111 | if | `(txtid instanceof String)` | CASE-FLOW-2af09bf51a641d5c-true (condition evaluates true; fixture FIX-CASE-FLOW-2af09bf51a641d5c-true; reference REF-CASE-FLOW-2af09bf51a641d5c-true; test TEST-CASE-FLOW-2af09bf51a641d5c-true; evidence plan EVID-CASE-FLOW-2af09bf51a641d5c-true)<br>CASE-FLOW-2af09bf51a641d5c-false (condition false; no else arm; fixture FIX-CASE-FLOW-2af09bf51a641d5c-false; reference REF-CASE-FLOW-2af09bf51a641d5c-false; test TEST-CASE-FLOW-2af09bf51a641d5c-false; evidence plan EVID-CASE-FLOW-2af09bf51a641d5c-false) |
| FLOW-b514e9c99324792b | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 105–110 | for_loop | `i < texturemap.length` | CASE-FLOW-b514e9c99324792b-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-b514e9c99324792b-iterate; reference REF-CASE-FLOW-b514e9c99324792b-iterate; test TEST-CASE-FLOW-b514e9c99324792b-iterate; evidence plan EVID-CASE-FLOW-b514e9c99324792b-iterate)<br>CASE-FLOW-b514e9c99324792b-exit (condition is false; fixture FIX-CASE-FLOW-b514e9c99324792b-exit; reference REF-CASE-FLOW-b514e9c99324792b-exit; test TEST-CASE-FLOW-b514e9c99324792b-exit; evidence plan EVID-CASE-FLOW-b514e9c99324792b-exit) |
| FLOW-16cd5400dc65efd6 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 106–109 | if | `(os.equals(texturemap[i]))` | CASE-FLOW-16cd5400dc65efd6-true (condition evaluates true; fixture FIX-CASE-FLOW-16cd5400dc65efd6-true; reference REF-CASE-FLOW-16cd5400dc65efd6-true; test TEST-CASE-FLOW-16cd5400dc65efd6-true; evidence plan EVID-CASE-FLOW-16cd5400dc65efd6-true)<br>CASE-FLOW-16cd5400dc65efd6-false (condition false; no else arm; fixture FIX-CASE-FLOW-16cd5400dc65efd6-false; reference REF-CASE-FLOW-16cd5400dc65efd6-false; test TEST-CASE-FLOW-16cd5400dc65efd6-false; evidence plan EVID-CASE-FLOW-16cd5400dc65efd6-false) |
| FLOW-31bddddb02aa25dc | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 112–114 | if | `((idx < 0) \|\| (idx >= textsetcnt))` | CASE-FLOW-31bddddb02aa25dc-true (condition evaluates true; fixture FIX-CASE-FLOW-31bddddb02aa25dc-true; reference REF-CASE-FLOW-31bddddb02aa25dc-true; test TEST-CASE-FLOW-31bddddb02aa25dc-true; evidence plan EVID-CASE-FLOW-31bddddb02aa25dc-true)<br>CASE-FLOW-31bddddb02aa25dc-false (condition false; no else arm; fixture FIX-CASE-FLOW-31bddddb02aa25dc-false; reference REF-CASE-FLOW-31bddddb02aa25dc-false; test TEST-CASE-FLOW-31bddddb02aa25dc-false; evidence plan EVID-CASE-FLOW-31bddddb02aa25dc-false) |
| FLOW-8e2ea137318f5068 | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 116–123 | if | `(o2 != null)` | CASE-FLOW-8e2ea137318f5068-true (condition evaluates true; fixture FIX-CASE-FLOW-8e2ea137318f5068-true; reference REF-CASE-FLOW-8e2ea137318f5068-true; test TEST-CASE-FLOW-8e2ea137318f5068-true; evidence plan EVID-CASE-FLOW-8e2ea137318f5068-true)<br>CASE-FLOW-8e2ea137318f5068-false (condition false; no else arm; fixture FIX-CASE-FLOW-8e2ea137318f5068-false; reference REF-CASE-FLOW-8e2ea137318f5068-false; test TEST-CASE-FLOW-8e2ea137318f5068-false; evidence plan EVID-CASE-FLOW-8e2ea137318f5068-false) |
| FLOW-32a3d74e84136f4e | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 117–122 | if | `(o != null)` | CASE-FLOW-32a3d74e84136f4e-true (condition evaluates true; fixture FIX-CASE-FLOW-32a3d74e84136f4e-true; reference REF-CASE-FLOW-32a3d74e84136f4e-true; test TEST-CASE-FLOW-32a3d74e84136f4e-true; evidence plan EVID-CASE-FLOW-32a3d74e84136f4e-true)<br>CASE-FLOW-32a3d74e84136f4e-false (condition evaluates false; fixture FIX-CASE-FLOW-32a3d74e84136f4e-false; reference REF-CASE-FLOW-32a3d74e84136f4e-false; test TEST-CASE-FLOW-32a3d74e84136f4e-false; evidence plan EVID-CASE-FLOW-32a3d74e84136f4e-false) |
| FLOW-70328023e25a1d8a | `org.dynmap.hdmap.renderer.RailCraftSlabBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 126–128 | for_loop | `i < rp.length` | CASE-FLOW-70328023e25a1d8a-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-70328023e25a1d8a-iterate; reference REF-CASE-FLOW-70328023e25a1d8a-iterate; test TEST-CASE-FLOW-70328023e25a1d8a-iterate; evidence plan EVID-CASE-FLOW-70328023e25a1d8a-iterate)<br>CASE-FLOW-70328023e25a1d8a-exit (condition is false; fixture FIX-CASE-FLOW-70328023e25a1d8a-exit; reference REF-CASE-FLOW-70328023e25a1d8a-exit; test TEST-CASE-FLOW-70328023e25a1d8a-exit; evidence plan EVID-CASE-FLOW-70328023e25a1d8a-exit) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins RailCraftSlabBlockRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer RailCraftSlabBlockRenderer --fixture-set rail-craft-slab-block-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer RailCraftSlabBlockRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin RailCraftSlabBlockRenderer
```
