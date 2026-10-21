# B-chest-state-renderer: Dynmap built-in renderer ChestStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-chest-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/chest-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin ChestStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ChestStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/chest-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-2ce5cbf1a397e848 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:981 |
| REG-340f7c551a92dc41 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1010 |
| REG-8e0a4c156be0e142 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:4732 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-2ce5cbf1a397e848 | DynmapCore/src/main/resources/models_1.txt:981 | — | chest, trapped_chest |  |  | doublechest |
| REG-340f7c551a92dc41 | DynmapCore/src/main/resources/models_1.txt:1010 | — | ender_chest |  |  | doublechest |
| REG-8e0a4c156be0e142 | DynmapCore/src/main/resources/models_1.txt:4732 | 1.21.9- | copper_chest, exposed_copper_chest, weathered_copper_chest, oxidized_copper_chest, waxed_copper_chest, waxed_exposed_copper_chest, waxed_weathered_copper_chest, waxed_oxidized_copper_chest |  |  | doublechest |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-2ce5cbf1a397e848 | FIX-CASE-REG-2ce5cbf1a397e848 | REF-CASE-REG-2ce5cbf1a397e848 | TEST-CASE-REG-2ce5cbf1a397e848 | EVID-CASE-REG-2ce5cbf1a397e848 | DynmapCore/src/main/resources/models_1.txt:981; guard=—; block=chest, trapped_chest; data=; state=; parameter keys=doublechest |
| CASE-REG-340f7c551a92dc41 | FIX-CASE-REG-340f7c551a92dc41 | REF-CASE-REG-340f7c551a92dc41 | TEST-CASE-REG-340f7c551a92dc41 | EVID-CASE-REG-340f7c551a92dc41 | DynmapCore/src/main/resources/models_1.txt:1010; guard=—; block=ender_chest; data=; state=; parameter keys=doublechest |
| CASE-REG-8e0a4c156be0e142 | FIX-CASE-REG-8e0a4c156be0e142 | REF-CASE-REG-8e0a4c156be0e142 | TEST-CASE-REG-8e0a4c156be0e142 | EVID-CASE-REG-8e0a4c156be0e142 | DynmapCore/src/main/resources/models_1.txt:4732; guard=1.21.9-; block=copper_chest, exposed_copper_chest, weathered_copper_chest, oxidized_copper_chest, waxed_copper_chest, waxed_exposed_copper_chest, waxed_weathered_copper_chest, waxed_oxidized_copper_chest; data=; state=; parameter keys=doublechest |

### Exact implementation symbols

This file contributes 17 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_EAST | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_EAST:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_NORTH | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_NORTH:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_SOUTH | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_SOUTH:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_WEST | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#LEFT_WEST:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_EAST | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_EAST:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_NORTH | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_NORTH:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_SOUTH | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_SOUTH:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_WEST | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#RIGHT_WEST:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_EAST | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_EAST:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_NORTH | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_NORTH:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_SOUTH | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_SOUTH:ChestData` | 11–11 |
| enum_constant:type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_WEST | enum_constant | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData#SINGLE_WEST:ChestData` | 11–11 |
| field:type:org.dynmap.hdmap.renderer.ChestStateRenderer#byIndex | field | `org.dynmap.hdmap.renderer.ChestStateRenderer#byIndex:ChestData[]` | 14–18 |
| method:type:org.dynmap.hdmap.renderer.ChestStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.ChestStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 19–26 |
| method:type:org.dynmap.hdmap.renderer.ChestStateRenderer#isOnlyBlockStateSensitive() | method | `org.dynmap.hdmap.renderer.ChestStateRenderer#isOnlyBlockStateSensitive()->boolean` | 27–30 |
| type:org.dynmap.hdmap.renderer.ChestStateRenderer | class | `org.dynmap.hdmap.renderer.ChestStateRenderer` | 9–31 |
| type:org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData | enum | `org.dynmap.hdmap.renderer.ChestStateRenderer$ChestData` | 10–12 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.ChestStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.ChestStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 19–26 | FLOW-f5946eff88b1a71c |
| method:type:org.dynmap.hdmap.renderer.ChestStateRenderer#isOnlyBlockStateSensitive() | `org.dynmap.hdmap.renderer.ChestStateRenderer#isOnlyBlockStateSensitive()->boolean` | 27–30 | none |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-f5946eff88b1a71c | `org.dynmap.hdmap.renderer.ChestStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 22–24 | if | `(!double_chest)` | CASE-FLOW-f5946eff88b1a71c-true (condition evaluates true; fixture FIX-CASE-FLOW-f5946eff88b1a71c-true; reference REF-CASE-FLOW-f5946eff88b1a71c-true; test TEST-CASE-FLOW-f5946eff88b1a71c-true; evidence plan EVID-CASE-FLOW-f5946eff88b1a71c-true)<br>CASE-FLOW-f5946eff88b1a71c-false (condition false; no else arm; fixture FIX-CASE-FLOW-f5946eff88b1a71c-false; reference REF-CASE-FLOW-f5946eff88b1a71c-false; test TEST-CASE-FLOW-f5946eff88b1a71c-false; evidence plan EVID-CASE-FLOW-f5946eff88b1a71c-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins ChestStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer ChestStateRenderer --fixture-set chest-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer ChestStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin ChestStateRenderer
```
