# P-028: Bounded tile scheduler and cancellation

## 目的と固定対象

- 対象source/symbol: viewport generations, per-server worker lifecycle and render deduplication。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: bounded concurrency, singleflight tile renders, cancellation and retry backoff。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 026,027。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: duplicate network snapshot/render, old generation wins, unbounded backlog or cancel deletes newer output.

## 実装作業

1. Set per-server/global worker and memory limits; deduplicate identical tile key renders.
2. Use viewport generation/identity so stale completed tasks cannot overwrite current results.
3. Cancel obsolete tasks safely while preserving reusable verified cache hits.
4. Expose queue-full, timeout, retryable, cache-hit and cancellation diagnostics without raw path/stack.

- 固定fixture / reference: same-key concurrent request, rapid viewport changes, cancel vs finish race, queue full, transient failure and cache short circuit.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: bounded resource use, singleflight and generation correctness under deterministic concurrency tests.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core scheduler
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: add bounded map render scheduler
```
