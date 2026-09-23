# V-1.20.5-assets: 1.20.5 renderer asset delta audit and compatibility assignment

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "V-1.20.5-assets",
  "kind": "version",
  "document": "phases/versions/1.20.5/assets.md",
  "dependsOn": [
    "P-002",
    "P-008",
    "P-012",
    "P-014",
    "P-016",
    "P-018"
  ],
  "commitMessage": "feat: add minecraft 1.20.5 asset profile"
}
```

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- 直前stable release: 1.20.4
- Required delta reports: assets=`spec/map/evidence/version-deltas/1.20.5/assets.json`, Anvil=`spec/map/evidence/version-deltas/1.20.5/anvil.json`, Dynmap oracle=`spec/map/evidence/version-deltas/1.20.5/dynmap-oracle.json`, Dynmap source delta=`spec/map/evidence/version-deltas/1.20.5/dynmap-source-delta.json`, Paper=`spec/map/evidence/version-deltas/1.20.5/paper.json`, parity=`spec/map/evidence/version-deltas/1.20.5/parity.json`.
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.20.5 / 2024-04-23T11:54:12+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/f884bec1bcf9fb50b1ade2406310cb12aaf422fd/1.20.5.json |
| client JAR | https://piston-data.mojang.com/v1/objects/c6b92b2374a629f20802bb284f98a4ee790e950a/client.jar; SHA-1 c6b92b2374a629f20802bb284f98a4ee790e950a; 26565623 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/79493072f65e17243fd36a699c9a96b4381feb91/server.jar; SHA-1 79493072f65e17243fd36a699c9a96b4381feb91; 51424012 bytes |
| asset index | id 16; SHA-1 c1fa4a8d41b8104ae6a8f9d32b5de21e72f49cdd; 446564 bytes; https://piston-meta.mojang.com/v1/packages/c1fa4a8d41b8104ae6a8f9d32b5de21e72f49cdd/16.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 21 |
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
4. blockstate→variant/multipart selector→resolved model graph（model inheritance/texture variable/geometry/face）→texture/metadataのrenderer closureを両rootから解決し、added/removed/changed block registry ID・full state property/value・selector・model edge・texture pixel/alpha digest・biome/material/light/emission・source locationのdelta entryを`spec/map/evidence/version-deltas/1.20.5/assets.json`へ記録する。
5. 完全なclientJarEntries、assetIndexObjects、canonicalResourceMap、blockRegistry、blockStates、resolvedModelGraph、rendererAssetClosure inventoryを生成し、exact target/baseline artifactsへ結びつける。unmapped block/state、missing/unverified bytes、unresolved edge、ambiguous/conflicting sourceをcoverage failureにする。
6. 全new/changed renderer-visible stateをfixture→exact-version Dynmap trace→Rust pixel comparisonへ結ぶ。removed/renamed stateは既存world chunk decode behaviorもfixture化し、resource filename差分だけを新ブロック証拠にしない。
7. データ差分があっても、既存汎用implementation profileですべてのchanged-state fixturesがreference parityを通る場合はそのprofileを再利用し、版固有adapterは作らない。現行profileで失敗する場合だけbehavior-gapと失敗traceを記録し、独立implementation phaseへ送る。
8. renderer-input差分なしと主張する場合は両source-root artifact digest、runtime resource-resolution policy digest、registry/model/resource closure digest、extractor revision、normalized renderer-input fingerprintの一致を保存する。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.20.5 --phase assets
bun scripts/check-map-version-phase.mjs --version 1.20.5 --phase assets --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: audit minecraft 1.20.5 renderer asset delta
```
