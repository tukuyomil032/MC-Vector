# P-032: Cross-layer failure and consent safety

## 目的と固定対象

- 対象source/symbol: artifact/source/render/cache/IPC/UI failure transitions。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: single failure taxonomy and no false terrain/consent success path。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 025,027-031。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: failure becomes empty/success, listener starts unresolved, tile loop retries unbounded or consent persists invalid state.

## 実装作業

1. Map missing asset, malformed Anvil, unsupported version, unloaded, world mismatch, timeout, queue full, checksum failure, conflict and renderer error to stable redacted codes.
2. Guarantee failed/empty target retains old verified layer and remains retryable as appropriate.
3. Gate listener, scheduler and consent behind verified artifact/config/runtime readiness.
4. Inject failure at each download/decode/render/cache/IPC boundary and assert no partial active artifact/tile.

- 固定fixture / reference: all structured error codes through Rust event and TypeScript view; raw HTTP/path/token sanitization.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all failure transitions are deterministic, bounded and cannot enable Map or erase previous verified content.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun run check && bun run test && bun run typecheck:tests && cargo test --manifest-path src-tauri/Cargo.toml --lib
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
fix: enforce map renderer failure safety
```
