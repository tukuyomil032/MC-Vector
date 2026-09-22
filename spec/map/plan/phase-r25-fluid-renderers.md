# R25: Dynmap fluid renderers

## 目的

Water/lavaのfluid stateを検証し、levelに応じたtop面と、同じfluidに隣接する面の
cullingを行う。透明面を代表色へ置き換えず、underwater shaderへ渡せるpatch metadata
を保持する。

## 対象 source symbol

- `FluidStateRenderer`
- fluid state、level、falling、neighbor matching

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/fluids.rs`

## 入力データ契約

`level`は0〜8、`falling`はtrue/falseとする。block nameからwater/lavaのfluid kindを
解決し、neighbor stateが同じkindの場合に側面をcullする。

## 失敗状態

unknown fluid、level範囲外、不正falling、missing neighbor dataは明示的に失敗する。
corner heightを推測して成功扱いしない。

## fixture / Dynmap reference差分条件

- water/lava
- level 0〜8
- falling
- same-fluid neighbor culling
- different-fluid side emission
- top height、bottom、side patch、alpha/shade metadata

corner interpolation、全neighborのfluid matching、underwater shader pixel parityは
後続reference/pixel parityで追加する。

## Rust warning gate

```bash
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

## 完了条件

- fluid kindとlevelを検証する
- same-fluid neighborで側面をcullする
- different/missing stateを混同しない
- warning-cleanでfocused testsが通る

Dynmap原典のcorner-height補間、flow direction、animated texture、underwater pixel
parityは未完了としてR14/R17/R29〜R31へ残る。

## Commit message

```text
feat: port dynmap fluid renderers
```
