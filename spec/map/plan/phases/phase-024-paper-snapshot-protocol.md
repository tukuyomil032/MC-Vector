# P-024: Paper snapshot provider, Core artifact and protocol

## 目的と固定対象

- 対象source/symbol: Paper plugin lifecycle boundary, bridge protocol, per-version child paper-snapshot pages。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: verified provider artifact, identity-bound snapshot transport and failure states。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 002,003,006,007,019。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: bridge-connected treated as terrain-ready, wrong chunk accepted, unknown snapshot as empty, renderer code added to plugin.

## 実装作業

1. Implement hello/heartbeat/reconnect/requestId, loaded/not_loaded, queue limits, cancellation and structured unavailable reason.
2. Implement version-bound Paper serializers only as data adapters; renderer logic stays Rust-only.
3. Validate server/version/world/dimension/chunk/DataVersion identity and bound packet/snapshot sizes.
4. Integrate Core artifact manifest/hash/install/restart lifecycle with the Paper provider and local release-like validation; no remote publication.
5. Run each generated version paper-snapshot child after the common protocol passes.

- 固定fixture / reference: real and loopback protocol fixtures for loaded/unloaded, wrong identity, timeout, queue full, reconnect, malformed payload and oversized snapshot.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: Paper artifact loads and data protocol is identity-safe; per-version real communication remains each version child gate.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core bridge && ./gradlew --no-daemon test
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: implement paper snapshot provider protocol
```
