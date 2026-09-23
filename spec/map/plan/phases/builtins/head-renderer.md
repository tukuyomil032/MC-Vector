# B-head-renderer: Dynmap built-in renderer HeadRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-head-renderer",
  "kind": "builtin",
  "document": "phases/builtins/head-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin HeadRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/HeadRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/head-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-ded61ecef945250d | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1069 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-ded61ecef945250d | DynmapCore/src/main/resources/models_1.txt:1069 | — | skeleton_skull, wither_skeleton_skull, zombie_head, player_head, creeper_head, dragon_head |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-ded61ecef945250d | FIX-CASE-REG-ded61ecef945250d | REF-CASE-REG-ded61ecef945250d | TEST-CASE-REG-ded61ecef945250d | EVID-CASE-REG-ded61ecef945250d | DynmapCore/src/main/resources/models_1.txt:1069; guard=—; block=skeleton_skull, wither_skeleton_skull, zombie_head, player_head, creeper_head, dragon_head; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 9 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.HeadRenderer#NUM_DIRECTIONS | field | `org.dynmap.hdmap.renderer.HeadRenderer#NUM_DIRECTIONS:int` | 14–14 |
| field:type:org.dynmap.hdmap.renderer.HeadRenderer#basemesh | field | `org.dynmap.hdmap.renderer.HeadRenderer#basemesh:RenderPatch[]` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.HeadRenderer#faces | field | `org.dynmap.hdmap.renderer.HeadRenderer#faces:int[]` | 44–44 |
| field:type:org.dynmap.hdmap.renderer.HeadRenderer#meshes | field | `org.dynmap.hdmap.renderer.HeadRenderer#meshes:RenderPatch[][]` | 17–17 |
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.HeadRenderer#getMaximumTextureCount()->int` | 39–42 |
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 46–63 |
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.HeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 19–37 |
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.HeadRenderer#isOnlyBlockStateSensitive()->boolean` | 64–67 |
| type:org.dynmap.hdmap.renderer.HeadRenderer | class | `org.dynmap.hdmap.renderer.HeadRenderer` | 13–68 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.HeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 19–37 | FLOW-4ebf902ccf49d449 |
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.HeadRenderer#getMaximumTextureCount()->int` | 39–42 | none |
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 46–63 | FLOW-aa595ce5d62b00c1, FLOW-13a7909e54bd74d8, FLOW-0b4c8db3c3ec94aa, FLOW-4ef996fd0e2aec74 |
| method:type:org.dynmap.hdmap.renderer.HeadRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.HeadRenderer#isOnlyBlockStateSensitive()->boolean` | 64–67 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-4ebf902ccf49d449 | `org.dynmap.hdmap.renderer.HeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 21–22 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-4ebf902ccf49d449-true (condition evaluates true; fixture FIX-CASE-FLOW-4ebf902ccf49d449-true; reference REF-CASE-FLOW-4ebf902ccf49d449-true; test TEST-CASE-FLOW-4ebf902ccf49d449-true; evidence plan EVID-CASE-FLOW-4ebf902ccf49d449-true)<br>CASE-FLOW-4ebf902ccf49d449-false (condition false; no else arm; fixture FIX-CASE-FLOW-4ebf902ccf49d449-false; reference REF-CASE-FLOW-4ebf902ccf49d449-false; test TEST-CASE-FLOW-4ebf902ccf49d449-false; evidence plan EVID-CASE-FLOW-4ebf902ccf49d449-false) |
| FLOW-aa595ce5d62b00c1 | `org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 49–49 | while_loop | `(idx < 0)` | CASE-FLOW-aa595ce5d62b00c1-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-aa595ce5d62b00c1-iterate; reference REF-CASE-FLOW-aa595ce5d62b00c1-iterate; test TEST-CASE-FLOW-aa595ce5d62b00c1-iterate; evidence plan EVID-CASE-FLOW-aa595ce5d62b00c1-iterate)<br>CASE-FLOW-aa595ce5d62b00c1-exit (condition is false; fixture FIX-CASE-FLOW-aa595ce5d62b00c1-exit; reference REF-CASE-FLOW-aa595ce5d62b00c1-exit; test TEST-CASE-FLOW-aa595ce5d62b00c1-exit; evidence plan EVID-CASE-FLOW-aa595ce5d62b00c1-exit) |
| FLOW-13a7909e54bd74d8 | `org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 50–62 | if | `(idx < meshes.length)` | CASE-FLOW-13a7909e54bd74d8-true (condition evaluates true; fixture FIX-CASE-FLOW-13a7909e54bd74d8-true; reference REF-CASE-FLOW-13a7909e54bd74d8-true; test TEST-CASE-FLOW-13a7909e54bd74d8-true; evidence plan EVID-CASE-FLOW-13a7909e54bd74d8-true)<br>CASE-FLOW-13a7909e54bd74d8-false (condition evaluates false; fixture FIX-CASE-FLOW-13a7909e54bd74d8-false; reference REF-CASE-FLOW-13a7909e54bd74d8-false; test TEST-CASE-FLOW-13a7909e54bd74d8-false; evidence plan EVID-CASE-FLOW-13a7909e54bd74d8-false) |
| FLOW-0b4c8db3c3ec94aa | `org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 51–58 | if | `(meshes[idx] == null)` | CASE-FLOW-0b4c8db3c3ec94aa-true (condition evaluates true; fixture FIX-CASE-FLOW-0b4c8db3c3ec94aa-true; reference REF-CASE-FLOW-0b4c8db3c3ec94aa-true; test TEST-CASE-FLOW-0b4c8db3c3ec94aa-true; evidence plan EVID-CASE-FLOW-0b4c8db3c3ec94aa-true)<br>CASE-FLOW-0b4c8db3c3ec94aa-false (condition false; no else arm; fixture FIX-CASE-FLOW-0b4c8db3c3ec94aa-false; reference REF-CASE-FLOW-0b4c8db3c3ec94aa-false; test TEST-CASE-FLOW-0b4c8db3c3ec94aa-false; evidence plan EVID-CASE-FLOW-0b4c8db3c3ec94aa-false) |
| FLOW-4ef996fd0e2aec74 | `org.dynmap.hdmap.renderer.HeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 54–56 | for_loop | `i < rp.length` | CASE-FLOW-4ef996fd0e2aec74-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-4ef996fd0e2aec74-iterate; reference REF-CASE-FLOW-4ef996fd0e2aec74-iterate; test TEST-CASE-FLOW-4ef996fd0e2aec74-iterate; evidence plan EVID-CASE-FLOW-4ef996fd0e2aec74-iterate)<br>CASE-FLOW-4ef996fd0e2aec74-exit (condition is false; fixture FIX-CASE-FLOW-4ef996fd0e2aec74-exit; reference REF-CASE-FLOW-4ef996fd0e2aec74-exit; test TEST-CASE-FLOW-4ef996fd0e2aec74-exit; evidence plan EVID-CASE-FLOW-4ef996fd0e2aec74-exit) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins HeadRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer HeadRenderer --fixture-set head-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer HeadRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin HeadRenderer
```
