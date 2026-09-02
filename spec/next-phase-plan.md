# MC-Vector Next Phase Plan — Tauri版整理 + macOS Native版

> 最終更新: 2026-07-13(Phase 5完了を反映)
> 要件定義・実現可能性調査: `spec/native-macos-requirements.md`
> 各フェーズの詳細タスク分解: `spec/phase-tasks.md`

## 全体像

```text
MC-Vector Classic (Tauri / React / Rust)      MC-Vector Native (SwiftUI / AppKit)
  クロスプラットフォーム安定版                    macOS Tahoe+ 旗艦版・独立実装
        │                                              │
        └──────────── データ契約(JSONスキーマ) ─────────┘
```

Rust Coreの共有・デーモン化は行わない。両実装はデータ契約(サーバー定義JSON等)のみを一致させる独立プロジェクトとして進める(`spec/native-macos-requirements.md` §4参照)。

## フェーズマトリクス

| Phase | 内容 | 状態 | 備考 |
|---|---|---|---|
| 0 | 要件定義・実現可能性調査 | ✅ 完了 (2026-07-08) | `spec/native-macos-requirements.md`。当初デーモン化前提だったが独立実装方針へ改訂済み |
| 1 | Tauri版内部整理(emit抽象化・純関数化。`security.rs`パターンの横展開) | セキュリティ監査対応中 | Rust側managed path、用途別download/archive/network policy、renderer IPC境界の整理を優先。Swift版との共有が目的ではなく、Tauri版単体の保守性向上が目的 |
| 2 | Native macOS Spike セットアップ(SPM構成・SwiftLint/SwiftFormat・`native.yml`・lefthook追加) | ✅ 完了 | `apps/native-macos/`にPackage.swift(executable+library+testTarget)構築済み(PR #153) |
| 3-A | 実機検証3項目(NSPanel×glassEffect / Hardened Runtime下のJava起動 / 高頻度ログ描画performance) | ✅ 完了 (2026-07-09) | `spec/phase3a-spike-results.md`。NSPanelブリッジ方式・entitlements不要・ScrollView+LazyVStack方式を確定(PR #154) |
| 3-B | Native macOS Spike 本体(SwiftUI: 一覧/詳細/起動停止/ログ/Floating Console/Activity Drawer + security.rs移植) | ✅ 完了 (2026-07-09) | `spec/phase-tasks.md` 3-4〜3-12全完了。3-4〜3-11実装+3-12 swiftui-pro全体レビュー実施済み(下記「Phase 3-B完了時の申し送り」参照) |
| 4 | Navigation Shell + View Routing(サイドバーナビタブ + ビュー切替基盤) | ✅ 完了 (2026-07-10) | `AppView` enum(12 cases) + `NavigationItem`(SF Symbols) + `NavigationState` + `ContentRouter` + `ServerListView`の2セクション化。テスト85件全パス。ブランチ: `feat/native-macos-phase4-navigation-shell` |
| 5 | Dashboard(KPIカード + リアルタイムチャート) | ✅ 完了 (2026-07-13) | `ServerPerformanceService` (proc_pid_rusage 1Hz) + `TPSExtractor` (Paper/LeafMC 対応) + `DashboardViewModel` + `DashboardView` (6 KPI + 3 Swift Charts)。stdout ブロードキャスタ化・`.online` イベント発火・PID API を service 層へ追加。テスト 130 件全パス。ブランチ: `feat/native-macos-phase5-dashboard` |
| 6 | Console フル機能化(ANSI色・検索・コマンド履歴・ログフィルタ) | 未着手 | 既存コンソールの大幅拡張。Phase 5完了後すぐに着手可能 |
| 7 | Server CRUD + サイドバー強化(作成・削除・複製・テンプレート・グルーピング・バルク操作) | 未着手 | Phase 8-13の前提 |
| 8 | Properties + Server Settings | 未着手 | server.propertiesエディタ + サーバー設定画面。Phase 7完了後 |
| 9 | Users(ホワイトリスト・OP・BAN管理) | 未着手 | Phase 7完了後 |
| 10 | Files(ファイルブラウザ + テキストエディタ) | 未着手 | Phase 7完了後 |
| 11 | Backups(バックアップ作成・リストア・管理) | 未着手 | Phase 7完了後 |
| 12 | Plugins/Mods(Modrinth・Hangar・SpigotMC API連携) | 未着手 | Phase 7完了後 |
| 13 | Proxy + 静的ドキュメント | 未着手 | Phase 7完了後 |
| 14 | App Settings + i18n + Command Palette | 未着手 | 他と並行可 |
| 15 | ダウンロード + Ngrok + ポリッシュ + データ契約文書化 | 未着手 | 最終フェーズ |

## フェーズ体系改訂について (2026-07-10)

Phase 3-B完了後、当初予定していたPhase 4（データ契約文書化）とPhase 5（Tahoe UI refinement）を見直し、**Tauri版の全UI/機能をSwift版で再現する**ことを最優先とするフェーズ体系に改訂した。データ契約の文書化とUI精緻化は全画面実装完了後（Phase 15）に実施する。詳細な実装プランは `.claude/plans/1-mc-vector-swift-mc-vector-tauri-swift-woolly-wozniak.md` を参照。

## Phase 3-B完了時の申し送り

3-12(swiftui-pro 9段階レビュー)で洗い出した指摘のうち、その場で修正した2件(エラー表示欠落・`ActivityDrawerView`のファイル分割)を除き、以下は意図的に未着手のまま次フェーズへ持ち越す:

- **ViewModel間のエラーハンドリング方針の不統一**: `ServerListViewModel`(alertで表示)・`ServerLogViewModel`(エラー面なし)・`FloatingConsolePanelController`(該当なし)で扱いがバラバラ。フェーズ体系改訂により最終ポリッシュフェーズ(Phase 15)で対応する
- **spacing/paddingのハードコード値**: `ServerLogView`/`ServerDetailView`/`ActivityDrawerView`/`FloatingConsoleContentView`/`DashboardView` に散在。数値自体に矛盾はないが共通定数化されていない。Phase 15 のデザインシステム整備と合わせて対応する
- **Liquid Glassの適用範囲**: 現状`FloatingConsoleContentView`のヘッダー1箇所のみ(`spec/native-macos-requirements.md` §5.4の「機能レイヤー限定」方針通り)。アプリ全体が揃った状態でこのバランスが最終形として妥当か、Phase 15 で最終判断する

## Phase 5完了時の申し送り (2026-07-13)

- **`DashboardViewModel` の stdout 購読は init 時に一度だけ attach**: Dashboard 画面を開いた時点でサーバー未起動の場合、後から起動しても TPS 収集が始まらない。Tauri 版と同じ挙動だが、ユーザーが「ダッシュボード → サーバー起動」の順に操作すると気付きにくい。実運用でサイドバー選択後の起動フローが主なので直ちに問題にはならないが、後続フェーズで再購読方針を検討
- **チャート視覚ポリッシュ未確認**: 実サーバー起動下での軸密度・チャート高さ・マーカーサイズは reasonable defaults のまま。Phase 15 のポリッシュフェーズで実サーバー起動時の見た目調整を行う
- **CPU の 100 超え表記**: `ServerPerformanceService` の CPU は multi-core 合計 (Tauri sysinfo と同じ挙動)。4-core JVM で ~400% になる。KPI カードとチャート y-scale は動的に対応済みだが、UX として「100% 超が正常」であることを表現する説明が不足。Phase 15 のツールチップまたはラベル追加で対応

## 運用ルール

- Tauri版とNative版はロジックを共有しない。共有するのはデータ契約(JSONスキーマ)のみ
- `security.rs`相当の正しさが重要な処理は、Swift移植時にロジックとテストケースを忠実に移植する
- 各フェーズは新ブランチ + PR単位で進める(スカッシュマージ不使用)
- 言語を問わず各タスクにテストコードを追加する
- プラグイン管理等をNative版に実装する段階で「二重実装がつらい」と分かった場合は、共有方式(FFI/プロセス分離)への転換を再評価する(`spec/native-macos-requirements.md` §4.2の記録を参照)

## Security Audit Follow-up

- High findings H-01 through H-05 and Medium findings M-01 through M-07 are being addressed on
  `fix/security-audit-hardening`.
- Plugin artifacts without a published checksum are rejected by default. The application-wide
  setting `allowUnverifiedPluginDownloads` is an explicit compatibility opt-in; published hashes
  are still verified when present.
- Existing ad-hoc signing is intentionally retained. `codesign --verify` is blocking, while
  Gatekeeper assessment remains informational until Developer ID signing and notarization are
  introduced.
- Low findings L-01 through L-03 remain outside the current implementation scope.

## Feedback and notification policy

The renderer uses one shared feedback policy through `AppFeedbackProvider` and
`src/renderer/shared/feedback.ts`:

- `toast`: successful completion, lightweight information, and background completion that does not
  require user action. Toasts are polite live-region notifications and never take focus.
- `inline`: a screen- or card-scoped failure that the user can retry or correct. Search failures
  retain the previous results and expose retry next to the search controls. Plugin network failures
  use the same card-scoped retry surface.
- `blocking dialog`: security refusals, confirmed incompatibility, integrity failures, and any
  decision that must stop the operation. These use the shared Radix dialog with a title,
  description, explicit close action, keyboard focus management, Escape handling, and textual
  severity information.
- `progress`: long-running downloads and other operations that need ongoing progress.

The PluginBrowser is the first complete consumer. A confirmed incompatible plugin never reaches a
provider API, download IPC, or filesystem operation; unknown compatibility remains installable.
Hashless artifact rejection, checksum failures, source/destination policy failures, and size
violations are blocking dialogs. Network failures are inline retryable errors. Successful install,
overwrite, and update operations retain success toasts only. Browser-required Hangar/Spigot
resources are informational actions, not install-error toasts.

The remaining notification inventory is intentionally staged rather than changed in one sweep:

| Area | Current policy | Follow-up |
|---|---|---|
| Server lifecycle and bulk operations | Existing success/error callbacks, routed through the shared toast boundary | Move recoverable lifecycle failures to screen-scoped inline errors and blocking decisions in the next migration task |
| Backup create/restore/delete | Success remains toast; failure paths are still mixed | Add restore/delete-specific dialog and retry surfaces |
| File delete/move and editor failures | Existing screen-specific handling | Convert destructive and recovery-required failures to shared dialogs/inline errors |
| Java and ngrok downloads | Progress/success infrastructure exists | Add typed failure presentation and retry surfaces |
| Settings saves | Success toast and existing inline rollback in settings | Keep rollback inline; use shared dialog only for policy refusals |
| Simple destructive confirmations | Native Tauri `ask` | Keep while the interaction is a simple yes/no confirmation |
| Rich confirmations and security explanations | Shared Radix dialog | Required for future cross-screen migrations |
