# V-1.21.5-anvil: 1.21.5 saved Anvil adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.5 / 2025-03-25T12:14:58+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/085c81eae857c821a14d1694519a0f6569a00427/1.21.5.json |
| client JAR | https://piston-data.mojang.com/v1/objects/b88808bbb3da8d9f453694b5d8f74a3396f1a533/client.jar; SHA-1 b88808bbb3da8d9f453694b5d8f74a3396f1a533; 28984409 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/e6ec2f64e6080b9b5d9b471b291c33cc7f509733/server.jar; SHA-1 e6ec2f64e6080b9b5d9b471b291c33cc7f509733; 57269758 bytes |
| asset index | id 24; SHA-1 bb262ea084de8fe98954101443ba34c8425a68ab; 483183 bytes; https://piston-meta.mojang.com/v1/packages/bb262ea084de8fe98954101443ba34c8425a68ab/24.json |
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
bun scripts/run-map-version-phase.mjs --version 1.21.5 --phase anvil
bun scripts/check-map-version-phase.mjs --version 1.21.5 --phase anvil --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.21.5 anvil adapter
```
