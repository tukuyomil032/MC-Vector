# P-003: Apache-2.0 source attribution and distribution boundary

## 目的と固定対象

- 対象source/symbol: pinned Dynmap source/resource licenses, vendored Java reference snapshot, Rust origin manifest。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: NOTICE, license records, per-module origin IDs, redistributed asset policy。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000,001。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: unknown provenance, missing attribution, asset redistribution without policy, copied executable source in app package.

## 実装作業

1. Retain pinned commit, upstream paths, copyright/license notices, translation statement and source hash.
2. Separate Rust translations, Java reference-only harness, fixture data, Minecraft assets, mod assets and MC-Vector-authored code.
3. Define which assets may be downloaded at runtime versus stored as redistributable fixtures; record source/licensing proof per item.
4. Verify release/package excludes unrelated Dynmap web/storage/lifecycle binaries and user Minecraft assets.

- 固定fixture / reference: origin manifest completeness, source revision mismatch, missing license, asset allowlist and package contents checks.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: every vendored/translated/reference/resource artifact has an auditable license and provenance decision.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/verify-map-renderer-source.mjs && bun scripts/verify-map-renderer-package-boundary.mjs
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
chore: define map renderer source and license boundary
```
