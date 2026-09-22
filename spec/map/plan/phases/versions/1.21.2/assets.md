# V-1.21.2-assets: 1.21.2 official assets

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.2 / 2024-10-22T09:58:55+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/1a7c9df30ab5916a361f117ecea4e07f2a3cfd14/1.21.2.json |
| client JAR | https://piston-data.mojang.com/v1/objects/c7ac2d0d86f4ca416cab9064ff8a281852ad0c7b/client.jar; SHA-1 c7ac2d0d86f4ca416cab9064ff8a281852ad0c7b; 27842947 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/7bf95409b0d9b5388bfea3704ec92012d273c14c/server.jar; SHA-1 7bf95409b0d9b5388bfea3704ec92012d273c14c; 56120171 bytes |
| asset index | id 18; SHA-1 fa0e9bba478d434dd64e7e334f84a4e6307a4283; 457929 bytes; https://piston-meta.mojang.com/v1/packages/fa0e9bba478d434dd64e7e334f84a4e6307a4283/18.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 21 |
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
bun scripts/run-map-version-phase.mjs --version 1.21.2 --phase assets
bun scripts/check-map-version-phase.mjs --version 1.21.2 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.21.2 asset profile
```
