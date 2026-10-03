# V-1.19.3-assets: 1.19.3 official assets

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.19.3 / 2022-12-07T08:17:18+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/a515312b57766db0d55f23f2ca4db4f67654621d/1.19.3.json |
| client JAR | https://piston-data.mojang.com/v1/objects/977727ec9ab8b4631e5c12839f064092f17663f8/client.jar; SHA-1 977727ec9ab8b4631e5c12839f064092f17663f8; 22704188 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/c9df48efed58511cdd0213c56b9013a7b5c9ac1f/server.jar; SHA-1 c9df48efed58511cdd0213c56b9013a7b5c9ac1f; 47162712 bytes |
| asset index | id 2; SHA-1 743a4a3fb4dedbba8d405a9907c400aa5fb36786; 407568 bytes; https://piston-meta.mojang.com/v1/packages/743a4a3fb4dedbba8d405a9907c400aa5fb36786/2.json |
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
bun scripts/run-map-version-phase.mjs --version 1.19.3 --phase assets
bun scripts/check-map-version-phase.mjs --version 1.19.3 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.19.3 asset profile
```
