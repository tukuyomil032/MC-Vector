# R31: Renderer differential and pixel-parity foundation

## 目的

R29のJava reference harnessとR30の固定traceを、Rust rendererの中間出力へ接続する。最初の対象は、fixture-only harnessで実行可能な `BoxRenderer`、`CuboidRenderer`、`PaneRenderer`、`PlantRenderer` の4つに限定する。

このphaseはDynmap renderer全体のpixel parity完了を意味しない。PNG golden、全built-in、全Minecraft version、lighting/shader parityは後続phaseの未完了項目として残す。

## 実装

- `SideVisible`へDynmapの可視性ラベルを追加し、Rust traceで参照側の名前を保持する。
- `RenderPatchFactory`へside、UV clip、rotationを明示するAPIを追加する。
- boxのface order、point winding、texture indexをDynmap `CustomRenderer.addBox`へ合わせる。
- plant/paneのrotationをblock center基準で処理する。
- Java harnessのrotation stubを実装し、参照traceが回転を捨てないようにする。
- fixed JSONをtest実行時に更新せず、Rust integration testで構造化比較する。

## 差分条件

比較する項目は renderer名、patch order、9点のgeometry、6項目のUV bounds、visibility label、texture index。浮動小数の許容値で差分を隠さず、fixtureのJSON値を構造化比較する。

## Gate

```bash
bun run test:map:reference:fixtures
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## 未完了の明示

- `reference.png`、PNG hash、pixel差分は未実装。
- 4 renderer以外の中間trace parityは未実装。
- built-in catalogの39件はtranslatedであり、verifiedではない。
- resource、lighting、shader、Anvil、Paper、version matrixの全件parityは未実装。

## Commit

```text
test: enforce dynmap renderer differential parity
```
