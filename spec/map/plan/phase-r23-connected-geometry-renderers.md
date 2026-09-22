# R23: Dynmap connected fence, wall, and pane geometry

## 目的

近傍blockをrenderer contextから取得し、fence、wall、paneの接続方向をpatch
topologyへ反映する。接続情報が取れないときに「接続なし」と推測して描画を確定
しない。

## 対象 source symbol

- `FenceWallBlockRenderer`
- `FenceWallBlockStateRenderer`
- `PaneRenderer`
- `MapDataContext` neighbor lookup

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/connected.rs`

## 入力データ契約

originのnorth/east/south/westへ`MapDataContext::neighbor_state`を行い、block名の
family分類で接続を決める。neighbor chunk/sectionがmissingの場合は
`CustomRendererError::Chunk`を返す。

## 失敗状態

missing neighbor、unloaded neighbor、malformed stateは明示的エラーとする。未知の
blockをconnectableとして扱わない。

## fixture / Dynmap reference差分条件

- 4方向全接続
- 接続なしの中央post
- fence / wall / pane family
- neighbor section missing
- patch count、arm bounds、中心post bounds、face orientation

Java reference harnessとpixel parityはR29〜R31で接続する。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- contextの4方向neighborが接続patchへ変換される
- fence/wall/paneがfamily別に動作する
- missing neighborをdisconnectへ黙って変換しない
- warning-cleanでfocused testsが通る

wallの高さ差分、paneの全variant、waterlogged、neighbor chunk boundary、Dynmap
reference/pixel parityは未完了で後続へ残る。

## Commit message

```text
feat: port dynmap connected geometry renderers
```
