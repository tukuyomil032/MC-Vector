# B-wall-head-renderer: Dynmap built-in renderer WallHeadRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-wall-head-renderer",
  "kind": "builtin",
  "document": "phases/builtins/wall-head-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin WallHeadRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/WallHeadRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/wall-head-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-b7ca54f42647b8be | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1067 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-b7ca54f42647b8be | DynmapCore/src/main/resources/models_1.txt:1067 | — | skeleton_wall_skull, wither_skeleton_wall_skull, zombie_wall_head, player_wall_head, creeper_wall_head, dragon_wall_head |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-b7ca54f42647b8be | FIX-CASE-REG-b7ca54f42647b8be | REF-CASE-REG-b7ca54f42647b8be | TEST-CASE-REG-b7ca54f42647b8be | EVID-CASE-REG-b7ca54f42647b8be | DynmapCore/src/main/resources/models_1.txt:1067; guard=—; block=skeleton_wall_skull, wither_skeleton_wall_skull, zombie_wall_head, player_wall_head, creeper_wall_head, dragon_wall_head; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 9 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.WallHeadRenderer#NUM_DIRECTIONS | field | `org.dynmap.hdmap.renderer.WallHeadRenderer#NUM_DIRECTIONS:int` | 14–14 |
| field:type:org.dynmap.hdmap.renderer.WallHeadRenderer#basemesh | field | `org.dynmap.hdmap.renderer.WallHeadRenderer#basemesh:RenderPatch[]` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.WallHeadRenderer#faces | field | `org.dynmap.hdmap.renderer.WallHeadRenderer#faces:int[]` | 44–44 |
| field:type:org.dynmap.hdmap.renderer.WallHeadRenderer#meshes | field | `org.dynmap.hdmap.renderer.WallHeadRenderer#meshes:RenderPatch[][]` | 17–17 |
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.WallHeadRenderer#getMaximumTextureCount()->int` | 39–42 |
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 46–63 |
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.WallHeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 19–37 |
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.WallHeadRenderer#isOnlyBlockStateSensitive()->boolean` | 64–67 |
| type:org.dynmap.hdmap.renderer.WallHeadRenderer | class | `org.dynmap.hdmap.renderer.WallHeadRenderer` | 13–68 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.WallHeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 19–37 | FLOW-6bdcbeccb394814e |
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.WallHeadRenderer#getMaximumTextureCount()->int` | 39–42 | none |
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 46–63 | FLOW-3a69dc2f6e502f7a, FLOW-3386901f6524b517, FLOW-b888cd9b83f1c258, FLOW-289d733e54647637 |
| method:type:org.dynmap.hdmap.renderer.WallHeadRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.WallHeadRenderer#isOnlyBlockStateSensitive()->boolean` | 64–67 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-6bdcbeccb394814e | `org.dynmap.hdmap.renderer.WallHeadRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 21–22 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-6bdcbeccb394814e-true (condition evaluates true; fixture FIX-CASE-FLOW-6bdcbeccb394814e-true; reference REF-CASE-FLOW-6bdcbeccb394814e-true; test TEST-CASE-FLOW-6bdcbeccb394814e-true; evidence plan EVID-CASE-FLOW-6bdcbeccb394814e-true)<br>CASE-FLOW-6bdcbeccb394814e-false (condition false; no else arm; fixture FIX-CASE-FLOW-6bdcbeccb394814e-false; reference REF-CASE-FLOW-6bdcbeccb394814e-false; test TEST-CASE-FLOW-6bdcbeccb394814e-false; evidence plan EVID-CASE-FLOW-6bdcbeccb394814e-false) |
| FLOW-3a69dc2f6e502f7a | `org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 49–49 | while_loop | `(idx < 0)` | CASE-FLOW-3a69dc2f6e502f7a-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-3a69dc2f6e502f7a-iterate; reference REF-CASE-FLOW-3a69dc2f6e502f7a-iterate; test TEST-CASE-FLOW-3a69dc2f6e502f7a-iterate; evidence plan EVID-CASE-FLOW-3a69dc2f6e502f7a-iterate)<br>CASE-FLOW-3a69dc2f6e502f7a-exit (condition is false; fixture FIX-CASE-FLOW-3a69dc2f6e502f7a-exit; reference REF-CASE-FLOW-3a69dc2f6e502f7a-exit; test TEST-CASE-FLOW-3a69dc2f6e502f7a-exit; evidence plan EVID-CASE-FLOW-3a69dc2f6e502f7a-exit) |
| FLOW-3386901f6524b517 | `org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 50–62 | if | `(idx < meshes.length)` | CASE-FLOW-3386901f6524b517-true (condition evaluates true; fixture FIX-CASE-FLOW-3386901f6524b517-true; reference REF-CASE-FLOW-3386901f6524b517-true; test TEST-CASE-FLOW-3386901f6524b517-true; evidence plan EVID-CASE-FLOW-3386901f6524b517-true)<br>CASE-FLOW-3386901f6524b517-false (condition evaluates false; fixture FIX-CASE-FLOW-3386901f6524b517-false; reference REF-CASE-FLOW-3386901f6524b517-false; test TEST-CASE-FLOW-3386901f6524b517-false; evidence plan EVID-CASE-FLOW-3386901f6524b517-false) |
| FLOW-b888cd9b83f1c258 | `org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 51–58 | if | `(meshes[idx] == null)` | CASE-FLOW-b888cd9b83f1c258-true (condition evaluates true; fixture FIX-CASE-FLOW-b888cd9b83f1c258-true; reference REF-CASE-FLOW-b888cd9b83f1c258-true; test TEST-CASE-FLOW-b888cd9b83f1c258-true; evidence plan EVID-CASE-FLOW-b888cd9b83f1c258-true)<br>CASE-FLOW-b888cd9b83f1c258-false (condition false; no else arm; fixture FIX-CASE-FLOW-b888cd9b83f1c258-false; reference REF-CASE-FLOW-b888cd9b83f1c258-false; test TEST-CASE-FLOW-b888cd9b83f1c258-false; evidence plan EVID-CASE-FLOW-b888cd9b83f1c258-false) |
| FLOW-289d733e54647637 | `org.dynmap.hdmap.renderer.WallHeadRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 54–56 | for_loop | `i < rp.length` | CASE-FLOW-289d733e54647637-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-289d733e54647637-iterate; reference REF-CASE-FLOW-289d733e54647637-iterate; test TEST-CASE-FLOW-289d733e54647637-iterate; evidence plan EVID-CASE-FLOW-289d733e54647637-iterate)<br>CASE-FLOW-289d733e54647637-exit (condition is false; fixture FIX-CASE-FLOW-289d733e54647637-exit; reference REF-CASE-FLOW-289d733e54647637-exit; test TEST-CASE-FLOW-289d733e54647637-exit; evidence plan EVID-CASE-FLOW-289d733e54647637-exit) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins WallHeadRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer WallHeadRenderer --fixture-set wall-head-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer WallHeadRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin WallHeadRenderer
```
