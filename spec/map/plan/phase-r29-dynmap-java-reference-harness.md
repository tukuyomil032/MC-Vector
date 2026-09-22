# R29: Dynmap Java reference harness

## 目的

Pinned Dynmap revisionのJava rendererを、Bukkit plugin lifecycleやDynmap Web/Storage
なしでfixtureから実行し、Rust rendererと比較できる中間patch traceを固定する。

Rust側の自己完結goldenをreferenceと呼ばない。原典Java sourceが実際に生成した
`RenderPatch`のgeometry、UV、visibility、texture indexをreference traceとして出力する。

## 対象 source symbol

最初のfixture runnerは依存が閉じている次の原典rendererを対象にする。

- `BoxRenderer`
- `CuboidRenderer`
- `PaneRenderer`
- `PlantRenderer`
- `CustomRenderer.addBox`
- `RenderPatchFactory`
- `MapDataContext`

他のbuilt-in rendererは、Bukkit／Dynmap内部asset／tile-entity依存を最小fixtureへ
追加できる段階で個別にharness対象へ広げる。未実行のclassをreference verifiedとしない。

## Rust / Java destination

- `src-tauri/crates/map-renderer-core/third_party/dynmap/reference-harness/src/`
- `scripts/run-dynmap-reference-harness.mjs`
- `package.json` の `test:map:reference`

fixture-only stubは`reference-harness/src/org/dynmap/`配下に限定する。
`Log`、`HDBlockStateTextureMap`、`TexturePack`、`DynmapBlockState`は、原典rendererを
コンパイルするための最小データ契約だけを持ち、Bukkit APIを持ち込まない。

## 入力データ契約

- source revision: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- Java source: `third_party/dynmap/upstream/`
- fixture state: renderer名1つと空の`MapDataContext`
- output: deterministic JSONのpatch trace
- trace fields: geometry、UV、side visibility、texture index

traceはraw filesystem path、token、server responseを含めない。

## 失敗状態

- renderer名がfixture allowlist外
- `javac`が原典sourceまたはfixture boundaryをコンパイルできない
- renderer initialization失敗
- unsupported named patchや未定義asset lookupがfixtureで呼ばれた

これらを空配列の成功へ変換しない。

## fixture / Dynmap reference差分条件

実行例:

```bash
bun scripts/run-dynmap-reference-harness.mjs box
bun scripts/run-dynmap-reference-harness.mjs cuboid
bun scripts/run-dynmap-reference-harness.mjs pane
bun scripts/run-dynmap-reference-harness.mjs plant
bun run test:map:reference
```

R29のtraceは、R30で固定fixture catalogへ保存し、R31でRust intermediate traceと
比較する。R29単独ではpixel parityを完了扱いにしない。`CuboidRenderer`の引数なし
fixtureが空patchになるような原典依存は、入力params fixtureを追加するまで未検証とする。

## Java warning / Rust warning gate

```bash
bun run test:map:reference
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## 完了条件

- pinned Java sourceを実際に`javac`でfixture harnessから実行できる
- 少なくともBox／Cuboid／Pane／Plantの4 renderer名がallowlistで固定される
- output traceがdeterministicで、原典のpatch順を保持する
- Bukkit/Web/Storageへの依存がreference harnessへ侵入していない
- 未実行classをverifiedへ更新していない

R29後も、versioned reference capture、モデル／texture／lighting／shader trace、
pixel PNG parity、全built-inのfixture closureは未完了として残る。

## Commit message

```text
test: add dynmap java reference harness
```
