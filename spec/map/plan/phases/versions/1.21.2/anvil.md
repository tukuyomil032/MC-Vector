# V-1.21.2-anvil: 1.21.2 Anvil schema delta audit and decoder-profile assignment

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-1.21.2-anvil",
  "kind": "version",
  "document": "phases/versions/1.21.2/anvil.md",
  "dependsOn": [
    "P-002",
    "P-006",
    "P-007",
    "P-011"
  ],
  "commitMessage": "feat: add minecraft 1.21.2 anvil adapter"
}
```

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- 直前stable release: 1.21.1
- Required delta reports: assets=`spec/map/evidence/version-deltas/1.21.2/assets.json`, Anvil=`spec/map/evidence/version-deltas/1.21.2/anvil.json`, Dynmap oracle=`spec/map/evidence/version-deltas/1.21.2/dynmap-oracle.json`, Dynmap source delta=`spec/map/evidence/version-deltas/1.21.2/dynmap-source-delta.json`, Paper=`spec/map/evidence/version-deltas/1.21.2/paper.json`, parity=`spec/map/evidence/version-deltas/1.21.2/parity.json`.
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.2 / 2024-10-22T09:58:55+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/1a7c9df30ab5916a361f117ecea4e07f2a3cfd14/1.21.2.json |
| client JAR | https://piston-data.mojang.com/v1/objects/c7ac2d0d86f4ca416cab9064ff8a281852ad0c7b/client.jar; SHA-1 c7ac2d0d86f4ca416cab9064ff8a281852ad0c7b; 27842947 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/7bf95409b0d9b5388bfea3704ec92012d273c14c/server.jar; SHA-1 7bf95409b0d9b5388bfea3704ec92012d273c14c; 56120171 bytes |
| asset index | id 18; SHA-1 fa0e9bba478d434dd64e7e334f84a4e6307a4283; 457929 bytes; https://piston-meta.mojang.com/v1/packages/fa0e9bba478d434dd64e7e334f84a4e6307a4283/18.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 21 |
| Paper version catalog | exact version not listed in 2026-09-23 snapshot |
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
3. 直前stable releaseの同一world recipeと比較し、field add/remove/rename/type/encoding changesを`spec/map/evidence/version-deltas/1.21.2/anvil.json`へ記録する。no-diffはnormalized schema fingerprint一致を要する。
4. 実schemaが異なる場合も、既存generic decoder profileがその差分を正しく扱えるか exact fixture/reference domain digestで試験する。既存profileが拒否・誤解するsemantic layout差がある場合だけversion adapter phaseを作り、差分・失敗trace・更新後のdecode evidenceをリンクする。
5. 1.18のheight expansionとchunk NBT/section/biome layout transitionなど、format boundaryごとに実fixtureを作り、該当する既存または新adapterのdecode/result digestを比較する。
6. negative coordinate、missing/truncated/corrupt section、wrong DataVersion、neighboring region/section boundaryは当該schema profileに対応したfailure fixtureへ割り当てる。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.21.2 --phase anvil
bun scripts/check-map-version-phase.mjs --version 1.21.2 --phase anvil --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: audit minecraft 1.21.2 anvil schema delta
```
