# R19: Dynmap built-in renderer catalog and registry

## 目的

Pinned Dynmap revision `93b454efb8802dc7406d6873434f2aeec5c636f4` の
`hdmap/renderer` に存在する全 built-in renderer を、実装済みと誤認しない
registryへ固定する。R19はrenderer本体の移植完了ではなく、39クラスそれぞれに
source path、Rust destination、fixtures、reference trace、pixel golden、実装状態を
要求する閉包の入口である。

## 対象 source symbol

- `DynmapCore/src/main/java/org/dynmap/hdmap/renderer/*.java`
- `spec/map/coverage/builtin-renderers.json`

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/mod.rs`

`BuiltinRendererRegistry` はJSON catalogを読み、revision drift、重複class、必須
metadata欠落、未知の実装状態を拒否する。`is_complete()` は全entryが
`verified` の場合だけtrueを返す。

## 入力データ契約

catalogは次を全entryに持つ。

- `class`
- `sourcePath`
- `sourceRevision`
- `rustModule`
- `requiredAssets`
- `fixtures`
- `referenceTrace`
- `pixelGolden`
- `implementationStatus`

## 失敗状態

`InvalidJson`、`MissingEntries`、`MissingField`、`InvalidField`、
`SourceRevisionMismatch`、`DuplicateClass`、`EmptyClass` を返す。
未実装rendererは成功扱いせず `not_started` のまま保持する。

## fixture / reference差分条件

R19ではregistry metadataの構造と39件の一意性だけを検証する。patch、ray、pixel
parityは各renderer移植フェーズで固定fixtureとDynmap reference harnessを追加する。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- pinned catalogの39 rendererがregistryへ登録される
- registryがrevision driftと重複classを拒否する
- `not_started` を `verified` として扱わない
- `map-renderer-core` がwarningなしで通る

R19では built-in renderer本体、fixture、reference capture、pixel goldenは未完了で
あり、R20〜R28でクラス群ごとに実装する。

## Commit message

```text
chore: catalog dynmap built-in renderers
```
