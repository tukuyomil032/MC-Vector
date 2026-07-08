# MC-Vector: Rust Core化 + macOS Tahoe Native版 — 要件定義・実現可能性調査

> 作成日: 2026-07-08 / ステータス: 調査完了・要件確定
> 元構想メモ: `~/Documents/mc-vector-rust-core-native-macos-plan.md`
> 本ドキュメントは要件定義であり、実装プランではない。実装プランはフェーズごとに別途作成する(`docs/next-phase-plan.md` 参照)。

## 1. 目的

MC-Vector を以下の2本柱で進化させる。

1. **Rustメイン化** — Tauri非依存の `mc-vector-core` crate へサーバー管理の中核ロジックを集約し、「TypeScriptが計画しRustが実行する」現状から「Rustが計画・検証・実行し、UIは表示・操作に専念する」構造へ転換する
2. **MC-Vector Native** — macOS Tahoe (26)+ 向けの Swift 6 / SwiftUI / AppKit ネイティブ版を、同じ Rust Core の上に構築する。Tauri版はクロスプラットフォーム安定版として維持し、Native版はmacOS旗艦版として再設計する

## 2. 確定事項(意思決定ログ)

| 論点 | 決定 | 背景 |
|---|---|---|
| リポジトリ | 既存リポジトリ内でモノレポに再編 | Git履歴・PR運用・CIを維持 |
| 配布形態 | Notarized DMG (App Store外) | Javaプロセス起動・任意パス操作がApp Store Sandboxと非互換 |
| Core接続方式 | **プロセス分離: Rust Coreデーモン + JSON-RPC over UDS** | §4.1 の調査結果。Tauri/Swift両UIから同一Coreを共有できる唯一素直な方式 |
| 型の正本 | Rust型を単一正本とし各言語へ生成 | §4.3。JSON Schema正本方式は型生成精度で劣る |
| Native版OS下限 | macOS 26 (Tahoe) 以降のみ | Liquid Glass・新Concurrencyをフル活用。旧OSはTauri版でカバー |
| Native版Spike範囲 | サーバー一覧・詳細・起動/停止・ログストリーム・Floating Console Panel・Activity Drawer | 機能数ではなく操作感・Core接続の現実性を検証する最小構成 |
| 並行開発 | Core化を優先、Tauri版新機能は抑制(バグ修正のみ) | コンフリクトと二重実装の最小化 |
| Floating Panel の Liquid Glass | 実機検証で判断。許容不可なら標準Materialへフォールバック | 非アクティブ時のglass劣化という既知リスクあり(§4.2) |

## 3. 現状分析(2026-07 コードベース調査)

### 3.1 規模と重心

- TS/TSX: 約21,600行(テスト除く) / Rust: 約3,220行 — 比率 6.7 : 1
- ロジックの重心は完全にTS側。Rustは「実行係」に留まっている

### 3.2 Rust側 (`src-tauri`、単一crate・workspace未構成)

- **分離良好(そのままCore移設可)**: `security.rs`(純関数+薄ラッパ+unit test済) / `perf.rs` / `process_stats.rs` / `updater_utils.rs` / `health_check.rs`
- **密結合(Core切り出しの主障害)**: `server.rs` / `ngrok.rs` — プロセス管理ロジック・Tauri State・`AppHandle::emit` が巨大async関数内に混在
- **中程度**: `backup.rs` / `java.rs` / `download.rs` / `file_utils.rs`(進捗emitと`app_data_dir()`依存)
- State構造体(`ServerManager`等)は `Arc<Mutex<...>>` ベースでTauri型非依存 → 移設容易
- ジョブシステムは存在しない(各コマンドが `tokio::spawn` + 都度emit) → 新規設計が必要
- 依存クレートの中核(tokio/reqwest/zip/sysinfo/serde)は全て汎用 → Core化の土台はある

### 3.3 TS側に残るビジネスロジック(Rust Core化候補)

優先度 高:

1. **プラグイン/Mod解決エンジン**: `src/lib/plugin-commands.ts` + `src/lib/adapters/plugin/*` — Modrinth/Hangar/Spiget のパース・互換性判定・バージョン解決・インストール
2. **サーバー定義の正本管理**: `src/lib/server-commands.ts` — 現状「定義=TS(servers.json via Tauri Store) / ランタイム状態=Rust」の**二重正本問題**あり
3. **サーバー作成オーケストレーション**: `src/renderer/hooks/use-server-create-action.ts` — ID生成・ディレクトリ作成・JAR URL解決(Paper/LeafMC/Vanilla/Fabric分岐)・DL指示。`version-commands.ts` と重複あり

