# R22: Dynmap doors, trapdoors, and fence gates

## 目的

開閉、向き、hinge、half、in-wallを持つthin geometryを、block stateから明示的に
patchへ変換する。door／trapdoor／fence gateを単一の代表色や常時閉状態へ
fallbackしない。

## 対象 source symbol

- `DoorRenderer`
- `DoorStateRenderer`
- `FenceGateBlockStateRenderer`
- Minecraft blockstateのdoor/trapdoor/fence-gate state

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/doors.rs`
- `src-tauri/crates/map-renderer-core/src/builtins/advanced.rs`

## 入力データ契約

- door: `facing`, `open`, `hinge`, `half`
- trapdoor: `facing`, `open`, `half`
- fence gate: `facing`, `open`, `in_wall`

未知の値は明示的な`UnsupportedState`とする。

## 失敗状態

boolean propertyが`true`/`false`以外、directionがnorth/south/west/east以外の場合は
失敗する。開閉不能なgeometryへ黙って置き換えない。

## fixture / Dynmap reference差分条件

- door open/closed、left/right hinge、upper/lower、4 facing
- trapdoor horizontal/open、top/bottom、4 facing
- fence gate open/closed、in-wall/not-in-wall、4 facing
- patch count、thin bounds、rotation、cullface、texture index

Dynmap Java reference harnessとpixel goldenはR29〜R31で接続するため、R22では
state-to-geometry focused testまでを完了条件とする。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- door/trapdoor/gateのstate分岐がpatch geometryへ反映される
- invalid stateが明示的に失敗する
- R20/R21のgeometry helperと同じpatch contractを使う
- warning-cleanでテストが通る

隣接block接続、fence/wall/pane topology、waterlogged、texture parityはR23以降へ残る。

## Commit message

```text
feat: port dynmap door and gate renderers
```
