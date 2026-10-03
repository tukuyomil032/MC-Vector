# P-020: Complete built-in renderer registry

## 目的と固定対象

- 対象source/symbol: all 39 pinned hdmap/renderer Java classes and registration call sites。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: one-to-one registry map and 39 child phase ownership entries。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000,019。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: unregistered class, catalog-only class without phase file, false translated-as-verified or third-party renderer added as core built-in.

## 実装作業

1. Compare Java AST class list and registration references with the 39 candidate catalog.
2. Record identifiers, state selectors, version/mod gates, construction inputs and implementation page for each class.
3. Add generator/coverage rule that newly discovered upstream built-in adds a child phase before implementation.
4. Mark every old translated flag unverified until child fixture/reference/pixel gate passes.

- 固定fixture / reference: source class/registration set equality, duplicate registration, unknown class and all condition branches.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: every pinned Dynmap built-in has exactly one child page and a registry owner; no extra claimed built-in.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun spec/map/plan/tools/generate-phase-files.mjs --check && bun scripts/check-map-renderer-coverage.mjs --require-builtin-plan-owners
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
chore: map every dynmap builtin to an implementation phase
```
