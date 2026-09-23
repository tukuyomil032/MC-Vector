# B-fence-gate-block-renderer: Dynmap built-in renderer FenceGateBlockRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-fence-gate-block-renderer",
  "kind": "builtin",
  "document": "phases/builtins/fence-gate-block-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin FenceGateBlockRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceGateBlockRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/fence-gate-block-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-0e7c1ab568fa2da0 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:743 |
| REG-d4ad1f6b0fbf49b7 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1160 |
| REG-0c96416bc751b2fc | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1163 |
| REG-54ac6d1e705fd321 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1166 |
| REG-3e809a001b6edd7a | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1169 |
| REG-bdcfa5bc03a29c22 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1172 |
| REG-c4f9227bd9c1b836 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:77 |
| REG-467d743346d939f0 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:269 |
| REG-43dd1acb9bc0a295 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:299 |
| REG-bb6e1082126dfcfd | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:329 |
| REG-088dbf4ad94b7b15 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:359 |
| REG-7ad1a9b2c162adbf | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:389 |
| REG-9545293071f59f9a | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:419 |
| REG-a56181248b188235 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:449 |
| REG-5c4802ce3c9edf1d | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:479 |
| REG-ca7e2d70771bd0d0 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:509 |
| REG-8506aa275cfb2b4c | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:539 |
| REG-df93d47d4dd759e7 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:569 |
| REG-0662f58ac334b04b | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:599 |
| REG-81072dc45ebb040b | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:629 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-0e7c1ab568fa2da0 | DynmapCore/src/main/resources/models_0.txt:743 | — | fence_gate | * |  |  |
| REG-d4ad1f6b0fbf49b7 | DynmapCore/src/main/resources/models_0.txt:1160 | 1.8.0- | spruce_fence_gate | * |  |  |
| REG-0c96416bc751b2fc | DynmapCore/src/main/resources/models_0.txt:1163 | 1.8.0- | birch_fence_gate | * |  |  |
| REG-54ac6d1e705fd321 | DynmapCore/src/main/resources/models_0.txt:1166 | 1.8.0- | jungle_fence_gate | * |  |  |
| REG-3e809a001b6edd7a | DynmapCore/src/main/resources/models_0.txt:1169 | 1.8.0- | dark_oak_fence_gate | * |  |  |
| REG-bdcfa5bc03a29c22 | DynmapCore/src/main/resources/models_0.txt:1172 | 1.8.0- | acacia_fence_gate | * |  |  |
| REG-c4f9227bd9c1b836 | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:77 | — | %customGate | * |  | link0, type |
| REG-467d743346d939f0 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:269 | — | %fenceGate.eucalyptus | * |  | link0, type |
| REG-43dd1acb9bc0a295 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:299 | — | %fenceGate.sakura | * |  | link0, type |
| REG-bb6e1082126dfcfd | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:329 | — | %fenceGate.ghostwood | * |  | link0, type |
| REG-088dbf4ad94b7b15 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:359 | — | %fenceGate.redwood | * |  | link0, type |
| REG-7ad1a9b2c162adbf | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:389 | — | %fenceGate.bloodwood | * |  | link0, type |
| REG-9545293071f59f9a | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:419 | — | %fenceGate.hopseed | * |  | link0, type |
| REG-a56181248b188235 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:449 | — | %fenceGate.maple | * |  | link0, type |
| REG-5c4802ce3c9edf1d | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:479 | — | %fenceGate.amaranth | * |  | link0, type |
| REG-ca7e2d70771bd0d0 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:509 | — | %fenceGate.silverbell | * |  | link0, type |
| REG-8506aa275cfb2b4c | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:539 | — | %fenceGate.tiger | * |  | link0, type |
| REG-df93d47d4dd759e7 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:569 | — | %fenceGate.willow | * |  | link0, type |
| REG-0662f58ac334b04b | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:599 | — | %fenceGate.darkwood | * |  | link0, type |
| REG-81072dc45ebb040b | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:629 | — | %fenceGate.fusewood | * |  | link0, type |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-0e7c1ab568fa2da0 | FIX-CASE-REG-0e7c1ab568fa2da0 | REF-CASE-REG-0e7c1ab568fa2da0 | TEST-CASE-REG-0e7c1ab568fa2da0 | EVID-CASE-REG-0e7c1ab568fa2da0 | DynmapCore/src/main/resources/models_0.txt:743; guard=—; block=fence_gate; data=*; state=; parameter keys= |
| CASE-REG-d4ad1f6b0fbf49b7 | FIX-CASE-REG-d4ad1f6b0fbf49b7 | REF-CASE-REG-d4ad1f6b0fbf49b7 | TEST-CASE-REG-d4ad1f6b0fbf49b7 | EVID-CASE-REG-d4ad1f6b0fbf49b7 | DynmapCore/src/main/resources/models_0.txt:1160; guard=1.8.0-; block=spruce_fence_gate; data=*; state=; parameter keys= |
| CASE-REG-0c96416bc751b2fc | FIX-CASE-REG-0c96416bc751b2fc | REF-CASE-REG-0c96416bc751b2fc | TEST-CASE-REG-0c96416bc751b2fc | EVID-CASE-REG-0c96416bc751b2fc | DynmapCore/src/main/resources/models_0.txt:1163; guard=1.8.0-; block=birch_fence_gate; data=*; state=; parameter keys= |
| CASE-REG-54ac6d1e705fd321 | FIX-CASE-REG-54ac6d1e705fd321 | REF-CASE-REG-54ac6d1e705fd321 | TEST-CASE-REG-54ac6d1e705fd321 | EVID-CASE-REG-54ac6d1e705fd321 | DynmapCore/src/main/resources/models_0.txt:1166; guard=1.8.0-; block=jungle_fence_gate; data=*; state=; parameter keys= |
| CASE-REG-3e809a001b6edd7a | FIX-CASE-REG-3e809a001b6edd7a | REF-CASE-REG-3e809a001b6edd7a | TEST-CASE-REG-3e809a001b6edd7a | EVID-CASE-REG-3e809a001b6edd7a | DynmapCore/src/main/resources/models_0.txt:1169; guard=1.8.0-; block=dark_oak_fence_gate; data=*; state=; parameter keys= |
| CASE-REG-bdcfa5bc03a29c22 | FIX-CASE-REG-bdcfa5bc03a29c22 | REF-CASE-REG-bdcfa5bc03a29c22 | TEST-CASE-REG-bdcfa5bc03a29c22 | EVID-CASE-REG-bdcfa5bc03a29c22 | DynmapCore/src/main/resources/models_0.txt:1172; guard=1.8.0-; block=acacia_fence_gate; data=*; state=; parameter keys= |
| CASE-REG-c4f9227bd9c1b836 | FIX-CASE-REG-c4f9227bd9c1b836 | REF-CASE-REG-c4f9227bd9c1b836 | TEST-CASE-REG-c4f9227bd9c1b836 | EVID-CASE-REG-c4f9227bd9c1b836 | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:77; guard=—; block=%customGate; data=*; state=; parameter keys=link0, type |
| CASE-REG-467d743346d939f0 | FIX-CASE-REG-467d743346d939f0 | REF-CASE-REG-467d743346d939f0 | TEST-CASE-REG-467d743346d939f0 | EVID-CASE-REG-467d743346d939f0 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:269; guard=—; block=%fenceGate.eucalyptus; data=*; state=; parameter keys=link0, type |
| CASE-REG-43dd1acb9bc0a295 | FIX-CASE-REG-43dd1acb9bc0a295 | REF-CASE-REG-43dd1acb9bc0a295 | TEST-CASE-REG-43dd1acb9bc0a295 | EVID-CASE-REG-43dd1acb9bc0a295 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:299; guard=—; block=%fenceGate.sakura; data=*; state=; parameter keys=link0, type |
| CASE-REG-bb6e1082126dfcfd | FIX-CASE-REG-bb6e1082126dfcfd | REF-CASE-REG-bb6e1082126dfcfd | TEST-CASE-REG-bb6e1082126dfcfd | EVID-CASE-REG-bb6e1082126dfcfd | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:329; guard=—; block=%fenceGate.ghostwood; data=*; state=; parameter keys=link0, type |
| CASE-REG-088dbf4ad94b7b15 | FIX-CASE-REG-088dbf4ad94b7b15 | REF-CASE-REG-088dbf4ad94b7b15 | TEST-CASE-REG-088dbf4ad94b7b15 | EVID-CASE-REG-088dbf4ad94b7b15 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:359; guard=—; block=%fenceGate.redwood; data=*; state=; parameter keys=link0, type |
| CASE-REG-7ad1a9b2c162adbf | FIX-CASE-REG-7ad1a9b2c162adbf | REF-CASE-REG-7ad1a9b2c162adbf | TEST-CASE-REG-7ad1a9b2c162adbf | EVID-CASE-REG-7ad1a9b2c162adbf | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:389; guard=—; block=%fenceGate.bloodwood; data=*; state=; parameter keys=link0, type |
| CASE-REG-9545293071f59f9a | FIX-CASE-REG-9545293071f59f9a | REF-CASE-REG-9545293071f59f9a | TEST-CASE-REG-9545293071f59f9a | EVID-CASE-REG-9545293071f59f9a | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:419; guard=—; block=%fenceGate.hopseed; data=*; state=; parameter keys=link0, type |
| CASE-REG-a56181248b188235 | FIX-CASE-REG-a56181248b188235 | REF-CASE-REG-a56181248b188235 | TEST-CASE-REG-a56181248b188235 | EVID-CASE-REG-a56181248b188235 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:449; guard=—; block=%fenceGate.maple; data=*; state=; parameter keys=link0, type |
| CASE-REG-5c4802ce3c9edf1d | FIX-CASE-REG-5c4802ce3c9edf1d | REF-CASE-REG-5c4802ce3c9edf1d | TEST-CASE-REG-5c4802ce3c9edf1d | EVID-CASE-REG-5c4802ce3c9edf1d | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:479; guard=—; block=%fenceGate.amaranth; data=*; state=; parameter keys=link0, type |
| CASE-REG-ca7e2d70771bd0d0 | FIX-CASE-REG-ca7e2d70771bd0d0 | REF-CASE-REG-ca7e2d70771bd0d0 | TEST-CASE-REG-ca7e2d70771bd0d0 | EVID-CASE-REG-ca7e2d70771bd0d0 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:509; guard=—; block=%fenceGate.silverbell; data=*; state=; parameter keys=link0, type |
| CASE-REG-8506aa275cfb2b4c | FIX-CASE-REG-8506aa275cfb2b4c | REF-CASE-REG-8506aa275cfb2b4c | TEST-CASE-REG-8506aa275cfb2b4c | EVID-CASE-REG-8506aa275cfb2b4c | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:539; guard=—; block=%fenceGate.tiger; data=*; state=; parameter keys=link0, type |
| CASE-REG-df93d47d4dd759e7 | FIX-CASE-REG-df93d47d4dd759e7 | REF-CASE-REG-df93d47d4dd759e7 | TEST-CASE-REG-df93d47d4dd759e7 | EVID-CASE-REG-df93d47d4dd759e7 | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:569; guard=—; block=%fenceGate.willow; data=*; state=; parameter keys=link0, type |
| CASE-REG-0662f58ac334b04b | FIX-CASE-REG-0662f58ac334b04b | REF-CASE-REG-0662f58ac334b04b | TEST-CASE-REG-0662f58ac334b04b | EVID-CASE-REG-0662f58ac334b04b | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:599; guard=—; block=%fenceGate.darkwood; data=*; state=; parameter keys=link0, type |
| CASE-REG-81072dc45ebb040b | FIX-CASE-REG-81072dc45ebb040b | REF-CASE-REG-81072dc45ebb040b | TEST-CASE-REG-81072dc45ebb040b | EVID-CASE-REG-81072dc45ebb040b | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:629; guard=—; block=%fenceGate.fusewood; data=*; state=; parameter keys=link0, type |

