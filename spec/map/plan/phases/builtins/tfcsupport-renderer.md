# B-tfcsupport-renderer: Dynmap built-in renderer TFCSupportRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-tfcsupport-renderer",
  "kind": "builtin",
  "document": "phases/builtins/tfcsupport-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin TFCSupportRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/TFCSupportRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/tfcsupport-renderer.rs。共通処理はdomain/model/traversalへ置く。
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

This file contributes 20 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_X | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_X:int` | 21–21 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_XN | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_XN:int` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_XP | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_XP:int` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_YN | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_YN:int` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_Z | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_Z:int` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_ZN | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_ZN:int` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_ZP | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#SIDE_ZP:int` | 22–22 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#horizid | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#horizid:BitSet` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#isVert | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#isVert:boolean` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#meshes | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#meshes:RenderPatch[][]` | 28–28 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#patchlist | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#patchlist:int[]` | 61–61 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#sides | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#sides:int[][]` | 104–109 |
| field:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#vertid | field | `org.dynmap.hdmap.renderer.TFCSupportRenderer#vertid:BitSet` | 16–16 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.TFCSupportRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 63–65 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory)->void` | 67–102 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getMaximumTextureCount()->int` | 56–59 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 111–129 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.TFCSupportRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 38–54 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#setID(BitSet,String) | method | `org.dynmap.hdmap.renderer.TFCSupportRenderer#setID(BitSet,String)->void` | 30–37 |
| type:org.dynmap.hdmap.renderer.TFCSupportRenderer | class | `org.dynmap.hdmap.renderer.TFCSupportRenderer` | 14–130 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#setID(BitSet,String) | `org.dynmap.hdmap.renderer.TFCSupportRenderer#setID(BitSet,String)->void` | 30–37 | FLOW-67552fc4f2203f52, FLOW-2ddcfe3b28b87f0a |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.TFCSupportRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 38–54 | FLOW-3e0368b4d343326c, FLOW-d9dc921732989107 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getMaximumTextureCount()->int` | 56–59 | none |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.TFCSupportRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 63–65 | none |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory) | `org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory)->void` | 67–102 | FLOW-4628a2237e26cdbf, FLOW-bce425862069537f, FLOW-9b50cb1b8b4a5236, FLOW-8702e7958dd37090 |
| method:type:org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 111–129 | FLOW-1c37fbdf2c784b95, FLOW-694ccef80f6b1b7e, FLOW-cb28288f08932dac, FLOW-534750a42ee88640, FLOW-169561a3170efa59 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-67552fc4f2203f52 | `org.dynmap.hdmap.renderer.TFCSupportRenderer#setID(BitSet,String)->void` 32–36 | if | `(bbs.isNotAir())` | CASE-FLOW-67552fc4f2203f52-true (condition evaluates true; fixture FIX-CASE-FLOW-67552fc4f2203f52-true; reference REF-CASE-FLOW-67552fc4f2203f52-true; test TEST-CASE-FLOW-67552fc4f2203f52-true; evidence plan EVID-CASE-FLOW-67552fc4f2203f52-true)<br>CASE-FLOW-67552fc4f2203f52-false (condition false; no else arm; fixture FIX-CASE-FLOW-67552fc4f2203f52-false; reference REF-CASE-FLOW-67552fc4f2203f52-false; test TEST-CASE-FLOW-67552fc4f2203f52-false; evidence plan EVID-CASE-FLOW-67552fc4f2203f52-false) |
| FLOW-2ddcfe3b28b87f0a | `org.dynmap.hdmap.renderer.TFCSupportRenderer#setID(BitSet,String)->void` 33–35 | for_loop | `i < bbs.getStateCount()` | CASE-FLOW-2ddcfe3b28b87f0a-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-2ddcfe3b28b87f0a-iterate; reference REF-CASE-FLOW-2ddcfe3b28b87f0a-iterate; test TEST-CASE-FLOW-2ddcfe3b28b87f0a-iterate; evidence plan EVID-CASE-FLOW-2ddcfe3b28b87f0a-iterate)<br>CASE-FLOW-2ddcfe3b28b87f0a-exit (condition is false; fixture FIX-CASE-FLOW-2ddcfe3b28b87f0a-exit; reference REF-CASE-FLOW-2ddcfe3b28b87f0a-exit; test TEST-CASE-FLOW-2ddcfe3b28b87f0a-exit; evidence plan EVID-CASE-FLOW-2ddcfe3b28b87f0a-exit) |
| FLOW-3e0368b4d343326c | `org.dynmap.hdmap.renderer.TFCSupportRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 40–41 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-3e0368b4d343326c-true (condition evaluates true; fixture FIX-CASE-FLOW-3e0368b4d343326c-true; reference REF-CASE-FLOW-3e0368b4d343326c-true; test TEST-CASE-FLOW-3e0368b4d343326c-true; evidence plan EVID-CASE-FLOW-3e0368b4d343326c-true)<br>CASE-FLOW-3e0368b4d343326c-false (condition false; no else arm; fixture FIX-CASE-FLOW-3e0368b4d343326c-false; reference REF-CASE-FLOW-3e0368b4d343326c-false; test TEST-CASE-FLOW-3e0368b4d343326c-false; evidence plan EVID-CASE-FLOW-3e0368b4d343326c-false) |
| FLOW-d9dc921732989107 | `org.dynmap.hdmap.renderer.TFCSupportRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 43–49 | if | `((vert != null) && (vert.equals("true")))` | CASE-FLOW-d9dc921732989107-true (condition evaluates true; fixture FIX-CASE-FLOW-d9dc921732989107-true; reference REF-CASE-FLOW-d9dc921732989107-true; test TEST-CASE-FLOW-d9dc921732989107-true; evidence plan EVID-CASE-FLOW-d9dc921732989107-true)<br>CASE-FLOW-d9dc921732989107-false (condition evaluates false; fixture FIX-CASE-FLOW-d9dc921732989107-false; reference REF-CASE-FLOW-d9dc921732989107-false; test TEST-CASE-FLOW-d9dc921732989107-false; evidence plan EVID-CASE-FLOW-d9dc921732989107-false) |
| FLOW-4628a2237e26cdbf | `org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory)->void` 69–101 | for_loop | `dat < 32` | CASE-FLOW-4628a2237e26cdbf-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-4628a2237e26cdbf-iterate; reference REF-CASE-FLOW-4628a2237e26cdbf-iterate; test TEST-CASE-FLOW-4628a2237e26cdbf-iterate; evidence plan EVID-CASE-FLOW-4628a2237e26cdbf-iterate)<br>CASE-FLOW-4628a2237e26cdbf-exit (condition is false; fixture FIX-CASE-FLOW-4628a2237e26cdbf-exit; reference REF-CASE-FLOW-4628a2237e26cdbf-exit; test TEST-CASE-FLOW-4628a2237e26cdbf-exit; evidence plan EVID-CASE-FLOW-4628a2237e26cdbf-exit) |
| FLOW-bce425862069537f | `org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory)->void` 70–80 | switch_statement | `(dat & SIDE_X)` | CASE-FLOW-bce425862069537f-case-0 (selector matches source case label(s): SIDE_XP; labels=SIDE_XP; fixture FIX-CASE-FLOW-bce425862069537f-case-0; reference REF-CASE-FLOW-bce425862069537f-case-0; test TEST-CASE-FLOW-bce425862069537f-case-0; evidence plan EVID-CASE-FLOW-bce425862069537f-case-0)<br>CASE-FLOW-bce425862069537f-case-1 (selector matches source case label(s): SIDE_XN; labels=SIDE_XN; fixture FIX-CASE-FLOW-bce425862069537f-case-1; reference REF-CASE-FLOW-bce425862069537f-case-1; test TEST-CASE-FLOW-bce425862069537f-case-1; evidence plan EVID-CASE-FLOW-bce425862069537f-case-1)<br>CASE-FLOW-bce425862069537f-case-2 (selector matches source case label(s): SIDE_X; labels=SIDE_X; fixture FIX-CASE-FLOW-bce425862069537f-case-2; reference REF-CASE-FLOW-bce425862069537f-case-2; test TEST-CASE-FLOW-bce425862069537f-case-2; evidence plan EVID-CASE-FLOW-bce425862069537f-case-2)<br>CASE-FLOW-bce425862069537f-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-bce425862069537f-unmatched; reference REF-CASE-FLOW-bce425862069537f-unmatched; test TEST-CASE-FLOW-bce425862069537f-unmatched; evidence plan EVID-CASE-FLOW-bce425862069537f-unmatched) |
| FLOW-9b50cb1b8b4a5236 | `org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory)->void` 81–91 | switch_statement | `(dat & SIDE_Z)` | CASE-FLOW-9b50cb1b8b4a5236-case-0 (selector matches source case label(s): SIDE_ZP; labels=SIDE_ZP; fixture FIX-CASE-FLOW-9b50cb1b8b4a5236-case-0; reference REF-CASE-FLOW-9b50cb1b8b4a5236-case-0; test TEST-CASE-FLOW-9b50cb1b8b4a5236-case-0; evidence plan EVID-CASE-FLOW-9b50cb1b8b4a5236-case-0)<br>CASE-FLOW-9b50cb1b8b4a5236-case-1 (selector matches source case label(s): SIDE_ZN; labels=SIDE_ZN; fixture FIX-CASE-FLOW-9b50cb1b8b4a5236-case-1; reference REF-CASE-FLOW-9b50cb1b8b4a5236-case-1; test TEST-CASE-FLOW-9b50cb1b8b4a5236-case-1; evidence plan EVID-CASE-FLOW-9b50cb1b8b4a5236-case-1)<br>CASE-FLOW-9b50cb1b8b4a5236-case-2 (selector matches source case label(s): SIDE_Z; labels=SIDE_Z; fixture FIX-CASE-FLOW-9b50cb1b8b4a5236-case-2; reference REF-CASE-FLOW-9b50cb1b8b4a5236-case-2; test TEST-CASE-FLOW-9b50cb1b8b4a5236-case-2; evidence plan EVID-CASE-FLOW-9b50cb1b8b4a5236-case-2)<br>CASE-FLOW-9b50cb1b8b4a5236-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-9b50cb1b8b4a5236-unmatched; reference REF-CASE-FLOW-9b50cb1b8b4a5236-unmatched; test TEST-CASE-FLOW-9b50cb1b8b4a5236-unmatched; evidence plan EVID-CASE-FLOW-9b50cb1b8b4a5236-unmatched) |
| FLOW-8702e7958dd37090 | `org.dynmap.hdmap.renderer.TFCSupportRenderer#buildMeshes(RenderPatchFactory)->void` 93–98 | if | `(isVert \|\| ((dat & SIDE_YN) != 0))` | CASE-FLOW-8702e7958dd37090-true (condition evaluates true; fixture FIX-CASE-FLOW-8702e7958dd37090-true; reference REF-CASE-FLOW-8702e7958dd37090-true; test TEST-CASE-FLOW-8702e7958dd37090-true; evidence plan EVID-CASE-FLOW-8702e7958dd37090-true)<br>CASE-FLOW-8702e7958dd37090-false (condition evaluates false; fixture FIX-CASE-FLOW-8702e7958dd37090-false; reference REF-CASE-FLOW-8702e7958dd37090-false; test TEST-CASE-FLOW-8702e7958dd37090-false; evidence plan EVID-CASE-FLOW-8702e7958dd37090-false) |
| FLOW-1c37fbdf2c784b95 | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 115–121 | enhanced_for_loop | `int[] side : sides` | CASE-FLOW-1c37fbdf2c784b95-each_element (execute body once per iterable element; fixture FIX-CASE-FLOW-1c37fbdf2c784b95-each_element; reference REF-CASE-FLOW-1c37fbdf2c784b95-each_element; test TEST-CASE-FLOW-1c37fbdf2c784b95-each_element; evidence plan EVID-CASE-FLOW-1c37fbdf2c784b95-each_element)<br>CASE-FLOW-1c37fbdf2c784b95-empty_or_exhausted (no remaining element; fixture FIX-CASE-FLOW-1c37fbdf2c784b95-empty_or_exhausted; reference REF-CASE-FLOW-1c37fbdf2c784b95-empty_or_exhausted; test TEST-CASE-FLOW-1c37fbdf2c784b95-empty_or_exhausted; evidence plan EVID-CASE-FLOW-1c37fbdf2c784b95-empty_or_exhausted) |
| FLOW-694ccef80f6b1b7e | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 117–117 | if | `(blk.isAir())` | CASE-FLOW-694ccef80f6b1b7e-true (condition evaluates true; fixture FIX-CASE-FLOW-694ccef80f6b1b7e-true; reference REF-CASE-FLOW-694ccef80f6b1b7e-true; test TEST-CASE-FLOW-694ccef80f6b1b7e-true; evidence plan EVID-CASE-FLOW-694ccef80f6b1b7e-true)<br>CASE-FLOW-694ccef80f6b1b7e-false (condition false; no else arm; fixture FIX-CASE-FLOW-694ccef80f6b1b7e-false; reference REF-CASE-FLOW-694ccef80f6b1b7e-false; test TEST-CASE-FLOW-694ccef80f6b1b7e-false; evidence plan EVID-CASE-FLOW-694ccef80f6b1b7e-false) |
| FLOW-cb28288f08932dac | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 118–120 | if | `(vertid.get(blk.globalStateIndex) \|\| horizid.get(blk.globalStateIndex))` | CASE-FLOW-cb28288f08932dac-true (condition evaluates true; fixture FIX-CASE-FLOW-cb28288f08932dac-true; reference REF-CASE-FLOW-cb28288f08932dac-true; test TEST-CASE-FLOW-cb28288f08932dac-true; evidence plan EVID-CASE-FLOW-cb28288f08932dac-true)<br>CASE-FLOW-cb28288f08932dac-false (condition false; no else arm; fixture FIX-CASE-FLOW-cb28288f08932dac-false; reference REF-CASE-FLOW-cb28288f08932dac-false; test TEST-CASE-FLOW-cb28288f08932dac-false; evidence plan EVID-CASE-FLOW-cb28288f08932dac-false) |
| FLOW-534750a42ee88640 | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 122–127 | if | `(!isVert)` | CASE-FLOW-534750a42ee88640-true (condition evaluates true; fixture FIX-CASE-FLOW-534750a42ee88640-true; reference REF-CASE-FLOW-534750a42ee88640-true; test TEST-CASE-FLOW-534750a42ee88640-true; evidence plan EVID-CASE-FLOW-534750a42ee88640-true)<br>CASE-FLOW-534750a42ee88640-false (condition false; no else arm; fixture FIX-CASE-FLOW-534750a42ee88640-false; reference REF-CASE-FLOW-534750a42ee88640-false; test TEST-CASE-FLOW-534750a42ee88640-false; evidence plan EVID-CASE-FLOW-534750a42ee88640-false) |
| FLOW-169561a3170efa59 | `org.dynmap.hdmap.renderer.TFCSupportRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 124–126 | if | `(blk.isNotAir() && vertid.get(blk.globalStateIndex))` | CASE-FLOW-169561a3170efa59-true (condition evaluates true; fixture FIX-CASE-FLOW-169561a3170efa59-true; reference REF-CASE-FLOW-169561a3170efa59-true; test TEST-CASE-FLOW-169561a3170efa59-true; evidence plan EVID-CASE-FLOW-169561a3170efa59-true)<br>CASE-FLOW-169561a3170efa59-false (condition false; no else arm; fixture FIX-CASE-FLOW-169561a3170efa59-false; reference REF-CASE-FLOW-169561a3170efa59-false; test TEST-CASE-FLOW-169561a3170efa59-false; evidence plan EVID-CASE-FLOW-169561a3170efa59-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins TFCSupportRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer TFCSupportRenderer --fixture-set tfcsupport-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer TFCSupportRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin TFCSupportRenderer
```
