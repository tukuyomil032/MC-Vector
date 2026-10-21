# B-rotated-box-renderer: Dynmap built-in renderer RotatedBoxRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-rotated-box-renderer",
  "kind": "builtin",
  "document": "phases/builtins/rotated-box-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin RotatedBoxRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RotatedBoxRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/rotated-box-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-325893acf221ae87 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:26 |
| REG-dd6c8d4743a8d78f | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:29 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-325893acf221ae87 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:26 | — | %tile.railcraft.detector | * |  | index0, index1, index2, index3, index4, index5, map0, map1, map2, map3, map4, map5, textureIndex |
| REG-dd6c8d4743a8d78f | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:29 | — | %tile.railcraft.machine.gamma | * |  | index0, index1, index2, index3, index4, index5, map0, map1, map2, map3, map4, map5, textureIndex |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-325893acf221ae87 | FIX-CASE-REG-325893acf221ae87 | REF-CASE-REG-325893acf221ae87 | TEST-CASE-REG-325893acf221ae87 | EVID-CASE-REG-325893acf221ae87 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:26; guard=—; block=%tile.railcraft.detector; data=*; state=; parameter keys=index0, index1, index2, index3, index4, index5, map0, map1, map2, map3, map4, map5, textureIndex |
| CASE-REG-dd6c8d4743a8d78f | FIX-CASE-REG-dd6c8d4743a8d78f | REF-CASE-REG-dd6c8d4743a8d78f | TEST-CASE-REG-dd6c8d4743a8d78f | EVID-CASE-REG-dd6c8d4743a8d78f | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:29; guard=—; block=%tile.railcraft.machine.gamma; data=*; state=; parameter keys=index0, index1, index2, index3, index4, index5, map0, map1, map2, map3, map4, map5, textureIndex |

### Exact implementation symbols

