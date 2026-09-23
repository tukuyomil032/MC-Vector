# B-rpsupport-frame-renderer: Dynmap built-in renderer RPSupportFrameRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-rpsupport-frame-renderer",
  "kind": "builtin",
  "document": "phases/builtins/rpsupport-frame-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin RPSupportFrameRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RPSupportFrameRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/rpsupport-frame-renderer.rs。共通処理はdomain/model/traversalへ置く。
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

This file contributes 6 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#frame_txt_edge | field | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#frame_txt_edge:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#frame_txt_side | field | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#frame_txt_side:int` | 14–14 |
| method:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getMaximumTextureCount()->int` | 26–29 |
| method:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 31–65 |
| method:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 17–24 |
| type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer | class | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer` | 13–66 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 17–24 | FLOW-443ea3c2ccfec4e2 |
| method:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getMaximumTextureCount()->int` | 26–29 | none |
| method:type:org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 31–65 | FLOW-ef602d3b13451c88, FLOW-4f924282776fb5ce, FLOW-dcbde93f1da3bb4a, FLOW-9b76525d5bb75ed2, FLOW-15bea9f029a624ce, FLOW-cbd3902df4e9c5e6, FLOW-fe9269ad695d41af, FLOW-12abec9f10c9a63c |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-443ea3c2ccfec4e2 | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 19–20 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-443ea3c2ccfec4e2-true (condition evaluates true; fixture FIX-CASE-FLOW-443ea3c2ccfec4e2-true; reference REF-CASE-FLOW-443ea3c2ccfec4e2-true; test TEST-CASE-FLOW-443ea3c2ccfec4e2-true; evidence plan EVID-CASE-FLOW-443ea3c2ccfec4e2-true)<br>CASE-FLOW-443ea3c2ccfec4e2-false (condition false; no else arm; fixture FIX-CASE-FLOW-443ea3c2ccfec4e2-false; reference REF-CASE-FLOW-443ea3c2ccfec4e2-false; test TEST-CASE-FLOW-443ea3c2ccfec4e2-false; evidence plan EVID-CASE-FLOW-443ea3c2ccfec4e2-false) |
| FLOW-ef602d3b13451c88 | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 35–37 | if | `(v instanceof Integer)` | CASE-FLOW-ef602d3b13451c88-true (condition evaluates true; fixture FIX-CASE-FLOW-ef602d3b13451c88-true; reference REF-CASE-FLOW-ef602d3b13451c88-true; test TEST-CASE-FLOW-ef602d3b13451c88-true; evidence plan EVID-CASE-FLOW-ef602d3b13451c88-true)<br>CASE-FLOW-ef602d3b13451c88-false (condition false; no else arm; fixture FIX-CASE-FLOW-ef602d3b13451c88-false; reference REF-CASE-FLOW-ef602d3b13451c88-false; test TEST-CASE-FLOW-ef602d3b13451c88-false; evidence plan EVID-CASE-FLOW-ef602d3b13451c88-false) |
| FLOW-4f924282776fb5ce | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 43–43 | conditional_expression | `((covermask & 2) != 0)` | CASE-FLOW-4f924282776fb5ce-true (condition evaluates true; fixture FIX-CASE-FLOW-4f924282776fb5ce-true; reference REF-CASE-FLOW-4f924282776fb5ce-true; test TEST-CASE-FLOW-4f924282776fb5ce-true; evidence plan EVID-CASE-FLOW-4f924282776fb5ce-true)<br>CASE-FLOW-4f924282776fb5ce-false (condition evaluates false; fixture FIX-CASE-FLOW-4f924282776fb5ce-false; reference REF-CASE-FLOW-4f924282776fb5ce-false; test TEST-CASE-FLOW-4f924282776fb5ce-false; evidence plan EVID-CASE-FLOW-4f924282776fb5ce-false) |
| FLOW-dcbde93f1da3bb4a | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 46–46 | conditional_expression | `((covermask & 1) != 0)` | CASE-FLOW-dcbde93f1da3bb4a-true (condition evaluates true; fixture FIX-CASE-FLOW-dcbde93f1da3bb4a-true; reference REF-CASE-FLOW-dcbde93f1da3bb4a-true; test TEST-CASE-FLOW-dcbde93f1da3bb4a-true; evidence plan EVID-CASE-FLOW-dcbde93f1da3bb4a-true)<br>CASE-FLOW-dcbde93f1da3bb4a-false (condition evaluates false; fixture FIX-CASE-FLOW-dcbde93f1da3bb4a-false; reference REF-CASE-FLOW-dcbde93f1da3bb4a-false; test TEST-CASE-FLOW-dcbde93f1da3bb4a-false; evidence plan EVID-CASE-FLOW-dcbde93f1da3bb4a-false) |
| FLOW-9b76525d5bb75ed2 | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 49–49 | conditional_expression | `((covermask & 16) != 0)` | CASE-FLOW-9b76525d5bb75ed2-true (condition evaluates true; fixture FIX-CASE-FLOW-9b76525d5bb75ed2-true; reference REF-CASE-FLOW-9b76525d5bb75ed2-true; test TEST-CASE-FLOW-9b76525d5bb75ed2-true; evidence plan EVID-CASE-FLOW-9b76525d5bb75ed2-true)<br>CASE-FLOW-9b76525d5bb75ed2-false (condition evaluates false; fixture FIX-CASE-FLOW-9b76525d5bb75ed2-false; reference REF-CASE-FLOW-9b76525d5bb75ed2-false; test TEST-CASE-FLOW-9b76525d5bb75ed2-false; evidence plan EVID-CASE-FLOW-9b76525d5bb75ed2-false) |
| FLOW-15bea9f029a624ce | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 52–52 | conditional_expression | `((covermask & 32) != 0)` | CASE-FLOW-15bea9f029a624ce-true (condition evaluates true; fixture FIX-CASE-FLOW-15bea9f029a624ce-true; reference REF-CASE-FLOW-15bea9f029a624ce-true; test TEST-CASE-FLOW-15bea9f029a624ce-true; evidence plan EVID-CASE-FLOW-15bea9f029a624ce-true)<br>CASE-FLOW-15bea9f029a624ce-false (condition evaluates false; fixture FIX-CASE-FLOW-15bea9f029a624ce-false; reference REF-CASE-FLOW-15bea9f029a624ce-false; test TEST-CASE-FLOW-15bea9f029a624ce-false; evidence plan EVID-CASE-FLOW-15bea9f029a624ce-false) |
| FLOW-cbd3902df4e9c5e6 | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 55–55 | conditional_expression | `((covermask & 4) != 0)` | CASE-FLOW-cbd3902df4e9c5e6-true (condition evaluates true; fixture FIX-CASE-FLOW-cbd3902df4e9c5e6-true; reference REF-CASE-FLOW-cbd3902df4e9c5e6-true; test TEST-CASE-FLOW-cbd3902df4e9c5e6-true; evidence plan EVID-CASE-FLOW-cbd3902df4e9c5e6-true)<br>CASE-FLOW-cbd3902df4e9c5e6-false (condition evaluates false; fixture FIX-CASE-FLOW-cbd3902df4e9c5e6-false; reference REF-CASE-FLOW-cbd3902df4e9c5e6-false; test TEST-CASE-FLOW-cbd3902df4e9c5e6-false; evidence plan EVID-CASE-FLOW-cbd3902df4e9c5e6-false) |
| FLOW-fe9269ad695d41af | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 58–58 | conditional_expression | `((covermask & 8) != 0)` | CASE-FLOW-fe9269ad695d41af-true (condition evaluates true; fixture FIX-CASE-FLOW-fe9269ad695d41af-true; reference REF-CASE-FLOW-fe9269ad695d41af-true; test TEST-CASE-FLOW-fe9269ad695d41af-true; evidence plan EVID-CASE-FLOW-fe9269ad695d41af-true)<br>CASE-FLOW-fe9269ad695d41af-false (condition evaluates false; fixture FIX-CASE-FLOW-fe9269ad695d41af-false; reference REF-CASE-FLOW-fe9269ad695d41af-false; test TEST-CASE-FLOW-fe9269ad695d41af-false; evidence plan EVID-CASE-FLOW-fe9269ad695d41af-false) |
| FLOW-12abec9f10c9a63c | `org.dynmap.hdmap.renderer.RPSupportFrameRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 60–63 | if | `((covermask & 1073741823) != 0)` | CASE-FLOW-12abec9f10c9a63c-true (condition evaluates true; fixture FIX-CASE-FLOW-12abec9f10c9a63c-true; reference REF-CASE-FLOW-12abec9f10c9a63c-true; test TEST-CASE-FLOW-12abec9f10c9a63c-true; evidence plan EVID-CASE-FLOW-12abec9f10c9a63c-true)<br>CASE-FLOW-12abec9f10c9a63c-false (condition false; no else arm; fixture FIX-CASE-FLOW-12abec9f10c9a63c-false; reference REF-CASE-FLOW-12abec9f10c9a63c-false; test TEST-CASE-FLOW-12abec9f10c9a63c-false; evidence plan EVID-CASE-FLOW-12abec9f10c9a63c-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins RPSupportFrameRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer RPSupportFrameRenderer --fixture-set rpsupport-frame-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer RPSupportFrameRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin RPSupportFrameRenderer
```
