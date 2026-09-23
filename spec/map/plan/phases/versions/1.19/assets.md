# V-1.19-assets: 1.19 official assets

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.19 / 2022-06-07T09:42:18+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/14bbfb25fb1c1c798e3c9b9482b081a78d1f3a9d/1.19.json |
| client JAR | https://piston-data.mojang.com/v1/objects/c0898ec7c6a5a2eaa317770203a1554260699994/client.jar; SHA-1 c0898ec7c6a5a2eaa317770203a1554260699994; 21462385 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/e00c4052dac1d59a1188b2aa9d5a87113aaf1122/server.jar; SHA-1 e00c4052dac1d59a1188b2aa9d5a87113aaf1122; 45538778 bytes |
| asset index | id 1.19; SHA-1 a9c8b05a8082a65678beda6dfa2b8f21fa627bce; 385608 bytes; https://piston-meta.mojang.com/v1/packages/a9c8b05a8082a65678beda6dfa2b8f21fa627bce/1.19.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 17 |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

公式client JAR・asset indexと、この版のrenderer-consumed resource全件をdigest付きprofileにする。

- 入力契約: 上表の公式release artifact、revision-pinned Dynmap reference、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. official metadataのURL/length/SHA-1を照合し、取得bytesのSHA-256も保存する。
2. ZIP entry path、duplicate、entry数、展開量、圧縮率、namespace、pack metadataを上限付きで検証する。
3. blockstate/model/texture/CTM/tint/animationをsource resource closureと照合し、全consumerとresolution precedenceを記録する。
4. missing/format mismatchをunsupportedまたはerrorとして返し、version外assetを混入させない。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.19 --phase assets
bun scripts/check-map-version-phase.mjs --version 1.19 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.19 asset profile
```
