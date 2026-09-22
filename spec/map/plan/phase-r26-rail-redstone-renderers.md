# R26: Dynmap rail and redstone renderers

## 目的

railのshapeとredstone wireの接続値を、明示的なsurface/side patchへ変換する。
state indexや代表色へ暗黙にfallbackせず、unknown topologyを失敗として扱う。

## 対象 source symbol

- `RailCraftTrackRenderer`
- rail shape variants
- `RedstoneWireRenderer`
- `RedstoneWireStateRenderer`

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/rails.rs`

## 入力データ契約

rail: `north_south`、`east_west`、`ascending_north/south/east/west`。
redstone: cardinal property `none`、`side`、`up`。

## 失敗状態

unknown shape、invalid connection valueは`UnsupportedState`とする。railを平面の
代表形状へ、redstoneを常時crossへ置き換えない。

## fixture / Dynmap reference差分条件

- six rail shape
- four redstone connection values
- side/up patch
- patch order、surface bounds、texture index、shade

neighbor-derived redstone connectionとJava reference/pixel parityはR29〜R31で接続する。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- rail shapeを6種生成する
- redstone connectionをside/up含めて生成する
- invalid topologyを拒否する
- warning-cleanでfocused testsが通る

RailCraft tile entity、powered railの特殊光、完全なneighbor lookup、reference/pixel
parityは後続で継続する。

## Commit message

```text
feat: port dynmap rail and redstone renderers
```
