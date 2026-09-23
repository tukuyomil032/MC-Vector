# P-022: Pixel rasterization and alpha compositing

## 目的と固定対象

- 対象source/symbol: Dynmap buffered image, pixel writer, HD perspective render output。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: deterministic tile RGBA and PNG encoding boundary。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 014,016,017,018。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: coverage-only success, transparent PNG marked terrain, encoder nondeterminism or changed alpha order.

## 実装作業

1. Port scanline/pixel placement, texture sampling, shade/tint/lighting order and alpha compositing.
2. Define clipping, tile edge and empty-pixel behavior from reference.
3. Use deterministic color conversion and PNG encoder settings; hash normalized RGBA separately from PNG bytes.
4. Track pixel provenance through face, texture, shader, lighting and compositing.

- 固定fixture / reference: overlapping opaque/cutout/translucent faces, tile edges, alpha 0/partial/255, clipping, color rounding.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: pixel coordinates and normalized RGBA equal Java oracle on fixed raster fixtures.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core renderer::png && bun run test:map:reference
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap raster and alpha compositing
```
