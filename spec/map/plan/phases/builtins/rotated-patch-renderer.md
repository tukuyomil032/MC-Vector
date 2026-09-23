# B-rotated-patch-renderer: Dynmap built-in renderer RotatedPatchRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-rotated-patch-renderer",
  "kind": "builtin",
  "document": "phases/builtins/rotated-patch-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin RotatedPatchRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RotatedPatchRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/rotated-patch-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-1c2f6332d964ebdc | static customblock registration | forge-1.12.2/src/main/resources/renderdata/BuildCraft_Core-models.txt:91 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-1c2f6332d964ebdc | forge-1.12.2/src/main/resources/renderdata/BuildCraft_Core-models.txt:91 | — | %engineBlock | 0, 1, 2 |  | index, patch0, patch1, patch10, patch11, patch12, patch13, patch14, patch2, patch3, patch4, patch5, patch6, patch7, patch8, patch9, rot0, rot2, rot3, rot4, rot5 |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-1c2f6332d964ebdc | FIX-CASE-REG-1c2f6332d964ebdc | REF-CASE-REG-1c2f6332d964ebdc | TEST-CASE-REG-1c2f6332d964ebdc | EVID-CASE-REG-1c2f6332d964ebdc | forge-1.12.2/src/main/resources/renderdata/BuildCraft_Core-models.txt:91; guard=—; block=%engineBlock; data=0, 1, 2; state=; parameter keys=index, patch0, patch1, patch10, patch11, patch12, patch13, patch14, patch2, patch3, patch4, patch5, patch6, patch7, patch8, patch9, rot0, rot2, rot3, rot4, rot5 |

### Exact implementation symbols

