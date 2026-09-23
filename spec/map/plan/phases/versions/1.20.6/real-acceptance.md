# V-1.20.6-real-acceptance: 1.20.6 real Paper/Tauri acceptance

## exact version identity

- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。
- current version matrix record:

| 項目 | exact matrix value |
| --- | --- |
| release/time | 1.20.6 / 2024-04-29T12:40:45+00:00 |
| official version JSON | https://piston-meta.mojang.com/v1/packages/c9b52edcb15feffc8ea0c4c90027e20cdcb1b1f6/1.20.6.json |
| client JAR | https://piston-data.mojang.com/v1/objects/05b6f1c6b46a29d6ea82b4e0d42190e42402030f/client.jar; SHA-1 05b6f1c6b46a29d6ea82b4e0d42190e42402030f; 26565641 bytes |
| server JAR | https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar; SHA-1 145ff0858209bcfc164859ba735d4199aafa1eea; 51420480 bytes |
| asset index | id 16; SHA-1 c1fa4a8d41b8104ae6a8f9d32b5de21e72f49cdd; 446564 bytes; https://piston-meta.mojang.com/v1/packages/c1fa4a8d41b8104ae6a8f9d32b5de21e72f49cdd/16.json |
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
bun scripts/run-map-version-phase.mjs --version 1.20.6 --phase real-acceptance
bun scripts/check-map-version-phase.mjs --version 1.20.6 --phase real-acceptance --require-evidence
```

両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。

## Commit

```text
test: record real map acceptance for minecraft 1.20.6
```
