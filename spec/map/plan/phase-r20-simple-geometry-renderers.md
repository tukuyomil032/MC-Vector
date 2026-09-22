# R20: Dynmap simple geometry renderer group

## 目的

Dynmapの基本的なpatch topologyを、共通のRust `CustomRenderer`境界から実際に
生成する。単位box、任意cuboid、crossed plant、pane、frameを対象にし、代表色や
固定矩形へ置き換えず、faceごとの頂点・法線・cullface・shadeを保持する。

## 対象 source symbol

- `BoxRenderer`
- `CuboidRenderer`
- `PlantRenderer`
- `PaneRenderer`
- `FrameRenderer`

stairs、fluid、container、neighbor-dependent connectionは対象外で、後続phaseで扱う。

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/simple.rs`

## 入力データ契約

rendererは`DynmapBlockState`、`MapDataContext`、`RenderPatchFactory`を受け取る。
R20の単純形状はblock stateを直接推測せず、形状パラメータを明示する。

## 失敗状態

非有限座標、逆転したbounds、pane/frameの範囲外thickness/borderは
`UnsupportedState`として返す。guessed colorや透明成功へfallbackしない。

## fixture / Dynmap reference差分条件

- unit cube: 6 patches
- cuboid: 6 patches、指定bounds
- plant: 2 crossed patches
- pane: explicit central cuboid
- frame: 4 border cuboids
- 各patchの`cullface`、`texture_index`、`shade`、法線方向を比較する

R20ではJava reference harnessとpixel goldenは未接続であり、R29〜R31で追加する。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- 5つのsimple geometry rendererがpatchを生成する
- invalid geometryが明示的に失敗する
- patch metadataが失われない
- 既存66テストに加え、R20の形状テストが通る

Dynmap全built-inの完了条件ではない。stairs/slabs、connection、fluid、entity/tile
entityは未完了としてR21〜R28へ残る。

## Commit message

```text
feat: port dynmap basic built-in renderers
```
