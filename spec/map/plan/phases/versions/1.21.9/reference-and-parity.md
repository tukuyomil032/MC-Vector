# V-1.21.9-reference-and-parity: 1.21.9 Java reference and pixel parity

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.9 / 2025-09-30T11:58:43+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/a6ad3cf935ede641f441a2fd9e0e4fea2961f43f/1.21.9.json |
| client JAR | https://piston-data.mojang.com/v1/objects/ce92fd8d1b2460c41ceda07ae7b3fe863a80d045/client.jar; SHA-1 ce92fd8d1b2460c41ceda07ae7b3fe863a80d045; 30591861 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/11e54c2081420a4d49db3007e66c80a22579ff2a/server.jar; SHA-1 11e54c2081420a4d49db3007e66c80a22579ff2a; 58638725 bytes |
| asset index | id 27; SHA-1 dedfb9bd5580d6c267cb72b34ecc2526b6894f47; 507956 bytes; https://piston-meta.mojang.com/v1/packages/dedfb9bd5580d6c267cb72b34ecc2526b6894f47/27.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 21 |
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
bun scripts/run-map-version-phase.mjs --version 1.21.9 --phase reference-and-parity
bun scripts/check-map-version-phase.mjs --version 1.21.9 --phase reference-and-parity --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: verify dynmap parity for minecraft 1.21.9
```
