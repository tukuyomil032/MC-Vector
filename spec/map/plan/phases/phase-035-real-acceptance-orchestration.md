# P-035: All-version Paper/Tauri acceptance runs

## 目的と固定対象

- 対象source/symbol: all exact-version real-acceptance pages and evidence matrix。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: one evidence record per exact release and final UI/process/port results。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 023-034 and every version real-acceptance child。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: missing version row, Paper mock, app stopped by force without UI evidence, port check omitted, evidence without hashes/commit.

## 実装作業

1. Provision version-matched Paper and Java runtime for each matrix entry; if unavailable, keep that version blocked and continue independent versions.
2. Execute the version-specific real-acceptance command and manual UI sequence from each child page.
3. Record plugin load, hello/heartbeat, loaded snapshots, actual terrain, cache, zoom/pan, failure safety and artifact digests per release.
4. Stop Paper via app UI; record process exit and port 25565 release before closing app.
5. Never copy evidence from fixture/mock/smoke or a neighboring version.

- 固定fixture / reference: real server worlds and client assets for every exact version; no synthetic-only substitution.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all 48 baseline exact releases have independently verified real evidence; unresolved row blocks entire Goal.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/check-map-acceptance-evidence.mjs --require-complete
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
test: record complete map renderer real acceptance
```
