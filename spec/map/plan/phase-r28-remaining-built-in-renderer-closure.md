# R28: Remaining Dynmap built-in renderer closure

## 目的

Pinned Dynmap v3.0 の `hdmap/renderer` にある39クラスを、Rust側の
`CustomRenderer` registration boundaryへ漏れなく割り当てる。R20〜R27で個別に
実装した geometry rendererと、state-indexed／optional-mod rendererの登録経路を
一つのfactoryで閉じる。

このphaseの `translated` は、Rustの型・state入力・明示的な失敗状態・登録テストが
揃ったことを示す。Dynmap Java reference trace、固定pixel golden、実Minecraft
assetとのparityを示す `verified` とは別状態であり、R29〜R31のgateを先取りしない。

## 対象 source symbol

- `BoxStateRenderer`
- `CTMVertTextureRenderer`
- `ChestStateRenderer`
- `CopyStairBlockRenderer`
- `DoorStateRenderer`
- `FenceGateBlockRenderer`
- `FenceGateBlockStateRenderer`
- `FenceWallBlockRenderer`
- `FenceWallBlockStateRenderer`
- `FluidStateRenderer`
- `GlowLichenStateRenderer`
- `ImmibisMicroRenderer`
- `PaneStateRenderer`
- `RPMicroRenderer`
- `RPRotatedBoxRenderer`
- `RPSupportFrameRenderer`
- `RailCraftSlabBlockRenderer`
- `RailCraftTrackRenderer`
- `RedstoneWireStateRenderer`
- `StairBlockRenderer`
- `StairStateRenderer`
- `TFCLooseRockRenderer`
- `TFCSupportRenderer`
- `TFCWoodRenderer`
- `ThaumFurnaceRenderer`
- `VineStateRenderer`
- R20〜R27で実装した既存クラスのfactory registration

## Rust destination

- `src-tauri/crates/map-renderer-core/src/builtins/closure.rs`
- `src-tauri/crates/map-renderer-core/src/builtins/simple.rs`
- `src-tauri/crates/map-renderer-core/src/builtins/mod.rs`
- `spec/map/coverage/builtin-renderers.json`

`BuiltinRendererRegistry::renderer_for()` はcatalogに存在する全classをRust rendererへ
変換する。classがfactory matchから漏れた場合はfocused testが失敗する。

## 入力データ契約

- state-indexed rendererは`DynmapBlockState.properties`を使う
- neighbor依存rendererは`MapDataContext::neighbor_state()`を使う
- CTMは上下neighborのblock nameとpropertyが一致した場合だけ接続扱いにする
- micro rendererはmodのtile-entity boundsがstate propertiesとして存在する場合だけ描画する
- TFC loose rockのseedはworld block coordinateからJava `Random`相当で決定する
- missing neighbor、missing tile-entity data、unknown stateは空形状や代表色に変換しない

## 失敗状態

- `UnsupportedState`: 未知のstate、範囲外のrotation、壊れたboolean、micro bounds欠落
- `Chunk`: neighbor chunkがmissing／incomplete
- `Patch`: degenerate geometryや非有限座標

optional mod rendererのtile-entity dataを勝手に補完するfallbackは禁止する。

## fixture / Dynmap reference差分条件

R28では、次の翻訳契約をfocused testで固定する。

- BoxStateの6面texture選択
- CTMのno/above/below/both neighbor選択
- state aliasのclass registration
- micro bounds欠落の明示的拒否
- TFC loose rockの座標seed、bounds、determinism
- 全39 catalog classにfactory registrationが存在すること

Java reference trace、optional modの実tile-entity fixture、pixel goldenは未完了であり、
catalogの状態は`translated`に留める。これらが揃うまでcoverage checkerの
`--require-all-builtins`は通らない。

## Rust warning gate

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## 完了条件

- 39 catalog classが全てRust factoryへ登録される
- state／neighbor／coordinate seed／optional dataの境界がテストされる
- catalogの実装状態が`not_started`から`translated`へ更新される
- `map-renderer-core`がwarning-cleanで92 focused testsを通過する
- `verified`未達を隠すためのfixture・reference・status偽装を行わない

R28完了後も、全classの`verified`化、Java reference harness、versioned fixture、
pixel parityはR29〜R33の未完了gateとして残る。

## Commit message

```text
feat: complete dynmap built-in renderer registration closure
```
