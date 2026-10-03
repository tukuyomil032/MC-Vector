# P-033: Renderer input bounds, security and memory

## 目的と固定対象

- 対象source/symbol: ZIP/NBT/Anvil/model/texture/cache/network inputs and worker concurrency。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: explicit byte/count/time/memory ceilings with safe cancellation。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 007,008,011,027-029。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: unbounded allocation, panic, path escape, partial write, stack/secret leak.

## 実装作業

1. Set hard limits for region/NBT/compressed chunk/model/texture/archive/atlas/tile/snapshot/queue sizes and document each constant.
2. Reject path traversal, zip bombs, duplicate identities, decompression bombs, integer overflow, malformed recursion and oversized JSON/model inheritance.
3. Bound pixel ray count, block traversal, per-server parallelism, memory and time; cancellation must release buffers.
4. Property/fuzz test parsers and recover without panic, partial cache writes or secret-bearing diagnostics.

- 固定fixture / reference: boundary at limit/limit+1, overflow, cyclic model parent, corrupt zip/NBT, timeout, cancel, memory-budget concurrency.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all untrusted inputs bounded and security/fuzz suites produce structured errors with no panic.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo fuzz run map_input_parsers && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
fix: bound map renderer resource usage
```
