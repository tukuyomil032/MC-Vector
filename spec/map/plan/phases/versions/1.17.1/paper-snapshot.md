# V-1.17.1-paper-snapshot: 1.17.1 Paper snapshot adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.17.1 / 2021-07-06T12:01:34+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/e0e7ab5ed6f55bbd874ef95be3c9356d67e64b57/1.17.1.json |
| client JAR | https://piston-data.mojang.com/v1/objects/8d9b65467c7913fcf6f5b2e729d44a1e00fde150/client.jar; SHA-1 8d9b65467c7913fcf6f5b2e729d44a1e00fde150; 19546842 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/a16d67e5807f57fc4e550299cf20226194497dc2/server.jar; SHA-1 a16d67e5807f57fc4e550299cf20226194497dc2; 43626592 bytes |
| asset index | id 1.17; SHA-1 f425401a00adf0112fde624ee80c66333530f8a1; 346398 bytes; https://piston-meta.mojang.com/v1/packages/f425401a00adf0112fde624ee80c66333530f8a1/1.17.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 16 |
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
bun scripts/run-map-version-phase.mjs --version 1.17.1 --phase paper-snapshot
bun scripts/check-map-version-phase.mjs --version 1.17.1 --phase paper-snapshot --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add paper snapshot adapter for minecraft 1.17.1
```
