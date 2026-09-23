# B-glow-lichen-state-renderer: Dynmap built-in renderer GlowLichenStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-glow-lichen-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/glow-lichen-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin GlowLichenStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/GlowLichenStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/glow-lichen-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-a8aa8b7a42b8a8d7 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1887 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-a8aa8b7a42b8a8d7 | DynmapCore/src/main/resources/models_1.txt:1887 | 1.17- | glow_lichen |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-a8aa8b7a42b8a8d7 | FIX-CASE-REG-a8aa8b7a42b8a8d7 | REF-CASE-REG-a8aa8b7a42b8a8d7 | TEST-CASE-REG-a8aa8b7a42b8a8d7 | EVID-CASE-REG-a8aa8b7a42b8a8d7 | DynmapCore/src/main/resources/models_1.txt:1887; guard=1.17-; block=glow_lichen; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 7 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#meshes | field | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#meshes:RenderPatch[][]` | 19–19 |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` | 29–47 |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getMaximumTextureCount()->int` | 48–51 |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 53–57 |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–27 |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#isOnlyBlockStateSensitive()->boolean` | 58–61 |
| type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer | class | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer` | 16–62 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–27 | FLOW-f8dea1882652bf74 |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory) | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` | 29–47 | FLOW-1523716f7e0ca556, FLOW-fc8ec49f2dc0255e, FLOW-9f8c42388502c12c, FLOW-5c60f8f311f909e6, FLOW-acfb007ba39f90f1, FLOW-02e4acb81473a243, FLOW-b449939f4616f85d |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getMaximumTextureCount()->int` | 48–51 | none |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 53–57 | none |
| method:type:org.dynmap.hdmap.renderer.GlowLichenStateRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#isOnlyBlockStateSensitive()->boolean` | 58–61 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-f8dea1882652bf74 | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 23–24 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-f8dea1882652bf74-true (condition evaluates true; fixture FIX-CASE-FLOW-f8dea1882652bf74-true; reference REF-CASE-FLOW-f8dea1882652bf74-true; test TEST-CASE-FLOW-f8dea1882652bf74-true; evidence plan EVID-CASE-FLOW-f8dea1882652bf74-true)<br>CASE-FLOW-f8dea1882652bf74-false (condition false; no else arm; fixture FIX-CASE-FLOW-f8dea1882652bf74-false; reference REF-CASE-FLOW-f8dea1882652bf74-false; test TEST-CASE-FLOW-f8dea1882652bf74-false; evidence plan EVID-CASE-FLOW-f8dea1882652bf74-false) |
| FLOW-1523716f7e0ca556 | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` 37–46 | for_loop | `i < 64` | CASE-FLOW-1523716f7e0ca556-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-1523716f7e0ca556-iterate; reference REF-CASE-FLOW-1523716f7e0ca556-iterate; test TEST-CASE-FLOW-1523716f7e0ca556-iterate; evidence plan EVID-CASE-FLOW-1523716f7e0ca556-iterate)<br>CASE-FLOW-1523716f7e0ca556-exit (condition is false; fixture FIX-CASE-FLOW-1523716f7e0ca556-exit; reference REF-CASE-FLOW-1523716f7e0ca556-exit; test TEST-CASE-FLOW-1523716f7e0ca556-exit; evidence plan EVID-CASE-FLOW-1523716f7e0ca556-exit) |
| FLOW-fc8ec49f2dc0255e | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` 39–39 | if | `((i & 32) == 0)` | CASE-FLOW-fc8ec49f2dc0255e-true (condition evaluates true; fixture FIX-CASE-FLOW-fc8ec49f2dc0255e-true; reference REF-CASE-FLOW-fc8ec49f2dc0255e-true; test TEST-CASE-FLOW-fc8ec49f2dc0255e-true; evidence plan EVID-CASE-FLOW-fc8ec49f2dc0255e-true)<br>CASE-FLOW-fc8ec49f2dc0255e-false (condition false; no else arm; fixture FIX-CASE-FLOW-fc8ec49f2dc0255e-false; reference REF-CASE-FLOW-fc8ec49f2dc0255e-false; test TEST-CASE-FLOW-fc8ec49f2dc0255e-false; evidence plan EVID-CASE-FLOW-fc8ec49f2dc0255e-false) |
| FLOW-9f8c42388502c12c | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` 40–40 | if | `((i & 16) == 0)` | CASE-FLOW-9f8c42388502c12c-true (condition evaluates true; fixture FIX-CASE-FLOW-9f8c42388502c12c-true; reference REF-CASE-FLOW-9f8c42388502c12c-true; test TEST-CASE-FLOW-9f8c42388502c12c-true; evidence plan EVID-CASE-FLOW-9f8c42388502c12c-true)<br>CASE-FLOW-9f8c42388502c12c-false (condition false; no else arm; fixture FIX-CASE-FLOW-9f8c42388502c12c-false; reference REF-CASE-FLOW-9f8c42388502c12c-false; test TEST-CASE-FLOW-9f8c42388502c12c-false; evidence plan EVID-CASE-FLOW-9f8c42388502c12c-false) |
| FLOW-5c60f8f311f909e6 | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` 41–41 | if | `((i & 8) == 0)` | CASE-FLOW-5c60f8f311f909e6-true (condition evaluates true; fixture FIX-CASE-FLOW-5c60f8f311f909e6-true; reference REF-CASE-FLOW-5c60f8f311f909e6-true; test TEST-CASE-FLOW-5c60f8f311f909e6-true; evidence plan EVID-CASE-FLOW-5c60f8f311f909e6-true)<br>CASE-FLOW-5c60f8f311f909e6-false (condition false; no else arm; fixture FIX-CASE-FLOW-5c60f8f311f909e6-false; reference REF-CASE-FLOW-5c60f8f311f909e6-false; test TEST-CASE-FLOW-5c60f8f311f909e6-false; evidence plan EVID-CASE-FLOW-5c60f8f311f909e6-false) |
| FLOW-acfb007ba39f90f1 | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` 42–42 | if | `((i & 4) == 0)` | CASE-FLOW-acfb007ba39f90f1-true (condition evaluates true; fixture FIX-CASE-FLOW-acfb007ba39f90f1-true; reference REF-CASE-FLOW-acfb007ba39f90f1-true; test TEST-CASE-FLOW-acfb007ba39f90f1-true; evidence plan EVID-CASE-FLOW-acfb007ba39f90f1-true)<br>CASE-FLOW-acfb007ba39f90f1-false (condition false; no else arm; fixture FIX-CASE-FLOW-acfb007ba39f90f1-false; reference REF-CASE-FLOW-acfb007ba39f90f1-false; test TEST-CASE-FLOW-acfb007ba39f90f1-false; evidence plan EVID-CASE-FLOW-acfb007ba39f90f1-false) |
| FLOW-02e4acb81473a243 | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` 43–43 | if | `((i & 2) == 0)` | CASE-FLOW-02e4acb81473a243-true (condition evaluates true; fixture FIX-CASE-FLOW-02e4acb81473a243-true; reference REF-CASE-FLOW-02e4acb81473a243-true; test TEST-CASE-FLOW-02e4acb81473a243-true; evidence plan EVID-CASE-FLOW-02e4acb81473a243-true)<br>CASE-FLOW-02e4acb81473a243-false (condition false; no else arm; fixture FIX-CASE-FLOW-02e4acb81473a243-false; reference REF-CASE-FLOW-02e4acb81473a243-false; test TEST-CASE-FLOW-02e4acb81473a243-false; evidence plan EVID-CASE-FLOW-02e4acb81473a243-false) |
| FLOW-b449939f4616f85d | `org.dynmap.hdmap.renderer.GlowLichenStateRenderer#buildPatches(RenderPatchFactory)->void` 44–44 | if | `((i & 1) == 0)` | CASE-FLOW-b449939f4616f85d-true (condition evaluates true; fixture FIX-CASE-FLOW-b449939f4616f85d-true; reference REF-CASE-FLOW-b449939f4616f85d-true; test TEST-CASE-FLOW-b449939f4616f85d-true; evidence plan EVID-CASE-FLOW-b449939f4616f85d-true)<br>CASE-FLOW-b449939f4616f85d-false (condition false; no else arm; fixture FIX-CASE-FLOW-b449939f4616f85d-false; reference REF-CASE-FLOW-b449939f4616f85d-false; test TEST-CASE-FLOW-b449939f4616f85d-false; evidence plan EVID-CASE-FLOW-b449939f4616f85d-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins GlowLichenStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer GlowLichenStateRenderer --fixture-set glow-lichen-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer GlowLichenStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin GlowLichenStateRenderer
```
