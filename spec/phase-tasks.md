# MC-Vector Native macOS — Phase別タスク分解

> 関連: `spec/next-phase-plan.md`（フェーズマトリクス）, `spec/native-macos-requirements.md`（要件定義・実現可能性調査）
> 最終更新: 2026-07-08

## 設計方針

- 各フェーズは新ブランチ + PR単位（既存運用ルール `spec/next-phase-plan.md` 準拠）。フェーズ内タスクは「1コミット1タスク」を基本単位とし、`/subagent-driven-development` での実行を想定して各タスクは「単独でビルド/テストが通る」「1〜3ファイル程度の変更」を目安にする。
- タスクの粒度基準: (a) 独立してレビュー可能な差分であること、(b) 失敗時にロールバックしても他タスクに影響しないこと、(c) 実装者（サブエージェント）が質問なしで着手できる程度に自己完結した仕様を持つこと。この3条件を満たす最小単位に分解した。
- 依存関係が強いタスク（例: `Package.swift`雛形 → SwiftLint plugin追加）は明示的に順序をつけ、独立タスク（例: SwiftLintとlefthookは並行可）は並行実行可能と注記する。
- Phase 3では、このリポジトリに新規追加された3つのSwiftスキル（`swift-concurrency` / `swiftui-expert-skill` / `swiftui-pro`）のうち、各タスクで使うべきものを明記する。

---

## Phase 1（オプション・参考プラン）

> **本フェーズは「着手要否は別途判断」（`spec/next-phase-plan.md`）であり、現時点では実行対象ではない。** 着手判断が下った場合の参考タスクリストとしてのみ記録する。着手する場合もNative版とはロジック非依存のため、Phase 2〜5と並行して別ブランチで進行できる。

| # | タスク | 内容 | 依存 |
|---|---|---|---|
| 1-1 | `server.rs` の emit抽象化: `trait EventSink` 定義 | `security.rs`の「純関数+薄ラッパ」パターンを参考に、`AppHandle::emit`呼び出しを`trait EventSink`経由に置き換えるための抽象層のみを追加（既存呼び出し箇所はまだ置き換えない） | なし(起点) |
| 1-2 | `server.rs` のプロセス起動/監視ロジックを純関数へ抽出 | `tokio::spawn`内の巨大async関数から、状態遷移・バリデーション部分を単体テスト可能な純関数に分離。`EventSink`経由でemit | 1-1 |
| 1-3 | `server.rs` 純関数化に対するunit test追加 | 1-2で抽出した純関数に対するテストを`security.rs`と同水準で追加 | 1-2 |
| 1-4 | `ngrok.rs` の emit抽象化(1-1のtraitを再利用) | `ngrok.rs`側のemit呼び出しを`EventSink`に置き換え | 1-1 |
| 1-5 | `ngrok.rs` のロジック純関数化+unit test | 1-4と同様のパターンを`ngrok.rs`に横展開 | 1-4 |
| 1-6 | サーバー定義の正本問題の調査タスク(ADR作成、実装なし) | servers.json(TS)とランタイム状態(Rust)の二重正本問題について、移管する/しないの意思決定を`spec/`にADRとして記録するのみ(コード変更なし) | なし(独立) |
| 1-7 | プラグイン解決エンジン整理 | 変更範囲が大きいため、着手判断が出た時点で改めて`/writing-plans`でサブプランを作成する。**本タスクリストの対象外** | — |

**理由付け**: 1-1/1-4のtrait定義を先に独立タスクとして切ることで、後続の置き換え作業(1-2, 1-5)がコンパイル可能な中間状態を保てる(段階的リファクタの原則)。1-6は「正しさ」に関わる設計判断でありコード変更を伴わないため、実装タスクと分離して先に意思決定を固定する。1-7はスコープが大きく「1コミット1タスク」に収まらないため、着手時に別途プラン化するとしてこのリストからは明示的に除外する(将来の膨張を防ぐ)。

---

