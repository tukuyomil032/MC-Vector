# V-1.14.3-anvil: 1.14.3 saved Anvil adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.14.3 / 2019-06-24T12:52:52+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/e21618620e02be5a14543d1d17ffdba941d09aa8/1.14.3.json |
| client JAR | https://piston-data.mojang.com/v1/objects/af100b34ec7ef2b8b9cf7775b544d21d690dddec/client.jar; SHA-1 af100b34ec7ef2b8b9cf7775b544d21d690dddec; 18813147 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/d0d0fe2b1dc6ab4c65554cb734270872b72dadd6/server.jar; SHA-1 d0d0fe2b1dc6ab4c65554cb734270872b72dadd6; 35952401 bytes |
| asset index | id 1.14; SHA-1 43b2f3021fe9f7d768378de95538e22da3ee8301; 227730 bytes; https://piston-meta.mojang.com/v1/packages/43b2f3021fe9f7d768378de95538e22da3ee8301/1.14.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 8 |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

このexact releaseの実Anvil chunkをshared MapChunkCacheへ復元する。

- 入力契約: 上表の公式release artifact、revision-pinned Dynmap reference、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. official server artifactからDataVersionを読み取りversion matrixへ固定する。
2. region header/sector/compression/NBT/chunk status、section palette、packed states、heightmap、biome、sky/block light、vertical rangeを実world fixtureと照合する。
3. negative chunk coordinate、missing/truncated/malformed chunk、neighboring region/section boundaryを別fixtureで検証する。
4. input/output digestsを固定し、他versionのDataVersionを受理しない。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.14.3 --phase anvil
bun scripts/check-map-version-phase.mjs --version 1.14.3 --phase anvil --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.14.3 anvil adapter
```
