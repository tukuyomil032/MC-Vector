# V-1.19.4-reference-and-parity: 1.19.4 version-delta Java reference and pixel parity

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-1.19.4-reference-and-parity",
  "kind": "version",
  "document": "phases/versions/1.19.4/reference-and-parity.md",
  "dependsOn": [
    "P-002",
    "P-004",
    "P-009",
    "P-010",
    "P-011",
    "P-012",
    "P-013",
    "P-014",
    "P-015",
    "P-016",
    "P-017",
    "P-018",
    "P-019",
    "P-020",
    "P-021",
    "P-022",
    "P-023",
    "V-1.19.4-anvil",
    "V-1.19.4-assets"
  ],
  "commitMessage": "test: verify dynmap parity for minecraft 1.19.4"
}
```

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- 直前stable release: 1.19.3
- Required delta reports: assets=`spec/map/evidence/version-deltas/1.19.4/assets.json`, Anvil=`spec/map/evidence/version-deltas/1.19.4/anvil.json`, Dynmap oracle=`spec/map/evidence/version-deltas/1.19.4/dynmap-oracle.json`, Dynmap source delta=`spec/map/evidence/version-deltas/1.19.4/dynmap-source-delta.json`, Paper=`spec/map/evidence/version-deltas/1.19.4/paper.json`, parity=`spec/map/evidence/version-deltas/1.19.4/parity.json`.
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.19.4 / 2023-03-14T12:56:18+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/34363790e6c3684954487c713d615c178aad2c55/1.19.4.json |
| client JAR | https://piston-data.mojang.com/v1/objects/958928a560c9167687bea0cefeb7375da1e552a8/client.jar; SHA-1 958928a560c9167687bea0cefeb7375da1e552a8; 23476620 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/8f3112a1049751cc472ec13e397eade5336ca7ae/server.jar; SHA-1 8f3112a1049751cc472ec13e397eade5336ca7ae; 47515675 bytes |
| asset index | id 3; SHA-1 1505aada4b2f7121756cfdac5ab4d37e3857ef6d; 411679 bytes; https://piston-meta.mojang.com/v1/packages/1505aada4b2f7121756cfdac5ab4d37e3857ef6d/3.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 17 |
| Paper version catalog | exact version listed; build/channel/artifact unverified |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

この版で追加/変更されたrenderer input/state、Dynmap version-specific source change、format-boundary fixtureについて対応済みJava referenceとRust outputを比較する。

## データ差分と実装profileの判定

このrelease固有のデータ差分は省略せず記録・fixture化する。一方、データfingerprintが違うことだけを理由にRust adapterを追加しない。既存汎用profileが全対象difference caseでexact-version reference parityを通せば共有し、既存profileで再現できないformat/API/render behavior gapが具体的traceで確認された場合だけ、phase graphに独立したadapter実装phaseを追加する。データfingerprint一致はno-delta判定の条件であり、implementation profile共有の唯一条件ではない。

- 入力契約: 上表の公式release artifact、dynmap-oracle reportが選定したexact-version対応Dynmap source/build、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. `spec/map/evidence/version-deltas/1.19.4/assets.json`、`anvil.json`、`dynmap-oracle.json`、`dynmap-source-delta.json`で列挙された全renderer-visible/data/source changeをfixtureへ展開し、変更なしはhash-verified shared-profile fixtureへ割り当てる。
2. 選定済みの`selected exact-version Dynmap source revision`でreference harnessをbuild・実行し、source capabilityとMinecraft releaseの適合を確認する。pinned baselineを無条件にreferenceに使わない。
3. ray origin/direction/step/hit/face/patch/UV/rotation/shade/light/alpha/projected pixelとversion-specific resolution branchをcaptureする。
4. reference trace/PNGはtest時に生成せず、capture source commit、input digest、exact client/server/asset digest、toolchain、PNG hashを固定する。
5. normalized RGBAをpixel単位比較し、差異をspecific block/state/resource/Anvil profile/Dynmap source symbolへ帰属させる。release IDだけを変えたshared goldenは認めない。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.19.4 --phase reference-and-parity
bun scripts/check-map-version-phase.mjs --version 1.19.4 --phase reference-and-parity --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: verify dynmap parity for minecraft 1.19.4
```