## Phase 2: Native macOS Spike セットアップ(SPM構成・Lint・CI・lefthook)

| # | タスク | 内容 | 依存 |
|---|---|---|---|
| 2-1 | `apps/native-macos/` ディレクトリ作成 + 最小`Package.swift` | executable(`MCVectorNative`)+ library(`MCVectorNativeKit`)+ testTarget(`MCVectorNativeKitTests`)の3ターゲット構成を作成。`swift-tools-version:6.2`、`platforms: [.macOS(.v26)]`を明記。executable側は`@main`のみの薄いエントリポイント | なし(起点) |
| 2-2 | `MCVectorNativeKit` に空のプレースホルダView + `#Preview`動作確認 | ライブラリターゲット分離が`#Preview`を機能させることを確認する最小SwiftUI View(例: `RootView.swift`)を追加 | 2-1 |
| 2-3 | `MCVectorNativeKitTests` に最小テスト1件追加、`swift test`通過確認 | テストターゲットが機能することを保証する土台テスト | 2-1 |
| 2-4 | SwiftFormat導入(SPM build tool plugin) | `Package.swift`にSwiftFormat pluginを依存追加、フォーマットルール設定ファイル(`.swiftformat`)を配置 | 2-1 |
| 2-5 | SwiftLint導入(SPM build tool plugin) | `Package.swift`にSwiftLint plugin追加、`.swiftlint.yml`配置(strict設定はCI用、autocorrectはローカル用に分離) | 2-1 |
| 2-6 | lefthook.yml へ `lint-format-swift` ジョブ追加 | `glob: 'apps/native-macos/**/*.swift'`で既存`fmt-rust`/`lint-format-ts`と同パターンのフックを追加。ローカルでのSwift実行環境が無い場合のフォールバック(スキップ条件)も明記 | 2-4, 2-5 |
| 2-7 | `.github/workflows/native.yml` 作成: Lintジョブ(ubuntu-latest) | SwiftLint/SwiftFormatのチェックのみを`ubuntu-latest`で実行するジョブ。`paths: ['apps/native-macos/**']`フィルタ設定 | 2-4, 2-5 |
| 2-8 | `native.yml` にビルド/テストジョブ(macos-latest)追加 | `swift build`/`swift test`を`macos-latest`で実行。`-skipPackagePluginValidation`フラグの要否を検証し必要なら追加 | 2-1, 2-3, 2-7(同一ファイルのため直列) |
| 2-9 | README/CLAUDE.md への Native版ビルド手順追記 | ルート`CLAUDE.md`もしくは`apps/native-macos/README.md`に`swift build`/`swift test`の実行方法を追記 | 2-1〜2-8完了後 |

**理由付け**: 2-1(Package.swift雛形)を全ての起点とし、その後「ライブラリ分離の動作確認(2-2/2-3)」と「ツールチェーン導入(2-4/2-5)」を並行させられる独立系統に分けた。lefthookとnative.ymlのLintジョブ(2-6/2-7)はどちらもLintツール設定(2-4/2-5)に依存するが互いには依存しないため並行可能。ビルドジョブ(2-8)は同一ファイル`native.yml`をLintジョブ(2-7)の後に追記する形にして無用なマージコンフリクトを避ける。

---

## Phase 3: Native macOS Spike本体(画面群 + 実機検証)

画面ごとに独立タスク化し、実機検証3項目もそれぞれ独立タスクとする。

### 3-A. 実機検証(最優先、画面実装より先に着手)

