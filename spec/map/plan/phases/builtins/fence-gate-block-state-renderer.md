# B-fence-gate-block-state-renderer: Dynmap built-in renderer FenceGateBlockStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-fence-gate-block-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/fence-gate-block-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin FenceGateBlockStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceGateBlockStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/fence-gate-block-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-7867728643596dc9 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:902 |
| REG-0d01319edd5d8ea1 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1231 |
| REG-a77f9e7977fe05cd | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1234 |
| REG-418471f57607f0b2 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1237 |
| REG-f53e98829f2b5492 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1240 |
| REG-fce32a86a98ed16f | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1243 |
| REG-d8821662985089be | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1796 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-7867728643596dc9 | DynmapCore/src/main/resources/models_1.txt:902 | — | oak_fence_gate |  |  |  |
| REG-0d01319edd5d8ea1 | DynmapCore/src/main/resources/models_1.txt:1231 | — | spruce_fence_gate |  |  |  |
| REG-a77f9e7977fe05cd | DynmapCore/src/main/resources/models_1.txt:1234 | — | birch_fence_gate |  |  |  |
| REG-418471f57607f0b2 | DynmapCore/src/main/resources/models_1.txt:1237 | — | jungle_fence_gate |  |  |  |
| REG-f53e98829f2b5492 | DynmapCore/src/main/resources/models_1.txt:1240 | — | dark_oak_fence_gate |  |  |  |
| REG-fce32a86a98ed16f | DynmapCore/src/main/resources/models_1.txt:1243 | — | acacia_fence_gate |  |  |  |
| REG-d8821662985089be | DynmapCore/src/main/resources/models_1.txt:1796 | 1.16- | crimson_fence_gate, warped_fence_gate |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-7867728643596dc9 | FIX-CASE-REG-7867728643596dc9 | REF-CASE-REG-7867728643596dc9 | TEST-CASE-REG-7867728643596dc9 | EVID-CASE-REG-7867728643596dc9 | DynmapCore/src/main/resources/models_1.txt:902; guard=—; block=oak_fence_gate; data=; state=; parameter keys= |
| CASE-REG-0d01319edd5d8ea1 | FIX-CASE-REG-0d01319edd5d8ea1 | REF-CASE-REG-0d01319edd5d8ea1 | TEST-CASE-REG-0d01319edd5d8ea1 | EVID-CASE-REG-0d01319edd5d8ea1 | DynmapCore/src/main/resources/models_1.txt:1231; guard=—; block=spruce_fence_gate; data=; state=; parameter keys= |
| CASE-REG-a77f9e7977fe05cd | FIX-CASE-REG-a77f9e7977fe05cd | REF-CASE-REG-a77f9e7977fe05cd | TEST-CASE-REG-a77f9e7977fe05cd | EVID-CASE-REG-a77f9e7977fe05cd | DynmapCore/src/main/resources/models_1.txt:1234; guard=—; block=birch_fence_gate; data=; state=; parameter keys= |
| CASE-REG-418471f57607f0b2 | FIX-CASE-REG-418471f57607f0b2 | REF-CASE-REG-418471f57607f0b2 | TEST-CASE-REG-418471f57607f0b2 | EVID-CASE-REG-418471f57607f0b2 | DynmapCore/src/main/resources/models_1.txt:1237; guard=—; block=jungle_fence_gate; data=; state=; parameter keys= |
| CASE-REG-f53e98829f2b5492 | FIX-CASE-REG-f53e98829f2b5492 | REF-CASE-REG-f53e98829f2b5492 | TEST-CASE-REG-f53e98829f2b5492 | EVID-CASE-REG-f53e98829f2b5492 | DynmapCore/src/main/resources/models_1.txt:1240; guard=—; block=dark_oak_fence_gate; data=; state=; parameter keys= |
| CASE-REG-fce32a86a98ed16f | FIX-CASE-REG-fce32a86a98ed16f | REF-CASE-REG-fce32a86a98ed16f | TEST-CASE-REG-fce32a86a98ed16f | EVID-CASE-REG-fce32a86a98ed16f | DynmapCore/src/main/resources/models_1.txt:1243; guard=—; block=acacia_fence_gate; data=; state=; parameter keys= |
| CASE-REG-d8821662985089be | FIX-CASE-REG-d8821662985089be | REF-CASE-REG-d8821662985089be | TEST-CASE-REG-d8821662985089be | EVID-CASE-REG-d8821662985089be | DynmapCore/src/main/resources/models_1.txt:1796; guard=1.16-; block=crimson_fence_gate, warped_fence_gate; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 21 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_CLOSED | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_CLOSED:int` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_EAST | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_EAST:int` | 26–26 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_INWALL | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_INWALL:int` | 21–21 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_NORTH | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_NORTH:int` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_NOTINWALL | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_NOTINWALL:int` | 22–22 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_OPEN | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_OPEN:int` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_SOUTH | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_SOUTH:int` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_WEST | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#IDX_WEST:int` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#TEXTURE_BOTTOM | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#TEXTURE_BOTTOM:int` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#TEXTURE_SIDES | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#TEXTURE_SIDES:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#TEXTURE_TOP | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#TEXTURE_TOP:int` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#meshes | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#meshes:RenderPatch[][]` | 28–28 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#patchlist | field | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#patchlist:int[]` | 43–43 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 45–47 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#buildMeshes(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#buildMeshes(RenderPatchFactory)->void` | 54–115 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getMaximumTextureCount()->int` | 38–41 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 117–122 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 30–36 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#isOnlyBlockStateSensitive()->boolean` | 123–126 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#rotateModel(RenderPatchFactory,int,int,int) | method | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#rotateModel(RenderPatchFactory,int,int,int)->void` | 48–53 |
| type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer | class | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer` | 14–127 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 30–36 | FLOW-24db57f2e04b4900 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getMaximumTextureCount()->int` | 38–41 | none |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 45–47 | none |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#rotateModel(RenderPatchFactory,int,int,int) | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#rotateModel(RenderPatchFactory,int,int,int)->void` | 48–53 | FLOW-face62ec84ad249a |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#buildMeshes(RenderPatchFactory) | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#buildMeshes(RenderPatchFactory)->void` | 54–115 | none |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 117–122 | none |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#isOnlyBlockStateSensitive()->boolean` | 123–126 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-24db57f2e04b4900 | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 32–33 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-24db57f2e04b4900-true (condition evaluates true; fixture FIX-CASE-FLOW-24db57f2e04b4900-true; reference REF-CASE-FLOW-24db57f2e04b4900-true; test TEST-CASE-FLOW-24db57f2e04b4900-true; evidence plan EVID-CASE-FLOW-24db57f2e04b4900-true)<br>CASE-FLOW-24db57f2e04b4900-false (condition false; no else arm; fixture FIX-CASE-FLOW-24db57f2e04b4900-false; reference REF-CASE-FLOW-24db57f2e04b4900-false; test TEST-CASE-FLOW-24db57f2e04b4900-false; evidence plan EVID-CASE-FLOW-24db57f2e04b4900-false) |
| FLOW-face62ec84ad249a | `org.dynmap.hdmap.renderer.FenceGateBlockStateRenderer#rotateModel(RenderPatchFactory,int,int,int)->void` 50–52 | for_loop | `i < meshes[destidx].length` | CASE-FLOW-face62ec84ad249a-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-face62ec84ad249a-iterate; reference REF-CASE-FLOW-face62ec84ad249a-iterate; test TEST-CASE-FLOW-face62ec84ad249a-iterate; evidence plan EVID-CASE-FLOW-face62ec84ad249a-iterate)<br>CASE-FLOW-face62ec84ad249a-exit (condition is false; fixture FIX-CASE-FLOW-face62ec84ad249a-exit; reference REF-CASE-FLOW-face62ec84ad249a-exit; test TEST-CASE-FLOW-face62ec84ad249a-exit; evidence plan EVID-CASE-FLOW-face62ec84ad249a-exit) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins FenceGateBlockStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer FenceGateBlockStateRenderer --fixture-set fence-gate-block-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer FenceGateBlockStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin FenceGateBlockStateRenderer
```
