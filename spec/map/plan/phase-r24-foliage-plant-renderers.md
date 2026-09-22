# R24: Dynmap foliage, plant, vine, and glow lichen renderers

## 目的

植物系の crossed quad と、面ごとに付着する vine/glow lichen geometryを、
transparent/cutoutを失わないpatchとして生成する。

## 対象 source symbol

- `PlantRenderer`
- `VineStateRenderer`
- `GlowLichenStateRenderer`
- leaves crossed-quad model path

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/foliage.rs`

## 入力データ契約

vine/glow lichenの`north/east/south/west/up/down`はbooleanとして検証する。未指定は
false扱い、6面すべてfalseまたは不正値は`UnsupportedState`とする。

## 失敗状態

不正なattachment state、面なしstateはsuccessにしない。alphaやbiome tintを代表色へ
置き換えない。

## fixture / Dynmap reference差分条件

- leaves crossed quads
- vine各付着面
- glow lichen各付着面
- 複数面同時付着
- 面なし／不正boolean
- patch order、normal、side visibility、texture index

Java reference harnessとpixel parityはR29〜R31で接続する。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- leavesのcrossed quadを生成する
- vine/glow lichenの付着面を明示的に生成する
- invalid/empty attachmentを拒否する
- warning-cleanでfocused testsが通る

leavesの版別tint、透明テクスチャ実データ、pixel parity、resource-pack差分は
R11/R14/R15/R29〜R32で継続検証する。

## Commit message

```text
feat: port dynmap foliage and plant renderers
```
