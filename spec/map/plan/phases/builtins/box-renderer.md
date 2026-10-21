# B-box-renderer: Dynmap built-in renderer BoxRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-box-renderer",
  "kind": "builtin",
  "document": "phases/builtins/box-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin BoxRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/BoxRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/box-renderer.rs。共通処理はdomain/model/traversalへ置く。
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

This file contributes 7 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.BoxRenderer#model | field | `org.dynmap.hdmap.renderer.BoxRenderer#model:RenderPatch[]` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.BoxRenderer#patchlist | field | `org.dynmap.hdmap.renderer.BoxRenderer#patchlist:int[]` | 19–19 |
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.BoxRenderer#getMaximumTextureCount()->int` | 67–70 |
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.BoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 72–75 |
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–65 |
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.BoxRenderer#isOnlyBlockStateSensitive()->boolean` | 76–79 |
| type:org.dynmap.hdmap.renderer.BoxRenderer | class | `org.dynmap.hdmap.renderer.BoxRenderer` | 15–80 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–65 | FLOW-6722a5c20c041a77, FLOW-7d8a755bc2158a22, FLOW-9c31a6572e2b2f84, FLOW-3191b40e56a7282c, FLOW-d96d893825b3af6e, FLOW-18d58b1f20f5dab8, FLOW-756fb3480dad4320, FLOW-1fc82e0fe64781d1, FLOW-3d58b2089051b24f, FLOW-b2b78dc310415192, FLOW-9d8e6c8ce063dd74, FLOW-9bb09f87bcf94e08, FLOW-4359824a32abbcbc |
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.BoxRenderer#getMaximumTextureCount()->int` | 67–70 | none |
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.BoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 72–75 | none |
| method:type:org.dynmap.hdmap.renderer.BoxRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.BoxRenderer#isOnlyBlockStateSensitive()->boolean` | 76–79 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-6722a5c20c041a77 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 23–24 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-6722a5c20c041a77-true (condition evaluates true; fixture FIX-CASE-FLOW-6722a5c20c041a77-true; reference REF-CASE-FLOW-6722a5c20c041a77-true; test TEST-CASE-FLOW-6722a5c20c041a77-true; evidence plan EVID-CASE-FLOW-6722a5c20c041a77-true)<br>CASE-FLOW-6722a5c20c041a77-false (condition false; no else arm; fixture FIX-CASE-FLOW-6722a5c20c041a77-false; reference REF-CASE-FLOW-6722a5c20c041a77-false; test TEST-CASE-FLOW-6722a5c20c041a77-false; evidence plan EVID-CASE-FLOW-6722a5c20c041a77-false) |
| FLOW-7d8a755bc2158a22 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 30–33 | if | `(lim != null)` | CASE-FLOW-7d8a755bc2158a22-true (condition evaluates true; fixture FIX-CASE-FLOW-7d8a755bc2158a22-true; reference REF-CASE-FLOW-7d8a755bc2158a22-true; test TEST-CASE-FLOW-7d8a755bc2158a22-true; evidence plan EVID-CASE-FLOW-7d8a755bc2158a22-true)<br>CASE-FLOW-7d8a755bc2158a22-false (condition false; no else arm; fixture FIX-CASE-FLOW-7d8a755bc2158a22-false; reference REF-CASE-FLOW-7d8a755bc2158a22-false; test TEST-CASE-FLOW-7d8a755bc2158a22-false; evidence plan EVID-CASE-FLOW-7d8a755bc2158a22-false) |
| FLOW-9c31a6572e2b2f84 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 32–32 | if | `(xmin < 0.0)` | CASE-FLOW-9c31a6572e2b2f84-true (condition evaluates true; fixture FIX-CASE-FLOW-9c31a6572e2b2f84-true; reference REF-CASE-FLOW-9c31a6572e2b2f84-true; test TEST-CASE-FLOW-9c31a6572e2b2f84-true; evidence plan EVID-CASE-FLOW-9c31a6572e2b2f84-true)<br>CASE-FLOW-9c31a6572e2b2f84-false (condition false; no else arm; fixture FIX-CASE-FLOW-9c31a6572e2b2f84-false; reference REF-CASE-FLOW-9c31a6572e2b2f84-false; test TEST-CASE-FLOW-9c31a6572e2b2f84-false; evidence plan EVID-CASE-FLOW-9c31a6572e2b2f84-false) |
| FLOW-3191b40e56a7282c | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 35–38 | if | `(lim != null)` | CASE-FLOW-3191b40e56a7282c-true (condition evaluates true; fixture FIX-CASE-FLOW-3191b40e56a7282c-true; reference REF-CASE-FLOW-3191b40e56a7282c-true; test TEST-CASE-FLOW-3191b40e56a7282c-true; evidence plan EVID-CASE-FLOW-3191b40e56a7282c-true)<br>CASE-FLOW-3191b40e56a7282c-false (condition false; no else arm; fixture FIX-CASE-FLOW-3191b40e56a7282c-false; reference REF-CASE-FLOW-3191b40e56a7282c-false; test TEST-CASE-FLOW-3191b40e56a7282c-false; evidence plan EVID-CASE-FLOW-3191b40e56a7282c-false) |
| FLOW-d96d893825b3af6e | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 37–37 | if | `(xmax > 1.0)` | CASE-FLOW-d96d893825b3af6e-true (condition evaluates true; fixture FIX-CASE-FLOW-d96d893825b3af6e-true; reference REF-CASE-FLOW-d96d893825b3af6e-true; test TEST-CASE-FLOW-d96d893825b3af6e-true; evidence plan EVID-CASE-FLOW-d96d893825b3af6e-true)<br>CASE-FLOW-d96d893825b3af6e-false (condition false; no else arm; fixture FIX-CASE-FLOW-d96d893825b3af6e-false; reference REF-CASE-FLOW-d96d893825b3af6e-false; test TEST-CASE-FLOW-d96d893825b3af6e-false; evidence plan EVID-CASE-FLOW-d96d893825b3af6e-false) |
| FLOW-18d58b1f20f5dab8 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 40–43 | if | `(lim != null)` | CASE-FLOW-18d58b1f20f5dab8-true (condition evaluates true; fixture FIX-CASE-FLOW-18d58b1f20f5dab8-true; reference REF-CASE-FLOW-18d58b1f20f5dab8-true; test TEST-CASE-FLOW-18d58b1f20f5dab8-true; evidence plan EVID-CASE-FLOW-18d58b1f20f5dab8-true)<br>CASE-FLOW-18d58b1f20f5dab8-false (condition false; no else arm; fixture FIX-CASE-FLOW-18d58b1f20f5dab8-false; reference REF-CASE-FLOW-18d58b1f20f5dab8-false; test TEST-CASE-FLOW-18d58b1f20f5dab8-false; evidence plan EVID-CASE-FLOW-18d58b1f20f5dab8-false) |
| FLOW-756fb3480dad4320 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 42–42 | if | `(ymin < 0.0)` | CASE-FLOW-756fb3480dad4320-true (condition evaluates true; fixture FIX-CASE-FLOW-756fb3480dad4320-true; reference REF-CASE-FLOW-756fb3480dad4320-true; test TEST-CASE-FLOW-756fb3480dad4320-true; evidence plan EVID-CASE-FLOW-756fb3480dad4320-true)<br>CASE-FLOW-756fb3480dad4320-false (condition false; no else arm; fixture FIX-CASE-FLOW-756fb3480dad4320-false; reference REF-CASE-FLOW-756fb3480dad4320-false; test TEST-CASE-FLOW-756fb3480dad4320-false; evidence plan EVID-CASE-FLOW-756fb3480dad4320-false) |
| FLOW-1fc82e0fe64781d1 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 45–48 | if | `(lim != null)` | CASE-FLOW-1fc82e0fe64781d1-true (condition evaluates true; fixture FIX-CASE-FLOW-1fc82e0fe64781d1-true; reference REF-CASE-FLOW-1fc82e0fe64781d1-true; test TEST-CASE-FLOW-1fc82e0fe64781d1-true; evidence plan EVID-CASE-FLOW-1fc82e0fe64781d1-true)<br>CASE-FLOW-1fc82e0fe64781d1-false (condition false; no else arm; fixture FIX-CASE-FLOW-1fc82e0fe64781d1-false; reference REF-CASE-FLOW-1fc82e0fe64781d1-false; test TEST-CASE-FLOW-1fc82e0fe64781d1-false; evidence plan EVID-CASE-FLOW-1fc82e0fe64781d1-false) |
| FLOW-3d58b2089051b24f | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 47–47 | if | `(ymax > 1.0)` | CASE-FLOW-3d58b2089051b24f-true (condition evaluates true; fixture FIX-CASE-FLOW-3d58b2089051b24f-true; reference REF-CASE-FLOW-3d58b2089051b24f-true; test TEST-CASE-FLOW-3d58b2089051b24f-true; evidence plan EVID-CASE-FLOW-3d58b2089051b24f-true)<br>CASE-FLOW-3d58b2089051b24f-false (condition false; no else arm; fixture FIX-CASE-FLOW-3d58b2089051b24f-false; reference REF-CASE-FLOW-3d58b2089051b24f-false; test TEST-CASE-FLOW-3d58b2089051b24f-false; evidence plan EVID-CASE-FLOW-3d58b2089051b24f-false) |
| FLOW-b2b78dc310415192 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 50–53 | if | `(lim != null)` | CASE-FLOW-b2b78dc310415192-true (condition evaluates true; fixture FIX-CASE-FLOW-b2b78dc310415192-true; reference REF-CASE-FLOW-b2b78dc310415192-true; test TEST-CASE-FLOW-b2b78dc310415192-true; evidence plan EVID-CASE-FLOW-b2b78dc310415192-true)<br>CASE-FLOW-b2b78dc310415192-false (condition false; no else arm; fixture FIX-CASE-FLOW-b2b78dc310415192-false; reference REF-CASE-FLOW-b2b78dc310415192-false; test TEST-CASE-FLOW-b2b78dc310415192-false; evidence plan EVID-CASE-FLOW-b2b78dc310415192-false) |
| FLOW-9d8e6c8ce063dd74 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 52–52 | if | `(zmin < 0.0)` | CASE-FLOW-9d8e6c8ce063dd74-true (condition evaluates true; fixture FIX-CASE-FLOW-9d8e6c8ce063dd74-true; reference REF-CASE-FLOW-9d8e6c8ce063dd74-true; test TEST-CASE-FLOW-9d8e6c8ce063dd74-true; evidence plan EVID-CASE-FLOW-9d8e6c8ce063dd74-true)<br>CASE-FLOW-9d8e6c8ce063dd74-false (condition false; no else arm; fixture FIX-CASE-FLOW-9d8e6c8ce063dd74-false; reference REF-CASE-FLOW-9d8e6c8ce063dd74-false; test TEST-CASE-FLOW-9d8e6c8ce063dd74-false; evidence plan EVID-CASE-FLOW-9d8e6c8ce063dd74-false) |
| FLOW-9bb09f87bcf94e08 | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 55–58 | if | `(lim != null)` | CASE-FLOW-9bb09f87bcf94e08-true (condition evaluates true; fixture FIX-CASE-FLOW-9bb09f87bcf94e08-true; reference REF-CASE-FLOW-9bb09f87bcf94e08-true; test TEST-CASE-FLOW-9bb09f87bcf94e08-true; evidence plan EVID-CASE-FLOW-9bb09f87bcf94e08-true)<br>CASE-FLOW-9bb09f87bcf94e08-false (condition false; no else arm; fixture FIX-CASE-FLOW-9bb09f87bcf94e08-false; reference REF-CASE-FLOW-9bb09f87bcf94e08-false; test TEST-CASE-FLOW-9bb09f87bcf94e08-false; evidence plan EVID-CASE-FLOW-9bb09f87bcf94e08-false) |
| FLOW-4359824a32abbcbc | `org.dynmap.hdmap.renderer.BoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 57–57 | if | `(zmax > 1.0)` | CASE-FLOW-4359824a32abbcbc-true (condition evaluates true; fixture FIX-CASE-FLOW-4359824a32abbcbc-true; reference REF-CASE-FLOW-4359824a32abbcbc-true; test TEST-CASE-FLOW-4359824a32abbcbc-true; evidence plan EVID-CASE-FLOW-4359824a32abbcbc-true)<br>CASE-FLOW-4359824a32abbcbc-false (condition false; no else arm; fixture FIX-CASE-FLOW-4359824a32abbcbc-false; reference REF-CASE-FLOW-4359824a32abbcbc-false; test TEST-CASE-FLOW-4359824a32abbcbc-false; evidence plan EVID-CASE-FLOW-4359824a32abbcbc-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins BoxRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer BoxRenderer --fixture-set box-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer BoxRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin BoxRenderer
```
