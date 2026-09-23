# P-016: Biome tint, color multipliers and materials

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-016",
  "kind": "common",
  "document": "phases/phase-016-biome-color-material.md",
  "dependsOn": [
    "P-006",
    "P-007",
    "P-012",
    "P-014"
  ],
  "commitMessage": "feat: port dynmap biome colors and materials"
}
```

## 目的と固定対象

- 対象source/symbol: ColorScheme, DefaultHDShader biome color resolution, every CustomColorMultiplier, biome lookup, grass/foliage/water tint, and material alpha/emission。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: Rust biome/color-scheme resolver with exact Dynmap file precedence, interpolation, per-version RGBA tables, and missing-data failures。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 006,007,012,014。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: Fixed or guessed biome color, defaulting missing biome/table data, changed multiplier order, unverified colormap bytes, path traversal, or guessed material alpha fails this phase.

## 実装作業

1. Port the pinned ColorScheme file-open order: biome_rainfall_temp.txt, default.txt, then the configured preset; reproduce comment/blank handling, token parsing, block/biome indexing, later-file override precedence, and rainfall/temperature interpolation.
2. Resolve the selected scheme exactly as DefaultHDShader does; reject path traversal, absent files, malformed/truncated rows, and invalid block or biome indices instead of synthesizing colors.
3. Port every pinned CustomColorMultiplier and grass/foliage/water lookup with exact biome identity, sample coordinates, neighbor reads, and version-specific table values.
4. Preserve material opacity, cutout, translucent, emissive, and alpha-compositing inputs; do not infer material behavior from texture color alone.
5. Bind colormap/resource hashes and record raw biome ID, selected scheme, winning override file, interpolation inputs, and final RGBA in the Java reference trace.
## Exact color-scheme resource set and per-resource plans

The pinned inventory contains these 12 selectable/base files. Each file is opened directly or is reachable through the configured `DefaultHDShader` scheme name; this is a source reachability statement, not a redistribution grant.

| Exact resource path | Role in load order |
|---|---|
| `DynmapCore/src/main/resources/extracted/colorschemes/amidst.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/biome_rainfall_temp.txt` | first/base table |
| `DynmapCore/src/main/resources/extracted/colorschemes/default.txt` | second/default table and default selected scheme |
| `DynmapCore/src/main/resources/extracted/colorschemes/dokudark.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/dokuhigh.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/dokulight.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/flames.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/misa.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/ovocean.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/sk89q.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/sphax.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/standard.txt` | selectable scheme input |

Per-blob copyright/license inspection remains P-003 work. Do not copy any of these bytes into an MC-Vector bundle while `licenseStatus` is unverified.

## Source-derived fixture and capture schema

For each path-derived `FIX-RES-COLORSCHEME-<path digest>` / `REF-RES-COLORSCHEME-<path digest>` pair, capture the exact input bytes digest, selected scheme, all three file-open results and order, parsed row/index tuples, override winner, interpolation inputs, resolved color-table digest, and downstream shader RGBA for a fixed block/biome sample. The Java reference must use identical input bytes, distinguish open/read/parse errors, and pin output JSON/PNG hashes before Rust comparison. `TEST-RES-COLORSCHEME-<path digest>` covers malformed lines, out-of-range indices, missing preset/default table, and duplicate override precedence.

## Exact packaged grass/foliage colormap texture resources

The AST-pinned constants are `field:type:org.dynmap.hdmap.TexturePack#GRASSCOLOR_RP_PNG` at `TexturePack.java:70` and `field:type:org.dynmap.hdmap.TexturePack#FOLIAGECOLOR_RP_PNG` at `:72`; their exact initializer paths are `assets/minecraft/textures/colormap/grass.png` and `assets/minecraft/textures/colormap/foliage.png`. The inventory has exactly these two matching packaged blobs. The runtime constructor at `TexturePack.java:626-793` explicitly opens the names through the two-name `TexturePackLoader.openTPResource` path and sends decoded images to `loadBiomeShadingImage` (`TexturePack.java:1364-1396`). The actual fallback filename choice and resulting biome sample must follow the pinned caller order; these packaged PNGs are only the selected primary paths.

Each of the two exact paths is assigned to P-016 with `FIX-LEGACY-BIOME-COLORMAP-<first-20-hex-of-SHA256(sourcePath)>`, `REF-LEGACY-BIOME-COLORMAP-<same-id>`, and `TEST-LEGACY-BIOME-COLORMAP-<same-id>`. Capture selected path, source precedence/winner, byte digest, image dimensions, decoded lookup coordinate, loaded color sample, and final per-biome multiplier output. Missing/corrupt primary and alternate files remain distinct failures. License and global resource closure stay open; no image bytes are copied into fixtures before per-resource license review.

- 固定fixture / reference: Every pinned scheme path plus selected custom scheme; three-file load/override order; malformed, missing, truncated, out-of-range inputs; same block across distinct biomes; tint on/off; grass, foliage, water, and each custom multiplier.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: ColorScheme parsing/load order, biome identity, multiplier output, material class, and sampled RGBA trace match the pinned Java reference for every in-scope resource/version fixture.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core shaders::color && bun run test:map:reference && node spec/map/plan/tools/materialize-colorscheme-resource-candidates.mjs --check && git diff --check
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap biome colors and materials
```
