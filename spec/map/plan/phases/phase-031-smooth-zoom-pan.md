# P-031: Cursor-anchored continuous zoom and committed pan

## 目的と固定対象

- 対象source/symbol: MapView viewport interactions and project/unproject functions。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: continuous preview transform with verified target tile swapping。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 026,027,029,030。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: blank grid during target generation, cursor-world drift, no center commit, over-boundary request, raw floating precision in UI.

## 実装作業

1. Preserve renderedZoom/previewZoom/targetZoom/previewScale/anchor separately and format fractional display to two decimals.
2. Unproject cursor to world coordinate, debounce integer backend target, retain old valid layer until all target tiles verified.
3. Commit pointerup displacement to canonical world center and request adjacent tiles with new center.
4. Apply same center anchor for +/- controls; clamp 0..8; maintain marker/player/boundary layers under one transform.

- 固定fixture / reference: project/unproject roundtrip for WorldXZ/IsoProjected, center/edges, zoom 8→0, preview during render, failure retention, pan pointerup commit.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: automated anchor/pan tests pass and real UI manipulation is recorded in every required real acceptance.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun run typecheck:tests && bun run test -- map-viewport-interaction
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: add cursor anchored map zoom and pan
```
