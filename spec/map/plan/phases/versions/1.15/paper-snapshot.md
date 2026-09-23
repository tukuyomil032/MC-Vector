# V-1.15-paper-snapshot: 1.15 Paper snapshot adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.15 / 2019-12-09T13:13:38+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/833322370ab320e77717097082effe1d124d48bd/1.15.json |
| client JAR | https://piston-data.mojang.com/v1/objects/7b07fd09d1e3aae1bc7a1304fedc73bfe5d81800/client.jar; SHA-1 7b07fd09d1e3aae1bc7a1304fedc73bfe5d81800; 15517346 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/e9f105b3c5c7e85c7b445249a93362a22f62442d/server.jar; SHA-1 e9f105b3c5c7e85c7b445249a93362a22f62442d; 36164465 bytes |
| asset index | id 1.15; SHA-1 58c12b1e2878e0a78719778acb803746450b3f1c; 234331 bytes; https://piston-meta.mojang.com/v1/packages/58c12b1e2878e0a78719778acb803746450b3f1c/1.15.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 8 |
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
bun scripts/run-map-version-phase.mjs --version 1.15 --phase paper-snapshot
bun scripts/check-map-version-phase.mjs --version 1.15 --phase paper-snapshot --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add paper snapshot adapter for minecraft 1.15
```
