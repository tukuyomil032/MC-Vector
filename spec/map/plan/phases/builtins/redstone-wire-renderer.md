# B-redstone-wire-renderer: Dynmap built-in renderer RedstoneWireRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-redstone-wire-renderer",
  "kind": "builtin",
  "document": "phases/builtins/redstone-wire-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin RedstoneWireRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RedstoneWireRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/redstone-wire-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-8a780c6098655b5b | static customblock registration | DynmapCore/src/main/resources/models_0.txt:322 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-8a780c6098655b5b | DynmapCore/src/main/resources/models_0.txt:322 | — | redstone_wire | * |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-8a780c6098655b5b | FIX-CASE-REG-8a780c6098655b5b | REF-CASE-REG-8a780c6098655b5b | TEST-CASE-REG-8a780c6098655b5b | EVID-CASE-REG-8a780c6098655b5b | DynmapCore/src/main/resources/models_0.txt:322; guard=—; block=redstone_wire; data=*; state=; parameter keys= |

### Exact implementation symbols

This file contributes 14 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#TEXTURE_REDSTONE_CROSS | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#TEXTURE_REDSTONE_CROSS:int` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#TEXTURE_REDSTONE_STRAIGHT | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#TEXTURE_REDSTONE_STRAIGHT:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#blkbs | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#blkbs:DynmapBlockState` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#bottom_patches | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#bottom_patches:RenderPatch[]` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#meshes | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#meshes:RenderPatch[][]` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#side_patches | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#side_patches:RenderPatch[]` | 22–22 |
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#x_off | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#x_off:int[]` | 72–72 |
| field:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#z_off | field | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#z_off:int[]` | 73–73 |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#buildMesh(int) | method | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#buildMesh(int)->RenderPatch[]` | 104–114 |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMaximumTextureCount()->int` | 67–70 |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMesh(int) | method | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMesh(int)->RenderPatch[]` | 94–102 |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 75–92 |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 26–65 |
| type:org.dynmap.hdmap.renderer.RedstoneWireRenderer | class | `org.dynmap.hdmap.renderer.RedstoneWireRenderer` | 14–115 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 26–65 | FLOW-5b0d56441d05f216, FLOW-5ffc6da945dbb20f, FLOW-f84785f010407890, FLOW-06e73d467493dd9c, FLOW-8182ac85b1b9f68a, FLOW-7f8b420d209ba5e2, FLOW-2f630c776bebf28a |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMaximumTextureCount()->int` | 67–70 | none |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 75–92 | FLOW-0de8f0e81e5389e2, FLOW-5fb95002c9d6f0e2, FLOW-884408142bc8cf1c, FLOW-8f8162af91ea0a10 |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMesh(int) | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMesh(int)->RenderPatch[]` | 94–102 | FLOW-511ecd4822062d78 |
| method:type:org.dynmap.hdmap.renderer.RedstoneWireRenderer#buildMesh(int) | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#buildMesh(int)->RenderPatch[]` | 104–114 | FLOW-db656a53f411e42c, FLOW-bc33c72f471b342d |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-5b0d56441d05f216 | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 28–29 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-5b0d56441d05f216-true (condition evaluates true; fixture FIX-CASE-FLOW-5b0d56441d05f216-true; reference REF-CASE-FLOW-5b0d56441d05f216-true; test TEST-CASE-FLOW-5b0d56441d05f216-true; evidence plan EVID-CASE-FLOW-5b0d56441d05f216-true)<br>CASE-FLOW-5b0d56441d05f216-false (condition false; no else arm; fixture FIX-CASE-FLOW-5b0d56441d05f216-false; reference REF-CASE-FLOW-5b0d56441d05f216-false; test TEST-CASE-FLOW-5b0d56441d05f216-false; evidence plan EVID-CASE-FLOW-5b0d56441d05f216-false) |
| FLOW-5ffc6da945dbb20f | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 37–62 | for_loop | `i < 16` | CASE-FLOW-5ffc6da945dbb20f-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-5ffc6da945dbb20f-iterate; reference REF-CASE-FLOW-5ffc6da945dbb20f-iterate; test TEST-CASE-FLOW-5ffc6da945dbb20f-iterate; evidence plan EVID-CASE-FLOW-5ffc6da945dbb20f-iterate)<br>CASE-FLOW-5ffc6da945dbb20f-exit (condition is false; fixture FIX-CASE-FLOW-5ffc6da945dbb20f-exit; reference REF-CASE-FLOW-5ffc6da945dbb20f-exit; test TEST-CASE-FLOW-5ffc6da945dbb20f-exit; evidence plan EVID-CASE-FLOW-5ffc6da945dbb20f-exit) |
| FLOW-f84785f010407890 | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 38–61 | switch_statement | `(i)` | CASE-FLOW-f84785f010407890-case-0 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-f84785f010407890-case-0; reference REF-CASE-FLOW-f84785f010407890-case-0; test TEST-CASE-FLOW-f84785f010407890-case-0; evidence plan EVID-CASE-FLOW-f84785f010407890-case-0)<br>CASE-FLOW-f84785f010407890-case-1 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-f84785f010407890-case-1; reference REF-CASE-FLOW-f84785f010407890-case-1; test TEST-CASE-FLOW-f84785f010407890-case-1; evidence plan EVID-CASE-FLOW-f84785f010407890-case-1)<br>CASE-FLOW-f84785f010407890-case-2 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-f84785f010407890-case-2; reference REF-CASE-FLOW-f84785f010407890-case-2; test TEST-CASE-FLOW-f84785f010407890-case-2; evidence plan EVID-CASE-FLOW-f84785f010407890-case-2)<br>CASE-FLOW-f84785f010407890-case-3 (selector matches source case label(s): 4; labels=4; fixture FIX-CASE-FLOW-f84785f010407890-case-3; reference REF-CASE-FLOW-f84785f010407890-case-3; test TEST-CASE-FLOW-f84785f010407890-case-3; evidence plan EVID-CASE-FLOW-f84785f010407890-case-3)<br>CASE-FLOW-f84785f010407890-case-4 (selector matches source case label(s): 8; labels=8; fixture FIX-CASE-FLOW-f84785f010407890-case-4; reference REF-CASE-FLOW-f84785f010407890-case-4; test TEST-CASE-FLOW-f84785f010407890-case-4; evidence plan EVID-CASE-FLOW-f84785f010407890-case-4)<br>CASE-FLOW-f84785f010407890-case-5 (selector matches source case label(s): 12; labels=12; fixture FIX-CASE-FLOW-f84785f010407890-case-5; reference REF-CASE-FLOW-f84785f010407890-case-5; test TEST-CASE-FLOW-f84785f010407890-case-5; evidence plan EVID-CASE-FLOW-f84785f010407890-case-5)<br>CASE-FLOW-f84785f010407890-case-6 (default selector arm; labels=default; labels=default; fixture FIX-CASE-FLOW-f84785f010407890-case-6; reference REF-CASE-FLOW-f84785f010407890-case-6; test TEST-CASE-FLOW-f84785f010407890-case-6; evidence plan EVID-CASE-FLOW-f84785f010407890-case-6) |
| FLOW-06e73d467493dd9c | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 55–55 | conditional_expression | `((i & 4) != 0)` | CASE-FLOW-06e73d467493dd9c-true (condition evaluates true; fixture FIX-CASE-FLOW-06e73d467493dd9c-true; reference REF-CASE-FLOW-06e73d467493dd9c-true; test TEST-CASE-FLOW-06e73d467493dd9c-true; evidence plan EVID-CASE-FLOW-06e73d467493dd9c-true)<br>CASE-FLOW-06e73d467493dd9c-false (condition evaluates false; fixture FIX-CASE-FLOW-06e73d467493dd9c-false; reference REF-CASE-FLOW-06e73d467493dd9c-false; test TEST-CASE-FLOW-06e73d467493dd9c-false; evidence plan EVID-CASE-FLOW-06e73d467493dd9c-false) |
| FLOW-8182ac85b1b9f68a | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 56–56 | conditional_expression | `((i & 8) != 0)` | CASE-FLOW-8182ac85b1b9f68a-true (condition evaluates true; fixture FIX-CASE-FLOW-8182ac85b1b9f68a-true; reference REF-CASE-FLOW-8182ac85b1b9f68a-true; test TEST-CASE-FLOW-8182ac85b1b9f68a-true; evidence plan EVID-CASE-FLOW-8182ac85b1b9f68a-true)<br>CASE-FLOW-8182ac85b1b9f68a-false (condition evaluates false; fixture FIX-CASE-FLOW-8182ac85b1b9f68a-false; reference REF-CASE-FLOW-8182ac85b1b9f68a-false; test TEST-CASE-FLOW-8182ac85b1b9f68a-false; evidence plan EVID-CASE-FLOW-8182ac85b1b9f68a-false) |
| FLOW-7f8b420d209ba5e2 | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 57–57 | conditional_expression | `((i & 1) != 0)` | CASE-FLOW-7f8b420d209ba5e2-true (condition evaluates true; fixture FIX-CASE-FLOW-7f8b420d209ba5e2-true; reference REF-CASE-FLOW-7f8b420d209ba5e2-true; test TEST-CASE-FLOW-7f8b420d209ba5e2-true; evidence plan EVID-CASE-FLOW-7f8b420d209ba5e2-true)<br>CASE-FLOW-7f8b420d209ba5e2-false (condition evaluates false; fixture FIX-CASE-FLOW-7f8b420d209ba5e2-false; reference REF-CASE-FLOW-7f8b420d209ba5e2-false; test TEST-CASE-FLOW-7f8b420d209ba5e2-false; evidence plan EVID-CASE-FLOW-7f8b420d209ba5e2-false) |
| FLOW-2f630c776bebf28a | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 58–58 | conditional_expression | `((i & 2) != 0)` | CASE-FLOW-2f630c776bebf28a-true (condition evaluates true; fixture FIX-CASE-FLOW-2f630c776bebf28a-true; reference REF-CASE-FLOW-2f630c776bebf28a-true; test TEST-CASE-FLOW-2f630c776bebf28a-true; evidence plan EVID-CASE-FLOW-2f630c776bebf28a-true)<br>CASE-FLOW-2f630c776bebf28a-false (condition evaluates false; fixture FIX-CASE-FLOW-2f630c776bebf28a-false; reference REF-CASE-FLOW-2f630c776bebf28a-false; test TEST-CASE-FLOW-2f630c776bebf28a-false; evidence plan EVID-CASE-FLOW-2f630c776bebf28a-false) |
| FLOW-0de8f0e81e5389e2 | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 79–90 | for_loop | `i < x_off.length` | CASE-FLOW-0de8f0e81e5389e2-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-0de8f0e81e5389e2-iterate; reference REF-CASE-FLOW-0de8f0e81e5389e2-iterate; test TEST-CASE-FLOW-0de8f0e81e5389e2-iterate; evidence plan EVID-CASE-FLOW-0de8f0e81e5389e2-iterate)<br>CASE-FLOW-0de8f0e81e5389e2-exit (condition is false; fixture FIX-CASE-FLOW-0de8f0e81e5389e2-exit; reference REF-CASE-FLOW-0de8f0e81e5389e2-exit; test TEST-CASE-FLOW-0de8f0e81e5389e2-exit; evidence plan EVID-CASE-FLOW-0de8f0e81e5389e2-exit) |
| FLOW-5fb95002c9d6f0e2 | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 81–89 | if | `(mapDataCtx.getBlockTypeAt(x_off[i], 1, z_off[i]).matchingBaseState(blkbs))` | CASE-FLOW-5fb95002c9d6f0e2-true (condition evaluates true; fixture FIX-CASE-FLOW-5fb95002c9d6f0e2-true; reference REF-CASE-FLOW-5fb95002c9d6f0e2-true; test TEST-CASE-FLOW-5fb95002c9d6f0e2-true; evidence plan EVID-CASE-FLOW-5fb95002c9d6f0e2-true)<br>CASE-FLOW-5fb95002c9d6f0e2-false (condition evaluates false; fixture FIX-CASE-FLOW-5fb95002c9d6f0e2-false; reference REF-CASE-FLOW-5fb95002c9d6f0e2-false; test TEST-CASE-FLOW-5fb95002c9d6f0e2-false; evidence plan EVID-CASE-FLOW-5fb95002c9d6f0e2-false) |
| FLOW-884408142bc8cf1c | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 84–89 | if | `(mapDataCtx.getBlockTypeAt(x_off[i], 0, z_off[i]).matchingBaseState(blkbs))` | CASE-FLOW-884408142bc8cf1c-true (condition evaluates true; fixture FIX-CASE-FLOW-884408142bc8cf1c-true; reference REF-CASE-FLOW-884408142bc8cf1c-true; test TEST-CASE-FLOW-884408142bc8cf1c-true; evidence plan EVID-CASE-FLOW-884408142bc8cf1c-true)<br>CASE-FLOW-884408142bc8cf1c-false (condition evaluates false; fixture FIX-CASE-FLOW-884408142bc8cf1c-false; reference REF-CASE-FLOW-884408142bc8cf1c-false; test TEST-CASE-FLOW-884408142bc8cf1c-false; evidence plan EVID-CASE-FLOW-884408142bc8cf1c-false) |
| FLOW-8f8162af91ea0a10 | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 87–89 | if | `(mapDataCtx.getBlockTypeAt(x_off[i], -1, z_off[i]).matchingBaseState(blkbs))` | CASE-FLOW-8f8162af91ea0a10-true (condition evaluates true; fixture FIX-CASE-FLOW-8f8162af91ea0a10-true; reference REF-CASE-FLOW-8f8162af91ea0a10-true; test TEST-CASE-FLOW-8f8162af91ea0a10-true; evidence plan EVID-CASE-FLOW-8f8162af91ea0a10-true)<br>CASE-FLOW-8f8162af91ea0a10-false (condition false; no else arm; fixture FIX-CASE-FLOW-8f8162af91ea0a10-false; reference REF-CASE-FLOW-8f8162af91ea0a10-false; test TEST-CASE-FLOW-8f8162af91ea0a10-false; evidence plan EVID-CASE-FLOW-8f8162af91ea0a10-false) |
| FLOW-511ecd4822062d78 | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#getMesh(int)->RenderPatch[]` 97–100 | if | `(mesh == null)` | CASE-FLOW-511ecd4822062d78-true (condition evaluates true; fixture FIX-CASE-FLOW-511ecd4822062d78-true; reference REF-CASE-FLOW-511ecd4822062d78-true; test TEST-CASE-FLOW-511ecd4822062d78-true; evidence plan EVID-CASE-FLOW-511ecd4822062d78-true)<br>CASE-FLOW-511ecd4822062d78-false (condition false; no else arm; fixture FIX-CASE-FLOW-511ecd4822062d78-false; reference REF-CASE-FLOW-511ecd4822062d78-false; test TEST-CASE-FLOW-511ecd4822062d78-false; evidence plan EVID-CASE-FLOW-511ecd4822062d78-false) |
| FLOW-db656a53f411e42c | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#buildMesh(int)->RenderPatch[]` 108–112 | for_loop | `i < 4` | CASE-FLOW-db656a53f411e42c-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-db656a53f411e42c-iterate; reference REF-CASE-FLOW-db656a53f411e42c-iterate; test TEST-CASE-FLOW-db656a53f411e42c-iterate; evidence plan EVID-CASE-FLOW-db656a53f411e42c-iterate)<br>CASE-FLOW-db656a53f411e42c-exit (condition is false; fixture FIX-CASE-FLOW-db656a53f411e42c-exit; reference REF-CASE-FLOW-db656a53f411e42c-exit; test TEST-CASE-FLOW-db656a53f411e42c-exit; evidence plan EVID-CASE-FLOW-db656a53f411e42c-exit) |
| FLOW-bc33c72f471b342d | `org.dynmap.hdmap.renderer.RedstoneWireRenderer#buildMesh(int)->RenderPatch[]` 109–111 | if | `((idx & (16 << i)) != 0)` | CASE-FLOW-bc33c72f471b342d-true (condition evaluates true; fixture FIX-CASE-FLOW-bc33c72f471b342d-true; reference REF-CASE-FLOW-bc33c72f471b342d-true; test TEST-CASE-FLOW-bc33c72f471b342d-true; evidence plan EVID-CASE-FLOW-bc33c72f471b342d-true)<br>CASE-FLOW-bc33c72f471b342d-false (condition false; no else arm; fixture FIX-CASE-FLOW-bc33c72f471b342d-false; reference REF-CASE-FLOW-bc33c72f471b342d-false; test TEST-CASE-FLOW-bc33c72f471b342d-false; evidence plan EVID-CASE-FLOW-bc33c72f471b342d-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins RedstoneWireRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer RedstoneWireRenderer --fixture-set redstone-wire-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer RedstoneWireRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin RedstoneWireRenderer
```
