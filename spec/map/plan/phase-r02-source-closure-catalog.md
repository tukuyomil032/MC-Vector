# R02: Pinned Dynmap renderer source closure catalog

## 目的

R02はRust移植の完了を宣言するphaseではない。Dynmap v3.0のpinned revisionから、MC-Vectorのrendererが依存し得るJava symbol、resource、built-in rendererを漏れなく列挙し、後続phaseのsource→Rust→fixture→reference→evidenceの追跡単位を固定する。

## 対象

- Revision: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- `DynmapCoreAPI/.../renderer/`
- `DynmapCore/.../hdmap/`
- `DynmapCore/.../utils/`
- `DynmapCore/src/main/resources/` の全blob。web、markers、admin用resourceは除外スコープとして記録する。

## 生成物

- `spec/map/coverage/source-symbols.json`
- `spec/map/coverage/resources.json`
- `spec/map/coverage/builtin-renderers.json`
- `scripts/generate-map-renderer-coverage.mjs`
- `scripts/check-map-renderer-coverage.mjs`

Java sourceはclass単位で止めず、取得したsource本文から型とmethod symbolを抽出する。抽出時点では`status: cataloged`、`implementationStatus: not_started`とし、後続のR03以降でverified evidenceへ昇格する。catalogedは実装済みを意味せえへん。

## 失敗状態

- pinned revision以外のtreeを受け入れない
- GitHub treeがtruncatedなら生成を中断する
- Java本文を取得できないsymbolを空のまま成功扱いしない
- `planned`のentryを許可しない
- renderer resourceをplatform resourceとして隠さない

## 実行コマンド

```bash
node scripts/generate-map-renderer-coverage.mjs
node scripts/check-map-renderer-coverage.mjs
```

ネットワークが利用できない環境ではcatalog生成を実行せず、既存catalogのrevisionと件数を検証する。catalogを手編集して件数だけ合わせることは禁止する。

## 完了条件

- source catalogが空でない
- resource catalogが空でない
- built-in renderer catalogが空でない
- 全entryがpinned revisionを持つ
- `planned` entryがない
- すべての未移植項目が`implementationStatus: not_started`として明示されている
- `--require-all-*`は未実装項目を失敗として報告する

このphaseの完了は「依存閉包の棚卸し完了」であり、renderer parityやDynmap完全再実装の完了ではない。

## Commit

```text
chore: catalog complete dynmap renderer source closure
```
