# P-021: 39 individual built-in renderer phases

## 目的と固定対象

- 対象source/symbol: generated-index.md and 39 child pages under phases/builtins/。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: 39 independently committed implementations and reference evidence rows。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 004,006,009-020。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: child skipped because another renderer is similar, class covered only by family-level visual test, or evidence inherited from adjacent class.

## 実装作業

1. Execute each B-* child in dependency order; each class owns one commit and one AST-symbol subset.
2. Split any source class whose methods do not form one reviewable task into additional symbol-group child phases before coding it.
3. For mod-integrated built-ins use isolated API data fixtures; do not copy third-party renderer implementations.
4. Run the registry-wide cross-renderer fixture after the final class and check registration collisions.

- 固定fixture / reference: 39 class-specific source-branch fixture sets plus registry interaction fixtures.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all 39 child pages passed and class-specific reference/pixel evidence is recorded.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/check-map-renderer-coverage.mjs --require-all-builtins && bun run test:map:reference:fixtures
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: complete dynmap builtin renderer set
```
