# V-1.21.6-anvil: 1.21.6 saved Anvil adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.6 / 2025-06-17T11:10:28+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/870ceb0e45bc251e1345dd8714261e8d153189cc/1.21.6.json |
| client JAR | https://piston-data.mojang.com/v1/objects/740a125b83dd3447feaa3c5e891ead7fbb21ae28/client.jar; SHA-1 740a125b83dd3447feaa3c5e891ead7fbb21ae28; 29516555 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/6e64dcabba3c01a7271b4fa6bd898483b794c59b/server.jar; SHA-1 6e64dcabba3c01a7271b4fa6bd898483b794c59b; 57554576 bytes |
| asset index | id 26; SHA-1 62ed5debfe241ed0ab32c3b6fcf50a80ce11a59a; 491670 bytes; https://piston-meta.mojang.com/v1/packages/62ed5debfe241ed0ab32c3b6fcf50a80ce11a59a/26.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 21 |
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
bun scripts/run-map-version-phase.mjs --version 1.21.6 --phase anvil
bun scripts/check-map-version-phase.mjs --version 1.21.6 --phase anvil --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.21.6 anvil adapter
```
