# R21: Dynmap stairs, slabs, and rotated geometry

## 目的

Dynmapのstairs state分岐を、block stateの`half`、`facing`、`shape`へ明示的に
対応させる。slabのbottom/top/doubleと、回転box／回転patchも同じpatch geometry
契約へ入れる。

## 対象 source symbol

- `StairBlockRenderer`
- `StairStateRenderer`
- `RotatedBoxRenderer`
- `RotatedPatchRenderer`
- slab形状に使われるDynmap patch/model分岐

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/advanced.rs`

## 入力データ契約

state propertiesは、存在しない場合だけDynmapの通常値へ寄せ、未知の値は
`UnsupportedState`として拒否する。回転はblock中心を基準に90度単位で行い、
patchのcullfaceとstepも同時に回転する。

## 失敗状態

未知の`half`、`facing`、`shape`、slab typeはguessed geometryへfallbackしない。
非有限boundsはsimple geometry側で拒否する。

## fixture / Dynmap reference差分条件

- straight / inner_left / inner_right / outer_left / outer_right
- bottom / top stair
- north / south / west / east
- bottom / top / double slab
- quarter-turn rotated box/patch
- patch count、bounds、cullface、step、法線を比較する

Java reference traceとpixel parityはR29〜R31で接続するため、R21単体では未完了の
差分証拠が残る。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- state-driven stair meshが5 shapeを拒否なく生成する
- slabの3種を生成する
- rotated box/patchがpatch countを維持して座標とface stepを回転する
- unknown propertyは明示的に失敗する

隣接blockによるconnection、waterlogged、texture割当、Java reference/pixel goldenは
後続のR23、R29〜R31で検証する。

## Commit message

```text
feat: port dynmap stair and slab renderers
```
