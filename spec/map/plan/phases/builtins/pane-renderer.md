# B-pane-renderer: Dynmap built-in renderer PaneRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-pane-renderer",
  "kind": "builtin",
  "document": "phases/builtins/pane-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin PaneRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/PaneRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/pane-renderer.rs。共通処理はdomain/model/traversalへ置く。
- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。
- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。

## Class-specific state and branch matrix

Pinned behavior inventory: [builtin-behavior-inventory.json.gz](../../../coverage/builtin-behavior-inventory.json.gz); dispatch inventory: [builtin-dispatch-inventory.json](../../../coverage/builtin-dispatch-inventory.json). These generated records are pinned to `93b454efb8802dc7406d6873434f2aeec5c636f4`; line ranges and symbol IDs are checked against the javac AST and Git blob IDs.

### Dispatch and exact configured input cases

The configuration parser is `org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void` at `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206`. The reflective class load is `Class.forName` at `DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18` from `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)`. Every `customblock:class` selector resolves through this path; classes with no pinned static record are not treated as unreachable.

| Registration evidence ID | Dispatch route | Exact evidence |
|---|---|---|
| DISPATCH-CUSTOMBLOCK-CLASS-REFLECTION | reflective custom renderer | `constructor:type:org.dynmap.hdmap.CustomBlockModel#%3cinit%3e(DynmapBlockState,BitSet,String,Map%3cString%2c%20String%3e,String)` calls `Class.forName` at DynmapCore/src/main/java/org/dynmap/hdmap/CustomBlockModel.java:18; config parser DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:336-1206 |
| REG-1ff2008ad9017cc8 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:699 |
| REG-8442384edf0b9d76 | static customblock registration | DynmapCore/src/main/resources/models_0.txt:1128 |
| REG-06c898bd8606c3e1 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:154 |
| REG-3f0fa0be2a65ad81 | static customblock registration | forge-1.12.2/src/main/resources/renderdata/TConstruct-models.txt:541 |

| Evidence ID | Pinned definition | Guard | Block selector(s) | Legacy data selector(s) | State selector(s) | Custom parameter key(s) |
|---|---|---|---|---|---|---|
| REG-1ff2008ad9017cc8 | DynmapCore/src/main/resources/models_0.txt:699 | — | glass_pane, iron_bars | * |  |  |
| REG-8442384edf0b9d76 | DynmapCore/src/main/resources/models_0.txt:1128 | 1.7.0- | stained_glass_pane | * |  |  |
| REG-06c898bd8606c3e1 | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:154 | — | %blockDarkIronBars | * |  |  |
| REG-3f0fa0be2a65ad81 | forge-1.12.2/src/main/resources/renderdata/TConstruct-models.txt:541 | — | %GlassPaneClearStained | * |  |  |

Each row above is an independent configuration fixture. Honor the parser’s exact version-guard, block-state matching, and selector expansion behavior; the observed resolved `DynmapBlockState` set is the fixture input and digest. Cover valid initialization, initialization rejection, malformed parameters, and missing required data only where the source path exposes those outcomes. A row may not be collapsed into a representative block.

| Case ID | Fixture | Reference | Focused test | Evidence plan | Exact source-backed input |
|---|---|---|---|---|
| CASE-REG-1ff2008ad9017cc8 | FIX-CASE-REG-1ff2008ad9017cc8 | REF-CASE-REG-1ff2008ad9017cc8 | TEST-CASE-REG-1ff2008ad9017cc8 | EVID-CASE-REG-1ff2008ad9017cc8 | DynmapCore/src/main/resources/models_0.txt:699; guard=—; block=glass_pane, iron_bars; data=*; state=; parameter keys= |
| CASE-REG-8442384edf0b9d76 | FIX-CASE-REG-8442384edf0b9d76 | REF-CASE-REG-8442384edf0b9d76 | TEST-CASE-REG-8442384edf0b9d76 | EVID-CASE-REG-8442384edf0b9d76 | DynmapCore/src/main/resources/models_0.txt:1128; guard=1.7.0-; block=stained_glass_pane; data=*; state=; parameter keys= |
| CASE-REG-06c898bd8606c3e1 | FIX-CASE-REG-06c898bd8606c3e1 | REF-CASE-REG-06c898bd8606c3e1 | TEST-CASE-REG-06c898bd8606c3e1 | EVID-CASE-REG-06c898bd8606c3e1 | forge-1.12.2/src/main/resources/renderdata/EnderIO-models.txt:154; guard=—; block=%blockDarkIronBars; data=*; state=; parameter keys= |
| CASE-REG-3f0fa0be2a65ad81 | FIX-CASE-REG-3f0fa0be2a65ad81 | REF-CASE-REG-3f0fa0be2a65ad81 | TEST-CASE-REG-3f0fa0be2a65ad81 | EVID-CASE-REG-3f0fa0be2a65ad81 | forge-1.12.2/src/main/resources/renderdata/TConstruct-models.txt:541; guard=—; block=%GlassPaneClearStained; data=*; state=; parameter keys= |

