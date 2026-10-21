# B-skull-renderer: Dynmap built-in renderer SkullRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-skull-renderer",
  "kind": "builtin",
  "document": "phases/builtins/skull-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin SkullRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/SkullRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/skull-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-9073ade857dc3c9b | static customblock registration | DynmapCore/src/main/resources/models_0.txt:970 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-9073ade857dc3c9b | DynmapCore/src/main/resources/models_0.txt:970 | — | skull | * |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-9073ade857dc3c9b | FIX-CASE-REG-9073ade857dc3c9b | REF-CASE-REG-9073ade857dc3c9b | TEST-CASE-REG-9073ade857dc3c9b | EVID-CASE-REG-9073ade857dc3c9b | DynmapCore/src/main/resources/models_0.txt:970; guard=—; block=skull; data=*; state=; parameter keys= |

### Exact implementation symbols

This file contributes 11 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.SkullRenderer#NUM_DIRECTIONS | field | `org.dynmap.hdmap.renderer.SkullRenderer#NUM_DIRECTIONS:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.SkullRenderer#NUM_FACES | field | `org.dynmap.hdmap.renderer.SkullRenderer#NUM_FACES:int` | 14–14 |
| field:type:org.dynmap.hdmap.renderer.SkullRenderer#basemesh | field | `org.dynmap.hdmap.renderer.SkullRenderer#basemesh:RenderPatch[]` | 18–18 |
| field:type:org.dynmap.hdmap.renderer.SkullRenderer#faces | field | `org.dynmap.hdmap.renderer.SkullRenderer#faces:int[]` | 46–46 |
| field:type:org.dynmap.hdmap.renderer.SkullRenderer#meshes | field | `org.dynmap.hdmap.renderer.SkullRenderer#meshes:RenderPatch[][]` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.SkullRenderer#tileFields | field | `org.dynmap.hdmap.renderer.SkullRenderer#tileFields:String[]` | 16–16 |
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.SkullRenderer#getMaximumTextureCount()->int` | 41–44 |
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 48–72 |
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.SkullRenderer#getTileEntityFieldsNeeded()->String[]` | 74–77 |
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.SkullRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–39 |
| type:org.dynmap.hdmap.renderer.SkullRenderer | class | `org.dynmap.hdmap.renderer.SkullRenderer` | 13–78 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.SkullRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–39 | FLOW-0ff68bef47e1612b |
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.SkullRenderer#getMaximumTextureCount()->int` | 41–44 | none |
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 48–72 | FLOW-415a82c1774905ca, FLOW-54f2f66005099ab7, FLOW-f8d48a9162d50210, FLOW-9fea3be879b0517b, FLOW-27819cb5a65e4c71, FLOW-43f8fb4b81545951, FLOW-988e2b1ac0d17991 |
| method:type:org.dynmap.hdmap.renderer.SkullRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.SkullRenderer#getTileEntityFieldsNeeded()->String[]` | 74–77 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-0ff68bef47e1612b | `org.dynmap.hdmap.renderer.SkullRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 23–24 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-0ff68bef47e1612b-true (condition evaluates true; fixture FIX-CASE-FLOW-0ff68bef47e1612b-true; reference REF-CASE-FLOW-0ff68bef47e1612b-true; test TEST-CASE-FLOW-0ff68bef47e1612b-true; evidence plan EVID-CASE-FLOW-0ff68bef47e1612b-true)<br>CASE-FLOW-0ff68bef47e1612b-false (condition false; no else arm; fixture FIX-CASE-FLOW-0ff68bef47e1612b-false; reference REF-CASE-FLOW-0ff68bef47e1612b-false; test TEST-CASE-FLOW-0ff68bef47e1612b-false; evidence plan EVID-CASE-FLOW-0ff68bef47e1612b-false) |
| FLOW-415a82c1774905ca | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 53–53 | if | `(val instanceof Byte)` | CASE-FLOW-415a82c1774905ca-true (condition evaluates true; fixture FIX-CASE-FLOW-415a82c1774905ca-true; reference REF-CASE-FLOW-415a82c1774905ca-true; test TEST-CASE-FLOW-415a82c1774905ca-true; evidence plan EVID-CASE-FLOW-415a82c1774905ca-true)<br>CASE-FLOW-415a82c1774905ca-false (condition false; no else arm; fixture FIX-CASE-FLOW-415a82c1774905ca-false; reference REF-CASE-FLOW-415a82c1774905ca-false; test TEST-CASE-FLOW-415a82c1774905ca-false; evidence plan EVID-CASE-FLOW-415a82c1774905ca-false) |
| FLOW-54f2f66005099ab7 | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 54–54 | while_loop | `(rot < 0)` | CASE-FLOW-54f2f66005099ab7-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-54f2f66005099ab7-iterate; reference REF-CASE-FLOW-54f2f66005099ab7-iterate; test TEST-CASE-FLOW-54f2f66005099ab7-iterate; evidence plan EVID-CASE-FLOW-54f2f66005099ab7-iterate)<br>CASE-FLOW-54f2f66005099ab7-exit (condition is false; fixture FIX-CASE-FLOW-54f2f66005099ab7-exit; reference REF-CASE-FLOW-54f2f66005099ab7-exit; test TEST-CASE-FLOW-54f2f66005099ab7-exit; evidence plan EVID-CASE-FLOW-54f2f66005099ab7-exit) |
| FLOW-f8d48a9162d50210 | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 56–56 | if | `(val instanceof Byte)` | CASE-FLOW-f8d48a9162d50210-true (condition evaluates true; fixture FIX-CASE-FLOW-f8d48a9162d50210-true; reference REF-CASE-FLOW-f8d48a9162d50210-true; test TEST-CASE-FLOW-f8d48a9162d50210-true; evidence plan EVID-CASE-FLOW-f8d48a9162d50210-true)<br>CASE-FLOW-f8d48a9162d50210-false (condition false; no else arm; fixture FIX-CASE-FLOW-f8d48a9162d50210-false; reference REF-CASE-FLOW-f8d48a9162d50210-false; test TEST-CASE-FLOW-f8d48a9162d50210-false; evidence plan EVID-CASE-FLOW-f8d48a9162d50210-false) |
| FLOW-9fea3be879b0517b | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 57–57 | while_loop | `(face < 0)` | CASE-FLOW-9fea3be879b0517b-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-9fea3be879b0517b-iterate; reference REF-CASE-FLOW-9fea3be879b0517b-iterate; test TEST-CASE-FLOW-9fea3be879b0517b-iterate; evidence plan EVID-CASE-FLOW-9fea3be879b0517b-iterate)<br>CASE-FLOW-9fea3be879b0517b-exit (condition is false; fixture FIX-CASE-FLOW-9fea3be879b0517b-exit; reference REF-CASE-FLOW-9fea3be879b0517b-exit; test TEST-CASE-FLOW-9fea3be879b0517b-exit; evidence plan EVID-CASE-FLOW-9fea3be879b0517b-exit) |
| FLOW-27819cb5a65e4c71 | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 59–71 | if | `(idx < meshes.length)` | CASE-FLOW-27819cb5a65e4c71-true (condition evaluates true; fixture FIX-CASE-FLOW-27819cb5a65e4c71-true; reference REF-CASE-FLOW-27819cb5a65e4c71-true; test TEST-CASE-FLOW-27819cb5a65e4c71-true; evidence plan EVID-CASE-FLOW-27819cb5a65e4c71-true)<br>CASE-FLOW-27819cb5a65e4c71-false (condition evaluates false; fixture FIX-CASE-FLOW-27819cb5a65e4c71-false; reference REF-CASE-FLOW-27819cb5a65e4c71-false; test TEST-CASE-FLOW-27819cb5a65e4c71-false; evidence plan EVID-CASE-FLOW-27819cb5a65e4c71-false) |
| FLOW-43f8fb4b81545951 | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 60–67 | if | `(meshes[idx] == null)` | CASE-FLOW-43f8fb4b81545951-true (condition evaluates true; fixture FIX-CASE-FLOW-43f8fb4b81545951-true; reference REF-CASE-FLOW-43f8fb4b81545951-true; test TEST-CASE-FLOW-43f8fb4b81545951-true; evidence plan EVID-CASE-FLOW-43f8fb4b81545951-true)<br>CASE-FLOW-43f8fb4b81545951-false (condition false; no else arm; fixture FIX-CASE-FLOW-43f8fb4b81545951-false; reference REF-CASE-FLOW-43f8fb4b81545951-false; test TEST-CASE-FLOW-43f8fb4b81545951-false; evidence plan EVID-CASE-FLOW-43f8fb4b81545951-false) |
| FLOW-988e2b1ac0d17991 | `org.dynmap.hdmap.renderer.SkullRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 63–65 | for_loop | `i < rp.length` | CASE-FLOW-988e2b1ac0d17991-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-988e2b1ac0d17991-iterate; reference REF-CASE-FLOW-988e2b1ac0d17991-iterate; test TEST-CASE-FLOW-988e2b1ac0d17991-iterate; evidence plan EVID-CASE-FLOW-988e2b1ac0d17991-iterate)<br>CASE-FLOW-988e2b1ac0d17991-exit (condition is false; fixture FIX-CASE-FLOW-988e2b1ac0d17991-exit; reference REF-CASE-FLOW-988e2b1ac0d17991-exit; test TEST-CASE-FLOW-988e2b1ac0d17991-exit; evidence plan EVID-CASE-FLOW-988e2b1ac0d17991-exit) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins SkullRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer SkullRenderer --fixture-set skull-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer SkullRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin SkullRenderer
```
