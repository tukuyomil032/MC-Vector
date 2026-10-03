# V-1.20-paper-snapshot: 1.20 Paper snapshot adapter

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.20 / 2023-06-02T08:36:17+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/50af6da98cdb14993372ce281e03ced670e9a495/1.20.json |
| client JAR | https://piston-data.mojang.com/v1/objects/e575a48efda46cf88111ba05b624ef90c520eef1/client.jar; SHA-1 e575a48efda46cf88111ba05b624ef90c520eef1; 23028278 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/15c777e2cfe0556eef19aab534b186c0c6f277e1/server.jar; SHA-1 15c777e2cfe0556eef19aab534b186c0c6f277e1; 47787288 bytes |
| asset index | id 5; SHA-1 e1e23f09e9f518f5b8f76dac10524ebf07691d86; 413067 bytes; https://piston-meta.mojang.com/v1/packages/e1e23f09e9f518f5b8f76dac10524ebf07691d86/5.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 17 |
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
bun scripts/run-map-version-phase.mjs --version 1.20 --phase paper-snapshot
bun scripts/check-map-version-phase.mjs --version 1.20 --phase paper-snapshot --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
feat: add paper snapshot adapter for minecraft 1.20
```
