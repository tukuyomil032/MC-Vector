# B-plant-renderer: Dynmap built-in renderer PlantRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-plant-renderer",
  "kind": "builtin",
  "document": "phases/builtins/plant-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin PlantRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/PlantRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/plant-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-e647ed254b5f2309 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1136 |
| REG-ce1324992d0e37d1 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1137 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-e647ed254b5f2309 | DynmapCore/src/main/resources/models_0.txt:1136 | 1.7.0- | double_plant | 0, 1, 2, 3, 4, 5 |  | metacnt |
| REG-ce1324992d0e37d1 | DynmapCore/src/main/resources/models_0.txt:1137 | 1.7.0- | double_plant | 8, 9, 10, 11, 12, 13, 14, 15 |  | metacnt, metasrc |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-e647ed254b5f2309 | FIX-CASE-REG-e647ed254b5f2309 | REF-CASE-REG-e647ed254b5f2309 | TEST-CASE-REG-e647ed254b5f2309 | EVID-CASE-REG-e647ed254b5f2309 | DynmapCore/src/main/resources/models_0.txt:1136; guard=1.7.0-; block=double_plant; data=0, 1, 2, 3, 4, 5; state=; parameter keys=metacnt |
| CASE-REG-ce1324992d0e37d1 | FIX-CASE-REG-ce1324992d0e37d1 | REF-CASE-REG-ce1324992d0e37d1 | TEST-CASE-REG-ce1324992d0e37d1 | EVID-CASE-REG-ce1324992d0e37d1 | DynmapCore/src/main/resources/models_0.txt:1137; guard=1.7.0-; block=double_plant; data=8, 9, 10, 11, 12, 13, 14, 15; state=; parameter keys=metacnt, metasrc |

### Exact implementation symbols

