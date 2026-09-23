# V-26.1.2-assets: 26.1.2 official assets

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 26.1.2 / 2026-04-09T10:12:23+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/50187e15f4fe9e772e617db26c58d789f9ec2b31/26.1.2.json |
| client JAR | https://piston-data.mojang.com/v1/objects/4e618f09a0c649dde3fdf829df443ce0b8831e65/client.jar; SHA-1 4e618f09a0c649dde3fdf829df443ce0b8831e65; 38113927 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/97ccd4c0ed3f81bbb7bfacddd1090b0c56f9bc51/server.jar; SHA-1 97ccd4c0ed3f81bbb7bfacddd1090b0c56f9bc51; 60417480 bytes |
| asset index | id 30; SHA-1 1cf55e789e49796e91b0258d4012e653b0e6acc3; 548391 bytes; https://piston-meta.mojang.com/v1/packages/1cf55e789e49796e91b0258d4012e653b0e6acc3/30.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 25 |
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
bun scripts/run-map-version-phase.mjs --version 26.1.2 --phase assets
bun scripts/check-map-version-phase.mjs --version 26.1.2 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 26.1.2 asset profile
```
