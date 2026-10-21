# B-fence-wall-block-renderer: Dynmap built-in renderer FenceWallBlockRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-fence-wall-block-renderer",
  "kind": "builtin",
  "document": "phases/builtins/fence-wall-block-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin FenceWallBlockRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceWallBlockRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/fence-wall-block-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-139066b4cf112f9e | static customblock registration | DynmapCore/src/main/resources/models_0.txt:219 |
| REG-0036194a015c685b | static customblock registration | DynmapCore/src/main/resources/models_0.txt:955 |
| REG-8595aafd95e52257 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1175 |
| REG-8f93f8cf0926ab03 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1178 |
| REG-46b56724937c354e | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1181 |
| REG-f42b81f962ec925d | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1184 |
| REG-7311b76a98d3e959 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1187 |
| REG-e7ed27120c8cb18a | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1202 |
| REG-58ddf73dff8cce01 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:43 |
| REG-cda57a0495bbf42c | static customblock registration | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:64 |
| REG-0fb0d96c23d606ab | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Forestry-models.txt:47 |
| REG-273933520d34ab88 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Forestry-models.txt:50 |
| REG-5c823c01eace2edf | static customblock registration | forge-1.12.2/src/main/resources/renderdata/IC2-models.txt:164 |
| REG-bd52f8cfc8180d02 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/IC2-models.txt:170 |
| REG-4a97c6a968ef2826 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:74 |
| REG-7af642dda2326584 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:80 |
| REG-0038ddff47a3e44e | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:188 |
| REG-0ebc1282985aae54 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/ProjRed_Exploration-models.txt:25 |
| REG-882f7b6c7ea6aa79 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:236 |
| REG-0cca40bc092b3dfa | static customblock registration | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:240 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-139066b4cf112f9e | DynmapCore/src/main/resources/models_0.txt:219 | — | fence, nether_brick_fence | * |  | link0, type |
| REG-0036194a015c685b | DynmapCore/src/main/resources/models_0.txt:955 | — | cobblestone_wall | * |  | link0, type |
| REG-8595aafd95e52257 | DynmapCore/src/main/resources/models_0.txt:1175 | 1.8.0- | spruce_fence | * |  | link0, type |
| REG-8f93f8cf0926ab03 | DynmapCore/src/main/resources/models_0.txt:1178 | 1.8.0- | birch_fence | * |  | link0, type |
| REG-46b56724937c354e | DynmapCore/src/main/resources/models_0.txt:1181 | 1.8.0- | jungle_fence | * |  | link0, type |
| REG-f42b81f962ec925d | DynmapCore/src/main/resources/models_0.txt:1184 | 1.8.0- | dark_oak_fence | * |  | link0, type |
| REG-7311b76a98d3e959 | DynmapCore/src/main/resources/models_0.txt:1187 | 1.8.0- | acacia_fence | * |  | link0, type |
| REG-e7ed27120c8cb18a | DynmapCore/src/main/resources/models_0.txt:1202 | 1.9.0- | chorus_plant | * |  | link0, type |
| REG-58ddf73dff8cce01 | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:43 | — | %blockPaintedFence | * |  | link0, type |
| REG-cda57a0495bbf42c | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:64 | — | %blockPaintedWall | * |  | link0, type |
| REG-0fb0d96c23d606ab | forge-1.12.2/src/main/resources/renderdata/Forestry-models.txt:47 | — | %tile.for.fences | * |  | link0, type |
| REG-273933520d34ab88 | forge-1.12.2/src/main/resources/renderdata/Forestry-models.txt:50 | — | %tile.for.fences2 | * |  | link0, type |
| REG-5c823c01eace2edf | forge-1.12.2/src/main/resources/renderdata/IC2-models.txt:164 | — | %blockFenceIron | * |  | link0, type |
| REG-bd52f8cfc8180d02 | forge-1.12.2/src/main/resources/renderdata/IC2-models.txt:170 | — | %blockWall | * |  | link0, type |
| REG-4a97c6a968ef2826 | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:74 | — | %customFence | * |  | link0, type |
| REG-7af642dda2326584 | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:80 | — | %customWall | * |  | link0, type |
| REG-0038ddff47a3e44e | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:188 | — | %Natura.fence | * |  | link0, type |
| REG-0ebc1282985aae54 | forge-1.12.2/src/main/resources/renderdata/ProjRed_Exploration-models.txt:25 | — | %projectred.exploration.stonewalls | 0, 1, 2, 3, 4, 5, 6, 7 |  | link0, type |
| REG-882f7b6c7ea6aa79 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:236 | — | %tile.railcraft.post, %tile.railcraft.post.metal | * |  | link0, type |
| REG-0cca40bc092b3dfa | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:240 | — | %tile.railcraft.wall.alpha, %tile.railcraft.wall.beta | * |  | link0, link1, link2, type |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-139066b4cf112f9e | FIX-CASE-REG-139066b4cf112f9e | REF-CASE-REG-139066b4cf112f9e | TEST-CASE-REG-139066b4cf112f9e | EVID-CASE-REG-139066b4cf112f9e | DynmapCore/src/main/resources/models_0.txt:219; guard=—; block=fence, nether_brick_fence; data=*; state=; parameter keys=link0, type |
| CASE-REG-0036194a015c685b | FIX-CASE-REG-0036194a015c685b | REF-CASE-REG-0036194a015c685b | TEST-CASE-REG-0036194a015c685b | EVID-CASE-REG-0036194a015c685b | DynmapCore/src/main/resources/models_0.txt:955; guard=—; block=cobblestone_wall; data=*; state=; parameter keys=link0, type |
| CASE-REG-8595aafd95e52257 | FIX-CASE-REG-8595aafd95e52257 | REF-CASE-REG-8595aafd95e52257 | TEST-CASE-REG-8595aafd95e52257 | EVID-CASE-REG-8595aafd95e52257 | DynmapCore/src/main/resources/models_0.txt:1175; guard=1.8.0-; block=spruce_fence; data=*; state=; parameter keys=link0, type |
| CASE-REG-8f93f8cf0926ab03 | FIX-CASE-REG-8f93f8cf0926ab03 | REF-CASE-REG-8f93f8cf0926ab03 | TEST-CASE-REG-8f93f8cf0926ab03 | EVID-CASE-REG-8f93f8cf0926ab03 | DynmapCore/src/main/resources/models_0.txt:1178; guard=1.8.0-; block=birch_fence; data=*; state=; parameter keys=link0, type |
| CASE-REG-46b56724937c354e | FIX-CASE-REG-46b56724937c354e | REF-CASE-REG-46b56724937c354e | TEST-CASE-REG-46b56724937c354e | EVID-CASE-REG-46b56724937c354e | DynmapCore/src/main/resources/models_0.txt:1181; guard=1.8.0-; block=jungle_fence; data=*; state=; parameter keys=link0, type |
| CASE-REG-f42b81f962ec925d | FIX-CASE-REG-f42b81f962ec925d | REF-CASE-REG-f42b81f962ec925d | TEST-CASE-REG-f42b81f962ec925d | EVID-CASE-REG-f42b81f962ec925d | DynmapCore/src/main/resources/models_0.txt:1184; guard=1.8.0-; block=dark_oak_fence; data=*; state=; parameter keys=link0, type |
| CASE-REG-7311b76a98d3e959 | FIX-CASE-REG-7311b76a98d3e959 | REF-CASE-REG-7311b76a98d3e959 | TEST-CASE-REG-7311b76a98d3e959 | EVID-CASE-REG-7311b76a98d3e959 | DynmapCore/src/main/resources/models_0.txt:1187; guard=1.8.0-; block=acacia_fence; data=*; state=; parameter keys=link0, type |
| CASE-REG-e7ed27120c8cb18a | FIX-CASE-REG-e7ed27120c8cb18a | REF-CASE-REG-e7ed27120c8cb18a | TEST-CASE-REG-e7ed27120c8cb18a | EVID-CASE-REG-e7ed27120c8cb18a | DynmapCore/src/main/resources/models_0.txt:1202; guard=1.9.0-; block=chorus_plant; data=*; state=; parameter keys=link0, type |
| CASE-REG-58ddf73dff8cce01 | FIX-CASE-REG-58ddf73dff8cce01 | REF-CASE-REG-58ddf73dff8cce01 | TEST-CASE-REG-58ddf73dff8cce01 | EVID-CASE-REG-58ddf73dff8cce01 | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:43; guard=—; block=%blockPaintedFence; data=*; state=; parameter keys=link0, type |
| CASE-REG-cda57a0495bbf42c | FIX-CASE-REG-cda57a0495bbf42c | REF-CASE-REG-cda57a0495bbf42c | TEST-CASE-REG-cda57a0495bbf42c | EVID-CASE-REG-cda57a0495bbf42c | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:64; guard=—; block=%blockPaintedWall; data=*; state=; parameter keys=link0, type |
| CASE-REG-0fb0d96c23d606ab | FIX-CASE-REG-0fb0d96c23d606ab | REF-CASE-REG-0fb0d96c23d606ab | TEST-CASE-REG-0fb0d96c23d606ab | EVID-CASE-REG-0fb0d96c23d606ab | forge-1.12.2/src/main/resources/renderdata/Forestry-models.txt:47; guard=—; block=%tile.for.fences; data=*; state=; parameter keys=link0, type |
| CASE-REG-273933520d34ab88 | FIX-CASE-REG-273933520d34ab88 | REF-CASE-REG-273933520d34ab88 | TEST-CASE-REG-273933520d34ab88 | EVID-CASE-REG-273933520d34ab88 | forge-1.12.2/src/main/resources/renderdata/Forestry-models.txt:50; guard=—; block=%tile.for.fences2; data=*; state=; parameter keys=link0, type |
| CASE-REG-5c823c01eace2edf | FIX-CASE-REG-5c823c01eace2edf | REF-CASE-REG-5c823c01eace2edf | TEST-CASE-REG-5c823c01eace2edf | EVID-CASE-REG-5c823c01eace2edf | forge-1.12.2/src/main/resources/renderdata/IC2-models.txt:164; guard=—; block=%blockFenceIron; data=*; state=; parameter keys=link0, type |
| CASE-REG-bd52f8cfc8180d02 | FIX-CASE-REG-bd52f8cfc8180d02 | REF-CASE-REG-bd52f8cfc8180d02 | TEST-CASE-REG-bd52f8cfc8180d02 | EVID-CASE-REG-bd52f8cfc8180d02 | forge-1.12.2/src/main/resources/renderdata/IC2-models.txt:170; guard=—; block=%blockWall; data=*; state=; parameter keys=link0, type |
| CASE-REG-4a97c6a968ef2826 | FIX-CASE-REG-4a97c6a968ef2826 | REF-CASE-REG-4a97c6a968ef2826 | TEST-CASE-REG-4a97c6a968ef2826 | EVID-CASE-REG-4a97c6a968ef2826 | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:74; guard=—; block=%customFence; data=*; state=; parameter keys=link0, type |
| CASE-REG-7af642dda2326584 | FIX-CASE-REG-7af642dda2326584 | REF-CASE-REG-7af642dda2326584 | TEST-CASE-REG-7af642dda2326584 | EVID-CASE-REG-7af642dda2326584 | forge-1.12.2/src/main/resources/renderdata/Mariculture-models.txt:80; guard=—; block=%customWall; data=*; state=; parameter keys=link0, type |
| CASE-REG-0038ddff47a3e44e | FIX-CASE-REG-0038ddff47a3e44e | REF-CASE-REG-0038ddff47a3e44e | TEST-CASE-REG-0038ddff47a3e44e | EVID-CASE-REG-0038ddff47a3e44e | forge-1.12.2/src/main/resources/renderdata/Natura-models.txt:188; guard=—; block=%Natura.fence; data=*; state=; parameter keys=link0, type |
| CASE-REG-0ebc1282985aae54 | FIX-CASE-REG-0ebc1282985aae54 | REF-CASE-REG-0ebc1282985aae54 | TEST-CASE-REG-0ebc1282985aae54 | EVID-CASE-REG-0ebc1282985aae54 | forge-1.12.2/src/main/resources/renderdata/ProjRed_Exploration-models.txt:25; guard=—; block=%projectred.exploration.stonewalls; data=0, 1, 2, 3, 4, 5, 6, 7; state=; parameter keys=link0, type |
| CASE-REG-882f7b6c7ea6aa79 | FIX-CASE-REG-882f7b6c7ea6aa79 | REF-CASE-REG-882f7b6c7ea6aa79 | TEST-CASE-REG-882f7b6c7ea6aa79 | EVID-CASE-REG-882f7b6c7ea6aa79 | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:236; guard=—; block=%tile.railcraft.post, %tile.railcraft.post.metal; data=*; state=; parameter keys=link0, type |
| CASE-REG-0cca40bc092b3dfa | FIX-CASE-REG-0cca40bc092b3dfa | REF-CASE-REG-0cca40bc092b3dfa | TEST-CASE-REG-0cca40bc092b3dfa | EVID-CASE-REG-0cca40bc092b3dfa | forge-1.12.2/src/main/resources/renderdata/Railcraft-models.txt:240; guard=—; block=%tile.railcraft.wall.alpha, %tile.railcraft.wall.beta; data=*; state=; parameter keys=link0, link1, link2, type |

