# B-immibis-micro-renderer: Dynmap built-in renderer ImmibisMicroRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-immibis-micro-renderer",
  "kind": "builtin",
  "document": "phases/builtins/immibis-micro-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin ImmibisMicroRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ImmibisMicroRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/immibis-micro-renderer.rs。共通処理はdomain/model/traversalへ置く。
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

This file contributes 19 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| enum_constant:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#CENTER | enum_constant | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#CENTER:AxisPos` | 252–252 |
| enum_constant:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#NEGATIVE | enum_constant | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#NEGATIVE:AxisPos` | 253–253 |
| enum_constant:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#POSITIVE | enum_constant | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#POSITIVE:AxisPos` | 254–254 |
| enum_constant:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#SPAN | enum_constant | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos#SPAN:AxisPos` | 255–255 |
| field:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#NUM_TEXTURES | field | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#NUM_TEXTURES:int` | 107–107 |
| field:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#axes_by_pos | field | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#axes_by_pos:AxisPos[][]` | 258–289 |
| field:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#materialTextureMap | field | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#materialTextureMap:int[][]` | 110–201 |
| field:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#tileFields | field | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#tileFields:String[]` | 15–15 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList%3cRenderPatch%3e,int,int) | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` | 312–373 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMax(AxisPos,double) | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMax(AxisPos,double)->double` | 301–310 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMin(AxisPos,double) | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMin(AxisPos,double)->double` | 291–300 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getMaximumTextureCount()->int` | 217–220 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 222–242 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getThickness(int) | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getThickness(int)->double` | 247–249 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getTileEntityFieldsNeeded()->String[]` | 375–378 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 202–215 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#isHollow(int) | method | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#isHollow(int)->boolean` | 244–246 |
| type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer | class | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer` | 14–379 |
| type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos | enum | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer$AxisPos` | 251–256 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 202–215 | FLOW-d9a015665b78e187, FLOW-9126b55420eb0801, FLOW-2d9be4ecd6277771 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getMaximumTextureCount()->int` | 217–220 | none |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 222–242 | FLOW-fc107e2c6bfd45ab, FLOW-f7b568fe576b7ec8, FLOW-b6136132fdf5c093, FLOW-6b11ae2eea776591 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#isHollow(int) | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#isHollow(int)->boolean` | 244–246 | none |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getThickness(int) | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getThickness(int)->double` | 247–249 | none |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMin(AxisPos,double) | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMin(AxisPos,double)->double` | 291–300 | FLOW-4cebc146fc7f4129 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMax(AxisPos,double) | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMax(AxisPos,double)->double` | 301–310 | FLOW-ab36e32cc035e6ac |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList%3cRenderPatch%3e,int,int) | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` | 312–373 | FLOW-21df3646dc798a74, FLOW-7aacede5a5515256, FLOW-159eb53146ae9466, FLOW-887e64184d1c0a15, FLOW-a44175de66900e5d, FLOW-833a31d6f3d15777 |
| method:type:org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getTileEntityFieldsNeeded()->String[]` | 375–378 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-d9a015665b78e187 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 204–205 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-d9a015665b78e187-true (condition evaluates true; fixture FIX-CASE-FLOW-d9a015665b78e187-true; reference REF-CASE-FLOW-d9a015665b78e187-true; test TEST-CASE-FLOW-d9a015665b78e187-true; evidence plan EVID-CASE-FLOW-d9a015665b78e187-true)<br>CASE-FLOW-d9a015665b78e187-false (condition false; no else arm; fixture FIX-CASE-FLOW-d9a015665b78e187-false; reference REF-CASE-FLOW-d9a015665b78e187-false; test TEST-CASE-FLOW-d9a015665b78e187-false; evidence plan EVID-CASE-FLOW-d9a015665b78e187-false) |
| FLOW-9126b55420eb0801 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 207–213 | for_loop | `i < materialTextureMap.length` | CASE-FLOW-9126b55420eb0801-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-9126b55420eb0801-iterate; reference REF-CASE-FLOW-9126b55420eb0801-iterate; test TEST-CASE-FLOW-9126b55420eb0801-iterate; evidence plan EVID-CASE-FLOW-9126b55420eb0801-iterate)<br>CASE-FLOW-9126b55420eb0801-exit (condition is false; fixture FIX-CASE-FLOW-9126b55420eb0801-exit; reference REF-CASE-FLOW-9126b55420eb0801-exit; test TEST-CASE-FLOW-9126b55420eb0801-exit; evidence plan EVID-CASE-FLOW-9126b55420eb0801-exit) |
| FLOW-2d9be4ecd6277771 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 208–212 | if | `(materialTextureMap[i].length < 6)` | CASE-FLOW-2d9be4ecd6277771-true (condition evaluates true; fixture FIX-CASE-FLOW-2d9be4ecd6277771-true; reference REF-CASE-FLOW-2d9be4ecd6277771-true; test TEST-CASE-FLOW-2d9be4ecd6277771-true; evidence plan EVID-CASE-FLOW-2d9be4ecd6277771-true)<br>CASE-FLOW-2d9be4ecd6277771-false (condition false; no else arm; fixture FIX-CASE-FLOW-2d9be4ecd6277771-false; reference REF-CASE-FLOW-2d9be4ecd6277771-false; test TEST-CASE-FLOW-2d9be4ecd6277771-false; evidence plan EVID-CASE-FLOW-2d9be4ecd6277771-false) |
| FLOW-fc107e2c6bfd45ab | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 228–240 | if | `((v != null) && (v instanceof List))` | CASE-FLOW-fc107e2c6bfd45ab-true (condition evaluates true; fixture FIX-CASE-FLOW-fc107e2c6bfd45ab-true; reference REF-CASE-FLOW-fc107e2c6bfd45ab-true; test TEST-CASE-FLOW-fc107e2c6bfd45ab-true; evidence plan EVID-CASE-FLOW-fc107e2c6bfd45ab-true)<br>CASE-FLOW-fc107e2c6bfd45ab-false (condition false; no else arm; fixture FIX-CASE-FLOW-fc107e2c6bfd45ab-false; reference REF-CASE-FLOW-fc107e2c6bfd45ab-false; test TEST-CASE-FLOW-fc107e2c6bfd45ab-false; evidence plan EVID-CASE-FLOW-fc107e2c6bfd45ab-false) |
| FLOW-f7b568fe576b7ec8 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 230–239 | enhanced_for_loop | `Object lval : lv` | CASE-FLOW-f7b568fe576b7ec8-each_element (execute body once per iterable element; fixture FIX-CASE-FLOW-f7b568fe576b7ec8-each_element; reference REF-CASE-FLOW-f7b568fe576b7ec8-each_element; test TEST-CASE-FLOW-f7b568fe576b7ec8-each_element; evidence plan EVID-CASE-FLOW-f7b568fe576b7ec8-each_element)<br>CASE-FLOW-f7b568fe576b7ec8-empty_or_exhausted (no remaining element; fixture FIX-CASE-FLOW-f7b568fe576b7ec8-empty_or_exhausted; reference REF-CASE-FLOW-f7b568fe576b7ec8-empty_or_exhausted; test TEST-CASE-FLOW-f7b568fe576b7ec8-empty_or_exhausted; evidence plan EVID-CASE-FLOW-f7b568fe576b7ec8-empty_or_exhausted) |
| FLOW-b6136132fdf5c093 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 231–238 | if | `(lval instanceof Map)` | CASE-FLOW-b6136132fdf5c093-true (condition evaluates true; fixture FIX-CASE-FLOW-b6136132fdf5c093-true; reference REF-CASE-FLOW-b6136132fdf5c093-true; test TEST-CASE-FLOW-b6136132fdf5c093-true; evidence plan EVID-CASE-FLOW-b6136132fdf5c093-true)<br>CASE-FLOW-b6136132fdf5c093-false (condition false; no else arm; fixture FIX-CASE-FLOW-b6136132fdf5c093-false; reference REF-CASE-FLOW-b6136132fdf5c093-false; test TEST-CASE-FLOW-b6136132fdf5c093-false; evidence plan EVID-CASE-FLOW-b6136132fdf5c093-false) |
| FLOW-6b11ae2eea776591 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 235–237 | if | `((type != null) && (pos != null))` | CASE-FLOW-6b11ae2eea776591-true (condition evaluates true; fixture FIX-CASE-FLOW-6b11ae2eea776591-true; reference REF-CASE-FLOW-6b11ae2eea776591-true; test TEST-CASE-FLOW-6b11ae2eea776591-true; evidence plan EVID-CASE-FLOW-6b11ae2eea776591-true)<br>CASE-FLOW-6b11ae2eea776591-false (condition false; no else arm; fixture FIX-CASE-FLOW-6b11ae2eea776591-false; reference REF-CASE-FLOW-6b11ae2eea776591-false; test TEST-CASE-FLOW-6b11ae2eea776591-false; evidence plan EVID-CASE-FLOW-6b11ae2eea776591-false) |
| FLOW-4cebc146fc7f4129 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMin(AxisPos,double)->double` 292–299 | switch_statement | `(ap)` | CASE-FLOW-4cebc146fc7f4129-case-0 (selector matches source case label(s): POSITIVE; labels=POSITIVE; fixture FIX-CASE-FLOW-4cebc146fc7f4129-case-0; reference REF-CASE-FLOW-4cebc146fc7f4129-case-0; test TEST-CASE-FLOW-4cebc146fc7f4129-case-0; evidence plan EVID-CASE-FLOW-4cebc146fc7f4129-case-0)<br>CASE-FLOW-4cebc146fc7f4129-case-1 (selector matches source case label(s): CENTER; labels=CENTER; fixture FIX-CASE-FLOW-4cebc146fc7f4129-case-1; reference REF-CASE-FLOW-4cebc146fc7f4129-case-1; test TEST-CASE-FLOW-4cebc146fc7f4129-case-1; evidence plan EVID-CASE-FLOW-4cebc146fc7f4129-case-1)<br>CASE-FLOW-4cebc146fc7f4129-case-2 (default selector arm; labels=default; labels=default; fixture FIX-CASE-FLOW-4cebc146fc7f4129-case-2; reference REF-CASE-FLOW-4cebc146fc7f4129-case-2; test TEST-CASE-FLOW-4cebc146fc7f4129-case-2; evidence plan EVID-CASE-FLOW-4cebc146fc7f4129-case-2) |
| FLOW-ab36e32cc035e6ac | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#getAxisMax(AxisPos,double)->double` 302–309 | switch_statement | `(ap)` | CASE-FLOW-ab36e32cc035e6ac-case-0 (selector matches source case label(s): NEGATIVE; labels=NEGATIVE; fixture FIX-CASE-FLOW-ab36e32cc035e6ac-case-0; reference REF-CASE-FLOW-ab36e32cc035e6ac-case-0; test TEST-CASE-FLOW-ab36e32cc035e6ac-case-0; evidence plan EVID-CASE-FLOW-ab36e32cc035e6ac-case-0)<br>CASE-FLOW-ab36e32cc035e6ac-case-1 (selector matches source case label(s): CENTER; labels=CENTER; fixture FIX-CASE-FLOW-ab36e32cc035e6ac-case-1; reference REF-CASE-FLOW-ab36e32cc035e6ac-case-1; test TEST-CASE-FLOW-ab36e32cc035e6ac-case-1; evidence plan EVID-CASE-FLOW-ab36e32cc035e6ac-case-1)<br>CASE-FLOW-ab36e32cc035e6ac-case-2 (default selector arm; labels=default; labels=default; fixture FIX-CASE-FLOW-ab36e32cc035e6ac-case-2; reference REF-CASE-FLOW-ab36e32cc035e6ac-case-2; test TEST-CASE-FLOW-ab36e32cc035e6ac-case-2; evidence plan EVID-CASE-FLOW-ab36e32cc035e6ac-case-2) |
| FLOW-21df3646dc798a74 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` 318–320 | if | `((material < 0) \|\| (material >= materialTextureMap.length))` | CASE-FLOW-21df3646dc798a74-true (condition evaluates true; fixture FIX-CASE-FLOW-21df3646dc798a74-true; reference REF-CASE-FLOW-21df3646dc798a74-true; test TEST-CASE-FLOW-21df3646dc798a74-true; evidence plan EVID-CASE-FLOW-21df3646dc798a74-true)<br>CASE-FLOW-21df3646dc798a74-false (condition false; no else arm; fixture FIX-CASE-FLOW-21df3646dc798a74-false; reference REF-CASE-FLOW-21df3646dc798a74-false; test TEST-CASE-FLOW-21df3646dc798a74-false; evidence plan EVID-CASE-FLOW-21df3646dc798a74-false) |
| FLOW-7aacede5a5515256 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` 321–323 | if | `((pos < 0) \|\| (pos >= axes_by_pos.length))` | CASE-FLOW-7aacede5a5515256-true (condition evaluates true; fixture FIX-CASE-FLOW-7aacede5a5515256-true; reference REF-CASE-FLOW-7aacede5a5515256-true; test TEST-CASE-FLOW-7aacede5a5515256-true; evidence plan EVID-CASE-FLOW-7aacede5a5515256-true)<br>CASE-FLOW-7aacede5a5515256-false (condition false; no else arm; fixture FIX-CASE-FLOW-7aacede5a5515256-false; reference REF-CASE-FLOW-7aacede5a5515256-false; test TEST-CASE-FLOW-7aacede5a5515256-false; evidence plan EVID-CASE-FLOW-7aacede5a5515256-false) |
| FLOW-159eb53146ae9466 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` 326–326 | if | `(thick <= 0.0)` | CASE-FLOW-159eb53146ae9466-true (condition evaluates true; fixture FIX-CASE-FLOW-159eb53146ae9466-true; reference REF-CASE-FLOW-159eb53146ae9466-true; test TEST-CASE-FLOW-159eb53146ae9466-true; evidence plan EVID-CASE-FLOW-159eb53146ae9466-true)<br>CASE-FLOW-159eb53146ae9466-false (condition false; no else arm; fixture FIX-CASE-FLOW-159eb53146ae9466-false; reference REF-CASE-FLOW-159eb53146ae9466-false; test TEST-CASE-FLOW-159eb53146ae9466-false; evidence plan EVID-CASE-FLOW-159eb53146ae9466-false) |
| FLOW-887e64184d1c0a15 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` 327–327 | if | `(thick > 1.0)` | CASE-FLOW-887e64184d1c0a15-true (condition evaluates true; fixture FIX-CASE-FLOW-887e64184d1c0a15-true; reference REF-CASE-FLOW-887e64184d1c0a15-true; test TEST-CASE-FLOW-887e64184d1c0a15-true; evidence plan EVID-CASE-FLOW-887e64184d1c0a15-true)<br>CASE-FLOW-887e64184d1c0a15-false (condition false; no else arm; fixture FIX-CASE-FLOW-887e64184d1c0a15-false; reference REF-CASE-FLOW-887e64184d1c0a15-false; test TEST-CASE-FLOW-887e64184d1c0a15-false; evidence plan EVID-CASE-FLOW-887e64184d1c0a15-false) |
| FLOW-a44175de66900e5d | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` 330–372 | if | `(isHollow(shape))` | CASE-FLOW-a44175de66900e5d-true (condition evaluates true; fixture FIX-CASE-FLOW-a44175de66900e5d-true; reference REF-CASE-FLOW-a44175de66900e5d-true; test TEST-CASE-FLOW-a44175de66900e5d-true; evidence plan EVID-CASE-FLOW-a44175de66900e5d-true)<br>CASE-FLOW-a44175de66900e5d-false (condition evaluates false; fixture FIX-CASE-FLOW-a44175de66900e5d-false; reference REF-CASE-FLOW-a44175de66900e5d-false; test TEST-CASE-FLOW-a44175de66900e5d-false; evidence plan EVID-CASE-FLOW-a44175de66900e5d-false) |
| FLOW-833a31d6f3d15777 | `org.dynmap.hdmap.renderer.ImmibisMicroRenderer#addPatchesFor(RenderPatchFactory,ArrayList<RenderPatch>,int,int)->void` 331–368 | switch_statement | `(pos)` | CASE-FLOW-833a31d6f3d15777-case-0 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-833a31d6f3d15777-case-0; reference REF-CASE-FLOW-833a31d6f3d15777-case-0; test TEST-CASE-FLOW-833a31d6f3d15777-case-0; evidence plan EVID-CASE-FLOW-833a31d6f3d15777-case-0)<br>CASE-FLOW-833a31d6f3d15777-case-1 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-833a31d6f3d15777-case-1; reference REF-CASE-FLOW-833a31d6f3d15777-case-1; test TEST-CASE-FLOW-833a31d6f3d15777-case-1; evidence plan EVID-CASE-FLOW-833a31d6f3d15777-case-1)<br>CASE-FLOW-833a31d6f3d15777-case-2 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-833a31d6f3d15777-case-2; reference REF-CASE-FLOW-833a31d6f3d15777-case-2; test TEST-CASE-FLOW-833a31d6f3d15777-case-2; evidence plan EVID-CASE-FLOW-833a31d6f3d15777-case-2)<br>CASE-FLOW-833a31d6f3d15777-case-3 (selector matches source case label(s): 4; labels=4; fixture FIX-CASE-FLOW-833a31d6f3d15777-case-3; reference REF-CASE-FLOW-833a31d6f3d15777-case-3; test TEST-CASE-FLOW-833a31d6f3d15777-case-3; evidence plan EVID-CASE-FLOW-833a31d6f3d15777-case-3)<br>CASE-FLOW-833a31d6f3d15777-case-4 (selector matches source case label(s): 5; labels=5; fixture FIX-CASE-FLOW-833a31d6f3d15777-case-4; reference REF-CASE-FLOW-833a31d6f3d15777-case-4; test TEST-CASE-FLOW-833a31d6f3d15777-case-4; evidence plan EVID-CASE-FLOW-833a31d6f3d15777-case-4)<br>CASE-FLOW-833a31d6f3d15777-case-5 (selector matches source case label(s): 6; labels=6; fixture FIX-CASE-FLOW-833a31d6f3d15777-case-5; reference REF-CASE-FLOW-833a31d6f3d15777-case-5; test TEST-CASE-FLOW-833a31d6f3d15777-case-5; evidence plan EVID-CASE-FLOW-833a31d6f3d15777-case-5)<br>CASE-FLOW-833a31d6f3d15777-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-833a31d6f3d15777-unmatched; reference REF-CASE-FLOW-833a31d6f3d15777-unmatched; test TEST-CASE-FLOW-833a31d6f3d15777-unmatched; evidence plan EVID-CASE-FLOW-833a31d6f3d15777-unmatched) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins ImmibisMicroRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer ImmibisMicroRenderer --fixture-set immibis-micro-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer ImmibisMicroRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin ImmibisMicroRenderer
```
