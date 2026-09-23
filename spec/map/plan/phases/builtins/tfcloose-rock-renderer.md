# B-tfcloose-rock-renderer: Dynmap built-in renderer TFCLooseRockRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-tfcloose-rock-renderer",
  "kind": "builtin",
  "document": "phases/builtins/tfcloose-rock-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin TFCLooseRockRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/TFCLooseRockRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/tfcloose-rock-renderer.rs。共通処理はdomain/model/traversalへ置く。
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

This file contributes 5 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer#patches | field | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#patches:int[]` | 25–25 |
| method:type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getMaximumTextureCount()->int` | 20–23 |
| method:type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 26–42 |
| method:type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 15–18 |
| type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer | class | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer` | 13–43 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 15–18 | none |
| method:type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getMaximumTextureCount()->int` | 20–23 | none |
| method:type:org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 26–42 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| none | No conditional/control-flow site exists in this source class; the default-output case below remains mandatory. | — | — | — |

### Unconditional output case

| Case ID | Fixture | Reference | Focused test | Evidence plan | Source-defined result |
|---|---|---|---|---|
| CASE-TFCLooseRockRenderer-default-output | FIX-CASE-TFCLooseRockRenderer-default-output | REF-CASE-TFCLooseRockRenderer-default-output | TEST-CASE-TFCLooseRockRenderer-default-output | EVID-CASE-TFCLooseRockRenderer-default-output | `org.dynmap.hdmap.renderer.TFCLooseRockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]`; default source-defined renderer result |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins TFCLooseRockRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer TFCLooseRockRenderer --fixture-set tfcloose-rock-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer TFCLooseRockRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin TFCLooseRockRenderer
```
