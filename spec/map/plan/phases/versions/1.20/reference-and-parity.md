# V-1.20-reference-and-parity: 1.20 Java reference and pixel parity

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.20 / 2023-06-02T08:36:17+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/50af6da98cdb14993372ce281e03ced670e9a495/1.20.json |
| client JAR | https://piston-data.mojang.com/v1/objects/e575a48efda46cf88111ba05b624ef90c520eef1/client.jar; SHA-1 e575a48efda46cf88111ba05b624ef90c520eef1; 23028278 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/15c777e2cfe0556eef19aab534b186c0c6f277e1/server.jar; SHA-1 15c777e2cfe0556eef19aab534b186c0c6f277e1; 47787288 bytes |
| asset index | id 5; SHA-1 e1e23f09e9f518f5b8f76dac10524ebf07691d86; 413067 bytes; https://piston-meta.mojang.com/v1/packages/e1e23f09e9f518f5b8f76dac10524ebf07691d86/5.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 17 |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

同じversion-bound assets/chunk/settingsをpinned Java rendererとRust rendererへ渡してtraceと画像を比較する。

- 入力契約: 上表の公式release artifact、revision-pinned Dynmap reference、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. ray origin/direction/step/hit/face/patch/UV/rotation/shade/light/alpha/projected pixelを固定schemaでcaptureする。
2. reference trace/PNGをtest時に生成せず、capture source commit、input digest、toolchain、PNG hashを固定する。
3. normalized RGBAをpixel単位比較する。許容差を広げて差分を隠さず、差異はsource symbolへ帰属させる。
4. 当該versionで登録される全required symbols/resources/built-insにfixtureまたは根拠付き非適用記録を結びつける。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.20 --phase reference-and-parity
bun scripts/check-map-version-phase.mjs --version 1.20 --phase reference-and-parity --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: verify dynmap parity for minecraft 1.20
```
