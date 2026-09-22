# P-009: Matrix/vector and HD perspective transforms

## 目的と固定対象

- 対象source/symbol: Matrix3D, Vector3D, HDPerspective, IsoHDPerspective, HDPerspectiveState。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: operation-order-compatible transform/projection/ray setup and exact tile bounds。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 004,006。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: algebraically similar but reordered floating operations causing trace/pixel drift, arbitrary clamping or world-center rollback.

## 実装作業

1. Port matrix multiplication, inverse, determinant, vector operations and floating-point order from pinned Java source.
2. Port azimuth/inclination/shear/scale and world↔map projection, pixel↔ray construction and perspective state.
3. Port tile coordinates, bounds, required chunks and adjacent tile transforms with exact boundary rules.
4. Trace each transform stage against Java fixtures, including negative values and numerical singularities.

- 固定fixture / reference: matrix basis/inverse, known orientation/ray, each tile corner/edge, negative coordinates, adjacent tiles, singular/near-singular inputs.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all pinned transform and tile-bound traces match under fixed numeric tolerance defined by reference capture.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core renderer::dynmap::transform && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap matrix and perspective transforms
```
