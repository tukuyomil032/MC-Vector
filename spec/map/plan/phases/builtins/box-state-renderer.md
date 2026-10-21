# B-box-state-renderer: Dynmap built-in renderer BoxStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-box-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/box-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin BoxStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/BoxStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/box-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-300321f947764ed2 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1440 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-300321f947764ed2 | DynmapCore/src/main/resources/models_1.txt:1440 | — | red_mushroom_block, brown_mushroom_block, mushroom_stem |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-300321f947764ed2 | FIX-CASE-REG-300321f947764ed2 | REF-CASE-REG-300321f947764ed2 | TEST-CASE-REG-300321f947764ed2 | EVID-CASE-REG-300321f947764ed2 | DynmapCore/src/main/resources/models_1.txt:1440; guard=—; block=red_mushroom_block, brown_mushroom_block, mushroom_stem; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 6 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.BoxStateRenderer#models | field | `org.dynmap.hdmap.renderer.BoxStateRenderer#models:RenderPatch[][]` | 21–21 |
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.BoxStateRenderer#getMaximumTextureCount()->int` | 83–86 |
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.BoxStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 88–91 |
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 23–81 |
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.BoxStateRenderer#isOnlyBlockStateSensitive()->boolean` | 92–95 |
| type:org.dynmap.hdmap.renderer.BoxStateRenderer | class | `org.dynmap.hdmap.renderer.BoxStateRenderer` | 19–96 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 23–81 | FLOW-cc6f7fe05021fef6, FLOW-b5f5df11c4dd90b3, FLOW-99e5786d9114c984, FLOW-b7f041126c79ef8a, FLOW-34acb8d4390a1c18, FLOW-f5c79aff1655208c, FLOW-309337d4de83ecb4, FLOW-7650fe636a13fda4, FLOW-3cd6a535df4d1d5e, FLOW-e81125ec20fb813f, FLOW-7dd5f447715d0167, FLOW-002a0aad068cabb0, FLOW-63486a14dd2a22b5, FLOW-ba7f7c1c8d40598c, FLOW-abc8f9c0599d17f7, FLOW-b560f63093f9cb76, FLOW-5fdb70b46f96d7a6, FLOW-814271fe70606d74, FLOW-f6e39e23a75b395b, FLOW-89bf15249f4d2c0e |
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.BoxStateRenderer#getMaximumTextureCount()->int` | 83–86 | none |
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.BoxStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 88–91 | none |
| method:type:org.dynmap.hdmap.renderer.BoxStateRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.BoxStateRenderer#isOnlyBlockStateSensitive()->boolean` | 92–95 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-cc6f7fe05021fef6 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 25–26 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-cc6f7fe05021fef6-true (condition evaluates true; fixture FIX-CASE-FLOW-cc6f7fe05021fef6-true; reference REF-CASE-FLOW-cc6f7fe05021fef6-true; test TEST-CASE-FLOW-cc6f7fe05021fef6-true; evidence plan EVID-CASE-FLOW-cc6f7fe05021fef6-true)<br>CASE-FLOW-cc6f7fe05021fef6-false (condition false; no else arm; fixture FIX-CASE-FLOW-cc6f7fe05021fef6-false; reference REF-CASE-FLOW-cc6f7fe05021fef6-false; test TEST-CASE-FLOW-cc6f7fe05021fef6-false; evidence plan EVID-CASE-FLOW-cc6f7fe05021fef6-false) |
| FLOW-b5f5df11c4dd90b3 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 32–35 | if | `(lim != null)` | CASE-FLOW-b5f5df11c4dd90b3-true (condition evaluates true; fixture FIX-CASE-FLOW-b5f5df11c4dd90b3-true; reference REF-CASE-FLOW-b5f5df11c4dd90b3-true; test TEST-CASE-FLOW-b5f5df11c4dd90b3-true; evidence plan EVID-CASE-FLOW-b5f5df11c4dd90b3-true)<br>CASE-FLOW-b5f5df11c4dd90b3-false (condition false; no else arm; fixture FIX-CASE-FLOW-b5f5df11c4dd90b3-false; reference REF-CASE-FLOW-b5f5df11c4dd90b3-false; test TEST-CASE-FLOW-b5f5df11c4dd90b3-false; evidence plan EVID-CASE-FLOW-b5f5df11c4dd90b3-false) |
| FLOW-99e5786d9114c984 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 34–34 | if | `(xmin < 0.0)` | CASE-FLOW-99e5786d9114c984-true (condition evaluates true; fixture FIX-CASE-FLOW-99e5786d9114c984-true; reference REF-CASE-FLOW-99e5786d9114c984-true; test TEST-CASE-FLOW-99e5786d9114c984-true; evidence plan EVID-CASE-FLOW-99e5786d9114c984-true)<br>CASE-FLOW-99e5786d9114c984-false (condition false; no else arm; fixture FIX-CASE-FLOW-99e5786d9114c984-false; reference REF-CASE-FLOW-99e5786d9114c984-false; test TEST-CASE-FLOW-99e5786d9114c984-false; evidence plan EVID-CASE-FLOW-99e5786d9114c984-false) |
| FLOW-b7f041126c79ef8a | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 37–40 | if | `(lim != null)` | CASE-FLOW-b7f041126c79ef8a-true (condition evaluates true; fixture FIX-CASE-FLOW-b7f041126c79ef8a-true; reference REF-CASE-FLOW-b7f041126c79ef8a-true; test TEST-CASE-FLOW-b7f041126c79ef8a-true; evidence plan EVID-CASE-FLOW-b7f041126c79ef8a-true)<br>CASE-FLOW-b7f041126c79ef8a-false (condition false; no else arm; fixture FIX-CASE-FLOW-b7f041126c79ef8a-false; reference REF-CASE-FLOW-b7f041126c79ef8a-false; test TEST-CASE-FLOW-b7f041126c79ef8a-false; evidence plan EVID-CASE-FLOW-b7f041126c79ef8a-false) |
| FLOW-34acb8d4390a1c18 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 39–39 | if | `(xmax > 1.0)` | CASE-FLOW-34acb8d4390a1c18-true (condition evaluates true; fixture FIX-CASE-FLOW-34acb8d4390a1c18-true; reference REF-CASE-FLOW-34acb8d4390a1c18-true; test TEST-CASE-FLOW-34acb8d4390a1c18-true; evidence plan EVID-CASE-FLOW-34acb8d4390a1c18-true)<br>CASE-FLOW-34acb8d4390a1c18-false (condition false; no else arm; fixture FIX-CASE-FLOW-34acb8d4390a1c18-false; reference REF-CASE-FLOW-34acb8d4390a1c18-false; test TEST-CASE-FLOW-34acb8d4390a1c18-false; evidence plan EVID-CASE-FLOW-34acb8d4390a1c18-false) |
| FLOW-f5c79aff1655208c | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 42–45 | if | `(lim != null)` | CASE-FLOW-f5c79aff1655208c-true (condition evaluates true; fixture FIX-CASE-FLOW-f5c79aff1655208c-true; reference REF-CASE-FLOW-f5c79aff1655208c-true; test TEST-CASE-FLOW-f5c79aff1655208c-true; evidence plan EVID-CASE-FLOW-f5c79aff1655208c-true)<br>CASE-FLOW-f5c79aff1655208c-false (condition false; no else arm; fixture FIX-CASE-FLOW-f5c79aff1655208c-false; reference REF-CASE-FLOW-f5c79aff1655208c-false; test TEST-CASE-FLOW-f5c79aff1655208c-false; evidence plan EVID-CASE-FLOW-f5c79aff1655208c-false) |
| FLOW-309337d4de83ecb4 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 44–44 | if | `(ymin < 0.0)` | CASE-FLOW-309337d4de83ecb4-true (condition evaluates true; fixture FIX-CASE-FLOW-309337d4de83ecb4-true; reference REF-CASE-FLOW-309337d4de83ecb4-true; test TEST-CASE-FLOW-309337d4de83ecb4-true; evidence plan EVID-CASE-FLOW-309337d4de83ecb4-true)<br>CASE-FLOW-309337d4de83ecb4-false (condition false; no else arm; fixture FIX-CASE-FLOW-309337d4de83ecb4-false; reference REF-CASE-FLOW-309337d4de83ecb4-false; test TEST-CASE-FLOW-309337d4de83ecb4-false; evidence plan EVID-CASE-FLOW-309337d4de83ecb4-false) |
| FLOW-7650fe636a13fda4 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 47–50 | if | `(lim != null)` | CASE-FLOW-7650fe636a13fda4-true (condition evaluates true; fixture FIX-CASE-FLOW-7650fe636a13fda4-true; reference REF-CASE-FLOW-7650fe636a13fda4-true; test TEST-CASE-FLOW-7650fe636a13fda4-true; evidence plan EVID-CASE-FLOW-7650fe636a13fda4-true)<br>CASE-FLOW-7650fe636a13fda4-false (condition false; no else arm; fixture FIX-CASE-FLOW-7650fe636a13fda4-false; reference REF-CASE-FLOW-7650fe636a13fda4-false; test TEST-CASE-FLOW-7650fe636a13fda4-false; evidence plan EVID-CASE-FLOW-7650fe636a13fda4-false) |
| FLOW-3cd6a535df4d1d5e | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 49–49 | if | `(ymax > 1.0)` | CASE-FLOW-3cd6a535df4d1d5e-true (condition evaluates true; fixture FIX-CASE-FLOW-3cd6a535df4d1d5e-true; reference REF-CASE-FLOW-3cd6a535df4d1d5e-true; test TEST-CASE-FLOW-3cd6a535df4d1d5e-true; evidence plan EVID-CASE-FLOW-3cd6a535df4d1d5e-true)<br>CASE-FLOW-3cd6a535df4d1d5e-false (condition false; no else arm; fixture FIX-CASE-FLOW-3cd6a535df4d1d5e-false; reference REF-CASE-FLOW-3cd6a535df4d1d5e-false; test TEST-CASE-FLOW-3cd6a535df4d1d5e-false; evidence plan EVID-CASE-FLOW-3cd6a535df4d1d5e-false) |
| FLOW-e81125ec20fb813f | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 52–55 | if | `(lim != null)` | CASE-FLOW-e81125ec20fb813f-true (condition evaluates true; fixture FIX-CASE-FLOW-e81125ec20fb813f-true; reference REF-CASE-FLOW-e81125ec20fb813f-true; test TEST-CASE-FLOW-e81125ec20fb813f-true; evidence plan EVID-CASE-FLOW-e81125ec20fb813f-true)<br>CASE-FLOW-e81125ec20fb813f-false (condition false; no else arm; fixture FIX-CASE-FLOW-e81125ec20fb813f-false; reference REF-CASE-FLOW-e81125ec20fb813f-false; test TEST-CASE-FLOW-e81125ec20fb813f-false; evidence plan EVID-CASE-FLOW-e81125ec20fb813f-false) |
| FLOW-7dd5f447715d0167 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 54–54 | if | `(zmin < 0.0)` | CASE-FLOW-7dd5f447715d0167-true (condition evaluates true; fixture FIX-CASE-FLOW-7dd5f447715d0167-true; reference REF-CASE-FLOW-7dd5f447715d0167-true; test TEST-CASE-FLOW-7dd5f447715d0167-true; evidence plan EVID-CASE-FLOW-7dd5f447715d0167-true)<br>CASE-FLOW-7dd5f447715d0167-false (condition false; no else arm; fixture FIX-CASE-FLOW-7dd5f447715d0167-false; reference REF-CASE-FLOW-7dd5f447715d0167-false; test TEST-CASE-FLOW-7dd5f447715d0167-false; evidence plan EVID-CASE-FLOW-7dd5f447715d0167-false) |
| FLOW-002a0aad068cabb0 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 57–60 | if | `(lim != null)` | CASE-FLOW-002a0aad068cabb0-true (condition evaluates true; fixture FIX-CASE-FLOW-002a0aad068cabb0-true; reference REF-CASE-FLOW-002a0aad068cabb0-true; test TEST-CASE-FLOW-002a0aad068cabb0-true; evidence plan EVID-CASE-FLOW-002a0aad068cabb0-true)<br>CASE-FLOW-002a0aad068cabb0-false (condition false; no else arm; fixture FIX-CASE-FLOW-002a0aad068cabb0-false; reference REF-CASE-FLOW-002a0aad068cabb0-false; test TEST-CASE-FLOW-002a0aad068cabb0-false; evidence plan EVID-CASE-FLOW-002a0aad068cabb0-false) |
| FLOW-63486a14dd2a22b5 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 59–59 | if | `(zmax > 1.0)` | CASE-FLOW-63486a14dd2a22b5-true (condition evaluates true; fixture FIX-CASE-FLOW-63486a14dd2a22b5-true; reference REF-CASE-FLOW-63486a14dd2a22b5-true; test TEST-CASE-FLOW-63486a14dd2a22b5-true; evidence plan EVID-CASE-FLOW-63486a14dd2a22b5-true)<br>CASE-FLOW-63486a14dd2a22b5-false (condition false; no else arm; fixture FIX-CASE-FLOW-63486a14dd2a22b5-false; reference REF-CASE-FLOW-63486a14dd2a22b5-false; test TEST-CASE-FLOW-63486a14dd2a22b5-false; evidence plan EVID-CASE-FLOW-63486a14dd2a22b5-false) |
| FLOW-ba7f7c1c8d40598c | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 65–78 | for_loop | `i < models.length` | CASE-FLOW-ba7f7c1c8d40598c-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-ba7f7c1c8d40598c-iterate; reference REF-CASE-FLOW-ba7f7c1c8d40598c-iterate; test TEST-CASE-FLOW-ba7f7c1c8d40598c-iterate; evidence plan EVID-CASE-FLOW-ba7f7c1c8d40598c-iterate)<br>CASE-FLOW-ba7f7c1c8d40598c-exit (condition is false; fixture FIX-CASE-FLOW-ba7f7c1c8d40598c-exit; reference REF-CASE-FLOW-ba7f7c1c8d40598c-exit; test TEST-CASE-FLOW-ba7f7c1c8d40598c-exit; evidence plan EVID-CASE-FLOW-ba7f7c1c8d40598c-exit) |
| FLOW-abc8f9c0599d17f7 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 70–70 | conditional_expression | `Arrays.binarySearch(states, "down=true") >= 0` | CASE-FLOW-abc8f9c0599d17f7-true (condition evaluates true; fixture FIX-CASE-FLOW-abc8f9c0599d17f7-true; reference REF-CASE-FLOW-abc8f9c0599d17f7-true; test TEST-CASE-FLOW-abc8f9c0599d17f7-true; evidence plan EVID-CASE-FLOW-abc8f9c0599d17f7-true)<br>CASE-FLOW-abc8f9c0599d17f7-false (condition evaluates false; fixture FIX-CASE-FLOW-abc8f9c0599d17f7-false; reference REF-CASE-FLOW-abc8f9c0599d17f7-false; test TEST-CASE-FLOW-abc8f9c0599d17f7-false; evidence plan EVID-CASE-FLOW-abc8f9c0599d17f7-false) |
| FLOW-b560f63093f9cb76 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 71–71 | conditional_expression | `Arrays.binarySearch(states, "up=true") >= 0` | CASE-FLOW-b560f63093f9cb76-true (condition evaluates true; fixture FIX-CASE-FLOW-b560f63093f9cb76-true; reference REF-CASE-FLOW-b560f63093f9cb76-true; test TEST-CASE-FLOW-b560f63093f9cb76-true; evidence plan EVID-CASE-FLOW-b560f63093f9cb76-true)<br>CASE-FLOW-b560f63093f9cb76-false (condition evaluates false; fixture FIX-CASE-FLOW-b560f63093f9cb76-false; reference REF-CASE-FLOW-b560f63093f9cb76-false; test TEST-CASE-FLOW-b560f63093f9cb76-false; evidence plan EVID-CASE-FLOW-b560f63093f9cb76-false) |
| FLOW-5fdb70b46f96d7a6 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 72–72 | conditional_expression | `Arrays.binarySearch(states, "west=true") >= 0` | CASE-FLOW-5fdb70b46f96d7a6-true (condition evaluates true; fixture FIX-CASE-FLOW-5fdb70b46f96d7a6-true; reference REF-CASE-FLOW-5fdb70b46f96d7a6-true; test TEST-CASE-FLOW-5fdb70b46f96d7a6-true; evidence plan EVID-CASE-FLOW-5fdb70b46f96d7a6-true)<br>CASE-FLOW-5fdb70b46f96d7a6-false (condition evaluates false; fixture FIX-CASE-FLOW-5fdb70b46f96d7a6-false; reference REF-CASE-FLOW-5fdb70b46f96d7a6-false; test TEST-CASE-FLOW-5fdb70b46f96d7a6-false; evidence plan EVID-CASE-FLOW-5fdb70b46f96d7a6-false) |
| FLOW-814271fe70606d74 | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 73–73 | conditional_expression | `Arrays.binarySearch(states, "east=true") >= 0` | CASE-FLOW-814271fe70606d74-true (condition evaluates true; fixture FIX-CASE-FLOW-814271fe70606d74-true; reference REF-CASE-FLOW-814271fe70606d74-true; test TEST-CASE-FLOW-814271fe70606d74-true; evidence plan EVID-CASE-FLOW-814271fe70606d74-true)<br>CASE-FLOW-814271fe70606d74-false (condition evaluates false; fixture FIX-CASE-FLOW-814271fe70606d74-false; reference REF-CASE-FLOW-814271fe70606d74-false; test TEST-CASE-FLOW-814271fe70606d74-false; evidence plan EVID-CASE-FLOW-814271fe70606d74-false) |
| FLOW-f6e39e23a75b395b | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 74–74 | conditional_expression | `Arrays.binarySearch(states, "north=true") >= 0` | CASE-FLOW-f6e39e23a75b395b-true (condition evaluates true; fixture FIX-CASE-FLOW-f6e39e23a75b395b-true; reference REF-CASE-FLOW-f6e39e23a75b395b-true; test TEST-CASE-FLOW-f6e39e23a75b395b-true; evidence plan EVID-CASE-FLOW-f6e39e23a75b395b-true)<br>CASE-FLOW-f6e39e23a75b395b-false (condition evaluates false; fixture FIX-CASE-FLOW-f6e39e23a75b395b-false; reference REF-CASE-FLOW-f6e39e23a75b395b-false; test TEST-CASE-FLOW-f6e39e23a75b395b-false; evidence plan EVID-CASE-FLOW-f6e39e23a75b395b-false) |
| FLOW-89bf15249f4d2c0e | `org.dynmap.hdmap.renderer.BoxStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 75–75 | conditional_expression | `Arrays.binarySearch(states, "south=true") >= 0` | CASE-FLOW-89bf15249f4d2c0e-true (condition evaluates true; fixture FIX-CASE-FLOW-89bf15249f4d2c0e-true; reference REF-CASE-FLOW-89bf15249f4d2c0e-true; test TEST-CASE-FLOW-89bf15249f4d2c0e-true; evidence plan EVID-CASE-FLOW-89bf15249f4d2c0e-true)<br>CASE-FLOW-89bf15249f4d2c0e-false (condition evaluates false; fixture FIX-CASE-FLOW-89bf15249f4d2c0e-false; reference REF-CASE-FLOW-89bf15249f4d2c0e-false; test TEST-CASE-FLOW-89bf15249f4d2c0e-false; evidence plan EVID-CASE-FLOW-89bf15249f4d2c0e-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins BoxStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer BoxStateRenderer --fixture-set box-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer BoxStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin BoxStateRenderer
```
