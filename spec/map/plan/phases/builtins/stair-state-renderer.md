# B-stair-state-renderer: Dynmap built-in renderer StairStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-stair-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/stair-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin StairStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/StairStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/stair-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-e41dfdd33ccc9cd4 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:181 |
| REG-07dbd53c3e79199b | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1222 |
| REG-b979d703a31a3794 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1228 |
| REG-57a42cfd6edce854 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1354 |
| REG-6bbcf769c341dd68 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1505 |
| REG-3370a36b6efc4242 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1802 |
| REG-d806fff51c82af82 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1866 |
| REG-ba50d8032e310efa | static customblock registration | DynmapCore/src/main/resources/models_1.txt:3448 |
| REG-72ffb202028bb194 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:3452 |
| REG-68410b1d28142ba1 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:3454 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-e41dfdd33ccc9cd4 | DynmapCore/src/main/resources/models_1.txt:181 | — | oak_stairs, cobblestone_stairs, brick_stairs, stone_brick_stairs, nether_brick_stairs, sandstone_stairs, spruce_stairs, birch_stairs, jungle_stairs, quartz_stairs, prismarine_stairs, prismarine_brick_stairs, dark_prismarine_stairs |  |  |  |
| REG-07dbd53c3e79199b | DynmapCore/src/main/resources/models_1.txt:1222 | — | acacia_stairs, dark_oak_stairs |  |  |  |
| REG-b979d703a31a3794 | DynmapCore/src/main/resources/models_1.txt:1228 | — | red_sandstone_stairs |  |  |  |
| REG-57a42cfd6edce854 | DynmapCore/src/main/resources/models_1.txt:1354 | — | purpur_stairs |  |  |  |
| REG-6bbcf769c341dd68 | DynmapCore/src/main/resources/models_1.txt:1505 | 1.14- | polished_granite_stairs, smooth_red_sandstone_stairs, mossy_stone_brick_stairs, polished_diorite_stairs, mossy_cobblestone_stairs, end_stone_brick_stairs, stone_stairs, smooth_sandstone_stairs, smooth_quartz_stairs, granite_stairs, andesite_stairs, red_nether_brick_stairs, polished_andesite_stairs, diorite_stairs |  |  |  |
| REG-3370a36b6efc4242 | DynmapCore/src/main/resources/models_1.txt:1802 | 1.16- | crimson_stairs, warped_stairs, blackstone_stairs, polished_blackstone_stairs, polished_blackstone_brick_stairs |  |  |  |
| REG-d806fff51c82af82 | DynmapCore/src/main/resources/models_1.txt:1866 | 1.17- | cobbled_deepslate_stairs, deepslate_brick_stairs, deepslate_tile_stairs, polished_deepslate_stairs, cut_copper_stairs, oxidized_cut_copper_stairs, exposed_cut_copper_stairs, weathered_cut_copper_stairs, waxed_cut_copper_stairs, waxed_oxidized_cut_copper_stairs, waxed_exposed_cut_copper_stairs, waxed_weathered_cut_copper_stairs |  |  |  |
| REG-ba50d8032e310efa | DynmapCore/src/main/resources/models_1.txt:3448 | 1.20.3- | %tuff_stairs |  |  |  |
| REG-72ffb202028bb194 | DynmapCore/src/main/resources/models_1.txt:3452 | 1.20.3- | %polished_tuff_stairs |  |  |  |
| REG-68410b1d28142ba1 | DynmapCore/src/main/resources/models_1.txt:3454 | 1.20.3- | %tuff_brick_stairs |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-e41dfdd33ccc9cd4 | FIX-CASE-REG-e41dfdd33ccc9cd4 | REF-CASE-REG-e41dfdd33ccc9cd4 | TEST-CASE-REG-e41dfdd33ccc9cd4 | EVID-CASE-REG-e41dfdd33ccc9cd4 | DynmapCore/src/main/resources/models_1.txt:181; guard=—; block=oak_stairs, cobblestone_stairs, brick_stairs, stone_brick_stairs, nether_brick_stairs, sandstone_stairs, spruce_stairs, birch_stairs, jungle_stairs, quartz_stairs, prismarine_stairs, prismarine_brick_stairs, dark_prismarine_stairs; data=; state=; parameter keys= |
| CASE-REG-07dbd53c3e79199b | FIX-CASE-REG-07dbd53c3e79199b | REF-CASE-REG-07dbd53c3e79199b | TEST-CASE-REG-07dbd53c3e79199b | EVID-CASE-REG-07dbd53c3e79199b | DynmapCore/src/main/resources/models_1.txt:1222; guard=—; block=acacia_stairs, dark_oak_stairs; data=; state=; parameter keys= |
| CASE-REG-b979d703a31a3794 | FIX-CASE-REG-b979d703a31a3794 | REF-CASE-REG-b979d703a31a3794 | TEST-CASE-REG-b979d703a31a3794 | EVID-CASE-REG-b979d703a31a3794 | DynmapCore/src/main/resources/models_1.txt:1228; guard=—; block=red_sandstone_stairs; data=; state=; parameter keys= |
| CASE-REG-57a42cfd6edce854 | FIX-CASE-REG-57a42cfd6edce854 | REF-CASE-REG-57a42cfd6edce854 | TEST-CASE-REG-57a42cfd6edce854 | EVID-CASE-REG-57a42cfd6edce854 | DynmapCore/src/main/resources/models_1.txt:1354; guard=—; block=purpur_stairs; data=; state=; parameter keys= |
| CASE-REG-6bbcf769c341dd68 | FIX-CASE-REG-6bbcf769c341dd68 | REF-CASE-REG-6bbcf769c341dd68 | TEST-CASE-REG-6bbcf769c341dd68 | EVID-CASE-REG-6bbcf769c341dd68 | DynmapCore/src/main/resources/models_1.txt:1505; guard=1.14-; block=polished_granite_stairs, smooth_red_sandstone_stairs, mossy_stone_brick_stairs, polished_diorite_stairs, mossy_cobblestone_stairs, end_stone_brick_stairs, stone_stairs, smooth_sandstone_stairs, smooth_quartz_stairs, granite_stairs, andesite_stairs, red_nether_brick_stairs, polished_andesite_stairs, diorite_stairs; data=; state=; parameter keys= |
| CASE-REG-3370a36b6efc4242 | FIX-CASE-REG-3370a36b6efc4242 | REF-CASE-REG-3370a36b6efc4242 | TEST-CASE-REG-3370a36b6efc4242 | EVID-CASE-REG-3370a36b6efc4242 | DynmapCore/src/main/resources/models_1.txt:1802; guard=1.16-; block=crimson_stairs, warped_stairs, blackstone_stairs, polished_blackstone_stairs, polished_blackstone_brick_stairs; data=; state=; parameter keys= |
| CASE-REG-d806fff51c82af82 | FIX-CASE-REG-d806fff51c82af82 | REF-CASE-REG-d806fff51c82af82 | TEST-CASE-REG-d806fff51c82af82 | EVID-CASE-REG-d806fff51c82af82 | DynmapCore/src/main/resources/models_1.txt:1866; guard=1.17-; block=cobbled_deepslate_stairs, deepslate_brick_stairs, deepslate_tile_stairs, polished_deepslate_stairs, cut_copper_stairs, oxidized_cut_copper_stairs, exposed_cut_copper_stairs, weathered_cut_copper_stairs, waxed_cut_copper_stairs, waxed_oxidized_cut_copper_stairs, waxed_exposed_cut_copper_stairs, waxed_weathered_cut_copper_stairs; data=; state=; parameter keys= |
| CASE-REG-ba50d8032e310efa | FIX-CASE-REG-ba50d8032e310efa | REF-CASE-REG-ba50d8032e310efa | TEST-CASE-REG-ba50d8032e310efa | EVID-CASE-REG-ba50d8032e310efa | DynmapCore/src/main/resources/models_1.txt:3448; guard=1.20.3-; block=%tuff_stairs; data=; state=; parameter keys= |
| CASE-REG-72ffb202028bb194 | FIX-CASE-REG-72ffb202028bb194 | REF-CASE-REG-72ffb202028bb194 | TEST-CASE-REG-72ffb202028bb194 | EVID-CASE-REG-72ffb202028bb194 | DynmapCore/src/main/resources/models_1.txt:3452; guard=1.20.3-; block=%polished_tuff_stairs; data=; state=; parameter keys= |
| CASE-REG-68410b1d28142ba1 | FIX-CASE-REG-68410b1d28142ba1 | REF-CASE-REG-68410b1d28142ba1 | TEST-CASE-REG-68410b1d28142ba1 | EVID-CASE-REG-68410b1d28142ba1 | DynmapCore/src/main/resources/models_1.txt:3454; guard=1.20.3-; block=%tuff_brick_stairs; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 18 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#TEXTURE_BOTTOM | field | `org.dynmap.hdmap.renderer.StairStateRenderer#TEXTURE_BOTTOM:int` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#TEXTURE_SIDES | field | `org.dynmap.hdmap.renderer.StairStateRenderer#TEXTURE_SIDES:int` | 14–14 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#TEXTURE_TOP | field | `org.dynmap.hdmap.renderer.StairStateRenderer#TEXTURE_TOP:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#midx_by_facing | field | `org.dynmap.hdmap.renderer.StairStateRenderer#midx_by_facing:int[]` | 132–132 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#midx_by_facing_left | field | `org.dynmap.hdmap.renderer.StairStateRenderer#midx_by_facing_left:int[]` | 133–133 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#patchlist | field | `org.dynmap.hdmap.renderer.StairStateRenderer#patchlist:int[]` | 43–43 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#step_1_4_meshes | field | `org.dynmap.hdmap.renderer.StairStateRenderer#step_1_4_meshes:RenderPatch[][]` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#step_3_4_meshes | field | `org.dynmap.hdmap.renderer.StairStateRenderer#step_3_4_meshes:RenderPatch[][]` | 21–21 |
| field:type:org.dynmap.hdmap.renderer.StairStateRenderer#stepmeshes | field | `org.dynmap.hdmap.renderer.StairStateRenderer#stepmeshes:RenderPatch[][]` | 19–19 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.StairStateRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 45–47 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#buildCornerStepMeshes(RenderPatchFactory,int) | method | `org.dynmap.hdmap.renderer.StairStateRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 75–99 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int) | method | `org.dynmap.hdmap.renderer.StairStateRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 101–129 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#buildStepMeshes(RenderPatchFactory,int) | method | `org.dynmap.hdmap.renderer.StairStateRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 49–73 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.StairStateRenderer#getMaximumTextureCount()->int` | 38–41 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.StairStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 134–161 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.StairStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 25–36 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.StairStateRenderer#isOnlyBlockStateSensitive()->boolean` | 162–165 |
| type:org.dynmap.hdmap.renderer.StairStateRenderer | class | `org.dynmap.hdmap.renderer.StairStateRenderer` | 13–166 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.StairStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 25–36 | FLOW-8414c9e7ebc67b78, FLOW-4ec02e2758ea8273 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.StairStateRenderer#getMaximumTextureCount()->int` | 38–41 | none |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.StairStateRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 45–47 | none |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#buildStepMeshes(RenderPatchFactory,int) | `org.dynmap.hdmap.renderer.StairStateRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 49–73 | FLOW-a069e834edd9023c, FLOW-183f2bedd7be38b1 |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#buildCornerStepMeshes(RenderPatchFactory,int) | `org.dynmap.hdmap.renderer.StairStateRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 75–99 | FLOW-2d48618f86d96bcc, FLOW-aae8ecee0bb7886e |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int) | `org.dynmap.hdmap.renderer.StairStateRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` | 101–129 | FLOW-13640e0dcf8ff6a2, FLOW-cb70034ed70371aa |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.StairStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 134–161 | FLOW-1560ddef3defb84f |
| method:type:org.dynmap.hdmap.renderer.StairStateRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.StairStateRenderer#isOnlyBlockStateSensitive()->boolean` | 162–165 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-8414c9e7ebc67b78 | `org.dynmap.hdmap.renderer.StairStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 27–28 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-8414c9e7ebc67b78-true (condition evaluates true; fixture FIX-CASE-FLOW-8414c9e7ebc67b78-true; reference REF-CASE-FLOW-8414c9e7ebc67b78-true; test TEST-CASE-FLOW-8414c9e7ebc67b78-true; evidence plan EVID-CASE-FLOW-8414c9e7ebc67b78-true)<br>CASE-FLOW-8414c9e7ebc67b78-false (condition false; no else arm; fixture FIX-CASE-FLOW-8414c9e7ebc67b78-false; reference REF-CASE-FLOW-8414c9e7ebc67b78-false; test TEST-CASE-FLOW-8414c9e7ebc67b78-false; evidence plan EVID-CASE-FLOW-8414c9e7ebc67b78-false) |
| FLOW-4ec02e2758ea8273 | `org.dynmap.hdmap.renderer.StairStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 30–34 | for_loop | `i < 8` | CASE-FLOW-4ec02e2758ea8273-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-4ec02e2758ea8273-iterate; reference REF-CASE-FLOW-4ec02e2758ea8273-iterate; test TEST-CASE-FLOW-4ec02e2758ea8273-iterate; evidence plan EVID-CASE-FLOW-4ec02e2758ea8273-iterate)<br>CASE-FLOW-4ec02e2758ea8273-exit (condition is false; fixture FIX-CASE-FLOW-4ec02e2758ea8273-exit; reference REF-CASE-FLOW-4ec02e2758ea8273-exit; test TEST-CASE-FLOW-4ec02e2758ea8273-exit; evidence plan EVID-CASE-FLOW-4ec02e2758ea8273-exit) |
| FLOW-a069e834edd9023c | `org.dynmap.hdmap.renderer.StairStateRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 52–57 | if | `((dat & 4) != 0)` | CASE-FLOW-a069e834edd9023c-true (condition evaluates true; fixture FIX-CASE-FLOW-a069e834edd9023c-true; reference REF-CASE-FLOW-a069e834edd9023c-true; test TEST-CASE-FLOW-a069e834edd9023c-true; evidence plan EVID-CASE-FLOW-a069e834edd9023c-true)<br>CASE-FLOW-a069e834edd9023c-false (condition evaluates false; fixture FIX-CASE-FLOW-a069e834edd9023c-false; reference REF-CASE-FLOW-a069e834edd9023c-false; test TEST-CASE-FLOW-a069e834edd9023c-false; evidence plan EVID-CASE-FLOW-a069e834edd9023c-false) |
| FLOW-183f2bedd7be38b1 | `org.dynmap.hdmap.renderer.StairStateRenderer#buildStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 58–71 | switch_statement | `(dat & 3)` | CASE-FLOW-183f2bedd7be38b1-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-183f2bedd7be38b1-case-0; reference REF-CASE-FLOW-183f2bedd7be38b1-case-0; test TEST-CASE-FLOW-183f2bedd7be38b1-case-0; evidence plan EVID-CASE-FLOW-183f2bedd7be38b1-case-0)<br>CASE-FLOW-183f2bedd7be38b1-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-183f2bedd7be38b1-case-1; reference REF-CASE-FLOW-183f2bedd7be38b1-case-1; test TEST-CASE-FLOW-183f2bedd7be38b1-case-1; evidence plan EVID-CASE-FLOW-183f2bedd7be38b1-case-1)<br>CASE-FLOW-183f2bedd7be38b1-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-183f2bedd7be38b1-case-2; reference REF-CASE-FLOW-183f2bedd7be38b1-case-2; test TEST-CASE-FLOW-183f2bedd7be38b1-case-2; evidence plan EVID-CASE-FLOW-183f2bedd7be38b1-case-2)<br>CASE-FLOW-183f2bedd7be38b1-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-183f2bedd7be38b1-case-3; reference REF-CASE-FLOW-183f2bedd7be38b1-case-3; test TEST-CASE-FLOW-183f2bedd7be38b1-case-3; evidence plan EVID-CASE-FLOW-183f2bedd7be38b1-case-3)<br>CASE-FLOW-183f2bedd7be38b1-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-183f2bedd7be38b1-unmatched; reference REF-CASE-FLOW-183f2bedd7be38b1-unmatched; test TEST-CASE-FLOW-183f2bedd7be38b1-unmatched; evidence plan EVID-CASE-FLOW-183f2bedd7be38b1-unmatched) |
| FLOW-2d48618f86d96bcc | `org.dynmap.hdmap.renderer.StairStateRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 78–83 | if | `((dat & 4) != 0)` | CASE-FLOW-2d48618f86d96bcc-true (condition evaluates true; fixture FIX-CASE-FLOW-2d48618f86d96bcc-true; reference REF-CASE-FLOW-2d48618f86d96bcc-true; test TEST-CASE-FLOW-2d48618f86d96bcc-true; evidence plan EVID-CASE-FLOW-2d48618f86d96bcc-true)<br>CASE-FLOW-2d48618f86d96bcc-false (condition evaluates false; fixture FIX-CASE-FLOW-2d48618f86d96bcc-false; reference REF-CASE-FLOW-2d48618f86d96bcc-false; test TEST-CASE-FLOW-2d48618f86d96bcc-false; evidence plan EVID-CASE-FLOW-2d48618f86d96bcc-false) |
| FLOW-aae8ecee0bb7886e | `org.dynmap.hdmap.renderer.StairStateRenderer#buildCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 84–97 | switch_statement | `(dat & 3)` | CASE-FLOW-aae8ecee0bb7886e-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-aae8ecee0bb7886e-case-0; reference REF-CASE-FLOW-aae8ecee0bb7886e-case-0; test TEST-CASE-FLOW-aae8ecee0bb7886e-case-0; evidence plan EVID-CASE-FLOW-aae8ecee0bb7886e-case-0)<br>CASE-FLOW-aae8ecee0bb7886e-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-aae8ecee0bb7886e-case-1; reference REF-CASE-FLOW-aae8ecee0bb7886e-case-1; test TEST-CASE-FLOW-aae8ecee0bb7886e-case-1; evidence plan EVID-CASE-FLOW-aae8ecee0bb7886e-case-1)<br>CASE-FLOW-aae8ecee0bb7886e-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-aae8ecee0bb7886e-case-2; reference REF-CASE-FLOW-aae8ecee0bb7886e-case-2; test TEST-CASE-FLOW-aae8ecee0bb7886e-case-2; evidence plan EVID-CASE-FLOW-aae8ecee0bb7886e-case-2)<br>CASE-FLOW-aae8ecee0bb7886e-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-aae8ecee0bb7886e-case-3; reference REF-CASE-FLOW-aae8ecee0bb7886e-case-3; test TEST-CASE-FLOW-aae8ecee0bb7886e-case-3; evidence plan EVID-CASE-FLOW-aae8ecee0bb7886e-case-3)<br>CASE-FLOW-aae8ecee0bb7886e-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-aae8ecee0bb7886e-unmatched; reference REF-CASE-FLOW-aae8ecee0bb7886e-unmatched; test TEST-CASE-FLOW-aae8ecee0bb7886e-unmatched; evidence plan EVID-CASE-FLOW-aae8ecee0bb7886e-unmatched) |
| FLOW-13640e0dcf8ff6a2 | `org.dynmap.hdmap.renderer.StairStateRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 104–109 | if | `((dat & 4) != 0)` | CASE-FLOW-13640e0dcf8ff6a2-true (condition evaluates true; fixture FIX-CASE-FLOW-13640e0dcf8ff6a2-true; reference REF-CASE-FLOW-13640e0dcf8ff6a2-true; test TEST-CASE-FLOW-13640e0dcf8ff6a2-true; evidence plan EVID-CASE-FLOW-13640e0dcf8ff6a2-true)<br>CASE-FLOW-13640e0dcf8ff6a2-false (condition evaluates false; fixture FIX-CASE-FLOW-13640e0dcf8ff6a2-false; reference REF-CASE-FLOW-13640e0dcf8ff6a2-false; test TEST-CASE-FLOW-13640e0dcf8ff6a2-false; evidence plan EVID-CASE-FLOW-13640e0dcf8ff6a2-false) |
| FLOW-cb70034ed70371aa | `org.dynmap.hdmap.renderer.StairStateRenderer#buildIntCornerStepMeshes(RenderPatchFactory,int)->RenderPatch[]` 110–127 | switch_statement | `(dat & 3)` | CASE-FLOW-cb70034ed70371aa-case-0 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-cb70034ed70371aa-case-0; reference REF-CASE-FLOW-cb70034ed70371aa-case-0; test TEST-CASE-FLOW-cb70034ed70371aa-case-0; evidence plan EVID-CASE-FLOW-cb70034ed70371aa-case-0)<br>CASE-FLOW-cb70034ed70371aa-case-1 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-cb70034ed70371aa-case-1; reference REF-CASE-FLOW-cb70034ed70371aa-case-1; test TEST-CASE-FLOW-cb70034ed70371aa-case-1; evidence plan EVID-CASE-FLOW-cb70034ed70371aa-case-1)<br>CASE-FLOW-cb70034ed70371aa-case-2 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-cb70034ed70371aa-case-2; reference REF-CASE-FLOW-cb70034ed70371aa-case-2; test TEST-CASE-FLOW-cb70034ed70371aa-case-2; evidence plan EVID-CASE-FLOW-cb70034ed70371aa-case-2)<br>CASE-FLOW-cb70034ed70371aa-case-3 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-cb70034ed70371aa-case-3; reference REF-CASE-FLOW-cb70034ed70371aa-case-3; test TEST-CASE-FLOW-cb70034ed70371aa-case-3; evidence plan EVID-CASE-FLOW-cb70034ed70371aa-case-3)<br>CASE-FLOW-cb70034ed70371aa-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-cb70034ed70371aa-unmatched; reference REF-CASE-FLOW-cb70034ed70371aa-unmatched; test TEST-CASE-FLOW-cb70034ed70371aa-unmatched; evidence plan EVID-CASE-FLOW-cb70034ed70371aa-unmatched) |
| FLOW-1560ddef3defb84f | `org.dynmap.hdmap.renderer.StairStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 143–159 | switch_statement | `(shape)` | CASE-FLOW-1560ddef3defb84f-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-1560ddef3defb84f-case-0; reference REF-CASE-FLOW-1560ddef3defb84f-case-0; test TEST-CASE-FLOW-1560ddef3defb84f-case-0; evidence plan EVID-CASE-FLOW-1560ddef3defb84f-case-0)<br>CASE-FLOW-1560ddef3defb84f-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-1560ddef3defb84f-case-1; reference REF-CASE-FLOW-1560ddef3defb84f-case-1; test TEST-CASE-FLOW-1560ddef3defb84f-case-1; evidence plan EVID-CASE-FLOW-1560ddef3defb84f-case-1)<br>CASE-FLOW-1560ddef3defb84f-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-1560ddef3defb84f-case-2; reference REF-CASE-FLOW-1560ddef3defb84f-case-2; test TEST-CASE-FLOW-1560ddef3defb84f-case-2; evidence plan EVID-CASE-FLOW-1560ddef3defb84f-case-2)<br>CASE-FLOW-1560ddef3defb84f-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-1560ddef3defb84f-case-3; reference REF-CASE-FLOW-1560ddef3defb84f-case-3; test TEST-CASE-FLOW-1560ddef3defb84f-case-3; evidence plan EVID-CASE-FLOW-1560ddef3defb84f-case-3)<br>CASE-FLOW-1560ddef3defb84f-case-4 (selector matches source case label(s): 4; labels=4; fixture FIX-CASE-FLOW-1560ddef3defb84f-case-4; reference REF-CASE-FLOW-1560ddef3defb84f-case-4; test TEST-CASE-FLOW-1560ddef3defb84f-case-4; evidence plan EVID-CASE-FLOW-1560ddef3defb84f-case-4)<br>CASE-FLOW-1560ddef3defb84f-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-1560ddef3defb84f-unmatched; reference REF-CASE-FLOW-1560ddef3defb84f-unmatched; test TEST-CASE-FLOW-1560ddef3defb84f-unmatched; evidence plan EVID-CASE-FLOW-1560ddef3defb84f-unmatched) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins StairStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer StairStateRenderer --fixture-set stair-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer StairStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin StairStateRenderer
```
