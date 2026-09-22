# V-1.21.9-anvil: 1.21.9 saved Anvil adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.9 / 2025-09-30T11:58:43+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/a6ad3cf935ede641f441a2fd9e0e4fea2961f43f/1.21.9.json |
| client JAR | https://piston-data.mojang.com/v1/objects/ce92fd8d1b2460c41ceda07ae7b3fe863a80d045/client.jar; SHA-1 ce92fd8d1b2460c41ceda07ae7b3fe863a80d045; 30591861 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/11e54c2081420a4d49db3007e66c80a22579ff2a/server.jar; SHA-1 11e54c2081420a4d49db3007e66c80a22579ff2a; 58638725 bytes |
| asset index | id 27; SHA-1 dedfb9bd5580d6c267cb72b34ecc2526b6894f47; 507956 bytes; https://piston-meta.mojang.com/v1/packages/dedfb9bd5580d6c267cb72b34ecc2526b6894f47/27.json |
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
bun scripts/run-map-version-phase.mjs --version 1.21.9 --phase anvil
bun scripts/check-map-version-phase.mjs --version 1.21.9 --phase anvil --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add minecraft 1.21.9 anvil adapter
```
