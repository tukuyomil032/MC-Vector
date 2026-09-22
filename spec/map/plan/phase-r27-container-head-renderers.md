# R27: Dynmap container, head, and tile-entity renderer boundary

## 目的

chestのsingle/left/rightとfacing、head/skullの16段階rotationを、stateからpatch
geometryへ変換する。container/tile-entity情報をrendererへ渡す境界を明示し、常時同じ
箱や向きへfallbackしない。

## 対象 source symbol

- `ChestRenderer`
- `ChestStateRenderer`
- `HeadRenderer`
- `SkullRenderer`
- `WallHeadRenderer`

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/containers.rs`

## 入力データ契約

chest: `facing`、`type=single/left/right`。
head/skull: `rotation=0..15`。head rotationは22.5度刻みでblock中心を回転する。

## 失敗状態

unknown chest type、rotation範囲外、malformed propertyは`UnsupportedState`とする。
tile entity dataが欠けている場合にopen/lidやcustom skinを推測しない。

## fixture / Dynmap reference差分条件

- chest single/left/right、4 facing
- head/skull rotation 0〜15
- wall head
- patch count、bounds、rotation、texture index
- tile entity欠落

double chestのneighbor identity、lid/open animation、custom head texture、Java
reference/pixel parityはR29〜R31およびtile-entity source adapterで継続する。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- chest stateがsingle/double boundsへ変換される
- head/skullのrotation 0〜15が生成される
- invalid stateを拒否する
- warning-cleanでfocused testsが通る

tile entityの完全解決、double chest neighbor parity、reference/pixel parityは未完了や。

## Commit message

```text
feat: port dynmap container and head renderers
```
