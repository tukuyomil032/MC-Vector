# B-door-state-renderer: Dynmap built-in renderer DoorStateRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-door-state-renderer",
  "kind": "builtin",
  "document": "phases/builtins/door-state-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin DoorStateRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/DoorStateRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/door-state-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-ea0c51923faec04d | static customblock registration | DynmapCore/src/main/resources/models_1.txt:593 |
| REG-31b6b4a499230653 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1265 |
| REG-2ee657ff31855dcf | static customblock registration | DynmapCore/src/main/resources/models_1.txt:1816 |
| REG-bb1986a0340f66d4 | static customblock registration | DynmapCore/src/main/resources/models_1.txt:3458 |
| REG-b5f98960bf29a16c | static customblock registration | DynmapCore/src/main/resources/models_1.txt:3459 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-ea0c51923faec04d | DynmapCore/src/main/resources/models_1.txt:593 | — | oak_door, iron_door |  |  |  |
| REG-31b6b4a499230653 | DynmapCore/src/main/resources/models_1.txt:1265 | — | spruce_door, birch_door, jungle_door, acacia_door, dark_oak_door |  |  |  |
| REG-2ee657ff31855dcf | DynmapCore/src/main/resources/models_1.txt:1816 | 1.16- | crimson_door, warped_door |  |  |  |
| REG-bb1986a0340f66d4 | DynmapCore/src/main/resources/models_1.txt:3458 | 1.20.3- | %copper_door, %exposed_copper_door, %oxidized_copper_door, %weathered_copper_door |  |  |  |
| REG-b5f98960bf29a16c | DynmapCore/src/main/resources/models_1.txt:3459 | 1.20.3- | %waxed_copper_door, %waxed_exposed_copper_door, %waxed_oxidized_copper_door, %waxed_weathered_copper_door |  |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-ea0c51923faec04d | FIX-CASE-REG-ea0c51923faec04d | REF-CASE-REG-ea0c51923faec04d | TEST-CASE-REG-ea0c51923faec04d | EVID-CASE-REG-ea0c51923faec04d | DynmapCore/src/main/resources/models_1.txt:593; guard=—; block=oak_door, iron_door; data=; state=; parameter keys= |
| CASE-REG-31b6b4a499230653 | FIX-CASE-REG-31b6b4a499230653 | REF-CASE-REG-31b6b4a499230653 | TEST-CASE-REG-31b6b4a499230653 | EVID-CASE-REG-31b6b4a499230653 | DynmapCore/src/main/resources/models_1.txt:1265; guard=—; block=spruce_door, birch_door, jungle_door, acacia_door, dark_oak_door; data=; state=; parameter keys= |
| CASE-REG-2ee657ff31855dcf | FIX-CASE-REG-2ee657ff31855dcf | REF-CASE-REG-2ee657ff31855dcf | TEST-CASE-REG-2ee657ff31855dcf | EVID-CASE-REG-2ee657ff31855dcf | DynmapCore/src/main/resources/models_1.txt:1816; guard=1.16-; block=crimson_door, warped_door; data=; state=; parameter keys= |
| CASE-REG-bb1986a0340f66d4 | FIX-CASE-REG-bb1986a0340f66d4 | REF-CASE-REG-bb1986a0340f66d4 | TEST-CASE-REG-bb1986a0340f66d4 | EVID-CASE-REG-bb1986a0340f66d4 | DynmapCore/src/main/resources/models_1.txt:3458; guard=1.20.3-; block=%copper_door, %exposed_copper_door, %oxidized_copper_door, %weathered_copper_door; data=; state=; parameter keys= |
| CASE-REG-b5f98960bf29a16c | FIX-CASE-REG-b5f98960bf29a16c | REF-CASE-REG-b5f98960bf29a16c | TEST-CASE-REG-b5f98960bf29a16c | EVID-CASE-REG-b5f98960bf29a16c | DynmapCore/src/main/resources/models_1.txt:3459; guard=1.20.3-; block=%waxed_copper_door, %waxed_exposed_copper_door, %waxed_oxidized_copper_door, %waxed_weathered_copper_door; data=; state=; parameter keys= |

### Exact implementation symbols

