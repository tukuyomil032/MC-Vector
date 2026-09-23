# B-tfcwood-renderer: Dynmap built-in renderer TFCWoodRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-tfcwood-renderer",
  "kind": "builtin",
  "document": "phases/builtins/tfcwood-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin TFCWoodRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/TFCWoodRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/tfcwood-renderer.rs。共通処理はdomain/model/traversalへ置く。
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

This file contributes 17 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_X | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_X:int` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_XN | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_XN:int` | 18–18 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_XP | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_XP:int` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_YN | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_YN:int` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_Z | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_Z:int` | 22–22 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_ZN | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_ZN:int` | 21–21 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_ZP | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#SIDE_ZP:int` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#blkbs | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#blkbs:DynmapBlockState` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#meshes | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#meshes:RenderPatch[][]` | 26–26 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#patchlist | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#patchlist:int[]` | 44–44 |
| field:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#sides | field | `org.dynmap.hdmap.renderer.TFCWoodRenderer#sides:int[][]` | 87–92 |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.TFCWoodRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 46–48 |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory)->void` | 50–85 |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.TFCWoodRenderer#getMaximumTextureCount()->int` | 39–42 |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.TFCWoodRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 94–109 |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.TFCWoodRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 28–37 |
| type:org.dynmap.hdmap.renderer.TFCWoodRenderer | class | `org.dynmap.hdmap.renderer.TFCWoodRenderer` | 14–110 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.TFCWoodRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 28–37 | FLOW-12c05762bba1230b |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.TFCWoodRenderer#getMaximumTextureCount()->int` | 39–42 | none |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.TFCWoodRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 46–48 | none |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory) | `org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory)->void` | 50–85 | FLOW-68fff07749d711d9, FLOW-069426393ce27e42, FLOW-6bf4b44ffb9c3eca, FLOW-cda90d78c70d3103 |
| method:type:org.dynmap.hdmap.renderer.TFCWoodRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.TFCWoodRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 94–109 | FLOW-a1595f7a5d15ce41, FLOW-497462c2ae60328e, FLOW-34bb31e9737219b9 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-12c05762bba1230b | `org.dynmap.hdmap.renderer.TFCWoodRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 30–31 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-12c05762bba1230b-true (condition evaluates true; fixture FIX-CASE-FLOW-12c05762bba1230b-true; reference REF-CASE-FLOW-12c05762bba1230b-true; test TEST-CASE-FLOW-12c05762bba1230b-true; evidence plan EVID-CASE-FLOW-12c05762bba1230b-true)<br>CASE-FLOW-12c05762bba1230b-false (condition false; no else arm; fixture FIX-CASE-FLOW-12c05762bba1230b-false; reference REF-CASE-FLOW-12c05762bba1230b-false; test TEST-CASE-FLOW-12c05762bba1230b-false; evidence plan EVID-CASE-FLOW-12c05762bba1230b-false) |
| FLOW-68fff07749d711d9 | `org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory)->void` 52–84 | for_loop | `dat < 32` | CASE-FLOW-68fff07749d711d9-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-68fff07749d711d9-iterate; reference REF-CASE-FLOW-68fff07749d711d9-iterate; test TEST-CASE-FLOW-68fff07749d711d9-iterate; evidence plan EVID-CASE-FLOW-68fff07749d711d9-iterate)<br>CASE-FLOW-68fff07749d711d9-exit (condition is false; fixture FIX-CASE-FLOW-68fff07749d711d9-exit; reference REF-CASE-FLOW-68fff07749d711d9-exit; test TEST-CASE-FLOW-68fff07749d711d9-exit; evidence plan EVID-CASE-FLOW-68fff07749d711d9-exit) |
| FLOW-069426393ce27e42 | `org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory)->void` 54–59 | if | `((dat & SIDE_YN) == 0)` | CASE-FLOW-069426393ce27e42-true (condition evaluates true; fixture FIX-CASE-FLOW-069426393ce27e42-true; reference REF-CASE-FLOW-069426393ce27e42-true; test TEST-CASE-FLOW-069426393ce27e42-true; evidence plan EVID-CASE-FLOW-069426393ce27e42-true)<br>CASE-FLOW-069426393ce27e42-false (condition evaluates false; fixture FIX-CASE-FLOW-069426393ce27e42-false; reference REF-CASE-FLOW-069426393ce27e42-false; test TEST-CASE-FLOW-069426393ce27e42-false; evidence plan EVID-CASE-FLOW-069426393ce27e42-false) |
| FLOW-6bf4b44ffb9c3eca | `org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory)->void` 60–70 | switch_statement | `(dat2 & SIDE_X)` | CASE-FLOW-6bf4b44ffb9c3eca-case-0 (selector matches source case label(s): SIDE_XP; labels=SIDE_XP; fixture FIX-CASE-FLOW-6bf4b44ffb9c3eca-case-0; reference REF-CASE-FLOW-6bf4b44ffb9c3eca-case-0; test TEST-CASE-FLOW-6bf4b44ffb9c3eca-case-0; evidence plan EVID-CASE-FLOW-6bf4b44ffb9c3eca-case-0)<br>CASE-FLOW-6bf4b44ffb9c3eca-case-1 (selector matches source case label(s): SIDE_XN; labels=SIDE_XN; fixture FIX-CASE-FLOW-6bf4b44ffb9c3eca-case-1; reference REF-CASE-FLOW-6bf4b44ffb9c3eca-case-1; test TEST-CASE-FLOW-6bf4b44ffb9c3eca-case-1; evidence plan EVID-CASE-FLOW-6bf4b44ffb9c3eca-case-1)<br>CASE-FLOW-6bf4b44ffb9c3eca-case-2 (selector matches source case label(s): SIDE_X; labels=SIDE_X; fixture FIX-CASE-FLOW-6bf4b44ffb9c3eca-case-2; reference REF-CASE-FLOW-6bf4b44ffb9c3eca-case-2; test TEST-CASE-FLOW-6bf4b44ffb9c3eca-case-2; evidence plan EVID-CASE-FLOW-6bf4b44ffb9c3eca-case-2)<br>CASE-FLOW-6bf4b44ffb9c3eca-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-6bf4b44ffb9c3eca-unmatched; reference REF-CASE-FLOW-6bf4b44ffb9c3eca-unmatched; test TEST-CASE-FLOW-6bf4b44ffb9c3eca-unmatched; evidence plan EVID-CASE-FLOW-6bf4b44ffb9c3eca-unmatched) |
| FLOW-cda90d78c70d3103 | `org.dynmap.hdmap.renderer.TFCWoodRenderer#buildMeshes(RenderPatchFactory)->void` 71–81 | switch_statement | `(dat2 & SIDE_Z)` | CASE-FLOW-cda90d78c70d3103-case-0 (selector matches source case label(s): SIDE_ZP; labels=SIDE_ZP; fixture FIX-CASE-FLOW-cda90d78c70d3103-case-0; reference REF-CASE-FLOW-cda90d78c70d3103-case-0; test TEST-CASE-FLOW-cda90d78c70d3103-case-0; evidence plan EVID-CASE-FLOW-cda90d78c70d3103-case-0)<br>CASE-FLOW-cda90d78c70d3103-case-1 (selector matches source case label(s): SIDE_ZN; labels=SIDE_ZN; fixture FIX-CASE-FLOW-cda90d78c70d3103-case-1; reference REF-CASE-FLOW-cda90d78c70d3103-case-1; test TEST-CASE-FLOW-cda90d78c70d3103-case-1; evidence plan EVID-CASE-FLOW-cda90d78c70d3103-case-1)<br>CASE-FLOW-cda90d78c70d3103-case-2 (selector matches source case label(s): SIDE_Z; labels=SIDE_Z; fixture FIX-CASE-FLOW-cda90d78c70d3103-case-2; reference REF-CASE-FLOW-cda90d78c70d3103-case-2; test TEST-CASE-FLOW-cda90d78c70d3103-case-2; evidence plan EVID-CASE-FLOW-cda90d78c70d3103-case-2)<br>CASE-FLOW-cda90d78c70d3103-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-cda90d78c70d3103-unmatched; reference REF-CASE-FLOW-cda90d78c70d3103-unmatched; test TEST-CASE-FLOW-cda90d78c70d3103-unmatched; evidence plan EVID-CASE-FLOW-cda90d78c70d3103-unmatched) |
| FLOW-a1595f7a5d15ce41 | `org.dynmap.hdmap.renderer.TFCWoodRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 98–103 | enhanced_for_loop | `int[] side : sides` | CASE-FLOW-a1595f7a5d15ce41-each_element (execute body once per iterable element; fixture FIX-CASE-FLOW-a1595f7a5d15ce41-each_element; reference REF-CASE-FLOW-a1595f7a5d15ce41-each_element; test TEST-CASE-FLOW-a1595f7a5d15ce41-each_element; evidence plan EVID-CASE-FLOW-a1595f7a5d15ce41-each_element)<br>CASE-FLOW-a1595f7a5d15ce41-empty_or_exhausted (no remaining element; fixture FIX-CASE-FLOW-a1595f7a5d15ce41-empty_or_exhausted; reference REF-CASE-FLOW-a1595f7a5d15ce41-empty_or_exhausted; test TEST-CASE-FLOW-a1595f7a5d15ce41-empty_or_exhausted; evidence plan EVID-CASE-FLOW-a1595f7a5d15ce41-empty_or_exhausted) |
| FLOW-497462c2ae60328e | `org.dynmap.hdmap.renderer.TFCWoodRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 100–102 | if | `(blkbs.matchingBaseState(blk))` | CASE-FLOW-497462c2ae60328e-true (condition evaluates true; fixture FIX-CASE-FLOW-497462c2ae60328e-true; reference REF-CASE-FLOW-497462c2ae60328e-true; test TEST-CASE-FLOW-497462c2ae60328e-true; evidence plan EVID-CASE-FLOW-497462c2ae60328e-true)<br>CASE-FLOW-497462c2ae60328e-false (condition false; no else arm; fixture FIX-CASE-FLOW-497462c2ae60328e-false; reference REF-CASE-FLOW-497462c2ae60328e-false; test TEST-CASE-FLOW-497462c2ae60328e-false; evidence plan EVID-CASE-FLOW-497462c2ae60328e-false) |
| FLOW-34bb31e9737219b9 | `org.dynmap.hdmap.renderer.TFCWoodRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 105–107 | if | `(id.isNotAir())` | CASE-FLOW-34bb31e9737219b9-true (condition evaluates true; fixture FIX-CASE-FLOW-34bb31e9737219b9-true; reference REF-CASE-FLOW-34bb31e9737219b9-true; test TEST-CASE-FLOW-34bb31e9737219b9-true; evidence plan EVID-CASE-FLOW-34bb31e9737219b9-true)<br>CASE-FLOW-34bb31e9737219b9-false (condition false; no else arm; fixture FIX-CASE-FLOW-34bb31e9737219b9-false; reference REF-CASE-FLOW-34bb31e9737219b9-false; test TEST-CASE-FLOW-34bb31e9737219b9-false; evidence plan EVID-CASE-FLOW-34bb31e9737219b9-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins TFCWoodRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer TFCWoodRenderer --fixture-set tfcwood-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer TFCWoodRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin TFCWoodRenderer
```
