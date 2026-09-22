# V-1.20.2-assets: 1.20.2 official assets

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.20.2 / 2023-09-20T09:02:57+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/e19d30ded4f25b8149bb43ab7493a9953a2f16b9/1.20.2.json |
| client JAR | https://piston-data.mojang.com/v1/objects/82d1974e75fc984c5ed4b038e764e50958ac61a0/client.jar; SHA-1 82d1974e75fc984c5ed4b038e764e50958ac61a0; 23186213 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/5b868151bd02b41319f54c8d4061b8cae84e665c/server.jar; SHA-1 5b868151bd02b41319f54c8d4061b8cae84e665c; 48285806 bytes |
| asset index | id 8; SHA-1 be795ea589c9dc3f23a1573de90699fea1696bb1; 416952 bytes; https://piston-meta.mojang.com/v1/packages/be795ea589c9dc3f23a1573de90699fea1696bb1/8.json |
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
bun scripts/run-map-version-phase.mjs --version 1.20.2 --phase assets
bun scripts/check-map-version-phase.mjs --version 1.20.2 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.20.2 asset profile
```