### Exact implementation symbols

This file contributes 12 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#TEXTURE_BOTTOM | field | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#TEXTURE_BOTTOM:int` | 16–16 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#TEXTURE_SIDES | field | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#TEXTURE_SIDES:int` | 14–14 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#TEXTURE_TOP | field | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#TEXTURE_TOP:int` | 15–15 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#meshes | field | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#meshes:RenderPatch[][]` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#patchlist | field | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#patchlist:int[]` | 34–34 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 36–38 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` | 40–103 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getMaximumTextureCount()->int` | 29–32 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 105–110 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–27 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#isOnlyBlockStateSensitive()->boolean` | 111–114 |
| type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer | class | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer` | 13–115 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 21–27 | FLOW-d67adc8f36cc0fa1 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getMaximumTextureCount()->int` | 29–32 | none |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 36–38 | none |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory) | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` | 40–103 | FLOW-69c6baab3603a4e8, FLOW-655d64489c77c2cd, FLOW-79856968dfb83fbe, FLOW-456dbc1cc9918365, FLOW-d7004e27fd8d3b10, FLOW-90c466aff6cf0176 |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 105–110 | none |
| method:type:org.dynmap.hdmap.renderer.FenceGateBlockRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#isOnlyBlockStateSensitive()->boolean` | 111–114 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-d67adc8f36cc0fa1 | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 23–24 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-d67adc8f36cc0fa1-true (condition evaluates true; fixture FIX-CASE-FLOW-d67adc8f36cc0fa1-true; reference REF-CASE-FLOW-d67adc8f36cc0fa1-true; test TEST-CASE-FLOW-d67adc8f36cc0fa1-true; evidence plan EVID-CASE-FLOW-d67adc8f36cc0fa1-true)<br>CASE-FLOW-d67adc8f36cc0fa1-false (condition false; no else arm; fixture FIX-CASE-FLOW-d67adc8f36cc0fa1-false; reference REF-CASE-FLOW-d67adc8f36cc0fa1-false; test TEST-CASE-FLOW-d67adc8f36cc0fa1-false; evidence plan EVID-CASE-FLOW-d67adc8f36cc0fa1-false) |
| FLOW-69c6baab3603a4e8 | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` 42–102 | for_loop | `dat < 8` | CASE-FLOW-69c6baab3603a4e8-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-69c6baab3603a4e8-iterate; reference REF-CASE-FLOW-69c6baab3603a4e8-iterate; test TEST-CASE-FLOW-69c6baab3603a4e8-iterate; evidence plan EVID-CASE-FLOW-69c6baab3603a4e8-iterate)<br>CASE-FLOW-69c6baab3603a4e8-exit (condition is false; fixture FIX-CASE-FLOW-69c6baab3603a4e8-exit; reference REF-CASE-FLOW-69c6baab3603a4e8-exit; test TEST-CASE-FLOW-69c6baab3603a4e8-exit; evidence plan EVID-CASE-FLOW-69c6baab3603a4e8-exit) |
| FLOW-655d64489c77c2cd | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` 44–97 | if | `((dat & 1) == 0)` | CASE-FLOW-655d64489c77c2cd-true (condition evaluates true; fixture FIX-CASE-FLOW-655d64489c77c2cd-true; reference REF-CASE-FLOW-655d64489c77c2cd-true; test TEST-CASE-FLOW-655d64489c77c2cd-true; evidence plan EVID-CASE-FLOW-655d64489c77c2cd-true)<br>CASE-FLOW-655d64489c77c2cd-false (condition evaluates false; fixture FIX-CASE-FLOW-655d64489c77c2cd-false; reference REF-CASE-FLOW-655d64489c77c2cd-false; test TEST-CASE-FLOW-655d64489c77c2cd-false; evidence plan EVID-CASE-FLOW-655d64489c77c2cd-false) |
| FLOW-79856968dfb83fbe | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` 47–69 | if | `((dat & 4) == 0)` | CASE-FLOW-79856968dfb83fbe-true (condition evaluates true; fixture FIX-CASE-FLOW-79856968dfb83fbe-true; reference REF-CASE-FLOW-79856968dfb83fbe-true; test TEST-CASE-FLOW-79856968dfb83fbe-true; evidence plan EVID-CASE-FLOW-79856968dfb83fbe-true)<br>CASE-FLOW-79856968dfb83fbe-false (condition evaluates false; fixture FIX-CASE-FLOW-79856968dfb83fbe-false; reference REF-CASE-FLOW-79856968dfb83fbe-false; test TEST-CASE-FLOW-79856968dfb83fbe-false; evidence plan EVID-CASE-FLOW-79856968dfb83fbe-false) |
| FLOW-456dbc1cc9918365 | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` 54–69 | if | `((dat & 3) == 0)` | CASE-FLOW-456dbc1cc9918365-true (condition evaluates true; fixture FIX-CASE-FLOW-456dbc1cc9918365-true; reference REF-CASE-FLOW-456dbc1cc9918365-true; test TEST-CASE-FLOW-456dbc1cc9918365-true; evidence plan EVID-CASE-FLOW-456dbc1cc9918365-true)<br>CASE-FLOW-456dbc1cc9918365-false (condition evaluates false; fixture FIX-CASE-FLOW-456dbc1cc9918365-false; reference REF-CASE-FLOW-456dbc1cc9918365-false; test TEST-CASE-FLOW-456dbc1cc9918365-false; evidence plan EVID-CASE-FLOW-456dbc1cc9918365-false) |
| FLOW-d7004e27fd8d3b10 | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` 74–96 | if | `((dat & 4) == 0)` | CASE-FLOW-d7004e27fd8d3b10-true (condition evaluates true; fixture FIX-CASE-FLOW-d7004e27fd8d3b10-true; reference REF-CASE-FLOW-d7004e27fd8d3b10-true; test TEST-CASE-FLOW-d7004e27fd8d3b10-true; evidence plan EVID-CASE-FLOW-d7004e27fd8d3b10-true)<br>CASE-FLOW-d7004e27fd8d3b10-false (condition evaluates false; fixture FIX-CASE-FLOW-d7004e27fd8d3b10-false; reference REF-CASE-FLOW-d7004e27fd8d3b10-false; test TEST-CASE-FLOW-d7004e27fd8d3b10-false; evidence plan EVID-CASE-FLOW-d7004e27fd8d3b10-false) |
| FLOW-90c466aff6cf0176 | `org.dynmap.hdmap.renderer.FenceGateBlockRenderer#buildMeshes(RenderPatchFactory)->void` 81–96 | if | `((dat & 3) == 3)` | CASE-FLOW-90c466aff6cf0176-true (condition evaluates true; fixture FIX-CASE-FLOW-90c466aff6cf0176-true; reference REF-CASE-FLOW-90c466aff6cf0176-true; test TEST-CASE-FLOW-90c466aff6cf0176-true; evidence plan EVID-CASE-FLOW-90c466aff6cf0176-true)<br>CASE-FLOW-90c466aff6cf0176-false (condition evaluates false; fixture FIX-CASE-FLOW-90c466aff6cf0176-false; reference REF-CASE-FLOW-90c466aff6cf0176-false; test TEST-CASE-FLOW-90c466aff6cf0176-false; evidence plan EVID-CASE-FLOW-90c466aff6cf0176-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins FenceGateBlockRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer FenceGateBlockRenderer --fixture-set fence-gate-block-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer FenceGateBlockRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin FenceGateBlockRenderer
```
