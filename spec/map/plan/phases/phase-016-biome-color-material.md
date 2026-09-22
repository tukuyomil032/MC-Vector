# P-016: Biome tint, color multipliers and materials

## 目的と固定対象

- 対象source/symbol: CustomColorMultiplier implementations, biome lookup, grass/foliage/water colors。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: versioned biome/material RGBA multiplier and missing-data semantics。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 006,007,012,014。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: fixed biome color, missing biome defaulted, multiplier order changed or material alpha guessed.

## 実装作業

1. Port grass/foliage/water tint and each pinned CustomColorMultiplier algorithm.
2. Use exact world/biome sample coordinates and neighbor rules required by Dynmap.
3. Preserve material opacity/cutout/translucent/emissive classification and compositing inputs.
4. Version-bind colormap/resource hashes and record raw biome ID to resolved color trace.

- 固定fixture / reference: same block across distinct biomes, tint enabled/disabled, missing biome, foliage, grass, water, mod color multipliers.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: biome identity, multiplier output, material and sampled color trace match Java.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core shaders::color && bun run test:map:reference
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap biome colors and materials
```