優先度 中:

4. Java解決ロジック: `src/lib/java-commands.ts`(Adoptium URL組立、OS/arch判定、削除パス導出)
5. server.properties パーサ/シリアライザ + EULA生成(生成コードは現状存在しない。スキーマは `src/renderer/shared/propertiesData.ts`)
6. バックアップスケジュール計算: `src/renderer/shared/auto-backup.ts`

### 3.4 型共有の現状

ts-rs / specta 未導入。全て手書き手動同期(camelCase変換も手動)。実行時ガード(`guards/json-guards.ts`)でAPI JSONを吸収している。**Core化の前提整備として型生成の導入が最優先横断課題**。

## 4. 技術調査結果(2026-07 Web調査)

### 4.1 Rust⇔Swiftブリッジ方式の比較

| 観点 | UniFFI 0.31.x | swift-bridge | 手書きC FFI | プロセス分離(デーモン+IPC) |
|---|---|---|---|---|
| 成熟度 | ◎ Mozilla本番・活発 | △ 個人メンテ | ○ 全部自作 | ◎ 概念は枯れている |
| async | ◎ tokio統合(制約あり) | ○ | × 手書き | ◎ 境界で自然 |
| イベントストリーム | ○ callback→AsyncStream橋渡し | ○ | △ | ◎ server-push が第一級 |
| Tauri/Swift両UIでCore共有 | × UI別バインディング | × | × | ◎ 同一デーモンを共有 |
| クラッシュ分離 | × | × | × | ◎ UIが落ちてもサーバー生存 |
| ビルド/運用複雑性 | ○ cargo-swift等 | ○ | △ | △ プロセス管理が増える |