### Exact implementation symbols

This file contributes 12 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.PaneRenderer#SIDE_XN | field | `org.dynmap.hdmap.renderer.PaneRenderer#SIDE_XN:int` | 23–23 |
| field:type:org.dynmap.hdmap.renderer.PaneRenderer#SIDE_XP | field | `org.dynmap.hdmap.renderer.PaneRenderer#SIDE_XP:int` | 22–22 |
| field:type:org.dynmap.hdmap.renderer.PaneRenderer#SIDE_ZN | field | `org.dynmap.hdmap.renderer.PaneRenderer#SIDE_ZN:int` | 25–25 |
| field:type:org.dynmap.hdmap.renderer.PaneRenderer#SIDE_ZP | field | `org.dynmap.hdmap.renderer.PaneRenderer#SIDE_ZP:int` | 24–24 |
| field:type:org.dynmap.hdmap.renderer.PaneRenderer#TEXTURE_EDGE | field | `org.dynmap.hdmap.renderer.PaneRenderer#TEXTURE_EDGE:int` | 20–20 |
| field:type:org.dynmap.hdmap.renderer.PaneRenderer#TEXTURE_FACE | field | `org.dynmap.hdmap.renderer.PaneRenderer#TEXTURE_FACE:int` | 19–19 |
| field:type:org.dynmap.hdmap.renderer.PaneRenderer#meshes | field | `org.dynmap.hdmap.renderer.PaneRenderer#meshes:RenderPatch[][]` | 28–28 |
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#buildPatches(RenderPatchFactory) | method | `org.dynmap.hdmap.renderer.PaneRenderer#buildPatches(RenderPatchFactory)->void` | 38–76 |
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.PaneRenderer#getMaximumTextureCount()->int` | 77–80 |
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 82–109 |
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.PaneRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 30–36 |
| type:org.dynmap.hdmap.renderer.PaneRenderer | class | `org.dynmap.hdmap.renderer.PaneRenderer` | 18–110 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.PaneRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 30–36 | FLOW-3334b8bfb8716a3c |
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#buildPatches(RenderPatchFactory) | `org.dynmap.hdmap.renderer.PaneRenderer#buildPatches(RenderPatchFactory)->void` | 38–76 | none |
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.PaneRenderer#getMaximumTextureCount()->int` | 77–80 | none |
| method:type:org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 82–109 | FLOW-0675e9db52e0b16a, FLOW-125c1e9ed6b5b445, FLOW-13721c429ba20fdc, FLOW-182350c31897f4fa |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-3334b8bfb8716a3c | `org.dynmap.hdmap.renderer.PaneRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 32–33 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-3334b8bfb8716a3c-true (condition evaluates true; fixture FIX-CASE-FLOW-3334b8bfb8716a3c-true; reference REF-CASE-FLOW-3334b8bfb8716a3c-true; test TEST-CASE-FLOW-3334b8bfb8716a3c-true; evidence plan EVID-CASE-FLOW-3334b8bfb8716a3c-true)<br>CASE-FLOW-3334b8bfb8716a3c-false (condition false; no else arm; fixture FIX-CASE-FLOW-3334b8bfb8716a3c-false; reference REF-CASE-FLOW-3334b8bfb8716a3c-false; test TEST-CASE-FLOW-3334b8bfb8716a3c-false; evidence plan EVID-CASE-FLOW-3334b8bfb8716a3c-false) |
| FLOW-0675e9db52e0b16a | `org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 90–92 | if | `((t == type) \|\| t.is(DynmapBlockState.GLASS_BLOCK) \|\| (HDBlockStateTextureMap.getTransparency(t) == BlockTransparency.OPAQUE))` | CASE-FLOW-0675e9db52e0b16a-true (condition evaluates true; fixture FIX-CASE-FLOW-0675e9db52e0b16a-true; reference REF-CASE-FLOW-0675e9db52e0b16a-true; test TEST-CASE-FLOW-0675e9db52e0b16a-true; evidence plan EVID-CASE-FLOW-0675e9db52e0b16a-true)<br>CASE-FLOW-0675e9db52e0b16a-false (condition false; no else arm; fixture FIX-CASE-FLOW-0675e9db52e0b16a-false; reference REF-CASE-FLOW-0675e9db52e0b16a-false; test TEST-CASE-FLOW-0675e9db52e0b16a-false; evidence plan EVID-CASE-FLOW-0675e9db52e0b16a-false) |
| FLOW-125c1e9ed6b5b445 | `org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 95–97 | if | `((t == type) \|\| t.is(DynmapBlockState.GLASS_BLOCK) \|\| (HDBlockStateTextureMap.getTransparency(t) == BlockTransparency.OPAQUE))` | CASE-FLOW-125c1e9ed6b5b445-true (condition evaluates true; fixture FIX-CASE-FLOW-125c1e9ed6b5b445-true; reference REF-CASE-FLOW-125c1e9ed6b5b445-true; test TEST-CASE-FLOW-125c1e9ed6b5b445-true; evidence plan EVID-CASE-FLOW-125c1e9ed6b5b445-true)<br>CASE-FLOW-125c1e9ed6b5b445-false (condition false; no else arm; fixture FIX-CASE-FLOW-125c1e9ed6b5b445-false; reference REF-CASE-FLOW-125c1e9ed6b5b445-false; test TEST-CASE-FLOW-125c1e9ed6b5b445-false; evidence plan EVID-CASE-FLOW-125c1e9ed6b5b445-false) |
| FLOW-13721c429ba20fdc | `org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 100–102 | if | `((t == type) \|\| t.is(DynmapBlockState.GLASS_BLOCK) \|\| (HDBlockStateTextureMap.getTransparency(t) == BlockTransparency.OPAQUE))` | CASE-FLOW-13721c429ba20fdc-true (condition evaluates true; fixture FIX-CASE-FLOW-13721c429ba20fdc-true; reference REF-CASE-FLOW-13721c429ba20fdc-true; test TEST-CASE-FLOW-13721c429ba20fdc-true; evidence plan EVID-CASE-FLOW-13721c429ba20fdc-true)<br>CASE-FLOW-13721c429ba20fdc-false (condition false; no else arm; fixture FIX-CASE-FLOW-13721c429ba20fdc-false; reference REF-CASE-FLOW-13721c429ba20fdc-false; test TEST-CASE-FLOW-13721c429ba20fdc-false; evidence plan EVID-CASE-FLOW-13721c429ba20fdc-false) |
| FLOW-182350c31897f4fa | `org.dynmap.hdmap.renderer.PaneRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 105–107 | if | `((t == type) \|\| t.is(DynmapBlockState.GLASS_BLOCK) \|\| (HDBlockStateTextureMap.getTransparency(t) == BlockTransparency.OPAQUE))` | CASE-FLOW-182350c31897f4fa-true (condition evaluates true; fixture FIX-CASE-FLOW-182350c31897f4fa-true; reference REF-CASE-FLOW-182350c31897f4fa-true; test TEST-CASE-FLOW-182350c31897f4fa-true; evidence plan EVID-CASE-FLOW-182350c31897f4fa-true)<br>CASE-FLOW-182350c31897f4fa-false (condition false; no else arm; fixture FIX-CASE-FLOW-182350c31897f4fa-false; reference REF-CASE-FLOW-182350c31897f4fa-false; test TEST-CASE-FLOW-182350c31897f4fa-false; evidence plan EVID-CASE-FLOW-182350c31897f4fa-false) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins PaneRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer PaneRenderer --fixture-set pane-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer PaneRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin PaneRenderer
```