| # | タスク | 内容 | 使用スキル | 依存 |
|---|---|---|---|---|
| 3-1 | 実機検証: NSPanel×glassEffectの非アクティブ時劣化検証 | 最小限のNSPanelブリッジ(`.nonactivatingPanel`+`NSHostingView`)実装と、純SwiftUI `Window`+`WindowLevel`実装の2パターンを作り、非アクティブ時のglass描画を実機で比較。結果を`spec/`に記録し、Floating Panelの実装方式(A/B)をこの時点で確定する | swiftui-expert-skill(Liquid Glass, Instruments .traceでの描画検証) | Phase 2完了 |
| 3-2 | 実機検証: Hardened Runtime下でのJavaプロセス起動 | 最小限のJavaサブプロセス起動テストハーネス(`Process`経由でjavaコマンド実行)をHardened Runtime + ad-hoc署名でビルドし、起動可否とentitlements要否(`com.apple.security.cs.allow-jit`等)を洗い出す | swift-concurrency(Process起動のasync/await化、@concurrentオフロード方針の検証) | Phase 2完了(3-1と並行可) |
| 3-3 | 実機検証: 高頻度ログ時のUI描画パフォーマンス | ダミーの高頻度ログ生成(例: 1000行/秒)を`List`/`ScrollView`にストリーム表示し、Instruments `.trace`でヒッチ/CPUホットスポットを計測。結果に応じ差分更新戦略(バッチ化/仮想化)を決定 | swiftui-expert-skill(Instruments .trace record_trace.py/analyze_trace.py活用、List/ForEach安定ID) | Phase 2完了(3-1, 3-2と並行可) |

**理由付け**: この3項目は「Floating Panelの実装方式」「Javaプロセス起動の実現性」「ログ描画のアーキテクチャ」という、後続の全画面実装の前提を決めるため、画面実装より先に必ず着手する。3つは互いに独立した検証対象(異なるView/プロセス)なので並行実行可能。

### 3-B. 画面実装(3-A完了後、依存順に実施)

| # | タスク | 内容 | 使用スキル | 依存 |
|---|---|---|---|---|
| 3-4 | データモデル層: `Server`/`ServerStatus`等のドメインモデル定義 | `ServerTemplate`(TS側 `src/lib/server-commands.ts`)を参考に、Swift側の`struct Server: Codable`等を`MCVectorNativeKit`に定義。servers.json読み書きの最小実装(まだUIなし) | swift-concurrency(Sendable適合の確認) | 3-1, 3-2完了(データ契約の形が固まってから) |
| 3-5 | サーバー一覧画面(NavigationSplitViewのサイドバー) | `List`でサーバー一覧を表示。安定ID・`@Observable`ベースの一覧ViewModelを実装 | swiftui-expert-skill(状態管理/@Observable、List/ForEach安定ID) | 3-4 |
| 3-6 | サーバー詳細画面(Inspector/detail pane) | 選択中サーバーの詳細表示。NavigationSplitViewのdetail領域として実装 | swiftui-expert-skill(ビュー構成/データフロー) | 3-5 |
| 3-7 | サーバー起動/停止機能 | Java子プロセス起動・停止ロジック(3-2の検証結果を反映)をServiceとして実装し、詳細画面のToolbarボタンと接続 | swift-concurrency(プロセス管理のactor化、@MainActorとのオフロード境界設計) | 3-6, 3-2 |
| 3-8 | ログストリーム画面 | 3-3の検証結果(バッチ化/仮想化戦略)を反映した本実装。起動中サーバーの標準出力を購読しUIへ反映 | swift-concurrency(AsyncStreamでのログ配信) → swiftui-expert-skill(List差分更新パフォーマンス) の順で適用 | 3-7, 3-3 |
| 3-9 | Floating Console Panel | 3-1で確定した実装方式(NSPanelブリッジ or 純SwiftUI Window)で本実装。ログストリーム(3-8)を表示するパネルとして接続 | swiftui-expert-skill(Liquid Glass適用、WindowLevel) | 3-8, 3-1 |
| 3-10 | Activity Drawer | 起動/停止/バックアップ等のアクティビティ履歴を表示するdrawer UI。Inspector/sheetパターンで実装 | swiftui-expert-skill(標準コンポーネントの自動glass化活用) | 3-6 |
| 3-11 | `security.rs`相当ロジックの移植: 認可・監査層 | `security.rs`のロール認可(`authorize`)・レート制限(`check_rate_limit`)・安全パス解決(`resolve_safe_path`)・監査エントリ生成(`build_audit_entry`)をSwiftへ移植し、Rust側のunit test(15件程度)を1件ずつ忠実にSwift Testへ移植する。「共有せず移植」を徹底 | swift-concurrency(actorでの状態保護、レート制限のスレッドセーフ性検証) | 3-7(サーバー起動と統合する前提のため) |
| 3-12 | Phase 3全体レビュー: swiftui-pro 9段階レビュー実施 | 3-4〜3-11で実装した全View/ViewModelに対し、swiftui-proの9段階レビュープロセス(非推奨API→パフォーマンス→コードハイジーン)を適用し、指摘事項をBefore/After形式でまとめ、必要なら追加タスクとして切り出す | swiftui-pro | 3-4〜3-11完了 |

