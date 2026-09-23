# P-026: WorldXZ/Iso tile geometry and zoom pyramid

## 目的と固定対象

- 対象source/symbol: Dynmap tile/perspective bounds plus MC-Vector zoom 0..8 contract。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: version/world/zoom tile coordinates, requested chunks and adjacent continuity。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 009,011,025。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: tile-center-only live sampling, gaps/overlaps, unbounded chunk fanout or center jump across zoom.

## 実装作業

1. Implement the existing MC-Vector product mapping exactly: WorldXZ at zoom 0..4 and IsoProjected at zoom 5..8; within each band reproduce pinned Dynmap transforms and boundaries without inventing renderer behavior.
2. Map the same world coordinate across all zoom levels, negative coordinates and dimension identity without recenter rollback.
3. Select viewport-centered live chunks while retaining geometric bounds and the bounded request cap specified by the Paper protocol phase.
4. Prove adjacent tiles share exact world/pixel boundaries and requested chunks include the visible center.

- 固定fixture / reference: zoom 0..8, center/edge coordinates, negative chunks, adjacent tile pairs, iso boundaries, zoom 4/5 transition.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all tile mappings and adjacency traces pass fixed geometry references and saved terrain fixtures.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core tiles && bun run test:map:viewport
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: implement map tile geometry and zoom pyramid
```
