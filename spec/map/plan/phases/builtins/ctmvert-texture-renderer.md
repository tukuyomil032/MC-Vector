# B-ctmvert-texture-renderer: Dynmap built-in renderer CTMVertTextureRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-ctmvert-texture-renderer",
  "kind": "builtin",
  "document": "phases/builtins/ctmvert-texture-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin CTMVertTextureRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/CTMVertTextureRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/ctmvert-texture-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-042ef0f986d23185 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:249 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-042ef0f986d23185 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:249 | — | %tile.railcraft.glass | * |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-042ef0f986d23185 | FIX-CASE-REG-042ef0f986d23185 | REF-CASE-REG-042ef0f986d23185 | TEST-CASE-REG-042ef0f986d23185 | EVID-CASE-REG-042ef0f986d23185 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:249; guard=—; block=%tile.railcraft.glass; data=*; state=; parameter keys= |

### Exact implementation symbols

This file contributes 15 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_BOTTOM | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_BOTTOM:int` | 14–14 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_ABOVE | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_ABOVE:int` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_BELOW | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_BELOW:int` | 18–18 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_BOTH | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_BOTH:int` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_NO_NEIGHBOR | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_SIDE_NO_NEIGHBOR:int` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_TOP | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#TEXTURE_TOP:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#blk | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#blk:DynmapBlockState` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_above_neighbor | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_above_neighbor:RenderPatch[]` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_below_neighbor | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_below_neighbor:RenderPatch[]` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_both_neighbor | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_both_neighbor:RenderPatch[]` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_no_neighbor | field | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#mesh_no_neighbor:RenderPatch[]` | 22–22 |
| method:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getMaximumTextureCount()->int` | 52–55 |
| method:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 58–96 |
| method:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 27–50 |
| type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer | class | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer` | 13–97 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 27–50 | FLOW-3416ba42288f12a7 |
| method:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getMaximumTextureCount()->int` | 52–55 | none |
| method:type:org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 58–96 | FLOW-3c3cb9979ed65130, FLOW-51665dda9a28ab4d, FLOW-046561b3a482cad0, FLOW-19c39eae5683f471, FLOW-9f93d7e73675da18, FLOW-f5d622974193c47f, FLOW-aad9b9ce31c19244 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-3416ba42288f12a7 | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 29–30 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-3416ba42288f12a7-true (condition evaluates true; fixture FIX-CASE-FLOW-3416ba42288f12a7-true; reference REF-CASE-FLOW-3416ba42288f12a7-true; test TEST-CASE-FLOW-3416ba42288f12a7-true; evidence plan EVID-CASE-FLOW-3416ba42288f12a7-true)<br>CASE-FLOW-3416ba42288f12a7-false (condition false; no else arm; fixture FIX-CASE-FLOW-3416ba42288f12a7-false; reference REF-CASE-FLOW-3416ba42288f12a7-false; test TEST-CASE-FLOW-3416ba42288f12a7-false; evidence plan EVID-CASE-FLOW-3416ba42288f12a7-false) |
| FLOW-3c3cb9979ed65130 | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 64–69 | if | `(id_above.baseState == blk)` | CASE-FLOW-3c3cb9979ed65130-true (condition evaluates true; fixture FIX-CASE-FLOW-3c3cb9979ed65130-true; reference REF-CASE-FLOW-3c3cb9979ed65130-true; test TEST-CASE-FLOW-3c3cb9979ed65130-true; evidence plan EVID-CASE-FLOW-3c3cb9979ed65130-true)<br>CASE-FLOW-3c3cb9979ed65130-false (condition false; no else arm; fixture FIX-CASE-FLOW-3c3cb9979ed65130-false; reference REF-CASE-FLOW-3c3cb9979ed65130-false; test TEST-CASE-FLOW-3c3cb9979ed65130-false; evidence plan EVID-CASE-FLOW-3c3cb9979ed65130-false) |
| FLOW-51665dda9a28ab4d | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 66–68 | if | `(meta == id_meta)` | CASE-FLOW-51665dda9a28ab4d-true (condition evaluates true; fixture FIX-CASE-FLOW-51665dda9a28ab4d-true; reference REF-CASE-FLOW-51665dda9a28ab4d-true; test TEST-CASE-FLOW-51665dda9a28ab4d-true; evidence plan EVID-CASE-FLOW-51665dda9a28ab4d-true)<br>CASE-FLOW-51665dda9a28ab4d-false (condition false; no else arm; fixture FIX-CASE-FLOW-51665dda9a28ab4d-false; reference REF-CASE-FLOW-51665dda9a28ab4d-false; test TEST-CASE-FLOW-51665dda9a28ab4d-false; evidence plan EVID-CASE-FLOW-51665dda9a28ab4d-false) |
| FLOW-046561b3a482cad0 | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 72–77 | if | `(id_below.baseState == blk)` | CASE-FLOW-046561b3a482cad0-true (condition evaluates true; fixture FIX-CASE-FLOW-046561b3a482cad0-true; reference REF-CASE-FLOW-046561b3a482cad0-true; test TEST-CASE-FLOW-046561b3a482cad0-true; evidence plan EVID-CASE-FLOW-046561b3a482cad0-true)<br>CASE-FLOW-046561b3a482cad0-false (condition false; no else arm; fixture FIX-CASE-FLOW-046561b3a482cad0-false; reference REF-CASE-FLOW-046561b3a482cad0-false; test TEST-CASE-FLOW-046561b3a482cad0-false; evidence plan EVID-CASE-FLOW-046561b3a482cad0-false) |
| FLOW-19c39eae5683f471 | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 74–76 | if | `(meta == id_meta)` | CASE-FLOW-19c39eae5683f471-true (condition evaluates true; fixture FIX-CASE-FLOW-19c39eae5683f471-true; reference REF-CASE-FLOW-19c39eae5683f471-true; test TEST-CASE-FLOW-19c39eae5683f471-true; evidence plan EVID-CASE-FLOW-19c39eae5683f471-true)<br>CASE-FLOW-19c39eae5683f471-false (condition false; no else arm; fixture FIX-CASE-FLOW-19c39eae5683f471-false; reference REF-CASE-FLOW-19c39eae5683f471-false; test TEST-CASE-FLOW-19c39eae5683f471-false; evidence plan EVID-CASE-FLOW-19c39eae5683f471-false) |
| FLOW-9f93d7e73675da18 | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 79–94 | if | `(above)` | CASE-FLOW-9f93d7e73675da18-true (condition evaluates true; fixture FIX-CASE-FLOW-9f93d7e73675da18-true; reference REF-CASE-FLOW-9f93d7e73675da18-true; test TEST-CASE-FLOW-9f93d7e73675da18-true; evidence plan EVID-CASE-FLOW-9f93d7e73675da18-true)<br>CASE-FLOW-9f93d7e73675da18-false (condition evaluates false; fixture FIX-CASE-FLOW-9f93d7e73675da18-false; reference REF-CASE-FLOW-9f93d7e73675da18-false; test TEST-CASE-FLOW-9f93d7e73675da18-false; evidence plan EVID-CASE-FLOW-9f93d7e73675da18-false) |
| FLOW-f5d622974193c47f | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 80–85 | if | `(below)` | CASE-FLOW-f5d622974193c47f-true (condition evaluates true; fixture FIX-CASE-FLOW-f5d622974193c47f-true; reference REF-CASE-FLOW-f5d622974193c47f-true; test TEST-CASE-FLOW-f5d622974193c47f-true; evidence plan EVID-CASE-FLOW-f5d622974193c47f-true)<br>CASE-FLOW-f5d622974193c47f-false (condition evaluates false; fixture FIX-CASE-FLOW-f5d622974193c47f-false; reference REF-CASE-FLOW-f5d622974193c47f-false; test TEST-CASE-FLOW-f5d622974193c47f-false; evidence plan EVID-CASE-FLOW-f5d622974193c47f-false) |
| FLOW-aad9b9ce31c19244 | `org.dynmap.hdmap.renderer.CTMVertTextureRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 88–93 | if | `(below)` | CASE-FLOW-aad9b9ce31c19244-true (condition evaluates true; fixture FIX-CASE-FLOW-aad9b9ce31c19244-true; reference REF-CASE-FLOW-aad9b9ce31c19244-true; test TEST-CASE-FLOW-aad9b9ce31c19244-true; evidence plan EVID-CASE-FLOW-aad9b9ce31c19244-true)<br>CASE-FLOW-aad9b9ce31c19244-false (condition evaluates false; fixture FIX-CASE-FLOW-aad9b9ce31c19244-false; reference REF-CASE-FLOW-aad9b9ce31c19244-false; test TEST-CASE-FLOW-aad9b9ce31c19244-false; evidence plan EVID-CASE-FLOW-aad9b9ce31c19244-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins CTMVertTextureRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer CTMVertTextureRenderer --fixture-set ctmvert-texture-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer CTMVertTextureRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin CTMVertTextureRenderer
```
