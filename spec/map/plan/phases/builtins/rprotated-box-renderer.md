# B-rprotated-box-renderer: Dynmap built-in renderer RPRotatedBoxRenderer

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "B-rprotated-box-renderer",
  "kind": "builtin",
  "document": "phases/builtins/rprotated-box-renderer.md",
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
  "commitMessage": "feat: port dynmap builtin RPRotatedBoxRenderer"
}
```

## 固定範囲とowner

- Pinned Java source: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RPRotatedBoxRenderer.java。revision 93b454efb8802dc7406d6873434f2aeec5c636f4、Apache-2.0。
- Rust destination: src-tauri/crates/map-renderer-core/src/builtins/rprotated-box-renderer.rs。共通処理はdomain/model/traversalへ置く。
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

This file contributes 10 AST declarations. Every declaration is listed below; method/constructor behavior rows provide a second index to the control-flow inventory.

| AST symbol ID | Kind | Exact source signature/name | Source lines |
|---|---|---|---:|
| field:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#models | field | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#models:RenderPatch[][]` | 40–40 |
| field:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#rotTable | field | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#rotTable:int[][]` | 13–37 |
| field:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#rotalg | field | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#rotalg:int[]` | 38–38 |
| field:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#rotgrid | field | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#rotgrid:int[][]` | 71–77 |
| field:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#tileEntityAttribs | field | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#tileEntityAttribs:String[]` | 43–43 |
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getMaximumTextureCount() | method | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getMaximumTextureCount()->int` | 61–64 |
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext) | method | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 79–108 |
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getTileEntityFieldsNeeded() | method | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getTileEntityFieldsNeeded()->String[]` | 66–69 |
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | method | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 45–59 |
| type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer | class | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer` | 11–109 |

| AST symbol ID | Exact pinned signature | Source lines | Branch IDs |
|---|---|---:|---|
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map%3cString%2c%20String%3e) | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` | 45–59 | FLOW-a9f3771604dc42c0, FLOW-65aed38a2432d4b0, FLOW-b1137c5991f570f6 |
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getMaximumTextureCount() | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getMaximumTextureCount()->int` | 61–64 | none |
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getTileEntityFieldsNeeded() | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getTileEntityFieldsNeeded()->String[]` | 66–69 | none |
| method:type:org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext) | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` | 79–108 | FLOW-0e9fe31a21eb4241, FLOW-0144df7d5e68769a, FLOW-16b64fdc252eacbd, FLOW-30afb1c9a152ac90, FLOW-29dd354872fbde9a, FLOW-43e5181b5d2456b6 |

### Source-derived branch/outcome matrix

Every AST control-flow site below has an independent input fixture, Java reference trace, and focused Rust test. For numeric comparisons, the fixture set must straddle the literal boundary and include equality when the operator permits it; for switch sites, cover every listed case label plus unmatched flow when there is no default; for loops, cover zero, one, and source-derived maximum iterations. Do not replace source-derived outcomes with a visual-only PNG check.

| Branch ID | Exact method / source | Kind | Pinned condition or selector | Required outcomes and per-outcome proof IDs |
|---|---|---|---|---|
| FLOW-a9f3771604dc42c0 | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 47–48 | if | `(!super.initializeRenderer(rpf, blkname, blockdatamask, custparm))` | CASE-FLOW-a9f3771604dc42c0-true (condition evaluates true; fixture FIX-CASE-FLOW-a9f3771604dc42c0-true; reference REF-CASE-FLOW-a9f3771604dc42c0-true; test TEST-CASE-FLOW-a9f3771604dc42c0-true; evidence plan EVID-CASE-FLOW-a9f3771604dc42c0-true)<br>CASE-FLOW-a9f3771604dc42c0-false (condition false; no else arm; fixture FIX-CASE-FLOW-a9f3771604dc42c0-false; reference REF-CASE-FLOW-a9f3771604dc42c0-false; test TEST-CASE-FLOW-a9f3771604dc42c0-false; evidence plan EVID-CASE-FLOW-a9f3771604dc42c0-false) |
| FLOW-65aed38a2432d4b0 | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 52–57 | for_loop | `i < 16` | CASE-FLOW-65aed38a2432d4b0-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-65aed38a2432d4b0-iterate; reference REF-CASE-FLOW-65aed38a2432d4b0-iterate; test TEST-CASE-FLOW-65aed38a2432d4b0-iterate; evidence plan EVID-CASE-FLOW-65aed38a2432d4b0-iterate)<br>CASE-FLOW-65aed38a2432d4b0-exit (condition is false; fixture FIX-CASE-FLOW-65aed38a2432d4b0-exit; reference REF-CASE-FLOW-65aed38a2432d4b0-exit; test TEST-CASE-FLOW-65aed38a2432d4b0-exit; evidence plan EVID-CASE-FLOW-65aed38a2432d4b0-exit) |
| FLOW-b1137c5991f570f6 | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#initializeRenderer(RenderPatchFactory,String,BitSet,Map<String, String>)->boolean` 54–56 | if | `(v != null)` | CASE-FLOW-b1137c5991f570f6-true (condition evaluates true; fixture FIX-CASE-FLOW-b1137c5991f570f6-true; reference REF-CASE-FLOW-b1137c5991f570f6-true; test TEST-CASE-FLOW-b1137c5991f570f6-true; evidence plan EVID-CASE-FLOW-b1137c5991f570f6-true)<br>CASE-FLOW-b1137c5991f570f6-false (condition false; no else arm; fixture FIX-CASE-FLOW-b1137c5991f570f6-false; reference REF-CASE-FLOW-b1137c5991f570f6-false; test TEST-CASE-FLOW-b1137c5991f570f6-false; evidence plan EVID-CASE-FLOW-b1137c5991f570f6-false) |
| FLOW-0e9fe31a21eb4241 | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 83–85 | if | `(rot instanceof Number)` | CASE-FLOW-0e9fe31a21eb4241-true (condition evaluates true; fixture FIX-CASE-FLOW-0e9fe31a21eb4241-true; reference REF-CASE-FLOW-0e9fe31a21eb4241-true; test TEST-CASE-FLOW-0e9fe31a21eb4241-true; evidence plan EVID-CASE-FLOW-0e9fe31a21eb4241-true)<br>CASE-FLOW-0e9fe31a21eb4241-false (condition false; no else arm; fixture FIX-CASE-FLOW-0e9fe31a21eb4241-false; reference REF-CASE-FLOW-0e9fe31a21eb4241-false; test TEST-CASE-FLOW-0e9fe31a21eb4241-false; evidence plan EVID-CASE-FLOW-0e9fe31a21eb4241-false) |
| FLOW-0144df7d5e68769a | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 86–96 | switch_statement | `(rotalg[ctx.getBlockType().stateIndex])` | CASE-FLOW-0144df7d5e68769a-case-0 (selector matches source case label(s): 0; labels=0; fixture FIX-CASE-FLOW-0144df7d5e68769a-case-0; reference REF-CASE-FLOW-0144df7d5e68769a-case-0; test TEST-CASE-FLOW-0144df7d5e68769a-case-0; evidence plan EVID-CASE-FLOW-0144df7d5e68769a-case-0)<br>CASE-FLOW-0144df7d5e68769a-case-1 (selector matches source case label(s): 2; labels=2; fixture FIX-CASE-FLOW-0144df7d5e68769a-case-1; reference REF-CASE-FLOW-0144df7d5e68769a-case-1; test TEST-CASE-FLOW-0144df7d5e68769a-case-1; evidence plan EVID-CASE-FLOW-0144df7d5e68769a-case-1)<br>CASE-FLOW-0144df7d5e68769a-case-2 (selector matches source case label(s): 3; labels=3; fixture FIX-CASE-FLOW-0144df7d5e68769a-case-2; reference REF-CASE-FLOW-0144df7d5e68769a-case-2; test TEST-CASE-FLOW-0144df7d5e68769a-case-2; evidence plan EVID-CASE-FLOW-0144df7d5e68769a-case-2)<br>CASE-FLOW-0144df7d5e68769a-unmatched (selector matches no listed case label and the switch has no default arm; labels=<no matching label and no default>; fixture FIX-CASE-FLOW-0144df7d5e68769a-unmatched; reference REF-CASE-FLOW-0144df7d5e68769a-unmatched; test TEST-CASE-FLOW-0144df7d5e68769a-unmatched; evidence plan EVID-CASE-FLOW-0144df7d5e68769a-unmatched) |
| FLOW-16b64fdc252eacbd | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 94–94 | if | `(idx > 3)` | CASE-FLOW-16b64fdc252eacbd-true (condition evaluates true; fixture FIX-CASE-FLOW-16b64fdc252eacbd-true; reference REF-CASE-FLOW-16b64fdc252eacbd-true; test TEST-CASE-FLOW-16b64fdc252eacbd-true; evidence plan EVID-CASE-FLOW-16b64fdc252eacbd-true)<br>CASE-FLOW-16b64fdc252eacbd-false (condition false; no else arm; fixture FIX-CASE-FLOW-16b64fdc252eacbd-false; reference REF-CASE-FLOW-16b64fdc252eacbd-false; test TEST-CASE-FLOW-16b64fdc252eacbd-false; evidence plan EVID-CASE-FLOW-16b64fdc252eacbd-false) |
| FLOW-30afb1c9a152ac90 | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 97–99 | if | `((idx < 0) \|\| (idx >= models.length))` | CASE-FLOW-30afb1c9a152ac90-true (condition evaluates true; fixture FIX-CASE-FLOW-30afb1c9a152ac90-true; reference REF-CASE-FLOW-30afb1c9a152ac90-true; test TEST-CASE-FLOW-30afb1c9a152ac90-true; evidence plan EVID-CASE-FLOW-30afb1c9a152ac90-true)<br>CASE-FLOW-30afb1c9a152ac90-false (condition false; no else arm; fixture FIX-CASE-FLOW-30afb1c9a152ac90-false; reference REF-CASE-FLOW-30afb1c9a152ac90-false; test TEST-CASE-FLOW-30afb1c9a152ac90-false; evidence plan EVID-CASE-FLOW-30afb1c9a152ac90-false) |
| FLOW-29dd354872fbde9a | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 100–106 | if | `(models[idx] == null)` | CASE-FLOW-29dd354872fbde9a-true (condition evaluates true; fixture FIX-CASE-FLOW-29dd354872fbde9a-true; reference REF-CASE-FLOW-29dd354872fbde9a-true; test TEST-CASE-FLOW-29dd354872fbde9a-true; evidence plan EVID-CASE-FLOW-29dd354872fbde9a-true)<br>CASE-FLOW-29dd354872fbde9a-false (condition false; no else arm; fixture FIX-CASE-FLOW-29dd354872fbde9a-false; reference REF-CASE-FLOW-29dd354872fbde9a-false; test TEST-CASE-FLOW-29dd354872fbde9a-false; evidence plan EVID-CASE-FLOW-29dd354872fbde9a-false) |
| FLOW-43e5181b5d2456b6 | `org.dynmap.hdmap.renderer.RPRotatedBoxRenderer#getRenderPatchList(MapDataContext)->RenderPatch[]` 103–105 | for_loop | `side < 6` | CASE-FLOW-43e5181b5d2456b6-iterate (execute body while condition is true; fixture FIX-CASE-FLOW-43e5181b5d2456b6-iterate; reference REF-CASE-FLOW-43e5181b5d2456b6-iterate; test TEST-CASE-FLOW-43e5181b5d2456b6-iterate; evidence plan EVID-CASE-FLOW-43e5181b5d2456b6-iterate)<br>CASE-FLOW-43e5181b5d2456b6-exit (condition is false; fixture FIX-CASE-FLOW-43e5181b5d2456b6-exit; reference REF-CASE-FLOW-43e5181b5d2456b6-exit; test TEST-CASE-FLOW-43e5181b5d2456b6-exit; evidence plan EVID-CASE-FLOW-43e5181b5d2456b6-exit) |
## 実装タスク

1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。
2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。
3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。
4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。
5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。

## 失敗条件と検証

Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins RPRotatedBoxRenderer
bun scripts/run-dynmap-reference-harness.mjs --renderer RPRotatedBoxRenderer --fixture-set rprotated-box-renderer
bun scripts/verify-map-reference-fixtures.mjs --renderer RPRotatedBoxRenderer
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
```

Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。

## Commit

```text
feat: port dynmap builtin RPRotatedBoxRenderer
```