This file contributes 10 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#idx_attrib | field | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#idx_attrib:String` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#models | field | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#models:RenderPatch[][]` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#rotValues | field | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#rotValues:Integer[]` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#tileEntityAttribs | field | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#tileEntityAttribs:String[]` | 21–21 |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getMaximumTextureCount()->int` | 102–105 |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 112–135 |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getTileEntityFieldsNeeded()->String[]` | 107–110 |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 23–100 |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#isOnlyBlockStateSensitive()->boolean` | 136–139 |
| type:org.dynmap.hdmap.renderer.RotatedBoxRenderer | class | `org.dynmap.hdmap.renderer.RotatedBoxRenderer` | 13–140 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 23–100 | FLOW-449c5d42a61f45b9, FLOW-2e695159215576fa, FLOW-e0edf6db8a0f6900, FLOW-0590e4e94884e92e, FLOW-3058f9045d65e035, FLOW-31a9669d50cc5f24, FLOW-dcec8629613bc1ca, FLOW-c64cea460662c853, FLOW-0855c98a5201d0db, FLOW-09ce0ca5b08cb3ac, FLOW-99a6b9fbea45d37c, FLOW-66c40dc6f5a1a7b2, FLOW-7f24bd2cccab1b06 |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getMaximumTextureCount()->int` | 102–105 | none |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getTileEntityFieldsNeeded()->String[]` | 107–110 | none |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 112–135 | FLOW-01fc577adf5cf8af, FLOW-8ff410168dbdd574, FLOW-d7cd9141444e5230, FLOW-2b1d2271fe6aab86 |
| method:type:org.dynmap.hdmap.renderer.RotatedBoxRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#isOnlyBlockStateSensitive()->boolean` | 136–139 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-449c5d42a61f45b9 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 25–26 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-449c5d42a61f45b9-true (condition evaluates true; fixture FIX-CASE-FLOW-449c5d42a61f45b9-true; reference REF-CASE-FLOW-449c5d42a61f45b9-true; test TEST-CASE-FLOW-449c5d42a61f45b9-true; evidence plan EVID-CASE-FLOW-449c5d42a61f45b9-true)<br>CASE-FLOW-449c5d42a61f45b9-false (condition false; no else arm; fixture FIX-CASE-FLOW-449c5d42a61f45b9-false; reference REF-CASE-FLOW-449c5d42a61f45b9-false; test TEST-CASE-FLOW-449c5d42a61f45b9-false; evidence plan EVID-CASE-FLOW-449c5d42a61f45b9-false) |
| FLOW-2e695159215576fa | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 30–34 | for_loop | `implicit_true` | CASE-FLOW-2e695159215576fa-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-2e695159215576fa-iterate; reference REF-CASE-FLOW-2e695159215576fa-iterate; test TEST-CASE-FLOW-2e695159215576fa-iterate; evidence plan EVID-CASE-FLOW-2e695159215576fa-iterate)<br>CASE-FLOW-2e695159215576fa-exit (condition is false; fixture FIX-CASE-FLOW-2e695159215576fa-exit; reference REF-CASE-FLOW-2e695159215576fa-exit; test TEST-CASE-FLOW-2e695159215576fa-exit; evidence plan EVID-CASE-FLOW-2e695159215576fa-exit) |
| FLOW-e0edf6db8a0f6900 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 32–32 | if | `(v == null)` | CASE-FLOW-e0edf6db8a0f6900-true (condition evaluates true; fixture FIX-CASE-FLOW-e0edf6db8a0f6900-true; reference REF-CASE-FLOW-e0edf6db8a0f6900-true; test TEST-CASE-FLOW-e0edf6db8a0f6900-true; evidence plan EVID-CASE-FLOW-e0edf6db8a0f6900-true)<br>CASE-FLOW-e0edf6db8a0f6900-false (condition false; no else arm; fixture FIX-CASE-FLOW-e0edf6db8a0f6900-false; reference REF-CASE-FLOW-e0edf6db8a0f6900-false; test TEST-CASE-FLOW-e0edf6db8a0f6900-false; evidence plan EVID-CASE-FLOW-e0edf6db8a0f6900-false) |
| FLOW-0590e4e94884e92e | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 41–90 | for_loop | `id < rotValues.length` | CASE-FLOW-0590e4e94884e92e-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-0590e4e94884e92e-iterate; reference REF-CASE-FLOW-0590e4e94884e92e-iterate; test TEST-CASE-FLOW-0590e4e94884e92e-iterate; evidence plan EVID-CASE-FLOW-0590e4e94884e92e-iterate)<br>CASE-FLOW-0590e4e94884e92e-exit (condition is false; fixture FIX-CASE-FLOW-0590e4e94884e92e-exit; reference REF-CASE-FLOW-0590e4e94884e92e-exit; test TEST-CASE-FLOW-0590e4e94884e92e-exit; evidence plan EVID-CASE-FLOW-0590e4e94884e92e-exit) |
| FLOW-3058f9045d65e035 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 43–43 | if | `(v == null)` | CASE-FLOW-3058f9045d65e035-true (condition evaluates true; fixture FIX-CASE-FLOW-3058f9045d65e035-true; reference REF-CASE-FLOW-3058f9045d65e035-true; test TEST-CASE-FLOW-3058f9045d65e035-true; evidence plan EVID-CASE-FLOW-3058f9045d65e035-true)<br>CASE-FLOW-3058f9045d65e035-false (condition false; no else arm; fixture FIX-CASE-FLOW-3058f9045d65e035-false; reference REF-CASE-FLOW-3058f9045d65e035-false; test TEST-CASE-FLOW-3058f9045d65e035-false; evidence plan EVID-CASE-FLOW-3058f9045d65e035-false) |
| FLOW-31a9669d50cc5f24 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 45–89 | if | `(v.startsWith("S"))` | CASE-FLOW-31a9669d50cc5f24-true (condition evaluates true; fixture FIX-CASE-FLOW-31a9669d50cc5f24-true; reference REF-CASE-FLOW-31a9669d50cc5f24-true; test TEST-CASE-FLOW-31a9669d50cc5f24-true; evidence plan EVID-CASE-FLOW-31a9669d50cc5f24-true)<br>CASE-FLOW-31a9669d50cc5f24-false (condition evaluates false; fixture FIX-CASE-FLOW-31a9669d50cc5f24-false; reference REF-CASE-FLOW-31a9669d50cc5f24-false; test TEST-CASE-FLOW-31a9669d50cc5f24-false; evidence plan EVID-CASE-FLOW-31a9669d50cc5f24-false) |
| FLOW-dcec8629613bc1ca | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 47–56 | for_loop | `i < 6` | CASE-FLOW-dcec8629613bc1ca-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-dcec8629613bc1ca-iterate; reference REF-CASE-FLOW-dcec8629613bc1ca-iterate; test TEST-CASE-FLOW-dcec8629613bc1ca-iterate; evidence plan EVID-CASE-FLOW-dcec8629613bc1ca-iterate)<br>CASE-FLOW-dcec8629613bc1ca-exit (condition is false; fixture FIX-CASE-FLOW-dcec8629613bc1ca-exit; reference REF-CASE-FLOW-dcec8629613bc1ca-exit; test TEST-CASE-FLOW-dcec8629613bc1ca-exit; evidence plan EVID-CASE-FLOW-dcec8629613bc1ca-exit) |
| FLOW-c64cea460662c853 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 49–55 | try_catch | `resources=[]; catches=[Exception x]; finally=absent` | CASE-FLOW-c64cea460662c853-normal (try body completes normally; fixture FIX-CASE-FLOW-c64cea460662c853-normal; reference REF-CASE-FLOW-c64cea460662c853-normal; test TEST-CASE-FLOW-c64cea460662c853-normal; evidence plan EVID-CASE-FLOW-c64cea460662c853-normal)<br>CASE-FLOW-c64cea460662c853-catch-0 (exception matches Exception x; fixture FIX-CASE-FLOW-c64cea460662c853-catch-0; reference REF-CASE-FLOW-c64cea460662c853-catch-0; test TEST-CASE-FLOW-c64cea460662c853-catch-0; evidence plan EVID-CASE-FLOW-c64cea460662c853-catch-0)<br>CASE-FLOW-c64cea460662c853-finally (no finally block; fixture FIX-CASE-FLOW-c64cea460662c853-finally; reference REF-CASE-FLOW-c64cea460662c853-finally; test TEST-CASE-FLOW-c64cea460662c853-finally; evidence plan EVID-CASE-FLOW-c64cea460662c853-finally) |
| FLOW-0855c98a5201d0db | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 61–84 | switch_statement | `(sv.length)` | CASE-FLOW-0855c98a5201d0db-case-0 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-0855c98a5201d0db-case-0; reference REF-CASE-FLOW-0855c98a5201d0db-case-0; test TEST-CASE-FLOW-0855c98a5201d0db-case-0; evidence plan EVID-CASE-FLOW-0855c98a5201d0db-case-0)<br>CASE-FLOW-0855c98a5201d0db-case-1 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-0855c98a5201d0db-case-1; reference REF-CASE-FLOW-0855c98a5201d0db-case-1; test TEST-CASE-FLOW-0855c98a5201d0db-case-1; evidence plan EVID-CASE-FLOW-0855c98a5201d0db-case-1)<br>CASE-FLOW-0855c98a5201d0db-case-2 (default selector arm; labels=default; labels=default; fixture FIX-CASE-FLOW-0855c98a5201d0db-case-2; reference REF-CASE-FLOW-0855c98a5201d0db-case-2; test TEST-CASE-FLOW-0855c98a5201d0db-case-2; evidence plan EVID-CASE-FLOW-0855c98a5201d0db-case-2) |
| FLOW-09ce0ca5b08cb3ac | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 64–69 | try_catch | `resources=[]; catches=[NumberFormatException nfx]; finally=absent` | CASE-FLOW-09ce0ca5b08cb3ac-normal (try body completes normally; fixture FIX-CASE-FLOW-09ce0ca5b08cb3ac-normal; reference REF-CASE-FLOW-09ce0ca5b08cb3ac-normal; test TEST-CASE-FLOW-09ce0ca5b08cb3ac-normal; evidence plan EVID-CASE-FLOW-09ce0ca5b08cb3ac-normal)<br>CASE-FLOW-09ce0ca5b08cb3ac-catch-0 (exception matches NumberFormatException nfx; fixture FIX-CASE-FLOW-09ce0ca5b08cb3ac-catch-0; reference REF-CASE-FLOW-09ce0ca5b08cb3ac-catch-0; test TEST-CASE-FLOW-09ce0ca5b08cb3ac-catch-0; evidence plan EVID-CASE-FLOW-09ce0ca5b08cb3ac-catch-0)<br>CASE-FLOW-09ce0ca5b08cb3ac-finally (no finally block; fixture FIX-CASE-FLOW-09ce0ca5b08cb3ac-finally; reference REF-CASE-FLOW-09ce0ca5b08cb3ac-finally; test TEST-CASE-FLOW-09ce0ca5b08cb3ac-finally; evidence plan EVID-CASE-FLOW-09ce0ca5b08cb3ac-finally) |
| FLOW-99a6b9fbea45d37c | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 72–79 | try_catch | `resources=[]; catches=[NumberFormatException nfx]; finally=absent` | CASE-FLOW-99a6b9fbea45d37c-normal (try body completes normally; fixture FIX-CASE-FLOW-99a6b9fbea45d37c-normal; reference REF-CASE-FLOW-99a6b9fbea45d37c-normal; test TEST-CASE-FLOW-99a6b9fbea45d37c-normal; evidence plan EVID-CASE-FLOW-99a6b9fbea45d37c-normal)<br>CASE-FLOW-99a6b9fbea45d37c-catch-0 (exception matches NumberFormatException nfx; fixture FIX-CASE-FLOW-99a6b9fbea45d37c-catch-0; reference REF-CASE-FLOW-99a6b9fbea45d37c-catch-0; test TEST-CASE-FLOW-99a6b9fbea45d37c-catch-0; evidence plan EVID-CASE-FLOW-99a6b9fbea45d37c-catch-0)<br>CASE-FLOW-99a6b9fbea45d37c-finally (no finally block; fixture FIX-CASE-FLOW-99a6b9fbea45d37c-finally; reference REF-CASE-FLOW-99a6b9fbea45d37c-finally; test TEST-CASE-FLOW-99a6b9fbea45d37c-finally; evidence plan EVID-CASE-FLOW-99a6b9fbea45d37c-finally) |
| FLOW-66c40dc6f5a1a7b2 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 86–88 | for_loop | `i < 6` | CASE-FLOW-66c40dc6f5a1a7b2-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-66c40dc6f5a1a7b2-iterate; reference REF-CASE-FLOW-66c40dc6f5a1a7b2-iterate; test TEST-CASE-FLOW-66c40dc6f5a1a7b2-iterate; evidence plan EVID-CASE-FLOW-66c40dc6f5a1a7b2-iterate)<br>CASE-FLOW-66c40dc6f5a1a7b2-exit (condition is false; fixture FIX-CASE-FLOW-66c40dc6f5a1a7b2-exit; reference REF-CASE-FLOW-66c40dc6f5a1a7b2-exit; test TEST-CASE-FLOW-66c40dc6f5a1a7b2-exit; evidence plan EVID-CASE-FLOW-66c40dc6f5a1a7b2-exit) |
| FLOW-7f24bd2cccab1b06 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 91–97 | if | `(idx_attrib != null)` | CASE-FLOW-7f24bd2cccab1b06-true (condition evaluates true; fixture FIX-CASE-FLOW-7f24bd2cccab1b06-true; reference REF-CASE-FLOW-7f24bd2cccab1b06-true; test TEST-CASE-FLOW-7f24bd2cccab1b06-true; evidence plan EVID-CASE-FLOW-7f24bd2cccab1b06-true)<br>CASE-FLOW-7f24bd2cccab1b06-false (condition evaluates false; fixture FIX-CASE-FLOW-7f24bd2cccab1b06-false; reference REF-CASE-FLOW-7f24bd2cccab1b06-false; test TEST-CASE-FLOW-7f24bd2cccab1b06-false; evidence plan EVID-CASE-FLOW-7f24bd2cccab1b06-false) |
| FLOW-01fc577adf5cf8af | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 117–125 | if | `(idx_attrib != null)` | CASE-FLOW-01fc577adf5cf8af-true (condition evaluates true; fixture FIX-CASE-FLOW-01fc577adf5cf8af-true; reference REF-CASE-FLOW-01fc577adf5cf8af-true; test TEST-CASE-FLOW-01fc577adf5cf8af-true; evidence plan EVID-CASE-FLOW-01fc577adf5cf8af-true)<br>CASE-FLOW-01fc577adf5cf8af-false (condition evaluates false; fixture FIX-CASE-FLOW-01fc577adf5cf8af-false; reference REF-CASE-FLOW-01fc577adf5cf8af-false; test TEST-CASE-FLOW-01fc577adf5cf8af-false; evidence plan EVID-CASE-FLOW-01fc577adf5cf8af-false) |
| FLOW-8ff410168dbdd574 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 119–121 | if | `(idxv instanceof Number)` | CASE-FLOW-8ff410168dbdd574-true (condition evaluates true; fixture FIX-CASE-FLOW-8ff410168dbdd574-true; reference REF-CASE-FLOW-8ff410168dbdd574-true; test TEST-CASE-FLOW-8ff410168dbdd574-true; evidence plan EVID-CASE-FLOW-8ff410168dbdd574-true)<br>CASE-FLOW-8ff410168dbdd574-false (condition false; no else arm; fixture FIX-CASE-FLOW-8ff410168dbdd574-false; reference REF-CASE-FLOW-8ff410168dbdd574-false; test TEST-CASE-FLOW-8ff410168dbdd574-false; evidence plan EVID-CASE-FLOW-8ff410168dbdd574-false) |
| FLOW-d7cd9141444e5230 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 127–132 | for_loop | `i < rotValues.length` | CASE-FLOW-d7cd9141444e5230-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-d7cd9141444e5230-iterate; reference REF-CASE-FLOW-d7cd9141444e5230-iterate; test TEST-CASE-FLOW-d7cd9141444e5230-iterate; evidence plan EVID-CASE-FLOW-d7cd9141444e5230-iterate)<br>CASE-FLOW-d7cd9141444e5230-exit (condition is false; fixture FIX-CASE-FLOW-d7cd9141444e5230-exit; reference REF-CASE-FLOW-d7cd9141444e5230-exit; test TEST-CASE-FLOW-d7cd9141444e5230-exit; evidence plan EVID-CASE-FLOW-d7cd9141444e5230-exit) |
| FLOW-2b1d2271fe6aab86 | `org.dynmap.hdmap.renderer.RotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 128–131 | if | `(rotValues[i] == textureIdx)` | CASE-FLOW-2b1d2271fe6aab86-true (condition evaluates true; fixture FIX-CASE-FLOW-2b1d2271fe6aab86-true; reference REF-CASE-FLOW-2b1d2271fe6aab86-true; test TEST-CASE-FLOW-2b1d2271fe6aab86-true; evidence plan EVID-CASE-FLOW-2b1d2271fe6aab86-true)<br>CASE-FLOW-2b1d2271fe6aab86-false (condition false; no else arm; fixture FIX-CASE-FLOW-2b1d2271fe6aab86-false; reference REF-CASE-FLOW-2b1d2271fe6aab86-false; test TEST-CASE-FLOW-2b1d2271fe6aab86-false; evidence plan EVID-CASE-FLOW-2b1d2271fe6aab86-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins RotatedBoxRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer RotatedBoxRenderer --fixture-set rotated-box-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer RotatedBoxRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin RotatedBoxRenderer
```