**理由付け**:
- データモデル(3-4)を全画面実装の起点に置くのは、servers.jsonのデータ契約が固まらないと画面のViewModelが書けないため。
- 一覧→詳細→起動停止→ログ→Floating Panel→Activity Drawerの順は、画面間の参照関係(詳細は一覧の選択を受ける、Floating Panelはログの購読先を必要とする)に沿った自然な依存順。Activity Drawerのみ詳細画面から独立して並行可能。
- `security.rs`移植(3-11)を独立タスクとして切り出したのは、これが「画面」ではなく「横断的な正しさが重要なロジック」であり、テストケース単位での忠実な移植という性質上、UIタスクとは別のレビュー基準(仕様の一致率)が必要なため。起動/停止(3-7)の後に置くのは、認可チェックの適用対象となる操作が先に実装されている必要があるため。
- swift-concurrencyはプロセス/非同期処理系のタスク、swiftui-expert-skillは状態管理・パフォーマンス・Liquid Glass系、swiftui-proは仕上げの横断レビューという役割分担にした。
- 3-12(swiftui-pro全体レビュー)をPhase 3の最後に置くのは、9段階レビューが個別画面ではなく実装済みコード全体に対して行うのが効果的なため(個々のタスクで都度レビューすると同じ指摘の繰り返しになりやすい)。

---

## Phase 4: データ契約の文書化(servers.jsonスキーマ等)

| # | タスク | 内容 | 依存 |
|---|---|---|---|
| 4-1 | 配置場所の意思決定(ADR) | `spec/`直下 か 新設`shared/schemas/`かを決定し、`spec/native-macos-requirements.md`または新規ADRファイルに記録(コード変更なし) | Phase 3完了(実データ構造がPhase 3で固まった後の方が精度が高い) |
| 4-2 | `servers.json` のJSON Schema定義作成 | TS側`ServerTemplate`(`src/lib/server-commands.ts`)とSwift側`Server`構造体(3-4)を突き合わせ、両者が一致するJSON Schemaファイルを1つ作成 | 4-1, 3-4 |
| 4-3 | TS側にスキーマ検証テスト追加 | 4-2のJSON Schemaに対し、TS側の`servers.json`書き込み結果を検証するテスト(既存`guards/json-guards.ts`と統合、またはAjv等での軽量検証)を追加 | 4-2 |
| 4-4 | Swift側にスキーマ検証テスト追加 | 4-2のJSON Schemaに対し、Swift側の`Server`エンコード/デコード結果を検証するテストを`MCVectorNativeKitTests`に追加 | 4-2 |
| 4-5 | スキーマドキュメント執筆(人間向けMarkdown) | JSON Schemaの各フィールドの意味・型・両実装での扱いの違い(camelCase変換等)を説明するドキュメントを`spec/`に追加。将来の変更時に両実装で追随すべき手順もここに明記 | 4-2〜4-4 |
| 4-6 | `spec/next-phase-plan.md` のPhase 4ステータス更新 | フェーズ完了をステータス表に反映 | 4-1〜4-5完了後 |

