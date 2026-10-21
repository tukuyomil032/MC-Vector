# B-pane-state-renderer: Dynmap built-in renderer PaneStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-pane-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/pane-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin PaneStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/PaneStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/pane-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-fc3c7b6acf48e52b | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1200 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-fc3c7b6acf48e52b | DynmapCore/src/main/resources/models_1.txt:1200 | — | glass_pane |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-fc3c7b6acf48e52b | FIX-CASE-REG-fc3c7b6acf48e52b | REF-CASE-REG-fc3c7b6acf48e52b | TEST-CASE-REG-fc3c7b6acf48e52b | EVID-CASE-REG-fc3c7b6acf48e52b | DynmapCore/src/main/resources/models_1.txt:1200; guard=—; block=glass_pane; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 3 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| method:type:org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 10–16 |
| method:type:org.dynmap.hdmap.renderer.PaneStateRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.PaneStateRenderer#isOnlyBlockStateSensitive()->boolean` | 17–20 |
| type:org.dynmap.hdmap.renderer.PaneStateRenderer | class | `org.dynmap.hdmap.renderer.PaneStateRenderer` | 9–21 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 10–16 | FLOW-0ce7b3d41abc3af9, FLOW-3fad0346cf958293, FLOW-afb8df921b13cb2f, FLOW-b97f0b41b1086d51 |
| method:type:org.dynmap.hdmap.renderer.PaneStateRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.PaneStateRenderer#isOnlyBlockStateSensitive()->boolean` | 17–20 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-0ce7b3d41abc3af9 | `org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 14–14 | conditional_expression | `((idx & 8) == 0)` | CASE-FLOW-0ce7b3d41abc3af9-true (condition evaluates true; fixture FIX-CASE-FLOW-0ce7b3d41abc3af9-true; reference REF-CASE-FLOW-0ce7b3d41abc3af9-true; test TEST-CASE-FLOW-0ce7b3d41abc3af9-true; evidence plan EVID-CASE-FLOW-0ce7b3d41abc3af9-true)<br>CASE-FLOW-0ce7b3d41abc3af9-false (condition evaluates false; fixture FIX-CASE-FLOW-0ce7b3d41abc3af9-false; reference REF-CASE-FLOW-0ce7b3d41abc3af9-false; test TEST-CASE-FLOW-0ce7b3d41abc3af9-false; evidence plan EVID-CASE-FLOW-0ce7b3d41abc3af9-false) |
| FLOW-3fad0346cf958293 | `org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 14–14 | conditional_expression | `((idx & 4) == 0)` | CASE-FLOW-3fad0346cf958293-true (condition evaluates true; fixture FIX-CASE-FLOW-3fad0346cf958293-true; reference REF-CASE-FLOW-3fad0346cf958293-true; test TEST-CASE-FLOW-3fad0346cf958293-true; evidence plan EVID-CASE-FLOW-3fad0346cf958293-true)<br>CASE-FLOW-3fad0346cf958293-false (condition evaluates false; fixture FIX-CASE-FLOW-3fad0346cf958293-false; reference REF-CASE-FLOW-3fad0346cf958293-false; test TEST-CASE-FLOW-3fad0346cf958293-false; evidence plan EVID-CASE-FLOW-3fad0346cf958293-false) |
| FLOW-afb8df921b13cb2f | `org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 14–14 | conditional_expression | `((idx & 1) == 0)` | CASE-FLOW-afb8df921b13cb2f-true (condition evaluates true; fixture FIX-CASE-FLOW-afb8df921b13cb2f-true; reference REF-CASE-FLOW-afb8df921b13cb2f-true; test TEST-CASE-FLOW-afb8df921b13cb2f-true; evidence plan EVID-CASE-FLOW-afb8df921b13cb2f-true)<br>CASE-FLOW-afb8df921b13cb2f-false (condition evaluates false; fixture FIX-CASE-FLOW-afb8df921b13cb2f-false; reference REF-CASE-FLOW-afb8df921b13cb2f-false; test TEST-CASE-FLOW-afb8df921b13cb2f-false; evidence plan EVID-CASE-FLOW-afb8df921b13cb2f-false) |
| FLOW-b97f0b41b1086d51 | `org.dynmap.hdmap.renderer.PaneStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 14–14 | conditional_expression | `((idx & 16) == 0)` | CASE-FLOW-b97f0b41b1086d51-true (condition evaluates true; fixture FIX-CASE-FLOW-b97f0b41b1086d51-true; reference REF-CASE-FLOW-b97f0b41b1086d51-true; test TEST-CASE-FLOW-b97f0b41b1086d51-true; evidence plan EVID-CASE-FLOW-b97f0b41b1086d51-true)<br>CASE-FLOW-b97f0b41b1086d51-false (condition evaluates false; fixture FIX-CASE-FLOW-b97f0b41b1086d51-false; reference REF-CASE-FLOW-b97f0b41b1086d51-false; test TEST-CASE-FLOW-b97f0b41b1086d51-false; evidence plan EVID-CASE-FLOW-b97f0b41b1086d51-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins PaneStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer PaneStateRenderer --fixture-set pane-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer PaneStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin PaneStateRenderer
```
