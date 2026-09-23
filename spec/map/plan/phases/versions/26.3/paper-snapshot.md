# V-26.3-paper-snapshot: 26.3 Paper snapshot adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 26.3 / 2026-09-15T11:23:02+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/bc098d111a72e9f6178801544a42099bdfbb0cf2/26.3.json |
| client JAR | https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar; SHA-1 e877b6a07acd633fb3bb475002175cec036e7b87; 41483720 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar; SHA-1 33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c; 62294556 bytes |
| asset index | id 34; SHA-1 32a06dd28a0a8a981f4a1dffbdb3931f3075ca6c; 597035 bytes; https://piston-meta.mojang.com/v1/packages/32a06dd28a0a8a981f4a1dffbdb3931f3075ca6c/34.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 25 |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

対象版のPaper processが返すsnapshotをAnvilと同じMapChunkCacheへ変換する。

- 入力契約: 上表の公式release artifact、revision-pinned Dynmap reference、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. exact Paper build、jar SHA-256、required Java runtimeをversion matrixへ記録する。
2. loaded/not_loaded、requestId/server/world/dimension/chunk/version/DataVersionのidentityを照合する。
3. palette、biome、height、sky/block lightのwire bytesを実Paper responseとfixtureで比較する。
4. queue full/timeout/reconnect/malformed/world mismatchは個別unavailable reasonとし、地形なしと混同しない。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 26.3 --phase paper-snapshot
bun scripts/check-map-version-phase.mjs --version 26.3 --phase paper-snapshot --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add paper snapshot adapter for minecraft 26.3
```