- UniFFI既知の制約: `async_runtime="tokio"` がexported traitのasyncメソッドに効かない([uniffi-rs #2576](https://github.com/mozilla/uniffi-rs/issues/2576))、同期メソッド内`tokio::spawn`問題([#2811](https://github.com/mozilla/uniffi-rs/issues/2811))。ジェネリクス/ライフタイム不可
- 実プロダクション採用: Firefox/Matrix SDK=UniFFI、Signal=手書きC ABI、1Password=独自FFI(TypeShare+JSON)
- TauriアプリがRust常駐デーモンにUDS接続する実例あり(interprocess crate / local_socket)

**採用: プロセス分離(デーモン + JSON-RPC over UDS)**。理由: (a) Tauri/Swift両UIから同一Coreという要件を唯一素直に満たす (b) tokioをCore内に閉じ込めUniFFIのランタイム制約を回避 (c) ログ/進捗ストリームがプロトコルの第一級市民 (d) UIクラッシュとMinecraftサーバーの分離。UniFFI/XCFramework(Mozilla方式: cargo staticlib → lipo → xcframework → SwiftPM binaryTarget)は、将来インプロセス直接呼び出しが必要になった場合の代替として記録する。

### 4.2 macOS Tahoe / Liquid Glass / Swift 6.2

**バージョン状況(2026-07)**: macOS Tahoe 26.5.2 が現行公開版。Xcode 26.5(Swift 6.3.2)/26.6(Swift 6.3.3)。要件下限は「Xcode 26+ / Swift 6.2+」、実開発は6.3.x追随を推奨。macOS 26はIntel対応最後のメジャー版。

**Liquid Glass API(全てmacOS 26.0+)**:

- `.glassEffect(_:in:)` + `Glass.regular/.clear/.identity`(`.tint()`/`.interactive()`)
- `GlassEffectContainer`(複数glass要素のモーフィング/ブレンド。glass同士はサンプリング不可のため必須)
- `.glassEffectID` / `.glassEffectUnion` / `.glassEffectTransition` / `.glassBackgroundEffect` / `.buttonStyle(.glass)`
- Apple公式ガイダンス: **機能レイヤー(toolbar/ナビ/コントロール)限定、コンテンツ本体には使わない。glassの入れ子禁止**。標準コンポーネント(Toolbar/Inspector/NavigationSplitView/sheet)は再コンパイルだけで自動glass化 — 構想メモの「使い所を限定する」方針と一致

**Swift 6.2+ Concurrency**: 新規プロジェクトは default MainActor isolation が既定ON。Approachable Concurrency + `@concurrent` / `nonisolated(nonsending)`。方針: 「全部MainActor、重い処理(プロセス管理/ログストリーム)だけ明示オフロード」。

**SwiftUI on macOS 26新機能**: `WindowLevel`(SwiftUIシーンだけでfloatingウィンドウが可能に)、`ToolbarSpacer`、ウィンドウリサイズ同期アニメーション、List大幅高速化。

**Floating Console Panelの実装2択**:

- (A) 純SwiftUI: `Window`シーン + 新`WindowLevel`(簡潔)
- (B) NSPanelブリッジ: `.nonactivatingPanel` + `isFloatingPanel` + `NSHostingView`(非アクティブ化挙動の細かい制御が必要なら確実)
- **既知リスク**: NSHostingView内の`.glassEffect`はアプリ非アクティブ時に単なるブラーへ劣化する報告あり。nonactivatingPanelでは特に起きやすい → Spike最初期の実機検証項目

**配布**: Developer ID署名 + `notarytool` + stapler の従来フローに破壊的変更なし。Hardened Runtime必須。Java子プロセス起動に絡むentitlements(`com.apple.security.cs.allow-jit`等)の要否洗い出しが設計課題。

### 4.3 モノレポ構成・型共有・CI

- **Cargo workspace + Tauri v2**: 公式サポートあり(`cargo metadata`でworkspace root/target dir自動検出)。注意: (1) target dirがworkspaceルートへ移る (2) Tauri CLIに`--manifest-path`相当がなく `apps/tauri` へ`cd`して実行(pnpm scriptでcwd固定)
- **Rust→TS型生成**: tauri-specta(コマンド+イベントまで型安全化。v2はRC段階でバージョン固定必須) / ts-rs(安定だが型のみ)
- **Rust→Swift型生成**: デーモン方式のためUniFFI不要。`schemars`でRust型→JSON Schema→quicktypeでSwift Codable生成
- **CI**: ubuntu(cargo test + Tauriビルド + pnpm) / macos(Xcodeビルドのみ、変更検知でスキップ)にジョブ分割。キャッシュ: Swatinem/rust-cache(ルートtarget/一本化) + pnpm store-dir明示 + Xcode Cache action(DerivedData)

## 5. 要件定義

### 5.1 目標アーキテクチャ

```text
mc-vector/  (既存リポジトリを再編)
├─ Cargo.toml                  # [workspace]
├─ crates/
│  ├─ mc-vector-core/          # UI非依存ドメインロジック + 型の単一正本
│  │   (server / java / plugin / backup / files / jobs / settings / events)
│  └─ mc-vector-daemon/        # Core をホストする常駐プロセス
│      (JSON-RPC over UDS サーバー、ジョブ実行、イベントpush)
├─ apps/
│  ├─ tauri/                   # 既存Tauri版(src-tauri + React)。デーモンのクライアントに移行
│  └─ native-macos/            # SwiftUI版(Xcodeプロジェクト)。デーモンのクライアント
├─ shared/
│  └─ schemas/                 # schemarsでRust型から生成したJSON Schema(契約の可視化用)
└─ .github/workflows/          # ubuntu + macos 分割CI
```

### 5.2 Core接続方式: プロセス分離デーモン + JSON-RPC over UDS

- Rust Core(tokio)を `mc-vector-daemon` として常駐化。Tauri/Swift双方が同一プロトコルで接続
- イベント(サーバーログ・進捗・ステータス)はJSON-RPC notificationでpush。Swift側は`AsyncStream`、TS側は既存イベントリスナ層に写像
- **副次効果**: UIを閉じてもMinecraftサーバーが生存(現Tauri版にない価値)。UIクラッシュとサーバーの分離
- デーモンライフサイクル: UIアプリが起動時にspawn(ソケット存在チェック→なければ起動)。stale socket削除・所有者限定パーミッション。launchd登録は将来検討。プロトコルバージョンをhandshakeで確認

### 5.3 型共有

- **正本はRust型**(`mc-vector-core`内)
- → TypeScript: specta(またはts-rs)で生成。tauri-specta採用時はRC段階のためバージョン固定
- → Swift: schemars → JSON Schema → quicktype で Codable 生成
- → RPCメソッド定義もRust側を正本にコード生成、または薄い手書きクライアント

### 5.4 Rust Core化の対象と優先順

1. 前提整備: workspace化 + 型生成導入 + ジョブシステム新設(job_id/kind/status/progress/cancel + イベント配信)
2. `server.rs`/`ngrok.rs`のemit→`trait EventSink`/mpsc化、`app_data_dir`の引数注入化(`security.rs`の「純関数+薄ラッパ+unit test」パターンを横展開)
3. サーバー定義の正本をTS(servers.json)からCoreへ移管(二重正本の解消)
4. プラグイン解決エンジン(`plugin-commands.ts` + adapters)のRust移植
5. サーバー作成オーケストレーション(`provision_server(spec)`ジョブ化、失敗時ロールバック、registryのatomic update)
6. Java解決 / server.propertiesパーサ+EULA生成 / バックアップスケジュール計算

UI側に残す処理(構想メモの基準を踏襲): モーダル開閉・タブ・トースト・入力途中状態・表示ソート・エディタ/チャート/ターミナルの見た目。**アプリの正しさに関わるもの → Rust、見た目と操作感に関わるもの → UI側**。

### 5.5 Native版要件(Spike)

- 対象: macOS 26 (Tahoe)+ / Xcode 26+ / Swift 6.2+(6.3.x追随)
- Swift設定: default MainActor isolation + Approachable Concurrency ON。重い処理のみ`@concurrent`/actorへ
- スコープ: サーバー一覧・詳細・起動/停止・ログストリーム・Floating Console Panel・Activity Drawer
- UI: NavigationSplitView + Inspector + Toolbar(標準コンポーネントの自動glass化を活用、カスタムglassは機能レイヤー限定)
- Floating Panel: NSPanelブリッジ と 純SwiftUI(WindowLevel) を検証して選択
- 配布: Developer ID + notarytool + Hardened Runtime。Java子プロセス起動のentitlements要否を洗い出す
- Tauri版の完全コピーにしない。macOSネイティブアプリとして再設計する(構想メモ NG 2)

### 5.6 Spike最初期の実機検証項目

1. NSPanel×glassEffectの非アクティブ時劣化(許容不可なら標準Materialへフォールバック — 方針確定済み)
2. デーモンspawn/再接続/stale socket処理の堅牢性
3. ログストリームのUDS越しスループット(高頻度ログでのUI描画)
4. Hardened Runtime下でのJavaプロセス起動

## 6. リスクと既知の制約

| リスク | 影響 | 緩和策 |
|---|---|---|
| デーモン運用複雑性(起動監視・更新・配布) | 中 | UIからのspawn方式で開始、launchdは後回し。handshakeでプロトコルバージョン確認 |
| Tauri版のデーモンクライアント化は大規模改修 | 高 | 段階移行: まずcrate分離、Tauri版は当面in-process参照のまま、デーモン化はNative Spike前に実施 |
| tauri-specta RC段階 | 低 | バージョン固定。破壊時はts-rsへ退避 |
| glass非アクティブ劣化 | 低 | 実機検証→Materialフォールバック(確定済み) |
| Tauri CLIの`--manifest-path`欠如 | 低 | pnpm scriptでcwd固定 |
| UniFFI tokio制約(#2576/#2811) | なし | デーモン方式採用により回避(記録のみ) |
| macOSランナーCIコスト | 低 | 変更検知でXcodeジョブをスキップ |

## 7. 主要出典

- UniFFI: <https://mozilla.github.io/uniffi-rs/latest/futures.html> / <https://mozilla.github.io/uniffi-rs/latest/foreign_traits.html> / issues [#2576](https://github.com/mozilla/uniffi-rs/issues/2576), [#2811](https://github.com/mozilla/uniffi-rs/issues/2811)
- Mozilla方式(XCFramework + SwiftPM): <https://mozilla.github.io/application-services/book/design/swift-package-manager.html>
- Tauri IPC / プロジェクト構成: <https://v2.tauri.app/concept/inter-process-communication/> / <https://v2.tauri.app/start/project-structure/> / discussions [#13941](https://github.com/orgs/tauri-apps/discussions/13941), [#7368](https://github.com/orgs/tauri-apps/discussions/7368)
- Tauri + 常駐デーモンUDS実例: <https://dev.to/hiyoyok/ipc-pipe-vs-unix-socket-for-a-resident-daemon-in-tauri-what-i-learned-fa6>
- Liquid Glass: <https://developer.apple.com/documentation/swiftui/view/glasseffect(_:in:)> / <https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views>
- WWDC25 What's new in SwiftUI: <https://developer.apple.com/videos/play/wwdc2025/256/> / <https://developer.apple.com/documentation/swiftui/windowlevel>
- Swift 6.2 Concurrency: <https://www.donnywals.com/setting-default-actor-isolation-in-xcode-26/> / <https://www.avanderlee.com/concurrency/approachable-concurrency-in-swift-6-2-a-clear-guide/>
- Floating Panel: <https://cindori.com/developer/floating-panel> / glass劣化報告 <https://www.hackingwithswift.com/forums/swiftui/glasseffect-in-floating-window-panel/30067>
- Notarization: <https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>
- 型生成: <https://github.com/specta-rs/tauri-specta> / <https://ahl.dtrace.org/2024/01/22/rust-and-json-schema/> / <https://quicktype.io/>
