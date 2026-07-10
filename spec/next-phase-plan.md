# MC-Vector Next Phase Plan — Tauri版整理 + macOS Native版

> 最終更新: 2026-07-10(Phase 4完了・フェーズ体系改訂を反映)
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
| 1 | Tauri版内部整理(emit抽象化・純関数化。`security.rs`パターンの横展開) | 未着手・要否は別途判断 | Swift版との共有が目的ではなく、Tauri版単体の保守性向上が目的。着手時に `/writing-plans` で実装プラン作成 |
| 2 | Native macOS Spike セットアップ(SPM構成・SwiftLint/SwiftFormat・`native.yml`・lefthook追加) | ✅ 完了 | `apps/native-macos/`にPackage.swift(executable+library+testTarget)構築済み(PR #153) |
| 3-A | 実機検証3項目(NSPanel×glassEffect / Hardened Runtime下のJava起動 / 高頻度ログ描画performance) | ✅ 完了 (2026-07-09) | `spec/phase3a-spike-results.md`。NSPanelブリッジ方式・entitlements不要・ScrollView+LazyVStack方式を確定(PR #154) |
| 3-B | Native macOS Spike 本体(SwiftUI: 一覧/詳細/起動停止/ログ/Floating Console/Activity Drawer + security.rs移植) | ✅ 完了 (2026-07-09) | `spec/phase-tasks.md` 3-4〜3-12全完了。3-4〜3-11実装+3-12 swiftui-pro全体レビュー実施済み(下記「Phase 3-B完了時の申し送り」参照) |
| 4 | Navigation Shell + View Routing(サイドバーナビタブ + ビュー切替基盤) | ✅ 完了 (2026-07-10) | `AppView` enum(12 cases) + `NavigationItem`(SF Symbols) + `NavigationState` + `ContentRouter` + `ServerListView`の2セクション化。テスト85件全パス。ブランチ: `feat/native-macos-phase4-navigation-shell` |
| 5 | Dashboard(KPIカード + リアルタイムチャート) | 未着手 | パフォーマンス監視サービス + Swift Charts。Phase 4完了後すぐに着手可能 |
| 6 | Console フル機能化(ANSI色・検索・コマンド履歴・ログフィルタ) | 未着手 | 既存コンソールの大幅拡張。Phase 4完了後すぐに着手可能 |
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

- **ViewModel間のエラーハンドリング方針の不統一**: `ServerListViewModel`(alertで表示)・`ServerLogViewModel`(エラー面なし)・`FloatingConsolePanelController`(該当なし)で扱いがバラバラ。統一方針を決めるのはPhase 4以降(データ契約文書化)かPhase 5(UI精緻化)のどちらかで判断
- **spacing/paddingのハードコード値**: `ServerLogView`/`ServerDetailView`/`ActivityDrawerView`/`FloatingConsoleContentView`に散在。数値自体に矛盾はないが共通定数化されていない。Phase 5のデザインシステム整備と合わせて対応するのが効率的
- **Liquid Glassの適用範囲**: 現状`FloatingConsoleContentView`のヘッダー1箇所のみ(`spec/native-macos-requirements.md` §5.4の「機能レイヤー限定」方針通り)。アプリ全体が揃った状態でこのバランスが最終形として妥当か、Phase 5(Tahoe UI refinement)で判断する

## 運用ルール

- Tauri版とNative版はロジックを共有しない。共有するのはデータ契約(JSONスキーマ)のみ
- `security.rs`相当の正しさが重要な処理は、Swift移植時にロジックとテストケースを忠実に移植する
- 各フェーズは新ブランチ + PR単位で進める(スカッシュマージ不使用)
- 言語を問わず各タスクにテストコードを追加する
- プラグイン管理等をNative版に実装する段階で「二重実装がつらい」と分かった場合は、共有方式(FFI/プロセス分離)への転換を再評価する(`spec/native-macos-requirements.md` §4.2の記録を参照)
