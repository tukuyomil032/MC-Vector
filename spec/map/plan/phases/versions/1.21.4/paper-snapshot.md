# V-1.21.4-paper-snapshot: 1.21.4 Paper snapshot adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.4 / 2024-12-03T10:12:57+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/c16bd1251bdf2cab3d7c3b30393427eeb19c6b2e/1.21.4.json |
| client JAR | https://piston-data.mojang.com/v1/objects/a7e5a6024bfd3cd614625aa05629adf760020304/client.jar; SHA-1 a7e5a6024bfd3cd614625aa05629adf760020304; 28335587 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/4707d00eb834b446575d89a61a11b5d548d8c001/server.jar; SHA-1 4707d00eb834b446575d89a61a11b5d548d8c001; 56880250 bytes |
| asset index | id 19; SHA-1 f08a9f07a863fe31e36f76f19b261cd0648b3c5a; 464718 bytes; https://piston-meta.mojang.com/v1/packages/f08a9f07a863fe31e36f76f19b261cd0648b3c5a/19.json |
| DataVersion / minimum Java | 4189 / 21 |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | world::anvil_versions::v1_21_4 / 未登録 / 未登録 |
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
bun scripts/run-map-version-phase.mjs --version 1.21.4 --phase paper-snapshot
bun scripts/check-map-version-phase.mjs --version 1.21.4 --phase paper-snapshot --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add paper snapshot adapter for minecraft 1.21.4
```
