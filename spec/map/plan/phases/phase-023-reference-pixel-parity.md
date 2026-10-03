# P-023: Full intermediate trace and pixel parity

## 目的と固定対象

- 対象source/symbol: all required symbols/resources/built-ins and immutable Java capture set。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: fixture-catalog keyed Java/Rust intermediate parity report and pixel goldens。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 004,009-022。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: unexplained pixel delta, reference made by Rust, missing symbol fixture, tolerance enlarged without source-level cause.

## 実装作業

1. Bind each required source symbol to at least one exercising reference fixture or a source-proved adapter boundary.
2. Cover flat, mountain/cliff, water/lava, forest/leaves, snow, stairs/slabs, doors, fences/walls/panes, glass, rails/redstone, containers/heads, CTM, boundary, negative coordinate, malformed/unloaded and custom pack.
3. Compare traversal, model, texture, UV, lighting, shader, tile boundary, alpha, normalized RGBA and PNG hash independently.
4. Freeze capture input/source/tool hashes before tests and do not regenerate expected values from Rust.

- 固定fixture / reference: versioned fixture catalog with input, asset, reference trace/PNG digest and expected structured diagnostics.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: required symbol/resource/builtin reference coverage complete; all intermediate/pixel comparisons pass.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun run test:map:reference:fixtures && cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_reference_parity
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
test: enforce full dynmap reference and pixel parity
```