This file contributes 8 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.PlantRenderer#meshes | field | `org.dynmap.hdmap.renderer.PlantRenderer#meshes:RenderPatch[][]` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.PlantRenderer#metaCnt | field | `org.dynmap.hdmap.renderer.PlantRenderer#metaCnt:int` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.PlantRenderer#metaFromBelow | field | `org.dynmap.hdmap.renderer.PlantRenderer#metaFromBelow:boolean` | 19–19 |
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#buildPatches(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.PlantRenderer#buildPatches(RenderPatchFactory)->void` | 41–48 |
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.PlantRenderer#getMaximumTextureCount()->int` | 49–52 |
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.PlantRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 54–67 |
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 22–39 |
| type:org.dynmap.hdmap.renderer.PlantRenderer | class | `org.dynmap.hdmap.renderer.PlantRenderer` | 15–68 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 22–39 | FLOW-addc737a58d75bb2, FLOW-ce4676a9d81f4293, FLOW-e3a118206b0d13eb, FLOW-d2b84a733c35d1fc |
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#buildPatches(RenderPatchFactory) | `org.dynmap.hdmap.renderer.PlantRenderer#buildPatches(RenderPatchFactory)->void` | 41–48 | FLOW-ee926e5414948b40 |
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.PlantRenderer#getMaximumTextureCount()->int` | 49–52 | none |
| method:type:org.dynmap.hdmap.renderer.PlantRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.PlantRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 54–67 | FLOW-b8e1425a4da3b74b, FLOW-9156bc1de51927cd |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-addc737a58d75bb2 | `org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 24–25 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-addc737a58d75bb2-true (condition evaluates true; fixture FIX-CASE-FLOW-addc737a58d75bb2-true; reference REF-CASE-FLOW-addc737a58d75bb2-true; test TEST-CASE-FLOW-addc737a58d75bb2-true; evidence plan EVID-CASE-FLOW-addc737a58d75bb2-true)<br>CASE-FLOW-addc737a58d75bb2-false (condition false; no else arm; fixture FIX-CASE-FLOW-addc737a58d75bb2-false; reference REF-CASE-FLOW-addc737a58d75bb2-false; test TEST-CASE-FLOW-addc737a58d75bb2-false; evidence plan EVID-CASE-FLOW-addc737a58d75bb2-false) |
| FLOW-ce4676a9d81f4293 | `org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 27–29 | if | `((idxsrc != null) && (idxsrc.equals("below")))` | CASE-FLOW-ce4676a9d81f4293-true (condition evaluates true; fixture FIX-CASE-FLOW-ce4676a9d81f4293-true; reference REF-CASE-FLOW-ce4676a9d81f4293-true; test TEST-CASE-FLOW-ce4676a9d81f4293-true; evidence plan EVID-CASE-FLOW-ce4676a9d81f4293-true)<br>CASE-FLOW-ce4676a9d81f4293-false (condition false; no else arm; fixture FIX-CASE-FLOW-ce4676a9d81f4293-false; reference REF-CASE-FLOW-ce4676a9d81f4293-false; test TEST-CASE-FLOW-ce4676a9d81f4293-false; evidence plan EVID-CASE-FLOW-ce4676a9d81f4293-false) |
| FLOW-e3a118206b0d13eb | `org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 31–34 | if | `(maxmeta != null)` | CASE-FLOW-e3a118206b0d13eb-true (condition evaluates true; fixture FIX-CASE-FLOW-e3a118206b0d13eb-true; reference REF-CASE-FLOW-e3a118206b0d13eb-true; test TEST-CASE-FLOW-e3a118206b0d13eb-true; evidence plan EVID-CASE-FLOW-e3a118206b0d13eb-true)<br>CASE-FLOW-e3a118206b0d13eb-false (condition false; no else arm; fixture FIX-CASE-FLOW-e3a118206b0d13eb-false; reference REF-CASE-FLOW-e3a118206b0d13eb-false; test TEST-CASE-FLOW-e3a118206b0d13eb-false; evidence plan EVID-CASE-FLOW-e3a118206b0d13eb-false) |
| FLOW-d2b84a733c35d1fc | `org.dynmap.hdmap.renderer.PlantRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 33–33 | if | `(metaCnt > 16)` | CASE-FLOW-d2b84a733c35d1fc-true (condition evaluates true; fixture FIX-CASE-FLOW-d2b84a733c35d1fc-true; reference REF-CASE-FLOW-d2b84a733c35d1fc-true; test TEST-CASE-FLOW-d2b84a733c35d1fc-true; evidence plan EVID-CASE-FLOW-d2b84a733c35d1fc-true)<br>CASE-FLOW-d2b84a733c35d1fc-false (condition false; no else arm; fixture FIX-CASE-FLOW-d2b84a733c35d1fc-false; reference REF-CASE-FLOW-d2b84a733c35d1fc-false; test TEST-CASE-FLOW-d2b84a733c35d1fc-false; evidence plan EVID-CASE-FLOW-d2b84a733c35d1fc-false) |
| FLOW-ee926e5414948b40 | `org.dynmap.hdmap.renderer.PlantRenderer#buildPatches(RenderPatchFactory)->void` 43–47 | for_loop | `txtid < metaCnt` | CASE-FLOW-ee926e5414948b40-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-ee926e5414948b40-iterate; reference REF-CASE-FLOW-ee926e5414948b40-iterate; test TEST-CASE-FLOW-ee926e5414948b40-iterate; evidence plan EVID-CASE-FLOW-ee926e5414948b40-iterate)<br>CASE-FLOW-ee926e5414948b40-exit (condition is false; fixture FIX-CASE-FLOW-ee926e5414948b40-exit; reference REF-CASE-FLOW-ee926e5414948b40-exit; test TEST-CASE-FLOW-ee926e5414948b40-exit; evidence plan EVID-CASE-FLOW-ee926e5414948b40-exit) |
| FLOW-b8e1425a4da3b74b | `org.dynmap.hdmap.renderer.PlantRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 57–62 | if | `(metaFromBelow)` | CASE-FLOW-b8e1425a4da3b74b-true (condition evaluates true; fixture FIX-CASE-FLOW-b8e1425a4da3b74b-true; reference REF-CASE-FLOW-b8e1425a4da3b74b-true; test TEST-CASE-FLOW-b8e1425a4da3b74b-true; evidence plan EVID-CASE-FLOW-b8e1425a4da3b74b-true)<br>CASE-FLOW-b8e1425a4da3b74b-false (condition evaluates false; fixture FIX-CASE-FLOW-b8e1425a4da3b74b-false; reference REF-CASE-FLOW-b8e1425a4da3b74b-false; test TEST-CASE-FLOW-b8e1425a4da3b74b-false; evidence plan EVID-CASE-FLOW-b8e1425a4da3b74b-false) |
| FLOW-9156bc1de51927cd | `org.dynmap.hdmap.renderer.PlantRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 63–65 | if | `(idx >= metaCnt)` | CASE-FLOW-9156bc1de51927cd-true (condition evaluates true; fixture FIX-CASE-FLOW-9156bc1de51927cd-true; reference REF-CASE-FLOW-9156bc1de51927cd-true; test TEST-CASE-FLOW-9156bc1de51927cd-true; evidence plan EVID-CASE-FLOW-9156bc1de51927cd-true)<br>CASE-FLOW-9156bc1de51927cd-false (condition false; no else arm; fixture FIX-CASE-FLOW-9156bc1de51927cd-false; reference REF-CASE-FLOW-9156bc1de51927cd-false; test TEST-CASE-FLOW-9156bc1de51927cd-false; evidence plan EVID-CASE-FLOW-9156bc1de51927cd-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins PlantRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer PlantRenderer --fixture-set plant-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer PlantRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin PlantRenderer
```