**理由付け**: 配置場所の意思決定(4-1)を最初に固定するのは、後続タスクのファイルパスが決まらないと着手できないため。TS側検証(4-3)とSwift側検証(4-4)は同一スキーマ(4-2)に依存するが互いには依存しないため並行実行可能。ドキュメント(4-5)は実装済みスキーマの内容を反映する必要があるため最後に置く。

---

## Phase 5: Tahoe UI refinement(Liquid Glass調整)

| # | タスク | 内容 | 使用スキル | 依存 |
|---|---|---|---|---|
| 5-1 | Toolbar/Inspector/NavigationSplitViewの標準glass化の目視確認+微調整 | 自動glass化されている標準コンポーネントの見た目をmacOS 26実機で確認し、必要ならスペーシング/`ToolbarSpacer`調整のみ行う(独自glass適用はしない領域) | swiftui-expert-skill | Phase 3完了 |
| 5-2 | 機能レイヤーへのカスタム`.glassEffect`適用(サーバー起動/停止ボタン等) | Apple公式ガイダンス(機能レイヤー限定・glass入れ子禁止)に従い、操作系コントロールに`Glass.regular`/`.interactive()`を適用 | swiftui-expert-skill(Liquid Glass) | 5-1 |
| 5-3 | Floating Console Panelのglass最終調整 | 3-1/3-9で決めた実装方式を前提に、`GlassEffectContainer`によるモーフィング/`glassEffectID`調整を行い、非アクティブ時劣化の許容度を最終確認 | swiftui-expert-skill | 5-1, 3-9 |
| 5-4 | ウィンドウリサイズ同期アニメーション対応 | macOS 26新機能のウィンドウリサイズ同期アニメーションを一覧/詳細画面に適用 | swiftui-expert-skill | 5-1 |
| 5-5 | Activity Drawerのアニメーション/トランジション調整 | drawerの開閉アニメーション、`glassEffectTransition`の適用 | swiftui-expert-skill | 5-1 |
| 5-6 | swiftui-pro最終レビュー(HIG準拠・アクセシビリティ項目) | 9段階レビューのうちHIG準拠・アクセシビリティに絞った再チェックをUI調整後の状態に対して実施 | swiftui-pro | 5-2〜5-5完了 |
| 5-7 | `spec/next-phase-plan.md` 全フェーズ完了ステータス更新 | Phase 5完了をもって全体のステータス表を更新 | 5-6完了後 |

**理由付け**: 5-1(標準コンポーネントの目視確認)を全ての起点にしたのは、Apple公式ガイダンス通り「機能レイヤー限定」の判断基準を実機で確認してから、カスタムglass適用(5-2〜5-5)の範囲を決める必要があるため。5-2〜5-5は対象コンポーネントが異なるため並行実行可能。5-6の最終レビューは全UI調整が終わった状態でのみ意味を持つため最後に置く。

---

## フェーズ横断の補足

- 各タスクの粒度は概ね「1〜3ファイル、実装+テストで1コミット」に収まるよう設計した。3-7(起動/停止)や3-11(security.rs移植)はやや大きめだが、これは機能の完結性(認可ロジックはテストケース単位で分割するとかえって仕様の一貫性検証が困難になる)を優先したトレードオフ。
- Phase 3の実機検証(3-1〜3-3)は「タスク」だが、その性質上は調査であり、結果次第で後続タスク(3-9のFloating Panel実装方式など)の内容が変わりうる。これは`spec/native-macos-requirements.md` §6のリスク表にある既知の不確実性であり、タスクリスト自体もその判断結果を反映して更新される前提とする。
- Phase 1はオプションフェーズであり、着手判断が出るまでは他フェーズの進行をブロックしない。もし着手する場合も、Native版とはロジック非依存のため、Phase 2〜5と並行して別ブランチで進めることが可能。
- 次に実際にコーディングへ着手する場合は、`/clear` 後の新セッションで本ファイルのPhase 2セクション(2-1から)を起点に `/subagent-driven-development` で実行する。
