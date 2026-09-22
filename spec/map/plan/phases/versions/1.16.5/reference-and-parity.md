# V-1.16.5-reference-and-parity: 1.16.5 Java reference and pixel parity

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.16.5 / 2021-01-14T16:05:32+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/fba9f7833e858a1257d810d21a3a9e3c967f9077/1.16.5.json |
| client JAR | https://piston-data.mojang.com/v1/objects/37fd3c903861eeff3bc24b71eed48f828b5269c8/client.jar; SHA-1 37fd3c903861eeff3bc24b71eed48f828b5269c8; 17547153 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/1b557e7b033b583cd9f66746b7a9ab1ec1673ced/server.jar; SHA-1 1b557e7b033b583cd9f66746b7a9ab1ec1673ced; 37962360 bytes |
| asset index | id 1.16; SHA-1 f3c4aa96e12951cd2781b3e1c0e8ab82bf719cf2; 295227 bytes; https://piston-meta.mojang.com/v1/packages/f3c4aa96e12951cd2781b3e1c0e8ab82bf719cf2/1.16.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 8 |
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
bun scripts/run-map-version-phase.mjs --version 1.16.5 --phase reference-and-parity
bun scripts/check-map-version-phase.mjs --version 1.16.5 --phase reference-and-parity --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: verify dynmap parity for minecraft 1.16.5
```
