# V-1.15.2-real-acceptance: 1.15.2 exact-version real acceptance

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-1.15.2-real-acceptance",
  "kind": "version",
  "document": "phases/versions/1.15.2/real-acceptance.md",
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
    "V-1.15.2-paper-snapshot",
    "V-1.15.2-reference-and-parity"
  ],
  "commitMessage": "test: record real map acceptance for minecraft 1.15.2"
}
```

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- 直前stable release: 1.15.1
- Required delta reports: assets=`spec/map/evidence/version-deltas/1.15.2/assets.json`, Anvil=`spec/map/evidence/version-deltas/1.15.2/anvil.json`, Dynmap oracle=`spec/map/evidence/version-deltas/1.15.2/dynmap-oracle.json`, Dynmap source delta=`spec/map/evidence/version-deltas/1.15.2/dynmap-source-delta.json`, Paper=`spec/map/evidence/version-deltas/1.15.2/paper.json`, parity=`spec/map/evidence/version-deltas/1.15.2/parity.json`.
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.15.2 / 2020-01-17T10:03:52+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/e9d0adb8f642abe422909ede50f651b2b58a3573/1.15.2.json |
| client JAR | https://piston-data.mojang.com/v1/objects/e3f78cd16f9eb9a52307ed96ebec64241cc5b32d/client.jar; SHA-1 e3f78cd16f9eb9a52307ed96ebec64241cc5b32d; 15531492 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/bb2b6b1aefcd70dfd1892149ac3a215f6c636b07/server.jar; SHA-1 bb2b6b1aefcd70dfd1892149ac3a215f6c636b07; 36175593 bytes |
| asset index | id 1.15; SHA-1 58c12b1e2878e0a78719778acb803746450b3f1c; 234331 bytes; https://piston-meta.mojang.com/v1/packages/58c12b1e2878e0a78719778acb803746450b3f1c/1.15.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 8 |
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
bun scripts/run-map-version-phase.mjs --version 1.15.2 --phase real-acceptance
bun scripts/check-map-version-phase.mjs --version 1.15.2 --phase real-acceptance --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: record real map acceptance for minecraft 1.15.2
```
