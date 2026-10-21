# B-vine-state-renderer: Dynmap built-in renderer VineStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-vine-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/vine-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin VineStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/VineStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/vine-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-649308032bc9c30c | static customblock registration | DynmapCore/src/main/resources/models_1.txt:899 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-649308032bc9c30c | DynmapCore/src/main/resources/models_1.txt:899 | — | vine |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-649308032bc9c30c | FIX-CASE-REG-649308032bc9c30c | REF-CASE-REG-649308032bc9c30c | TEST-CASE-REG-649308032bc9c30c | EVID-CASE-REG-649308032bc9c30c | DynmapCore/src/main/resources/models_1.txt:899; guard=—; block=vine; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 7 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.VineStateRenderer#meshes | field | `org.dynmap.hdmap.renderer.VineStateRenderer#meshes:RenderPatch[][]` | 19–19 |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` | 29–45 |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.VineStateRenderer#getMaximumTextureCount()->int` | 46–49 |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.VineStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 51–54 |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.VineStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–27 |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.VineStateRenderer#isOnlyBlockStateSensitive()->boolean` | 55–58 |
| type:org.dynmap.hdmap.renderer.VineStateRenderer | class | `org.dynmap.hdmap.renderer.VineStateRenderer` | 16–59 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.VineStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–27 | FLOW-669f8e741618055b |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory) | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` | 29–45 | FLOW-31eeb0603d25a7ef, FLOW-48582e0c3b0fd712, FLOW-0d39565936049e5b, FLOW-4625940d2819bcb5, FLOW-4475b36328c57e52, FLOW-3c630da4af21a754 |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.VineStateRenderer#getMaximumTextureCount()->int` | 46–49 | none |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.VineStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 51–54 | none |
| method:type:org.dynmap.hdmap.renderer.VineStateRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.VineStateRenderer#isOnlyBlockStateSensitive()->boolean` | 55–58 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-669f8e741618055b | `org.dynmap.hdmap.renderer.VineStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 23–24 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-669f8e741618055b-true (condition evaluates true; fixture FIX-CASE-FLOW-669f8e741618055b-true; reference REF-CASE-FLOW-669f8e741618055b-true; test TEST-CASE-FLOW-669f8e741618055b-true; evidence plan EVID-CASE-FLOW-669f8e741618055b-true)<br>CASE-FLOW-669f8e741618055b-false (condition false; no else arm; fixture FIX-CASE-FLOW-669f8e741618055b-false; reference REF-CASE-FLOW-669f8e741618055b-false; test TEST-CASE-FLOW-669f8e741618055b-false; evidence plan EVID-CASE-FLOW-669f8e741618055b-false) |
| FLOW-31eeb0603d25a7ef | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` 36–44 | for_loop | `i < 32` | CASE-FLOW-31eeb0603d25a7ef-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-31eeb0603d25a7ef-iterate; reference REF-CASE-FLOW-31eeb0603d25a7ef-iterate; test TEST-CASE-FLOW-31eeb0603d25a7ef-iterate; evidence plan EVID-CASE-FLOW-31eeb0603d25a7ef-iterate)<br>CASE-FLOW-31eeb0603d25a7ef-exit (condition is false; fixture FIX-CASE-FLOW-31eeb0603d25a7ef-exit; reference REF-CASE-FLOW-31eeb0603d25a7ef-exit; test TEST-CASE-FLOW-31eeb0603d25a7ef-exit; evidence plan EVID-CASE-FLOW-31eeb0603d25a7ef-exit) |
| FLOW-48582e0c3b0fd712 | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` 38–38 | if | `((i & 16) == 0)` | CASE-FLOW-48582e0c3b0fd712-true (condition evaluates true; fixture FIX-CASE-FLOW-48582e0c3b0fd712-true; reference REF-CASE-FLOW-48582e0c3b0fd712-true; test TEST-CASE-FLOW-48582e0c3b0fd712-true; evidence plan EVID-CASE-FLOW-48582e0c3b0fd712-true)<br>CASE-FLOW-48582e0c3b0fd712-false (condition false; no else arm; fixture FIX-CASE-FLOW-48582e0c3b0fd712-false; reference REF-CASE-FLOW-48582e0c3b0fd712-false; test TEST-CASE-FLOW-48582e0c3b0fd712-false; evidence plan EVID-CASE-FLOW-48582e0c3b0fd712-false) |
| FLOW-0d39565936049e5b | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` 39–39 | if | `((i & 8) == 0)` | CASE-FLOW-0d39565936049e5b-true (condition evaluates true; fixture FIX-CASE-FLOW-0d39565936049e5b-true; reference REF-CASE-FLOW-0d39565936049e5b-true; test TEST-CASE-FLOW-0d39565936049e5b-true; evidence plan EVID-CASE-FLOW-0d39565936049e5b-true)<br>CASE-FLOW-0d39565936049e5b-false (condition false; no else arm; fixture FIX-CASE-FLOW-0d39565936049e5b-false; reference REF-CASE-FLOW-0d39565936049e5b-false; test TEST-CASE-FLOW-0d39565936049e5b-false; evidence plan EVID-CASE-FLOW-0d39565936049e5b-false) |
| FLOW-4625940d2819bcb5 | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` 40–40 | if | `((i & 4) == 0)` | CASE-FLOW-4625940d2819bcb5-true (condition evaluates true; fixture FIX-CASE-FLOW-4625940d2819bcb5-true; reference REF-CASE-FLOW-4625940d2819bcb5-true; test TEST-CASE-FLOW-4625940d2819bcb5-true; evidence plan EVID-CASE-FLOW-4625940d2819bcb5-true)<br>CASE-FLOW-4625940d2819bcb5-false (condition false; no else arm; fixture FIX-CASE-FLOW-4625940d2819bcb5-false; reference REF-CASE-FLOW-4625940d2819bcb5-false; test TEST-CASE-FLOW-4625940d2819bcb5-false; evidence plan EVID-CASE-FLOW-4625940d2819bcb5-false) |
| FLOW-4475b36328c57e52 | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` 41–41 | if | `((i & 2) == 0)` | CASE-FLOW-4475b36328c57e52-true (condition evaluates true; fixture FIX-CASE-FLOW-4475b36328c57e52-true; reference REF-CASE-FLOW-4475b36328c57e52-true; test TEST-CASE-FLOW-4475b36328c57e52-true; evidence plan EVID-CASE-FLOW-4475b36328c57e52-true)<br>CASE-FLOW-4475b36328c57e52-false (condition false; no else arm; fixture FIX-CASE-FLOW-4475b36328c57e52-false; reference REF-CASE-FLOW-4475b36328c57e52-false; test TEST-CASE-FLOW-4475b36328c57e52-false; evidence plan EVID-CASE-FLOW-4475b36328c57e52-false) |
| FLOW-3c630da4af21a754 | `org.dynmap.hdmap.renderer.VineStateRenderer#buildPatches(RenderPatchFactory)->void` 42–42 | if | `((i & 1) == 0)` | CASE-FLOW-3c630da4af21a754-true (condition evaluates true; fixture FIX-CASE-FLOW-3c630da4af21a754-true; reference REF-CASE-FLOW-3c630da4af21a754-true; test TEST-CASE-FLOW-3c630da4af21a754-true; evidence plan EVID-CASE-FLOW-3c630da4af21a754-true)<br>CASE-FLOW-3c630da4af21a754-false (condition false; no else arm; fixture FIX-CASE-FLOW-3c630da4af21a754-false; reference REF-CASE-FLOW-3c630da4af21a754-false; test TEST-CASE-FLOW-3c630da4af21a754-false; evidence plan EVID-CASE-FLOW-3c630da4af21a754-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins VineStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer VineStateRenderer --fixture-set vine-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer VineStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin VineStateRenderer
```
