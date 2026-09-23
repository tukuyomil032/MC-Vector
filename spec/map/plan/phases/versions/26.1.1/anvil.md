# V-26.1.1-anvil: 26.1.1 Anvil schema delta audit and decoder-profile assignment

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-26.1.1-anvil",
  "kind": "version",
  "document": "phases/versions/26.1.1/anvil.md",
  "dependsOn": [
    "P-002",
    "P-006",
    "P-007",
    "P-011"
  ],
  "commitMessage": "feat: add minecraft 26.1.1 anvil adapter"
}
```

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- 直前stable release: 26.1
- Required delta reports: assets=`spec/map/evidence/version-deltas/26.1.1/assets.json`, Anvil=`spec/map/evidence/version-deltas/26.1.1/anvil.json`, Dynmap oracle=`spec/map/evidence/version-deltas/26.1.1/dynmap-oracle.json`, Dynmap source delta=`spec/map/evidence/version-deltas/26.1.1/dynmap-source-delta.json`, Paper=`spec/map/evidence/version-deltas/26.1.1/paper.json`, parity=`spec/map/evidence/version-deltas/26.1.1/parity.json`.
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 26.1.1 / 2026-04-01T09:06:36+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/e5cbc96c826605221c7107aa8f45087d3569c447/26.1.1.json |
| client JAR | https://piston-data.mojang.com/v1/objects/377031a9e733ba8ab4d355959a8f6fb8eb707556/client.jar; SHA-1 377031a9e733ba8ab4d355959a8f6fb8eb707556; 38113231 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/49c8195703ad0ba4f0a4efbccfd85a4a8ca57431/server.jar; SHA-1 49c8195703ad0ba4f0a4efbccfd85a4a8ca57431; 60417481 bytes |
| asset index | id 30; SHA-1 1cf55e789e49796e91b0258d4012e653b0e6acc3; 548391 bytes; https://piston-meta.mojang.com/v1/packages/1cf55e789e49796e91b0258d4012e653b0e6acc3/30.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 25 |
| Paper version catalog | exact version listed; build/channel/artifact unverified |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

このexact releaseの公式server由来world fixtureから保存形式差分を抽出し、既存Rust decoder profileで扱えるか実fixtureで確認する。

## データ差分と実装profileの判定

このrelease固有のデータ差分は省略せず記録・fixture化する。一方、データfingerprintが違うことだけを理由にRust adapterを追加しない。既存汎用profileが全対象difference caseでexact-version reference parityを通せば共有し、既存profileで再現できないformat/API/render behavior gapが具体的traceで確認された場合だけ、phase graphに独立したadapter実装phaseを追加する。データfingerprint一致はno-delta判定の条件であり、implementation profile共有の唯一条件ではない。

- 入力契約: 上表の公式release artifact、dynmap-oracle reportが選定したexact-version対応Dynmap source/build、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. exact server JARを公式SHA-1/lengthで検証し、seed/options/edition/level settings/source digestを固定した生成world fixtureを作る。DataVersion整数だけをschema同一性の根拠にしない。
2. dimension別min/max Y、region sector/compression、chunk NBT fields、sections、block/biome palette containerとpacked bit layout、heightmap、sky/block light、block entity、chunk statusをfixture bytesから抽出する。
3. 直前stable releaseの同一world recipeと比較し、field add/remove/rename/type/encoding changesを`spec/map/evidence/version-deltas/26.1.1/anvil.json`へ記録する。no-diffはnormalized schema fingerprint一致を要する。
4. 実schemaが異なる場合も、既存generic decoder profileがその差分を正しく扱えるか exact fixture/reference domain digestで試験する。既存profileが拒否・誤解するsemantic layout差がある場合だけversion adapter phaseを作り、差分・失敗trace・更新後のdecode evidenceをリンクする。
5. 1.18のheight expansionとchunk NBT/section/biome layout transitionなど、format boundaryごとに実fixtureを作り、該当する既存または新adapterのdecode/result digestを比較する。
6. negative coordinate、missing/truncated/corrupt section、wrong DataVersion、neighboring region/section boundaryは当該schema profileに対応したfailure fixtureへ割り当てる。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 26.1.1 --phase anvil
bun scripts/check-map-version-phase.mjs --version 26.1.1 --phase anvil --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: audit minecraft 26.1.1 anvil schema delta
```
