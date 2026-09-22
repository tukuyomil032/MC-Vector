# R30: Dynmap fixture catalog and fixed reference traces

## 目的

R29の原典Java実行結果を、実行時生成ではなくrepositoryに固定されたfixtureとして
保存する。Rust側のテストはgoldenを更新せず、原典traceとの差分だけを検証する。

## 対象 source symbol

- `BoxRenderer`
- `CuboidRenderer`
- `PaneRenderer`
- `PlantRenderer`
- R29の`RenderPatch` trace contract

## Rust / fixture destination

- `tests/fixtures/map/dynmap-reference/r29/*.json`
- `spec/map/coverage/fixture-catalog.json`
- `scripts/verify-map-reference-fixtures.mjs`
- `package.json` の `test:map:reference:fixtures`

## 入力データ契約

fixtureは以下を固定する。

- pinned Dynmap revision
- renderer class
- fixture-only input context
- trace JSON
- asset stubの範囲
- PNG referenceが未取得であること

空の`MapDataContext`やtransparency stubを、実Minecraft asset fixtureとは呼ばない。

## 失敗状態

- fixture JSONが壊れている
- harness出力のrenderer名が一致しない
- patch count、patch順、geometry、UV、side、texture indexが一致しない
- fixture catalogの参照ファイルが存在しない

golden mismatchでfixtureを自動更新しない。

## fixture / Dynmap reference差分条件

```bash
bun run test:map:reference:fixtures
```

このコマンドはR29 harnessを実行し、固定JSONと構造比較する。4件すべてが通る場合
だけR30のcaptured trace gateを通す。

現在のcatalogはR29の4件だけで、flat／mountain／water／stairs／versioned Anvilなど
は未登録や。R31以降でfixtureを増やすまで`status: partial`を維持する。

## Rust warning gate

```bash
bun run test:map:reference:fixtures
bun run check
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## 完了条件

- R29の4 reference traceが固定される
- fixture verifierがgoldenを変更せず差分検出できる
- catalogがfixture digestと参照パスを保持する
- 実行時golden生成や自動更新の経路がない
- 未取得の全built-in／version／PNG parityをpartialのまま明示する

R30後も全renderer、実asset、Anvil、Paper、PNG pixel parityは未完了や。

## Commit message

```text
test: add dynmap renderer fixtures
```