This file contributes 2 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| method:type:org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 10–33 |
| type:org.dynmap.hdmap.renderer.DoorStateRenderer | class | `org.dynmap.hdmap.renderer.DoorStateRenderer` | 9–34 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 10–33 | FLOW-c93cd44cf8e1bec7, FLOW-bd54b5ff7a1f7d1a, FLOW-7bf9f8ddf5145720, FLOW-78ea6e5d00f32ee8 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-c93cd44cf8e1bec7 | `org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 15–15 | conditional_expression | `((idx & 8) == 0)` | CASE-FLOW-c93cd44cf8e1bec7-true (condition evaluates true; fixture FIX-CASE-FLOW-c93cd44cf8e1bec7-true; reference REF-CASE-FLOW-c93cd44cf8e1bec7-true; test TEST-CASE-FLOW-c93cd44cf8e1bec7-true; evidence plan EVID-CASE-FLOW-c93cd44cf8e1bec7-true)<br>CASE-FLOW-c93cd44cf8e1bec7-false (condition evaluates false; fixture FIX-CASE-FLOW-c93cd44cf8e1bec7-false; reference REF-CASE-FLOW-c93cd44cf8e1bec7-false; test TEST-CASE-FLOW-c93cd44cf8e1bec7-false; evidence plan EVID-CASE-FLOW-c93cd44cf8e1bec7-false) |
| FLOW-bd54b5ff7a1f7d1a | `org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 16–16 | conditional_expression | `((idx & 2) == 0)` | CASE-FLOW-bd54b5ff7a1f7d1a-true (condition evaluates true; fixture FIX-CASE-FLOW-bd54b5ff7a1f7d1a-true; reference REF-CASE-FLOW-bd54b5ff7a1f7d1a-true; test TEST-CASE-FLOW-bd54b5ff7a1f7d1a-true; evidence plan EVID-CASE-FLOW-bd54b5ff7a1f7d1a-true)<br>CASE-FLOW-bd54b5ff7a1f7d1a-false (condition evaluates false; fixture FIX-CASE-FLOW-bd54b5ff7a1f7d1a-false; reference REF-CASE-FLOW-bd54b5ff7a1f7d1a-false; test TEST-CASE-FLOW-bd54b5ff7a1f7d1a-false; evidence plan EVID-CASE-FLOW-bd54b5ff7a1f7d1a-false) |
| FLOW-7bf9f8ddf5145720 | `org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 17–17 | conditional_expression | `((idx & 4) == 0)` | CASE-FLOW-7bf9f8ddf5145720-true (condition evaluates true; fixture FIX-CASE-FLOW-7bf9f8ddf5145720-true; reference REF-CASE-FLOW-7bf9f8ddf5145720-true; test TEST-CASE-FLOW-7bf9f8ddf5145720-true; evidence plan EVID-CASE-FLOW-7bf9f8ddf5145720-true)<br>CASE-FLOW-7bf9f8ddf5145720-false (condition evaluates false; fixture FIX-CASE-FLOW-7bf9f8ddf5145720-false; reference REF-CASE-FLOW-7bf9f8ddf5145720-false; test TEST-CASE-FLOW-7bf9f8ddf5145720-false; evidence plan EVID-CASE-FLOW-7bf9f8ddf5145720-false) |
| FLOW-78ea6e5d00f32ee8 | `org.dynmap.hdmap.renderer.DoorStateRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 18–31 | switch_statement | `((idx >> 4) & 3)` | CASE-FLOW-78ea6e5d00f32ee8-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-78ea6e5d00f32ee8-case-0; reference REF-CASE-FLOW-78ea6e5d00f32ee8-case-0; test TEST-CASE-FLOW-78ea6e5d00f32ee8-case-0; evidence plan EVID-CASE-FLOW-78ea6e5d00f32ee8-case-0)<br>CASE-FLOW-78ea6e5d00f32ee8-case-1 (selector matches source case label(s): 1; labels=1; fixture FIX-CASE-FLOW-78ea6e5d00f32ee8-case-1; reference REF-CASE-FLOW-78ea6e5d00f32ee8-case-1; test TEST-CASE-FLOW-78ea6e5d00f32ee8-case-1; evidence plan EVID-CASE-FLOW-78ea6e5d00f32ee8-case-1)<br>CASE-FLOW-78ea6e5d00f32ee8-case-2 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-78ea6e5d00f32ee8-case-2; reference REF-CASE-FLOW-78ea6e5d00f32ee8-case-2; test TEST-CASE-FLOW-78ea6e5d00f32ee8-case-2; evidence plan EVID-CASE-FLOW-78ea6e5d00f32ee8-case-2)<br>CASE-FLOW-78ea6e5d00f32ee8-case-3 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-78ea6e5d00f32ee8-case-3; reference REF-CASE-FLOW-78ea6e5d00f32ee8-case-3; test TEST-CASE-FLOW-78ea6e5d00f32ee8-case-3; evidence plan EVID-CASE-FLOW-78ea6e5d00f32ee8-case-3)<br>CASE-FLOW-78ea6e5d00f32ee8-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-78ea6e5d00f32ee8-unmatched; reference REF-CASE-FLOW-78ea6e5d00f32ee8-unmatched; test TEST-CASE-FLOW-78ea6e5d00f32ee8-unmatched; evidence plan EVID-CASE-FLOW-78ea6e5d00f32ee8-unmatched) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins DoorStateRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer DoorStateRenderer --fixture-set door-state-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer DoorStateRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin DoorStateRenderer
```
