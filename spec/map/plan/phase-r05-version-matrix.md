# R05: Minecraft version matrix and primary-source metadata

## 目的

R05は、対応版を曖昧な「1.14以降」として扱わず、Mojang official version manifestのrelease entryを個別に固定する。各版のclient/server JAR、asset index、Java requirement、Anvil/Paper adapter/evidenceを別フィールドで管理する。

## 対象範囲

- Minecraft Java Edition `1.14`以上`26.3`以下
- official release entryのみ。snapshot、pre-release、latest aliasは含めない
- version matrixに存在しない版は対応済みと名乗らない

## 生成物

- `spec/map/coverage/version-matrix.json`
- `scripts/fetch-map-version-metadata.mjs`
- `scripts/verify-map-version-artifacts.mjs`

Mojang metadata取得時点では`status: metadata_verified`、`artifactStatus: not_downloaded`とする。Paper build、dataVersion、Anvil adapter、Paper snapshot adapter、Dynmap reference captureが揃うまで`verified`へ昇格させない。

## Gate

```bash
node scripts/fetch-map-version-metadata.mjs
node scripts/verify-map-version-artifacts.mjs
node scripts/check-map-renderer-coverage.mjs
```

最終audit用のstrict gateは、各版にartifact・adapter・reference evidenceが揃うまで失敗する。

```bash
node scripts/check-map-renderer-coverage.mjs --require-all-versions
```

## 完了条件

- official manifest由来の個別entryが`1.14`〜`26.3`の範囲で登録される
- client/server/asset indexのURL・SHA-1・byte lengthが固定される
- 送信先がMojangのHTTPS hostに限定される
- `latest`、任意redirect、mutable query URLを受け入れない
- metadata catalogとartifact/adapter verifiedを分離する
- 未検証版はstrict gateで明示的に失敗する

このphaseの完了はversion metadataの固定であり、各版のAnvil/Paper/renderer parity完了ではない。

## Commit

```text
chore: establish minecraft version compatibility matrix
```
