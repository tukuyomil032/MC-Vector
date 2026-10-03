# V-1.21.7-real-acceptance: 1.21.7 real Paper/Tauri acceptance

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.21.7 / 2025-06-30T09:32:16+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/5297156351f0ae2d132e7bb89fbee25a8127c15d/1.21.7.json |
| client JAR | https://piston-data.mojang.com/v1/objects/a2db1ea98c37b2d00c83f6867fb8bb581a593e07/client.jar; SHA-1 a2db1ea98c37b2d00c83f6867fb8bb581a593e07; 29522178 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/05e4b48fbc01f0385adb74bcff9751d34552486c/server.jar; SHA-1 05e4b48fbc01f0385adb74bcff9751d34552486c; 57556704 bytes |
| asset index | id 26; SHA-1 62ed5debfe241ed0ab32c3b6fcf50a80ce11a59a; 491670 bytes; https://piston-meta.mojang.com/v1/packages/62ed5debfe241ed0ab32c3b6fcf50a80ce11a59a/26.json |
| DataVersion / minimum Java | 未取得。公式server artifactから抽出 / 21 |
| Paper build / jar SHA-256 | 未登録 / 未登録 |
| Anvil / Paper snapshot / reference | 未登録 / 未登録 / 未登録 |
| matrix state | metadata_verified; artifact not_downloaded |

## 目的と依存

実Paperと実Tauriでterrain生成から停止・port releaseまで、この版の証拠を採取する。

- 入力契約: 上表の公式release artifact、revision-pinned Dynmap reference、shared renderer contract。
- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。
- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。

## 個別作業

1. verified Core artifactとversion-matched Paperを起動し、plugin load、hello/heartbeat、loaded snapshotを記録する。
2. 実world terrain、Anvil/live diagnostics、PNG生成、tile cache reuse、client assetとCore分離を確認する。
3. UIでzoom 8→0、cursor anchor、上下左右edge anchor、pan、adjacent tile、old layer保持を操作する。
4. offline/malformed/missing assetではconsentがenabledにならず、retryable reasonがredactedであることを確認する。
5. UIからPaperを停止し、Java process終了とport 25565解放を確認した後にdebug appを閉じる。

## 失敗と検証

artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。

```bash
bun scripts/run-map-version-phase.mjs --version 1.21.7 --phase real-acceptance
bun scripts/check-map-version-phase.mjs --version 1.21.7 --phase real-acceptance --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: record real map acceptance for minecraft 1.21.7
```
