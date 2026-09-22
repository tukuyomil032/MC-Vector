# P-027: Verified tile cache, stale and retry states

## 目的と固定対象

- 対象source/symbol: MC-Vector map-cache metadata and renderer/version/asset/chunk digest。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: atomic PNG+metadata cache with verified/stale/empty/failed/retryable states。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 022,023,026。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: partial success file, old unknown cache trusted, failed tile fresh-cached or checksum mismatch ignored.

## 実装作業

1. Define cache key by world/dimension/zoom/tile/renderer/version/asset and input digest.
2. Atomically stage/sync/rename output and metadata; validate PNG, dimensions, digest and renderer version on read.
3. Do not cache zero-source/transparent/error result as fresh success; preserve stale metadata semantics.
4. Invalidate by chunk_dirty footprint and retry old empty/unknown cache without deleting unrelated/user files.

- 固定fixture / reference: cache hit, corrupted PNG, missing metadata, old schema, stale chunk, interrupted write, empty terrain and concurrent install.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: only verified tile and matching metadata are reusable; failures remain retryable and atomic.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core cache && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: add verified map tile cache
```
