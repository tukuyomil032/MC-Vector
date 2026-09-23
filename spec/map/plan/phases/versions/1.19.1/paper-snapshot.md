# V-1.19.1-paper-snapshot: 1.19.1 Paper snapshot compatibility audit

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-1.19.1-paper-snapshot",
  "kind": "version",
  "document": "phases/versions/1.19.1/paper-snapshot.md",
  "dependsOn": [
    "P-002",
    "P-006",
    "P-007",
    "P-024"
  ],
  "commitMessage": "feat: add paper snapshot adapter for minecraft 1.19.1"
}
```

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- 直前stable release: 1.19
- Required delta reports: assets=`spec/map/evidence/version-deltas/1.19.1/assets.json`, Anvil=`spec/map/evidence/version-deltas/1.19.1/anvil.json`, Dynmap oracle=`spec/map/evidence/version-deltas/1.19.1/dynmap-oracle.json`, Dynmap source delta=`spec/map/evidence/version-deltas/1.19.1/dynmap-source-delta.json`, Paper=`spec/map/evidence/version-deltas/1.19.1/paper.json`, parity=`spec/map/evidence/version-deltas/1.19.1/parity.json`.
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.19.1 / 2022-07-27T09:25:33+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/39d5e8925d37490c6f2abb2e02b8c6f1b35719df/1.19.1.json |
| client JAR | https://piston-data.mojang.com/v1/objects/90d438c3e432add8848a9f9f368ce5a52f6bc4a7/client.jar; SHA-1 90d438c3e432add8848a9f9f368ce5a52f6bc4a7; 21643604 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/8399e1211e95faa421c1507b322dbeae86d604df/server.jar; SHA-1 8399e1211e95faa421c1507b322dbeae86d604df; 45609936 bytes |
| asset index | id 1.19; SHA-1 a9c8b05a8082a65678beda6dfa2b8f21fa627bce; 385608 bytes; https://piston-meta.mojang.com/v1/packages/a9c8b05a8082a65678beda6dfa2b8f21fa627bce/1.19.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 17 |
| Paper version catalog | exact version listed; build/channel/artifact unverified |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

Paperのexact-version build/API/runtime/snapshot差分をrenderer asset/Anvilとは別軸で検証し、共有protocol profileか新しいadapterが必要かを決める。

## データ差分と実装profileの判定

このrelease固有のデータ差分は省略せず記録・fixture化する。一方、データfingerprintが違うことだけを理由にRust adapterを追加しない。既存汎用profileが全対象difference caseでexact-version reference parityを通せば共有し、既存profileで再現できないformat/API/render behavior gapが具体的traceで確認された場合だけ、phase graphに独立したadapter実装phaseを追加する。データfingerprint一致はno-delta判定の条件であり、implementation profile共有の唯一条件ではない。

- 入力契約: 上表の公式release artifact、dynmap-oracle reportが選定したexact-version対応Dynmap source/build、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. Paper official endpointでexact Minecraft releaseのSTABLE build availabilityを確認し、build number/channel/download SHA-256/Java requirementを保存する。project listingだけではbuild存在をpassにしない。
2. 隣接Paper profileとのAPI/mapping/runtime差分を調べる。1.20.5のruntime mapping transitionのようにplugin互換に影響する変更候補は独立fixtureへ落とし、実artifact/API差分を確認する。
3. exact buildからloaded/not_loaded snapshotを取得し、request/server/world/dimension/chunk/version/DataVersion identity、palette/biome/height/sky/block lightをwire fixtureへ記録する。
4. 既存protocol/provider profileでexact snapshotを同じChunkViewへ変換できるか確認する。全差分が同profileで通るなら再利用し、wire/API/data-contractのbehavior gapが証明された場合のみ別Paper adapter phaseを作る。
5. Paper build不在は`liveCompatibility=unavailable`として記録する。これをsaved Anvil rendererのversion statusへ波及させたり、Paper support済みと表示したりしない。
6. queue full/timeout/reconnect/malformed/world mismatchは個別failure fixtureとし、terrain emptyに正規化しない。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.19.1 --phase paper-snapshot
bun scripts/check-map-version-phase.mjs --version 1.19.1 --phase paper-snapshot --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: audit minecraft 1.19.1 paper snapshot compatibility
```