### Exact implementation symbols

This file contributes 23 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_X | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_X:int` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_XN | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_XN:int` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_XP | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_XP:int` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_YP | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_YP:int` | 29–29 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_Z | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_Z:int` | 28–28 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_ZN | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_ZN:int` | 27–27 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_ZP | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#SIDE_ZP:int` | 26–26 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#TEXTURE_BOTTOM | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#TEXTURE_BOTTOM:int` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#TEXTURE_SIDES | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#TEXTURE_SIDES:int` | 17–17 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#TEXTURE_TOP | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#TEXTURE_TOP:int` | 18–18 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#check_yplus | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#check_yplus:boolean` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#link_ids | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#link_ids:BitSet` | 21–21 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#meshes | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#meshes:RenderPatch[][]` | 32–32 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#patchlist | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#patchlist:int[]` | 70–70 |
| field:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#sides | field | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#sides:int[][]` | 152–157 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | method | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 72–74 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addIDs(String) | method | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addIDs(String)->void` | 34–42 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildFenceMeshes(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildFenceMeshes(RenderPatchFactory)->void` | 76–112 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory)->void` | 114–150 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getMaximumTextureCount()->int` | 65–68 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 159–176 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 43–63 |
| type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer | class | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer` | 16–177 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addIDs(String) | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addIDs(String)->void` | 34–42 | FLOW-d01c77139307e8a6, FLOW-505a6e81d0567287 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 43–63 | FLOW-22a4c88c769a5210, FLOW-6a83ea7d3e626ee4, FLOW-31c53162c42976ef, FLOW-494ddcdfed41d500 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getMaximumTextureCount()->int` | 65–68 | none |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addBox(RenderPatchFactory,List%3cRenderPatch%3e,double,double,double,double,double,double) | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addBox(RenderPatchFactory,List<RenderPatch>,double,double,double,double,double,double)->void` | 72–74 | none |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildFenceMeshes(RenderPatchFactory) | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildFenceMeshes(RenderPatchFactory)->void` | 76–112 | FLOW-b19cfcded3df17d1, FLOW-0e8e04486d3cbd0d, FLOW-1fa32ac1b77254ce |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory) | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory)->void` | 114–150 | FLOW-1cd383e68796f50c, FLOW-20b3a4ff77a4a741, FLOW-88de420e8293cd7f, FLOW-9d90e15cd1b8cd34 |
| method:type:org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 159–176 | FLOW-965149a819007568, FLOW-fa39b3fb4d88810d, FLOW-a9be57715091df30, FLOW-92a7b3f1da5eeac5, FLOW-ef0529f2d124dec3 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-d01c77139307e8a6 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addIDs(String)->void` 36–41 | if | `(bbs.isNotAir())` | CASE-FLOW-d01c77139307e8a6-true (condition evaluates true; fixture FIX-CASE-FLOW-d01c77139307e8a6-true; reference REF-CASE-FLOW-d01c77139307e8a6-true; test TEST-CASE-FLOW-d01c77139307e8a6-true; evidence plan EVID-CASE-FLOW-d01c77139307e8a6-true)<br>CASE-FLOW-d01c77139307e8a6-false (condition false; no else arm; fixture FIX-CASE-FLOW-d01c77139307e8a6-false; reference REF-CASE-FLOW-d01c77139307e8a6-false; test TEST-CASE-FLOW-d01c77139307e8a6-false; evidence plan EVID-CASE-FLOW-d01c77139307e8a6-false) |
| FLOW-505a6e81d0567287 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#addIDs(String)->void` 37–40 | for_loop | `i < bbs.getStateCount()` | CASE-FLOW-505a6e81d0567287-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-505a6e81d0567287-iterate; reference REF-CASE-FLOW-505a6e81d0567287-iterate; test TEST-CASE-FLOW-505a6e81d0567287-iterate; evidence plan EVID-CASE-FLOW-505a6e81d0567287-iterate)<br>CASE-FLOW-505a6e81d0567287-exit (condition is false; fixture FIX-CASE-FLOW-505a6e81d0567287-exit; reference REF-CASE-FLOW-505a6e81d0567287-exit; test TEST-CASE-FLOW-505a6e81d0567287-exit; evidence plan EVID-CASE-FLOW-505a6e81d0567287-exit) |
| FLOW-22a4c88c769a5210 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 45–46 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-22a4c88c769a5210-true (condition evaluates true; fixture FIX-CASE-FLOW-22a4c88c769a5210-true; reference REF-CASE-FLOW-22a4c88c769a5210-true; test TEST-CASE-FLOW-22a4c88c769a5210-true; evidence plan EVID-CASE-FLOW-22a4c88c769a5210-true)<br>CASE-FLOW-22a4c88c769a5210-false (condition false; no else arm; fixture FIX-CASE-FLOW-22a4c88c769a5210-false; reference REF-CASE-FLOW-22a4c88c769a5210-false; test TEST-CASE-FLOW-22a4c88c769a5210-false; evidence plan EVID-CASE-FLOW-22a4c88c769a5210-false) |
| FLOW-6a83ea7d3e626ee4 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 50–56 | if | `((type != null) && (type.equals("wall")))` | CASE-FLOW-6a83ea7d3e626ee4-true (condition evaluates true; fixture FIX-CASE-FLOW-6a83ea7d3e626ee4-true; reference REF-CASE-FLOW-6a83ea7d3e626ee4-true; test TEST-CASE-FLOW-6a83ea7d3e626ee4-true; evidence plan EVID-CASE-FLOW-6a83ea7d3e626ee4-true)<br>CASE-FLOW-6a83ea7d3e626ee4-false (condition evaluates false; fixture FIX-CASE-FLOW-6a83ea7d3e626ee4-false; reference REF-CASE-FLOW-6a83ea7d3e626ee4-false; test TEST-CASE-FLOW-6a83ea7d3e626ee4-false; evidence plan EVID-CASE-FLOW-6a83ea7d3e626ee4-false) |
| FLOW-31c53162c42976ef | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 57–61 | for_loop | `true` | CASE-FLOW-31c53162c42976ef-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-31c53162c42976ef-iterate; reference REF-CASE-FLOW-31c53162c42976ef-iterate; test TEST-CASE-FLOW-31c53162c42976ef-iterate; evidence plan EVID-CASE-FLOW-31c53162c42976ef-iterate)<br>CASE-FLOW-31c53162c42976ef-exit (condition is false; fixture FIX-CASE-FLOW-31c53162c42976ef-exit; reference REF-CASE-FLOW-31c53162c42976ef-exit; test TEST-CASE-FLOW-31c53162c42976ef-exit; evidence plan EVID-CASE-FLOW-31c53162c42976ef-exit) |
| FLOW-494ddcdfed41d500 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 59–59 | if | `(lid == null)` | CASE-FLOW-494ddcdfed41d500-true (condition evaluates true; fixture FIX-CASE-FLOW-494ddcdfed41d500-true; reference REF-CASE-FLOW-494ddcdfed41d500-true; test TEST-CASE-FLOW-494ddcdfed41d500-true; evidence plan EVID-CASE-FLOW-494ddcdfed41d500-true)<br>CASE-FLOW-494ddcdfed41d500-false (condition false; no else arm; fixture FIX-CASE-FLOW-494ddcdfed41d500-false; reference REF-CASE-FLOW-494ddcdfed41d500-false; test TEST-CASE-FLOW-494ddcdfed41d500-false; evidence plan EVID-CASE-FLOW-494ddcdfed41d500-false) |
| FLOW-b19cfcded3df17d1 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildFenceMeshes(RenderPatchFactory)->void` 78–111 | for_loop | `dat < 16` | CASE-FLOW-b19cfcded3df17d1-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-b19cfcded3df17d1-iterate; reference REF-CASE-FLOW-b19cfcded3df17d1-iterate; test TEST-CASE-FLOW-b19cfcded3df17d1-iterate; evidence plan EVID-CASE-FLOW-b19cfcded3df17d1-iterate)<br>CASE-FLOW-b19cfcded3df17d1-exit (condition is false; fixture FIX-CASE-FLOW-b19cfcded3df17d1-exit; reference REF-CASE-FLOW-b19cfcded3df17d1-exit; test TEST-CASE-FLOW-b19cfcded3df17d1-exit; evidence plan EVID-CASE-FLOW-b19cfcded3df17d1-exit) |
| FLOW-0e8e04486d3cbd0d | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildFenceMeshes(RenderPatchFactory)->void` 81–94 | switch_statement | `(dat & SIDE_X)` | CASE-FLOW-0e8e04486d3cbd0d-case-0 (selector matches source case label(s): SIDE_XP; labels=SIDE_XP; fixture FIX-CASE-FLOW-0e8e04486d3cbd0d-case-0; reference REF-CASE-FLOW-0e8e04486d3cbd0d-case-0; test TEST-CASE-FLOW-0e8e04486d3cbd0d-case-0; evidence plan EVID-CASE-FLOW-0e8e04486d3cbd0d-case-0)<br>CASE-FLOW-0e8e04486d3cbd0d-case-1 (selector matches source case label(s): SIDE_XN; labels=SIDE_XN; fixture FIX-CASE-FLOW-0e8e04486d3cbd0d-case-1; reference REF-CASE-FLOW-0e8e04486d3cbd0d-case-1; test TEST-CASE-FLOW-0e8e04486d3cbd0d-case-1; evidence plan EVID-CASE-FLOW-0e8e04486d3cbd0d-case-1)<br>CASE-FLOW-0e8e04486d3cbd0d-case-2 (selector matches source case label(s): SIDE_X; labels=SIDE_X; fixture FIX-CASE-FLOW-0e8e04486d3cbd0d-case-2; reference REF-CASE-FLOW-0e8e04486d3cbd0d-case-2; test TEST-CASE-FLOW-0e8e04486d3cbd0d-case-2; evidence plan EVID-CASE-FLOW-0e8e04486d3cbd0d-case-2)<br>CASE-FLOW-0e8e04486d3cbd0d-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-0e8e04486d3cbd0d-unmatched; reference REF-CASE-FLOW-0e8e04486d3cbd0d-unmatched; test TEST-CASE-FLOW-0e8e04486d3cbd0d-unmatched; evidence plan EVID-CASE-FLOW-0e8e04486d3cbd0d-unmatched) |
| FLOW-1fa32ac1b77254ce | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildFenceMeshes(RenderPatchFactory)->void` 95–108 | switch_statement | `(dat & SIDE_Z)` | CASE-FLOW-1fa32ac1b77254ce-case-0 (selector matches source case label(s): SIDE_ZP; labels=SIDE_ZP; fixture FIX-CASE-FLOW-1fa32ac1b77254ce-case-0; reference REF-CASE-FLOW-1fa32ac1b77254ce-case-0; test TEST-CASE-FLOW-1fa32ac1b77254ce-case-0; evidence plan EVID-CASE-FLOW-1fa32ac1b77254ce-case-0)<br>CASE-FLOW-1fa32ac1b77254ce-case-1 (selector matches source case label(s): SIDE_ZN; labels=SIDE_ZN; fixture FIX-CASE-FLOW-1fa32ac1b77254ce-case-1; reference REF-CASE-FLOW-1fa32ac1b77254ce-case-1; test TEST-CASE-FLOW-1fa32ac1b77254ce-case-1; evidence plan EVID-CASE-FLOW-1fa32ac1b77254ce-case-1)<br>CASE-FLOW-1fa32ac1b77254ce-case-2 (selector matches source case label(s): SIDE_Z; labels=SIDE_Z; fixture FIX-CASE-FLOW-1fa32ac1b77254ce-case-2; reference REF-CASE-FLOW-1fa32ac1b77254ce-case-2; test TEST-CASE-FLOW-1fa32ac1b77254ce-case-2; evidence plan EVID-CASE-FLOW-1fa32ac1b77254ce-case-2)<br>CASE-FLOW-1fa32ac1b77254ce-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-1fa32ac1b77254ce-unmatched; reference REF-CASE-FLOW-1fa32ac1b77254ce-unmatched; test TEST-CASE-FLOW-1fa32ac1b77254ce-unmatched; evidence plan EVID-CASE-FLOW-1fa32ac1b77254ce-unmatched) |
| FLOW-1cd383e68796f50c | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory)->void` 116–149 | for_loop | `dat < 32` | CASE-FLOW-1cd383e68796f50c-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-1cd383e68796f50c-iterate; reference REF-CASE-FLOW-1cd383e68796f50c-iterate; test TEST-CASE-FLOW-1cd383e68796f50c-iterate; evidence plan EVID-CASE-FLOW-1cd383e68796f50c-iterate)<br>CASE-FLOW-1cd383e68796f50c-exit (condition is false; fixture FIX-CASE-FLOW-1cd383e68796f50c-exit; reference REF-CASE-FLOW-1cd383e68796f50c-exit; test TEST-CASE-FLOW-1cd383e68796f50c-exit; evidence plan EVID-CASE-FLOW-1cd383e68796f50c-exit) |
| FLOW-20b3a4ff77a4a741 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory)->void` 118–130 | switch_statement | `(dat & SIDE_X)` | CASE-FLOW-20b3a4ff77a4a741-case-0 (selector matches source case label(s): SIDE_XP; labels=SIDE_XP; fixture FIX-CASE-FLOW-20b3a4ff77a4a741-case-0; reference REF-CASE-FLOW-20b3a4ff77a4a741-case-0; test TEST-CASE-FLOW-20b3a4ff77a4a741-case-0; evidence plan EVID-CASE-FLOW-20b3a4ff77a4a741-case-0)<br>CASE-FLOW-20b3a4ff77a4a741-case-1 (selector matches source case label(s): SIDE_XN; labels=SIDE_XN; fixture FIX-CASE-FLOW-20b3a4ff77a4a741-case-1; reference REF-CASE-FLOW-20b3a4ff77a4a741-case-1; test TEST-CASE-FLOW-20b3a4ff77a4a741-case-1; evidence plan EVID-CASE-FLOW-20b3a4ff77a4a741-case-1)<br>CASE-FLOW-20b3a4ff77a4a741-case-2 (selector matches source case label(s): SIDE_X; labels=SIDE_X; fixture FIX-CASE-FLOW-20b3a4ff77a4a741-case-2; reference REF-CASE-FLOW-20b3a4ff77a4a741-case-2; test TEST-CASE-FLOW-20b3a4ff77a4a741-case-2; evidence plan EVID-CASE-FLOW-20b3a4ff77a4a741-case-2)<br>CASE-FLOW-20b3a4ff77a4a741-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-20b3a4ff77a4a741-unmatched; reference REF-CASE-FLOW-20b3a4ff77a4a741-unmatched; test TEST-CASE-FLOW-20b3a4ff77a4a741-unmatched; evidence plan EVID-CASE-FLOW-20b3a4ff77a4a741-unmatched) |
| FLOW-88de420e8293cd7f | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory)->void` 131–143 | switch_statement | `(dat & SIDE_Z)` | CASE-FLOW-88de420e8293cd7f-case-0 (selector matches source case label(s): SIDE_ZP; labels=SIDE_ZP; fixture FIX-CASE-FLOW-88de420e8293cd7f-case-0; reference REF-CASE-FLOW-88de420e8293cd7f-case-0; test TEST-CASE-FLOW-88de420e8293cd7f-case-0; evidence plan EVID-CASE-FLOW-88de420e8293cd7f-case-0)<br>CASE-FLOW-88de420e8293cd7f-case-1 (selector matches source case label(s): SIDE_ZN; labels=SIDE_ZN; fixture FIX-CASE-FLOW-88de420e8293cd7f-case-1; reference REF-CASE-FLOW-88de420e8293cd7f-case-1; test TEST-CASE-FLOW-88de420e8293cd7f-case-1; evidence plan EVID-CASE-FLOW-88de420e8293cd7f-case-1)<br>CASE-FLOW-88de420e8293cd7f-case-2 (selector matches source case label(s): SIDE_Z; labels=SIDE_Z; fixture FIX-CASE-FLOW-88de420e8293cd7f-case-2; reference REF-CASE-FLOW-88de420e8293cd7f-case-2; test TEST-CASE-FLOW-88de420e8293cd7f-case-2; evidence plan EVID-CASE-FLOW-88de420e8293cd7f-case-2)<br>CASE-FLOW-88de420e8293cd7f-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-88de420e8293cd7f-unmatched; reference REF-CASE-FLOW-88de420e8293cd7f-unmatched; test TEST-CASE-FLOW-88de420e8293cd7f-unmatched; evidence plan EVID-CASE-FLOW-88de420e8293cd7f-unmatched) |
| FLOW-9d90e15cd1b8cd34 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#buildWallMeshes(RenderPatchFactory)->void` 144–146 | if | `(need_post)` | CASE-FLOW-9d90e15cd1b8cd34-true (condition evaluates true; fixture FIX-CASE-FLOW-9d90e15cd1b8cd34-true; reference REF-CASE-FLOW-9d90e15cd1b8cd34-true; test TEST-CASE-FLOW-9d90e15cd1b8cd34-true; evidence plan EVID-CASE-FLOW-9d90e15cd1b8cd34-true)<br>CASE-FLOW-9d90e15cd1b8cd34-false (condition false; no else arm; fixture FIX-CASE-FLOW-9d90e15cd1b8cd34-false; reference REF-CASE-FLOW-9d90e15cd1b8cd34-false; test TEST-CASE-FLOW-9d90e15cd1b8cd34-false; evidence plan EVID-CASE-FLOW-9d90e15cd1b8cd34-false) |
| FLOW-965149a819007568 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 163–169 | enhanced_for_loop | `int[] side : sides` | CASE-FLOW-965149a819007568-each_element (execute body once per iterable element; fixture FIX-CASE-FLOW-965149a819007568-each_element; reference REF-CASE-FLOW-965149a819007568-each_element; test TEST-CASE-FLOW-965149a819007568-each_element; evidence plan EVID-CASE-FLOW-965149a819007568-each_element)<br>CASE-FLOW-965149a819007568-empty_or_exhausted (no remaining element; fixture FIX-CASE-FLOW-965149a819007568-empty_or_exhausted; reference REF-CASE-FLOW-965149a819007568-empty_or_exhausted; test TEST-CASE-FLOW-965149a819007568-empty_or_exhausted; evidence plan EVID-CASE-FLOW-965149a819007568-empty_or_exhausted) |
| FLOW-fa39b3fb4d88810d | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 165–165 | if | `(blk.isAir())` | CASE-FLOW-fa39b3fb4d88810d-true (condition evaluates true; fixture FIX-CASE-FLOW-fa39b3fb4d88810d-true; reference REF-CASE-FLOW-fa39b3fb4d88810d-true; test TEST-CASE-FLOW-fa39b3fb4d88810d-true; evidence plan EVID-CASE-FLOW-fa39b3fb4d88810d-true)<br>CASE-FLOW-fa39b3fb4d88810d-false (condition false; no else arm; fixture FIX-CASE-FLOW-fa39b3fb4d88810d-false; reference REF-CASE-FLOW-fa39b3fb4d88810d-false; test TEST-CASE-FLOW-fa39b3fb4d88810d-false; evidence plan EVID-CASE-FLOW-fa39b3fb4d88810d-false) |
| FLOW-a9be57715091df30 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 166–168 | if | `(link_ids.get(blk.globalStateIndex) \|\| (HDBlockStateTextureMap.getTransparency(blk) == BlockTransparency.OPAQUE))` | CASE-FLOW-a9be57715091df30-true (condition evaluates true; fixture FIX-CASE-FLOW-a9be57715091df30-true; reference REF-CASE-FLOW-a9be57715091df30-true; test TEST-CASE-FLOW-a9be57715091df30-true; evidence plan EVID-CASE-FLOW-a9be57715091df30-true)<br>CASE-FLOW-a9be57715091df30-false (condition false; no else arm; fixture FIX-CASE-FLOW-a9be57715091df30-false; reference REF-CASE-FLOW-a9be57715091df30-false; test TEST-CASE-FLOW-a9be57715091df30-false; evidence plan EVID-CASE-FLOW-a9be57715091df30-false) |
| FLOW-92a7b3f1da5eeac5 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 170–174 | if | `(check_yplus)` | CASE-FLOW-92a7b3f1da5eeac5-true (condition evaluates true; fixture FIX-CASE-FLOW-92a7b3f1da5eeac5-true; reference REF-CASE-FLOW-92a7b3f1da5eeac5-true; test TEST-CASE-FLOW-92a7b3f1da5eeac5-true; evidence plan EVID-CASE-FLOW-92a7b3f1da5eeac5-true)<br>CASE-FLOW-92a7b3f1da5eeac5-false (condition false; no else arm; fixture FIX-CASE-FLOW-92a7b3f1da5eeac5-false; reference REF-CASE-FLOW-92a7b3f1da5eeac5-false; test TEST-CASE-FLOW-92a7b3f1da5eeac5-false; evidence plan EVID-CASE-FLOW-92a7b3f1da5eeac5-false) |
| FLOW-ef0529f2d124dec3 | `org.dynmap.hdmap.renderer.FenceWallBlockRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 171–173 | if | `(ctx.getBlockTypeAt(0, 1, 0).isNotAir())` | CASE-FLOW-ef0529f2d124dec3-true (condition evaluates true; fixture FIX-CASE-FLOW-ef0529f2d124dec3-true; reference REF-CASE-FLOW-ef0529f2d124dec3-true; test TEST-CASE-FLOW-ef0529f2d124dec3-true; evidence plan EVID-CASE-FLOW-ef0529f2d124dec3-true)<br>CASE-FLOW-ef0529f2d124dec3-false (condition false; no else arm; fixture FIX-CASE-FLOW-ef0529f2d124dec3-false; reference REF-CASE-FLOW-ef0529f2d124dec3-false; test TEST-CASE-FLOW-ef0529f2d124dec3-false; evidence plan EVID-CASE-FLOW-ef0529f2d124dec3-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins FenceWallBlockRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer FenceWallBlockRenderer --fixture-set fence-wall-block-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer FenceWallBlockRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin FenceWallBlockRenderer
```
