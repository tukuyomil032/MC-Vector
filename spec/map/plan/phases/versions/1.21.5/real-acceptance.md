# V-1.21.5-real-acceptance: 1.21.5 exact-version real acceptance

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-1.21.5-real-acceptance",
  "kind": "version",
  "document": "phases/versions/1.21.5/real-acceptance.md",
  "dependsOn": [
    "P-002",
    "P-023",
    "P-024",
    "P-025",
    "P-026",
    "P-027",
    "P-028",
    "P-029",
    "P-030",
    "P-031",
    "P-032",
    "P-033",
    "P-034",
    "V-1.21.5-paper-snapshot",
    "V-1.21.5-reference-and-parity"
  ],
  "commitMessage": "test: record real map acceptance for minecraft 1.21.5"
}
```

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- 直前stable release: 1.21.4
- Required delta reports: assets=`spec/map/evidence/version-deltas/1.21.5/assets.json`, Anvil=`spec/map/evidence/version-deltas/1.21.5/anvil.json`, Dynmap oracle=`spec/map/evidence/version-deltas/1.21.5/dynmap-oracle.json`, Dynmap source delta=`spec/map/evidence/version-deltas/1.21.5/dynmap-source-delta.json`, Paper=`spec/map/evidence/version-deltas/1.21.5/paper.json`, parity=`spec/map/evidence/version-deltas/1.21.5/parity.json`.
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.5 / 2025-03-25T12:14:58+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/085c81eae857c821a14d1694519a0f6569a00427/1.21.5.json |
| client JAR | https://piston-data.mojang.com/v1/objects/b88808bbb3da8d9f453694b5d8f74a3396f1a533/client.jar; SHA-1 b88808bbb3da8d9f453694b5d8f74a3396f1a533; 28984409 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/e6ec2f64e6080b9b5d9b471b291c33cc7f509733/server.jar; SHA-1 e6ec2f64e6080b9b5d9b471b291c33cc7f509733; 57269758 bytes |
| asset index | id 24; SHA-1 bb262ea084de8fe98954101443ba34c8425a68ab; 483183 bytes; https://piston-meta.mojang.com/v1/packages/bb262ea084de8fe98954101443ba34c8425a68ab/24.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 21 |
| Paper version catalog | exact version listed; build/channel/artifact unverified |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

このreleaseの観測済みdata profileと実Paper availabilityに基づき、saved/live renderer product pathの対応状態を確認する。

## データ差分と実装profileの判定

このrelease固有のデータ差分は省略せず記録・fixture化する。一方、データfingerprintが違うことだけを理由にRust adapterを追加しない。既存汎用profileが全対象difference caseでexact-version reference parityを通せば共有し、既存profileで再現できないformat/API/render behavior gapが具体的traceで確認された場合だけ、phase graphに独立したadapter実装phaseを追加する。データfingerprint一致はno-delta判定の条件であり、implementation profile共有の唯一条件ではない。

- 入力契約: 上表の公式release artifact、dynmap-oracle reportが選定したexact-version対応Dynmap source/build、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. exact version-delta profileとSHA-pinned Minecraft client assetを選択し、実world Anvil sourceから代表的なnew/changed block statesが出るtileを生成する。
2. Paper stable buildがある場合のみ、そのexact build/Core artifactでplugin load、hello/heartbeat、loaded/unloaded snapshotを確認する。Paper unavailableはlive support unavailableとして記録し、renderer asset/Anvil passと混ぜない。
3. 実Paper環境ではsaved/live same-chunk digest、tile cache reuse、failure state、consent gateを確認する。
4. renderer-wide UI acceptance（zoom 8→0、cursor/edge anchor、pan、adjacent tile、old layer retention）は全version profile boundaryと各異なるasset/Anvil/Paper profileで実施し、版固有表示/adapter差分も確認する。
5. UIからPaperを停止し、Java process終了とport 25565解放を記録してからdebug appを閉じる。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.21.5 --phase real-acceptance
bun scripts/check-map-version-phase.mjs --version 1.21.5 --phase real-acceptance --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: record real map acceptance for minecraft 1.21.5
```
