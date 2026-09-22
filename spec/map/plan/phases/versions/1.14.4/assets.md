# V-1.14.4-assets: 1.14.4 official assets

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.14.4 / 2019-07-19T09:25:47+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/be146d5f66a3627ed0a87c234c4d8dde8ab35098/1.14.4.json |
| client JAR | https://piston-data.mojang.com/v1/objects/8c325a0c5bd674dd747d6ebaa4c791fd363ad8a9/client.jar; SHA-1 8c325a0c5bd674dd747d6ebaa4c791fd363ad8a9; 25191691 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/3dc3d84a581f14691199cf6831b71ed1296a9fdf/server.jar; SHA-1 3dc3d84a581f14691199cf6831b71ed1296a9fdf; 35958734 bytes |
| asset index | id 1.14; SHA-1 43b2f3021fe9f7d768378de95538e22da3ee8301; 227730 bytes; https://piston-meta.mojang.com/v1/packages/43b2f3021fe9f7d768378de95538e22da3ee8301/1.14.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 8 |
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
bun scripts/run-map-version-phase.mjs --version 1.14.4 --phase assets
bun scripts/check-map-version-phase.mjs --version 1.14.4 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.14.4 asset profile
```
