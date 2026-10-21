# P-005: Warning-clean Rust renderer crate boundary

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-005",
  "kind": "common",
  "document": "phases/phase-005-renderer-core-isolation.md",
  "dependsOn": [
    "P-000",
    "P-003"
  ],
  "commitMessage": "ref: isolate map renderer core boundary"
}
```

## 目的と固定対象

- 対象source/symbol: src-tauri/crates/map-renderer-core/** and app integration boundary。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: crate/module graph with no unconnected app compilation and no warning suppression。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000,003。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: unfinished renderer silently compiled into app, Tauri types in core, lint suppression hiding unwired symbols.

## 実装作業

1. Inventory each Rust module and bind it to a phase/source symbol or remove only after explicit ownership review.
2. Keep renderer algorithm independent of Tauri, Paper Java types, filesystem cache, app state and UI.
3. Establish crate CI commands with warnings as errors; fix renderer warnings at their ownership source.
4. Prohibit blanket allow(dead_code)/unused, underscore renaming for warning hiding and changing warning policy.

- 固定fixture / reference: standalone crate check, feature-disabled app check, warning regression test in CI.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: independent core builds and clippy is clean with all renderer paths intentionally wired or explicitly pending.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check && cargo check --manifest-path src-tauri/Cargo.toml -p map-renderer-core && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
ref: isolate map renderer core boundary
```
