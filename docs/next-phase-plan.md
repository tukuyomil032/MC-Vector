# MC-Vector Next Phase Plan (Codebase Audited)

最終更新: 2026-04-01

このドキュメントは、現行コードを監査したうえで「実装済みは除外し、未実装または不足だけ」を次フェーズ対象にする計画です。

## 1. 監査サマリ

### 1.1 既に実装済み(再提案しない)

| 項目 | 状態 | 実装根拠 | 残課題 |
| --- | --- | --- | --- |
| #11 ログ検索 | Implemented | ConsoleViewに`searchQuery`/`totalMatches`/`jumpToMatch`あり | 検索状態の永続化なし |
| #12 ログフィルタ | Implemented | `logFilter`と`detectLogLevel`でALL/INFO/WARN/ERROR/FATAL切替 | 構造化ログ解析ではなくキーワード判定 |
| #17 コマンド履歴 | Partial | `commandHistory` + Up/Down履歴移動あり | メモリ内のみで永続化なし |
| #39 自動バックアップスケジュール | Implemented | interval/daily/weekly + 曜日指定 + 時刻指定を実装 | 実行履歴の蓄積UIなし |
| #6 クラッシュ検知自動再起動 | Implemented | offlineイベント時の自動再起動、試行回数上限、待機秒数あり | backoff戦略と監査ログが弱い |
| #29 依存関係チェック | Implemented | Modrinth依存解決と不足依存の一括導入フローあり | 依存ツリー可視化なし |
| #30 有効/無効トグル | Implemented | `.disabled`付け替えで有効化/無効化を実装 | 一括切替やプロファイル化なし |
| #32 バージョン互換チェック | Implemented | Compatibility判定バッジと互換情報表示あり | 判定理由の詳細表示が不足 |
| #28 更新通知 | Implemented (v1) | 導入済みModrinth/Hangarに対して更新バッジと候補サマリを表示 | Spigot対応と履歴保存は未対応 |
| ログ描画の50msバッファ | Implemented | `consoleStore`でログを50ms単位にまとめて反映 | flush統計や可視化メトリクスは未実装 |

### 1.2 未実装または不足(次フェーズ対象)

| 項目 | 状態 | 不足点 |
| --- | --- | --- |
| #17 コマンド履歴 | Partial | セッション内履歴のみで永続化・サーバー別履歴・履歴UIがない |
| サーバー状態機械(Stopped/Starting/Running/Stopping/Crashed/Restarting) | Partial | 実体はonline/offline中心で`crashed`状態を明示していない |
| Plugin Adapter層分離 | Partial | `src/lib/plugin-commands.ts`に実装が集中し`src/lib/adapters/plugin`未整備 |
| Guard層分離 | Partial | 型ガードは存在するが`src/lib/guards`へ分離されていない |

## 2. 次フェーズ実装計画(未実装/不足のみ)

### 2.1 Phase A (完了)

1. #28 プラグイン更新通知
- 結果: 導入済みModrinth/Hangarに対する更新候補表示を追加

2. ログ取り込みのバッファリング(50ms)
- 結果: `consoleStore`で50msバッファ反映を実装

### 2.2 Phase B (最優先)

1. #17 コマンド履歴の永続化
- 目的: 再起動後も運用コマンドを再利用できるようにする
- 変更:
  - 履歴をサーバーID単位で保存
  - 直近N件の重複圧縮と履歴削除機能を追加
  - ConsoleViewに履歴ドロワーを追加
- 受け入れ条件:
  - アプリ再起動後に履歴が復元される
  - サーバー切替時に履歴コンテキストが正しく切り替わる

### 2.3 Phase C (運用信頼性)

1. サーバー状態機械の厳密化
- 目的: UI操作可否と実行状態を一致させる
- 変更:
  - Rustイベントを`starting/running/stopping/stopped/crashed/restarting`へ拡張
  - フロントの`ServerStatus`と制御ロジックを同期
  - 手動停止と異常停止の判定を明確化
- 受け入れ条件:
  - 意図停止時に`crashed`へ遷移しない
  - 異常終了時は`crashed -> restarting -> starting`が確認できる

2. 自動再起動のバックオフ戦略
- 目的: 連続クラッシュ時の再試行スパイクを抑える
- 変更:
  - 固定待機秒数に加えて指数バックオフを選択可能にする
  - 失敗理由と試行履歴を保存
- 受け入れ条件:
  - 連続失敗時に再試行間隔が段階的に伸びる
  - 履歴画面で試行回数と失敗理由が確認できる

### 2.4 Phase D (構造改善)

1. Plugin Adapter分離
- 目的: ソース差異吸収をUIから切り離す
- 変更:
  - `src/lib/adapters/plugin`配下にModrinth/Hangar/Spigotアダプタ実装
  - `plugin-commands.ts`は公開APIの薄いファサードに縮小
- 受け入れ条件:
  - UI側が生レスポンス型を参照しない
  - 既存機能(検索、導入、README、互換判定)が回帰しない

2. Guard層分離
- 目的: 型ガードを共通化し保守性を上げる
- 変更:
  - `src/lib/guards`へ判定関数を移設
  - Adapter層でのみ外部payloadをパース
- 受け入れ条件:
  - unknown入力のガード漏れがない
  - `any`追加なし

## 3. 新規タブ提案(本当に未搭載)

### 3.1 Ops Timeline Tab (新規)

- 既存との差分:
  - Dashboard/Consoleには時系列統合ビューがない
  - バックアップ、再起動、更新イベントを横断して見られない
- MVP:
  - 直近24時間のイベント時系列(ログ、状態遷移、自動バックアップ、自動再起動)
  - 重大イベントのフィルタ(ERROR/CRASH/RESTART)
  - クリックで該当サーバーのConsoleへジャンプ

### 3.2 Update Center Tab (新規)

- 既存との差分:
  - アプリ本体更新はあるが、プラグイン更新の集中管理画面がない
- MVP:
  - サーバーごとの更新候補一覧
  - 互換性リスク付き一括更新プレビュー
  - 更新履歴(成功/失敗/ロールバック要否)

## 4. 推奨着手順

1. Phase A-1: #28 更新通知
2. Phase A-2: ログ50msバッファ
3. Phase B-1: #17 コマンド履歴の永続化
4. Phase C-1: 状態機械の厳密化
5. Phase D-1: Adapter/Guard分離
6. 新規タブはOps Timelineから着手

## 5. 直近タスク(最小着手セット)

1. #17向けに履歴保存ストア仕様を定義する
2. Rustの`server-status-change`イベント拡張案を設計する
3. Adapter/Guard移設対象関数の一覧を作る