This file contributes 11 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#basemodel | field | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#basemodel:RenderPatch[]` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#idx_attrib | field | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#idx_attrib:String` | 31–31 |
| field:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#maxTextureIndex | field | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#maxTextureIndex:int` | 29–29 |
| field:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#models | field | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#models:RenderPatch[][]` | 27–27 |
| field:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#tileEntityAttribs | field | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#tileEntityAttribs:String[]` | 33–33 |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getMaximumTextureCount()->int` | 126–129 |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 136–156 |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getTileEntityFieldsNeeded()->String[]` | 131–134 |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 35–124 |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#isOnlyBlockStateSensitive()->boolean` | 157–160 |
| type:org.dynmap.hdmap.renderer.RotatedPatchRenderer | class | `org.dynmap.hdmap.renderer.RotatedPatchRenderer` | 23–161 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 35–124 | FLOW-6e0cffd82926e719, FLOW-ebe05a4b8c06caea, FLOW-438bb61a9ff9a72e, FLOW-da1573a8630d5330, FLOW-931c6ec2c7e1aa44, FLOW-fb652ef0b2a2b4c7, FLOW-6531978aa7a1c45c, FLOW-ff2372985c134877, FLOW-db8a7734e5b2beff, FLOW-c9ba94a9ca4c1bc6, FLOW-1710f293d977b0f4, FLOW-a4dfffef5d226cab, FLOW-dc7a073bb36b4e3b, FLOW-be034ab7d16a9ccd, FLOW-1aa98ecc3dc0fc84, FLOW-6ed2c329fd9206c4, FLOW-036aa0298f91a35f, FLOW-41d9efb444cc7e59 |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getMaximumTextureCount()->int` | 126–129 | none |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getTileEntityFieldsNeeded()->String[]` | 131–134 | none |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 136–156 | FLOW-5413c8794f6f8852, FLOW-53029315a41c09fb, FLOW-9578f2ffd8dafe5a |
| method:type:org.dynmap.hdmap.renderer.RotatedPatchRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#isOnlyBlockStateSensitive()->boolean` | 157–160 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-6e0cffd82926e719 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 37–38 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-6e0cffd82926e719-true (condition evaluates true; fixture FIX-CASE-FLOW-6e0cffd82926e719-true; reference REF-CASE-FLOW-6e0cffd82926e719-true; test TEST-CASE-FLOW-6e0cffd82926e719-true; evidence plan EVID-CASE-FLOW-6e0cffd82926e719-true)<br>CASE-FLOW-6e0cffd82926e719-false (condition false; no else arm; fixture FIX-CASE-FLOW-6e0cffd82926e719-false; reference REF-CASE-FLOW-6e0cffd82926e719-false; test TEST-CASE-FLOW-6e0cffd82926e719-false; evidence plan EVID-CASE-FLOW-6e0cffd82926e719-false) |
| FLOW-ebe05a4b8c06caea | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 44–96 | enhanced_for_loop | `String k : custparm.keySet()` | CASE-FLOW-ebe05a4b8c06caea-each_element (execute body once per iterable element; fixture FIX-CASE-FLOW-ebe05a4b8c06caea-each_element; reference REF-CASE-FLOW-ebe05a4b8c06caea-each_element; test TEST-CASE-FLOW-ebe05a4b8c06caea-each_element; evidence plan EVID-CASE-FLOW-ebe05a4b8c06caea-each_element)<br>CASE-FLOW-ebe05a4b8c06caea-empty_or_exhausted (no remaining element; fixture FIX-CASE-FLOW-ebe05a4b8c06caea-empty_or_exhausted; reference REF-CASE-FLOW-ebe05a4b8c06caea-empty_or_exhausted; test TEST-CASE-FLOW-ebe05a4b8c06caea-empty_or_exhausted; evidence plan EVID-CASE-FLOW-ebe05a4b8c06caea-empty_or_exhausted) |
| FLOW-438bb61a9ff9a72e | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 47–95 | if | `(k.startsWith("patch"))` | CASE-FLOW-438bb61a9ff9a72e-true (condition evaluates true; fixture FIX-CASE-FLOW-438bb61a9ff9a72e-true; reference REF-CASE-FLOW-438bb61a9ff9a72e-true; test TEST-CASE-FLOW-438bb61a9ff9a72e-true; evidence plan EVID-CASE-FLOW-438bb61a9ff9a72e-true)<br>CASE-FLOW-438bb61a9ff9a72e-false (condition evaluates false; fixture FIX-CASE-FLOW-438bb61a9ff9a72e-false; reference REF-CASE-FLOW-438bb61a9ff9a72e-false; test TEST-CASE-FLOW-438bb61a9ff9a72e-false; evidence plan EVID-CASE-FLOW-438bb61a9ff9a72e-false) |
| FLOW-da1573a8630d5330 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 48–65 | try_catch | `resources=[]; catches=[NumberFormatException nfx]; finally=absent` | CASE-FLOW-da1573a8630d5330-normal (try body completes normally; fixture FIX-CASE-FLOW-da1573a8630d5330-normal; reference REF-CASE-FLOW-da1573a8630d5330-normal; test TEST-CASE-FLOW-da1573a8630d5330-normal; evidence plan EVID-CASE-FLOW-da1573a8630d5330-normal)<br>CASE-FLOW-da1573a8630d5330-catch-0 (exception matches NumberFormatException nfx; fixture FIX-CASE-FLOW-da1573a8630d5330-catch-0; reference REF-CASE-FLOW-da1573a8630d5330-catch-0; test TEST-CASE-FLOW-da1573a8630d5330-catch-0; evidence plan EVID-CASE-FLOW-da1573a8630d5330-catch-0)<br>CASE-FLOW-da1573a8630d5330-finally (no finally block; fixture FIX-CASE-FLOW-da1573a8630d5330-finally; reference REF-CASE-FLOW-da1573a8630d5330-finally; test TEST-CASE-FLOW-da1573a8630d5330-finally; evidence plan EVID-CASE-FLOW-da1573a8630d5330-finally) |
| FLOW-931c6ec2c7e1aa44 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 51–54 | if | `(p == null)` | CASE-FLOW-931c6ec2c7e1aa44-true (condition evaluates true; fixture FIX-CASE-FLOW-931c6ec2c7e1aa44-true; reference REF-CASE-FLOW-931c6ec2c7e1aa44-true; test TEST-CASE-FLOW-931c6ec2c7e1aa44-true; evidence plan EVID-CASE-FLOW-931c6ec2c7e1aa44-true)<br>CASE-FLOW-931c6ec2c7e1aa44-false (condition false; no else arm; fixture FIX-CASE-FLOW-931c6ec2c7e1aa44-false; reference REF-CASE-FLOW-931c6ec2c7e1aa44-false; test TEST-CASE-FLOW-931c6ec2c7e1aa44-false; evidence plan EVID-CASE-FLOW-931c6ec2c7e1aa44-false) |
| FLOW-fb652ef0b2a2b4c7 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 55–57 | if | `(p.getTextureIndex() > maxTextureIndex)` | CASE-FLOW-fb652ef0b2a2b4c7-true (condition evaluates true; fixture FIX-CASE-FLOW-fb652ef0b2a2b4c7-true; reference REF-CASE-FLOW-fb652ef0b2a2b4c7-true; test TEST-CASE-FLOW-fb652ef0b2a2b4c7-true; evidence plan EVID-CASE-FLOW-fb652ef0b2a2b4c7-true)<br>CASE-FLOW-fb652ef0b2a2b4c7-false (condition false; no else arm; fixture FIX-CASE-FLOW-fb652ef0b2a2b4c7-false; reference REF-CASE-FLOW-fb652ef0b2a2b4c7-false; test TEST-CASE-FLOW-fb652ef0b2a2b4c7-false; evidence plan EVID-CASE-FLOW-fb652ef0b2a2b4c7-false) |
| FLOW-6531978aa7a1c45c | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 58–60 | while_loop | `(patches.size() <= id)` | CASE-FLOW-6531978aa7a1c45c-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-6531978aa7a1c45c-iterate; reference REF-CASE-FLOW-6531978aa7a1c45c-iterate; test TEST-CASE-FLOW-6531978aa7a1c45c-iterate; evidence plan EVID-CASE-FLOW-6531978aa7a1c45c-iterate)<br>CASE-FLOW-6531978aa7a1c45c-exit (condition is false; fixture FIX-CASE-FLOW-6531978aa7a1c45c-exit; reference REF-CASE-FLOW-6531978aa7a1c45c-exit; test TEST-CASE-FLOW-6531978aa7a1c45c-exit; evidence plan EVID-CASE-FLOW-6531978aa7a1c45c-exit) |
| FLOW-ff2372985c134877 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 68–95 | if | `(k.startsWith("rot"))` | CASE-FLOW-ff2372985c134877-true (condition evaluates true; fixture FIX-CASE-FLOW-ff2372985c134877-true; reference REF-CASE-FLOW-ff2372985c134877-true; test TEST-CASE-FLOW-ff2372985c134877-true; evidence plan EVID-CASE-FLOW-ff2372985c134877-true)<br>CASE-FLOW-ff2372985c134877-false (condition false; no else arm; fixture FIX-CASE-FLOW-ff2372985c134877-false; reference REF-CASE-FLOW-ff2372985c134877-false; test TEST-CASE-FLOW-ff2372985c134877-false; evidence plan EVID-CASE-FLOW-ff2372985c134877-false) |
| FLOW-db8a7734e5b2beff | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 70–75 | try_catch | `resources=[]; catches=[NumberFormatException nfx]; finally=absent` | CASE-FLOW-db8a7734e5b2beff-normal (try body completes normally; fixture FIX-CASE-FLOW-db8a7734e5b2beff-normal; reference REF-CASE-FLOW-db8a7734e5b2beff-normal; test TEST-CASE-FLOW-db8a7734e5b2beff-normal; evidence plan EVID-CASE-FLOW-db8a7734e5b2beff-normal)<br>CASE-FLOW-db8a7734e5b2beff-catch-0 (exception matches NumberFormatException nfx; fixture FIX-CASE-FLOW-db8a7734e5b2beff-catch-0; reference REF-CASE-FLOW-db8a7734e5b2beff-catch-0; test TEST-CASE-FLOW-db8a7734e5b2beff-catch-0; evidence plan EVID-CASE-FLOW-db8a7734e5b2beff-catch-0)<br>CASE-FLOW-db8a7734e5b2beff-finally (no finally block; fixture FIX-CASE-FLOW-db8a7734e5b2beff-finally; reference REF-CASE-FLOW-db8a7734e5b2beff-finally; test TEST-CASE-FLOW-db8a7734e5b2beff-finally; evidence plan EVID-CASE-FLOW-db8a7734e5b2beff-finally) |
| FLOW-c9ba94a9ca4c1bc6 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 78–94 | try_catch | `resources=[]; catches=[NumberFormatException nfx]; finally=absent` | CASE-FLOW-c9ba94a9ca4c1bc6-normal (try body completes normally; fixture FIX-CASE-FLOW-c9ba94a9ca4c1bc6-normal; reference REF-CASE-FLOW-c9ba94a9ca4c1bc6-normal; test TEST-CASE-FLOW-c9ba94a9ca4c1bc6-normal; evidence plan EVID-CASE-FLOW-c9ba94a9ca4c1bc6-normal)<br>CASE-FLOW-c9ba94a9ca4c1bc6-catch-0 (exception matches NumberFormatException nfx; fixture FIX-CASE-FLOW-c9ba94a9ca4c1bc6-catch-0; reference REF-CASE-FLOW-c9ba94a9ca4c1bc6-catch-0; test TEST-CASE-FLOW-c9ba94a9ca4c1bc6-catch-0; evidence plan EVID-CASE-FLOW-c9ba94a9ca4c1bc6-catch-0)<br>CASE-FLOW-c9ba94a9ca4c1bc6-finally (no finally block; fixture FIX-CASE-FLOW-c9ba94a9ca4c1bc6-finally; reference REF-CASE-FLOW-c9ba94a9ca4c1bc6-finally; test TEST-CASE-FLOW-c9ba94a9ca4c1bc6-finally; evidence plan EVID-CASE-FLOW-c9ba94a9ca4c1bc6-finally) |
| FLOW-1710f293d977b0f4 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 79–86 | if | `(rotvals.length >= 3)` | CASE-FLOW-1710f293d977b0f4-true (condition evaluates true; fixture FIX-CASE-FLOW-1710f293d977b0f4-true; reference REF-CASE-FLOW-1710f293d977b0f4-true; test TEST-CASE-FLOW-1710f293d977b0f4-true; evidence plan EVID-CASE-FLOW-1710f293d977b0f4-true)<br>CASE-FLOW-1710f293d977b0f4-false (condition evaluates false; fixture FIX-CASE-FLOW-1710f293d977b0f4-false; reference REF-CASE-FLOW-1710f293d977b0f4-false; test TEST-CASE-FLOW-1710f293d977b0f4-false; evidence plan EVID-CASE-FLOW-1710f293d977b0f4-false) |
| FLOW-a4dfffef5d226cab | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 87–89 | while_loop | `(rotations.size() <= id)` | CASE-FLOW-a4dfffef5d226cab-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-a4dfffef5d226cab-iterate; reference REF-CASE-FLOW-a4dfffef5d226cab-iterate; test TEST-CASE-FLOW-a4dfffef5d226cab-iterate; evidence plan EVID-CASE-FLOW-a4dfffef5d226cab-iterate)<br>CASE-FLOW-a4dfffef5d226cab-exit (condition is false; fixture FIX-CASE-FLOW-a4dfffef5d226cab-exit; reference REF-CASE-FLOW-a4dfffef5d226cab-exit; test TEST-CASE-FLOW-a4dfffef5d226cab-exit; evidence plan EVID-CASE-FLOW-a4dfffef5d226cab-exit) |
| FLOW-dc7a073bb36b4e3b | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 98–103 | for_loop | `i < patches.size()` | CASE-FLOW-dc7a073bb36b4e3b-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-dc7a073bb36b4e3b-iterate; reference REF-CASE-FLOW-dc7a073bb36b4e3b-iterate; test TEST-CASE-FLOW-dc7a073bb36b4e3b-iterate; evidence plan EVID-CASE-FLOW-dc7a073bb36b4e3b-iterate)<br>CASE-FLOW-dc7a073bb36b4e3b-exit (condition is false; fixture FIX-CASE-FLOW-dc7a073bb36b4e3b-exit; reference REF-CASE-FLOW-dc7a073bb36b4e3b-exit; test TEST-CASE-FLOW-dc7a073bb36b4e3b-exit; evidence plan EVID-CASE-FLOW-dc7a073bb36b4e3b-exit) |
| FLOW-be034ab7d16a9ccd | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 99–102 | if | `(patches.get(i) == null)` | CASE-FLOW-be034ab7d16a9ccd-true (condition evaluates true; fixture FIX-CASE-FLOW-be034ab7d16a9ccd-true; reference REF-CASE-FLOW-be034ab7d16a9ccd-true; test TEST-CASE-FLOW-be034ab7d16a9ccd-true; evidence plan EVID-CASE-FLOW-be034ab7d16a9ccd-true)<br>CASE-FLOW-be034ab7d16a9ccd-false (condition false; no else arm; fixture FIX-CASE-FLOW-be034ab7d16a9ccd-false; reference REF-CASE-FLOW-be034ab7d16a9ccd-false; test TEST-CASE-FLOW-be034ab7d16a9ccd-false; evidence plan EVID-CASE-FLOW-be034ab7d16a9ccd-false) |
| FLOW-1aa98ecc3dc0fc84 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 108–115 | for_loop | `i < rotations.size()` | CASE-FLOW-1aa98ecc3dc0fc84-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-1aa98ecc3dc0fc84-iterate; reference REF-CASE-FLOW-1aa98ecc3dc0fc84-iterate; test TEST-CASE-FLOW-1aa98ecc3dc0fc84-iterate; evidence plan EVID-CASE-FLOW-1aa98ecc3dc0fc84-iterate)<br>CASE-FLOW-1aa98ecc3dc0fc84-exit (condition is false; fixture FIX-CASE-FLOW-1aa98ecc3dc0fc84-exit; reference REF-CASE-FLOW-1aa98ecc3dc0fc84-exit; test TEST-CASE-FLOW-1aa98ecc3dc0fc84-exit; evidence plan EVID-CASE-FLOW-1aa98ecc3dc0fc84-exit) |
| FLOW-6ed2c329fd9206c4 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 110–110 | if | `(rots == null)` | CASE-FLOW-6ed2c329fd9206c4-true (condition evaluates true; fixture FIX-CASE-FLOW-6ed2c329fd9206c4-true; reference REF-CASE-FLOW-6ed2c329fd9206c4-true; test TEST-CASE-FLOW-6ed2c329fd9206c4-true; evidence plan EVID-CASE-FLOW-6ed2c329fd9206c4-true)<br>CASE-FLOW-6ed2c329fd9206c4-false (condition false; no else arm; fixture FIX-CASE-FLOW-6ed2c329fd9206c4-false; reference REF-CASE-FLOW-6ed2c329fd9206c4-false; test TEST-CASE-FLOW-6ed2c329fd9206c4-false; evidence plan EVID-CASE-FLOW-6ed2c329fd9206c4-false) |
| FLOW-036aa0298f91a35f | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 112–114 | for_loop | `j < basemodel.length` | CASE-FLOW-036aa0298f91a35f-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-036aa0298f91a35f-iterate; reference REF-CASE-FLOW-036aa0298f91a35f-iterate; test TEST-CASE-FLOW-036aa0298f91a35f-iterate; evidence plan EVID-CASE-FLOW-036aa0298f91a35f-iterate)<br>CASE-FLOW-036aa0298f91a35f-exit (condition is false; fixture FIX-CASE-FLOW-036aa0298f91a35f-exit; reference REF-CASE-FLOW-036aa0298f91a35f-exit; test TEST-CASE-FLOW-036aa0298f91a35f-exit; evidence plan EVID-CASE-FLOW-036aa0298f91a35f-exit) |
| FLOW-41d9efb444cc7e59 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 116–122 | if | `(idx_attrib != null)` | CASE-FLOW-41d9efb444cc7e59-true (condition evaluates true; fixture FIX-CASE-FLOW-41d9efb444cc7e59-true; reference REF-CASE-FLOW-41d9efb444cc7e59-true; test TEST-CASE-FLOW-41d9efb444cc7e59-true; evidence plan EVID-CASE-FLOW-41d9efb444cc7e59-true)<br>CASE-FLOW-41d9efb444cc7e59-false (condition evaluates false; fixture FIX-CASE-FLOW-41d9efb444cc7e59-false; reference REF-CASE-FLOW-41d9efb444cc7e59-false; test TEST-CASE-FLOW-41d9efb444cc7e59-false; evidence plan EVID-CASE-FLOW-41d9efb444cc7e59-false) |
| FLOW-5413c8794f6f8852 | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 141–149 | if | `(idx_attrib != null)` | CASE-FLOW-5413c8794f6f8852-true (condition evaluates true; fixture FIX-CASE-FLOW-5413c8794f6f8852-true; reference REF-CASE-FLOW-5413c8794f6f8852-true; test TEST-CASE-FLOW-5413c8794f6f8852-true; evidence plan EVID-CASE-FLOW-5413c8794f6f8852-true)<br>CASE-FLOW-5413c8794f6f8852-false (condition evaluates false; fixture FIX-CASE-FLOW-5413c8794f6f8852-false; reference REF-CASE-FLOW-5413c8794f6f8852-false; test TEST-CASE-FLOW-5413c8794f6f8852-false; evidence plan EVID-CASE-FLOW-5413c8794f6f8852-false) |
| FLOW-53029315a41c09fb | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 143–145 | if | `(idxv instanceof Number)` | CASE-FLOW-53029315a41c09fb-true (condition evaluates true; fixture FIX-CASE-FLOW-53029315a41c09fb-true; reference REF-CASE-FLOW-53029315a41c09fb-true; test TEST-CASE-FLOW-53029315a41c09fb-true; evidence plan EVID-CASE-FLOW-53029315a41c09fb-true)<br>CASE-FLOW-53029315a41c09fb-false (condition false; no else arm; fixture FIX-CASE-FLOW-53029315a41c09fb-false; reference REF-CASE-FLOW-53029315a41c09fb-false; test TEST-CASE-FLOW-53029315a41c09fb-false; evidence plan EVID-CASE-FLOW-53029315a41c09fb-false) |
| FLOW-9578f2ffd8dafe5a | `org.dynmap.hdmap.renderer.RotatedPatchRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 150–155 | if | `((rotIdx >= 0) && (rotIdx < models.length) && (models[rotIdx] != null))` | CASE-FLOW-9578f2ffd8dafe5a-true (condition evaluates true; fixture FIX-CASE-FLOW-9578f2ffd8dafe5a-true; reference REF-CASE-FLOW-9578f2ffd8dafe5a-true; test TEST-CASE-FLOW-9578f2ffd8dafe5a-true; evidence plan EVID-CASE-FLOW-9578f2ffd8dafe5a-true)<br>CASE-FLOW-9578f2ffd8dafe5a-false (condition evaluates false; fixture FIX-CASE-FLOW-9578f2ffd8dafe5a-false; reference REF-CASE-FLOW-9578f2ffd8dafe5a-false; test TEST-CASE-FLOW-9578f2ffd8dafe5a-false; evidence plan EVID-CASE-FLOW-9578f2ffd8dafe5a-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins RotatedPatchRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer RotatedPatchRenderer --fixture-set rotated-patch-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer RotatedPatchRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin RotatedPatchRenderer
```
