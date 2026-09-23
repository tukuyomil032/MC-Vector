# V-26.1.1-assets: 26.1.1 renderer asset delta audit and compatibility assignment

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-26.1.1-assets",
  "kind": "version",
  "document": "phases/versions/26.1.1/assets.md",
  "dependsOn": [
    "P-002",
    "P-008",
    "P-012",
    "P-014",
    "P-016",
    "P-018"
  ],
  "commitMessage": "feat: add minecraft 26.1.1 asset profile"
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

このexact releaseの実client JAR・asset-index・runtime registryを直前stable releaseと比較し、データ差分とRust implementation-profile差分を分けて証明する。

## データ差分と実装profileの判定

このrelease固有のデータ差分は省略せず記録・fixture化する。一方、データfingerprintが違うことだけを理由にRust adapterを追加しない。既存汎用profileが全対象difference caseでexact-version reference parityを通せば共有し、既存profileで再現できないformat/API/render behavior gapが具体的traceで確認された場合だけ、phase graphに独立したadapter実装phaseを追加する。データfingerprint一致はno-delta判定の条件であり、implementation profile共有の唯一条件ではない。

- 入力契約: 上表の公式release artifact、dynmap-oracle reportが選定したexact-version対応Dynmap source/build、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. version-matrix.jsonのexact client JAR、version JSON、asset-index JSONを公式SHA-1/lengthと実取得bytesで照合し、各取得ファイルのSHA-256を保存する。
2. client JAR ZIP entryとasset-index object mappingを別々に完全inventory化し、両rootの実bytesを検証する。JAR内resourceとindex objectのどちらか片方に全assetsがあると仮定しない。
3. 両rootからprovenanceを保持したcanonical logical-resource mapを作る。source path、logical path、official SHA-1/size、downloaded SHA-256、consumer/model edge、version-specific runtime precedenceを記録する。同一logical pathの同一bytesだけdeduplicate可。異なるbytesはexact runtime source resolutionでdeterministic precedenceを証明し、rule fixture/referenceを残すまではfailureとする。
4. blockstate→variant/multipart selector→resolved model graph（model inheritance/texture variable/geometry/face）→texture/metadataのrenderer closureを両rootから解決し、added/removed/changed block registry ID・full state property/value・selector・model edge・texture pixel/alpha digest・biome/material/light/emission・source locationのdelta entryを`spec/map/evidence/version-deltas/26.1.1/assets.json`へ記録する。
5. 完全なclientJarEntries、assetIndexObjects、canonicalResourceMap、blockRegistry、blockStates、resolvedModelGraph、rendererAssetClosure inventoryを生成し、exact target/baseline artifactsへ結びつける。unmapped block/state、missing/unverified bytes、unresolved edge、ambiguous/conflicting sourceをcoverage failureにする。
6. 全new/changed renderer-visible stateをfixture→exact-version Dynmap trace→Rust pixel comparisonへ結ぶ。removed/renamed stateは既存world chunk decode behaviorもfixture化し、resource filename差分だけを新ブロック証拠にしない。
7. データ差分があっても、既存汎用implementation profileですべてのchanged-state fixturesがreference parityを通る場合はそのprofileを再利用し、版固有adapterは作らない。現行profileで失敗する場合だけbehavior-gapと失敗traceを記録し、独立implementation phaseへ送る。
8. renderer-input差分なしと主張する場合は両source-root artifact digest、runtime resource-resolution policy digest、registry/model/resource closure digest、extractor revision、normalized renderer-input fingerprintの一致を保存する。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 26.1.1 --phase assets
bun scripts/check-map-version-phase.mjs --version 26.1.1 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: audit minecraft 26.1.1 renderer asset delta
```
