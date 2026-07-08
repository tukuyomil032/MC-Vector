# MC-Vector: macOS Tahoe Native版 — 要件定義・実現可能性調査

> 作成日: 2026-07-08 / 改訂: 2026-07-08(独立実装方針への転換) / ステータス: 調査完了・要件確定
> 元構想メモ: `~/Documents/mc-vector-rust-core-native-macos-plan.md`
> 本ドキュメントは要件定義であり、実装プランではない。実装プランはフェーズごとに別途作成する(`spec/next-phase-plan.md` 参照)。

## 改訂履歴

- 2026-07-08 初版: 「Rust Coreを両UIが共有する(デーモン化 + JSON-RPC over UDS)」を前提に作成
- 2026-07-08 改訂: ユーザーとの追加相談の結果、**Rust Coreを共有せず、Swift版は独立実装とする方針(brew-browser方式)に転換**。デーモン化・UniFFI関連の記述は「検討したが不採用」の記録として残し、要件定義の主軸から外した

## 1. 目的

MC-Vector を以下の2本柱で進化させる。

1. **Tauri版のRust内部整理** — `src-tauri` 内のビジネスロジックを、Tauri State/emitに密結合した現状から、テスト可能な純関数+薄いコマンドラッパという構造(`security.rs`が既に体現しているパターン)へ整理する。**これはSwift版との共有を目的とせず、Tauri版単体の保守性向上が目的**
2. **MC-Vector Native** — macOS Tahoe (26)+ 向けの Swift 6 / SwiftUI / AppKit ネイティブ版を、**Tauri版とロジックを共有しない独立実装**として構築する。Tauri版はクロスプラットフォーム安定版として維持し、Native版はmacOS旗艦版として再設計する

## 2. 確定事項(意思決定ログ)

| 論点 | 決定 | 背景 |
|---|---|---|
| リポジトリ | 既存リポジトリ内でモノレポに再編 | Git履歴・PR運用・CIを維持 |
| 配布形態 | Notarized DMG (App Store外) | Javaプロセス起動・任意パス操作がApp Store Sandboxと非互換 |
| **Core方針** | **共有しない。Swift版は独立実装(brew-browser方式)** | §4.4。個人〜小規模開発ではデーモン運用・FFIビルドパイプラインの継続コストが重い。同規模の実例(brew-browser)が独立実装で機能している |
| 共有する範囲 | データ契約(サーバー定義JSON等のスキーマ)のみ | ロジックは共有しないが、設定ファイル/サーバー定義の読み書き互換性は保つ |
| 「正しさ」が重要な処理の扱い | Swift移植時にロジックとテストケースを忠実に移植する運用ルール | `security.rs`相当の認可・監査処理は二重実装のドリフトが危険。§4.4のリスク表参照 |
| SPM構成 | `.xcodeproj`なし。`Package.swift`のみ(executable + library + testTarget) | brew-browser方式。SwiftUI `#Preview` をexecutableターゲットで動かすには`ENABLE_DEBUG_DYLIB`が必要で`.xcodeproj`でしか設定できないため、libraryターゲットに分離して回避(§5.7) |
| Lint/Format | SwiftLint + SwiftFormat | 業界標準の組み合わせ。SPM build tool pluginで統合(§5.7) |
| CI | Swift専用の新規workflow(`native.yml`) | Lintはubuntu-latest、実ビルドはmacos-latestに分離。`paths`フィルタでNative版変更時のみトリガー(§5.7) |
| pre-commit | 既存`lefthook.yml`に追加 | `glob: 'apps/native-macos/**/*.swift'`で既存の`fmt-rust`/`lint-format-ts`と同様のパターン(§5.7) |
| Native版OS下限 | macOS 26 (Tahoe) 以降のみ | Liquid Glass・新Concurrencyをフル活用。旧OSはTauri版でカバー |
| Native版Spike範囲 | サーバー一覧・詳細・起動/停止・ログストリーム・Floating Console Panel・Activity Drawer | 機能数ではなく操作感・独立実装の現実性を検証する最小構成 |
| 並行開発 | Tauri版のRust内部整理を優先、大型新機能は抑制(バグ修正のみ) | コンフリクトの最小化 |
| Floating Panel の Liquid Glass | 実機検証で判断。許容不可なら標準Materialへフォールバック | 非アクティブ時のglass劣化という既知リスクあり(§4.2) |

## 3. 現状分析(2026-07 コードベース調査)

### 3.1 規模と重心

- TS/TSX: 約21,600行(テスト除く) / Rust: 約3,220行 — 比率 6.7 : 1
- ロジックの重心は完全にTS側。Rustは「実行係」に留まっている

### 3.2 Rust側 (`src-tauri`、単一crate・workspace未構成)

- **分離良好(整理の見本)**: `security.rs`(純関数+薄ラッパ+unit test済) / `perf.rs` / `process_stats.rs` / `updater_utils.rs` / `health_check.rs`
- **密結合(整理対象)**: `server.rs` / `ngrok.rs` — プロセス管理ロジック・Tauri State・`AppHandle::emit` が巨大async関数内に混在
- **中程度**: `backup.rs` / `java.rs` / `download.rs` / `file_utils.rs`(進捗emitと`app_data_dir()`依存)
- State構造体(`ServerManager`等)は `Arc<Mutex<...>>` ベースでTauri型非依存
- ジョブシステムは存在しない(各コマンドが `tokio::spawn` + 都度emit)
- 依存クレートの中核(tokio/reqwest/zip/sysinfo/serde)は全て汎用

これらは**Tauri版単体の保守性向上**として引き続き価値がある整理対象だが、「Swift版と共有するため」という目的は持たない。

### 3.3 TS側に残るビジネスロジック(Tauri版内で整理する候補)

優先度 高:

1. **プラグイン/Mod解決エンジン**: `src/lib/plugin-commands.ts` + `src/lib/adapters/plugin/*` — Modrinth/Hangar/Spiget のパース・互換性判定・バージョン解決・インストール
2. **サーバー定義の正本管理**: `src/lib/server-commands.ts` — 現状「定義=TS(servers.json via Tauri Store) / ランタイム状態=Rust」の**二重正本問題**あり
3. **サーバー作成オーケストレーション**: `src/renderer/hooks/use-server-create-action.ts` — ID生成・ディレクトリ作成・JAR URL解決(Paper/LeafMC/Vanilla/Fabric分岐)・DL指示。`version-commands.ts` と重複あり

優先度 中:

4. Java解決ロジック: `src/lib/java-commands.ts`(Adoptium URL組立、OS/arch判定、削除パス導出)
5. server.properties パーサ/シリアライザ + EULA生成(生成コードは現状存在しない。スキーマは `src/renderer/shared/propertiesData.ts`)
6. バックアップスケジュール計算: `src/renderer/shared/auto-backup.ts`

### 3.4 型共有の現状

Tauri版内でts-rs / specta 未導入。全て手書き手動同期(camelCase変換も手動)。実行時ガード(`guards/json-guards.ts`)でAPI JSONを吸収している。Native版とはロジックを共有しないため、型生成導入はTauri版単体の改善課題として位置づける(Rust→TS型生成のみでよく、Rust→Swift型生成は不要)。

## 4. 独立実装の判断材料(2026-07 Web調査)

### 4.1 brew-browserの実例

同規模(個人〜小規模開発、Tauri+SwiftUI二本立て)の直接の参考事例として `msitarzewski/brew-browser` を調査した。

- ディレクトリ構成: `src-tauri/`(Rust+Tauri)+ `src/`(SvelteKit)+ `native/`(Swift Package、独立ディレクトリ)
- **Swift版はRustロジックを再利用せず、完全な独立実装(reimplementation)**。`BrewService`/`GitHubService`/`VulnsService`等をRustモジュールをミラーする形で個別実装
- 共有しているのは: 同一の`settings.json`スキーマ、同一のJSONデータ契約(`memory-bank/`にドキュメント化)、`brew` CLIを同じ形でシェルアウトする規約のみ
- 言語統計: Rust 35.9% / Swift 27.0% / Svelte 21.2% — 両実装に相応の実装コストをかけている
- README記載の設計哲学: 最小信頼設計(テレメトリなし)、多層防御(Rustで`unsafe`不使用)、両ビルドが同一`settings.json`とバンドルデータを読むことで機能の乖離を防止

### 4.2 Rust⇔Swift共有(FFI/プロセス分離)の実例と摩擦点

参考として、共有を選んだ場合の実例と摩擦点も記録する(今回は不採用)。

- **Firefox iOS / Application Services**: UniFFI + xcframework。チーム開発、CI自動化に継続投資。バイナリサイズ+約32MB。旧配布方式(rust-components-swift)は既に非推奨化され置き換え済み(=メンテコストが継続的にかかる)
- **Matrix SDK(ElementX)**: 暗号・同期という「正しさが特に重要」な処理をUniFFIで共有
- **Ghostty(Mitchell Hashimoto)**: Zig core(94%)+ Swift(4%)、素のC ABI。「1年運用で破綻なし」の安定性報告がある一方、ビルド複雑さ(C API export、lipo、XCFramework化)は明記されたコスト
- 共通する摩擦点: 所有権/ARCの境界でのメモリリーク・循環参照リスク、エラーハンドリング変換の実装漏れによるパニック([UniFFI async guide](https://mozilla.github.io/uniffi-rs/0.28/futures.html))、FFI境界バグが「UIに到達して初めて謎のクラッシュとして発覚」する診断の難しさ([Forge & Code](https://forgeandcode.io/blog/building-rust-swift-ffi-bridge/))
- UniFFI既知の制約: `async_runtime="tokio"` がexported traitのasyncメソッドに効かない([uniffi-rs #2576](https://github.com/mozilla/uniffi-rs/issues/2576))、同期メソッド内`tokio::spawn`問題([#2811](https://github.com/mozilla/uniffi-rs/issues/2811)、2026年提出の新しいissueで未解決)
- プロセス分離(デーモン+UDS)を検討した際の再検証結果: 「Tauri/Swift両UIから同一Coreを共有する唯一素直な方法」という主張は、引用元記事([dev.to](https://dev.to/hiyoyok/ipc-pipe-vs-unix-socket-for-a-resident-daemon-in-tauri-what-i-learned-fa6))の実際の結論(「複雑さは実際の並行接続要件に応じて選べ」)と整合しない引用だった。Tauri sidecarも長時間常駐では結局デーモン化と同種のライフサイクル管理が必要になり「軽量な代替」にはならない([Evil Martians](https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar))

### 4.3 判断基準の一覧表(中立整理)

| 基準軸 | 共有を支持する状況 | 個別実装を支持する状況 | MC-Vectorの現状 |
|---|---|---|---|
| ロジックの変更頻度 | 頻繁に変わる | 安定している | プラグイン解決・サーバー作成フローは変更頻度が高い見込み |
| ロジックの複雑さ・量 | 大規模(Ghostty=94%) | 小規模〜中規模 | 既存Rust約3,220行。Ghosttyほどの規模ではない |
| 開発体制 | チーム、CI投資余力あり | 個人〜小規模、言語切替コストが効く | 個人〜小規模開発(1〜2名) |
| 「正しさ」の重要度 | データ破損リスクが高い処理(Matrix=暗号/同期) | 間違っても実害が小さいUI寄り処理 | `security.rs`・バックアップ・ファイル操作は正しさ重要 → §4.4の運用ルールで緩和 |
| ビルド/保守インフラ投資余力 | 継続投資できる | 個人開発でCI/xcframework構築を避けたい | 現状lefthook+GitHub Actions(ubuntu/macOS/Windowsマトリクス)はあるが、デーモン運用は新規コスト |
| デバッグのしやすさ | プロセス分離ならOS単位で切り分け可 | FFI(インプロセス)は境界バグが発見しにくい | — |
| 将来の抽出可能性 | 今すぐ判断つかないなら後回しも可 | 個別実装から始めて後日共有化する道もある | Sandi Metz「誤った抽象化より重複の方が安い」論 |

### 4.4 決定と運用ルール

**決定: Swift版は独立実装(brew-browser方式)**。個人〜小規模開発というリソース制約が最も強く効くこと、brew-browserという直接の同規模実例が独立実装で機能していること、Native版Spikeの範囲(サーバー起動・ログ監視)がプラグイン解決のような「変更頻度が高く二重実装がつらい」ロジックを含まないことが決め手。

**留保・運用ルール**:

- `security.rs`相当の認可・監査ロジックは、Swift側で手を抜くと本当にセキュリティホールになる。「共有はしないが、Rust側の実装とテストケースをSwift側へ忠実に移植する」運用ルールを設ける
- データ契約(サーバー定義JSON、`servers.json`スキーマ等)は両実装で一致させる。JSON Schemaとして`spec/`か将来的な`shared/schemas/`に文書化することを推奨(ロジック共有ではなくスキーマの一致のみ)
- プラグイン管理をNative版に実装する段階(Spikeの先)で「二重実装が思ったよりつらい」と分かれば再評価する
- 「Swift側とTauri側でロジックがドリフトする」リスクは§6のリスク表を参照

## 5. 要件定義

### 5.1 目標アーキテクチャ

```text
mc-vector/  (既存リポジトリを再編)
├─ Cargo.toml                  # [workspace] (任意。Tauri版のみのworkspace化)
├─ crates/
│  └─ (Tauri版内の整理後クレート。Swift版とは共有しない)
├─ apps/
│  ├─ tauri/                   # 既存Tauri版(src-tauri + React)
│  └─ native-macos/            # SwiftUI版。Rust Coreと接続しない独立アプリ
│      ├─ Package.swift        # executable + library(実装本体) + testTarget
│      ├─ Sources/
│      │  ├─ MCVectorNative/       (薄いエントリポイント)
│      │  └─ MCVectorNativeKit/    (View/ViewModel/Service層)
│      ├─ Tests/
│      ├─ build-app.sh          # .app バンドル組み立て(開発用)
│      └─ release.sh            # 署名 + notarization(配布用)
├─ spec/                        # 仕様・計画ドキュメント(このファイルもここ)
└─ .github/workflows/
   └─ native.yml                 # Swift専用CI
```

Tauri版とNative版の間に共有コードは存在しない。矢印で表すと:

```text
apps/tauri  --(データ契約: servers.json等のJSONスキーマ)-->  apps/native-macos
```

ロジックの矢印はなく、データフォーマットの一致のみを保証する。

### 5.2 Tauri版内部整理の対象と優先順(Swift版とは無関係)

1. `server.rs`/`ngrok.rs`のemit→`trait EventSink`/mpsc化(`security.rs`の「純関数+薄ラッパ+unit test」パターンを横展開)
2. サーバー定義の正本をTS(servers.json)からRust側へ移管するか検討(二重正本の解消)
3. プラグイン解決エンジン(`plugin-commands.ts` + adapters)の整理
4. サーバー作成オーケストレーション整理、Java解決、server.propertiesパーサ+EULA生成、バックアップスケジュール計算

これらはTauri版単体のリファクタリング課題であり、着手時期・要否は別途判断する。本ドキュメントのスコープでは「将来の選択肢」として記録するに留める。

### 5.3 Native版要件(Spike)

- 対象: macOS 26 (Tahoe)+ / Xcode 26+ / Swift 6.2+(6.3.x追随)
- Swift設定: default MainActor isolation + Approachable Concurrency ON。重い処理のみ`@concurrent`/actorへ
- スコープ: サーバー一覧・詳細・起動/停止・ログストリーム・Floating Console Panel・Activity Drawer
- UI: NavigationSplitView + Inspector + Toolbar(標準コンポーネントの自動glass化を活用、カスタムglassは機能レイヤー限定)
- Floating Panel: NSPanelブリッジ と 純SwiftUI(WindowLevel) を検証して選択
- 配布: Developer ID + notarytool + Hardened Runtime。Java子プロセス起動のentitlements要否を洗い出す
- Tauri版の完全コピーにしない。macOSネイティブアプリとして再設計する(構想メモ NG 2)
- サーバープロセス管理(Java起動・監視・停止)はSwift側で独自に実装する(§4.4の運用ルールに従い、`server.rs`のロジックを参考にしつつ忠実に移植)

### 5.4 macOS Tahoe / Liquid Glass / Swift 6.2 技術情報

**バージョン状況(2026-07)**: macOS Tahoe 26.5.2 が現行公開版。Xcode 26.5(Swift 6.3.2)/26.6(Swift 6.3.3)。要件下限は「Xcode 26+ / Swift 6.2+」、実開発は6.3.x追随を推奨。macOS 26はIntel対応最後のメジャー版。

**Liquid Glass API(全てmacOS 26.0+)**:

- `.glassEffect(_:in:)` + `Glass.regular/.clear/.identity`(`.tint()`/`.interactive()`)
- `GlassEffectContainer`(複数glass要素のモーフィング/ブレンド。glass同士はサンプリング不可のため必須)
- `.glassEffectID` / `.glassEffectUnion` / `.glassEffectTransition` / `.glassBackgroundEffect` / `.buttonStyle(.glass)`
- Apple公式ガイダンス: **機能レイヤー(toolbar/ナビ/コントロール)限定、コンテンツ本体には使わない。glassの入れ子禁止**。標準コンポーネント(Toolbar/Inspector/NavigationSplitView/sheet)は再コンパイルだけで自動glass化

**Swift 6.2+ Concurrency**: 新規プロジェクトは default MainActor isolation が既定ON。Approachable Concurrency + `@concurrent` / `nonisolated(nonsending)`。方針: 「全部MainActor、重い処理(プロセス管理/ログストリーム)だけ明示オフロード」

**SwiftUI on macOS 26新機能**: `WindowLevel`(SwiftUIシーンだけでfloatingウィンドウが可能に)、`ToolbarSpacer`、ウィンドウリサイズ同期アニメーション、List大幅高速化

**Floating Console Panelの実装2択**:

- (A) 純SwiftUI: `Window`シーン + 新`WindowLevel`(簡潔)
- (B) NSPanelブリッジ: `.nonactivatingPanel` + `isFloatingPanel` + `NSHostingView`(非アクティブ化挙動の細かい制御が必要なら確実)
- **既知リスク**: NSHostingView内の`.glassEffect`はアプリ非アクティブ時に単なるブラーへ劣化する報告あり。nonactivatingPanelでは特に起きやすい → Spike最初期の実機検証項目

**配布**: Developer ID署名 + `notarytool` + stapler の従来フローに破壊的変更なし。Hardened Runtime必須。Java子プロセス起動に絡むentitlements(`com.apple.security.cs.allow-jit`等)の要否洗い出しが設計課題

### 5.5 Spike最初期の実機検証項目

1. NSPanel×glassEffectの非アクティブ時劣化(許容不可なら標準Materialへフォールバック — 方針確定済み)
2. Hardened Runtime下でのJavaプロセス起動
3. ログストリームのUI描画パフォーマンス(高頻度ログ時)

### 5.6 データ契約(共有する唯一の範囲)

- `servers.json`スキーマ(サーバー定義)をTauri版と一致させる
- 将来的にJSON Schemaとして文書化する場合は`spec/`配下、または独立した`shared/schemas/`ディレクトリを検討(モノレポ全体の構成が固まった段階で判断)
- ロジック(バリデーション処理そのもの)は共有しない。スキーマ定義のみが契約

### 5.7 Swift側の開発ツールチェーン

#### SPM構成

`.xcodeproj`を作らず、`Package.swift`のみで管理する(brew-browser方式)。

```swift
// swift-tools-version:6.2
let package = Package(
    name: "MCVectorNative",
    platforms: [.macOS(.v26)],
    products: [.library(name: "MCVectorNativeKit", targets: ["MCVectorNativeKit"])],
    targets: [
        .executableTarget(name: "MCVectorNative", dependencies: ["MCVectorNativeKit"]),
        .target(name: "MCVectorNativeKit"),
        .testTarget(name: "MCVectorNativeKitTests", dependencies: ["MCVectorNativeKit"]),
    ]
)
```

**採用理由**: SwiftUI `#Preview` をexecutableターゲットで動かすには`ENABLE_DEBUG_DYLIB`ビルド設定が必要で、これは`.xcodeproj`でしか設定できない。ロジック・View本体をlibraryターゲット(`MCVectorNativeKit`)に分離すれば、この制約自体が発生せず`#Preview`が問題なく動く。executableは`@main`エントリポイントのみを持つ薄いラッパーとする。

業界主流は「Xcodeプロジェクト + ロジックをローカルSwift Packageに分割」するハイブリッド構成だが、brew-browserは同規模で`.xcodeproj`なしを実証済み。

#### ビルド・配布

`.xcodeproj`がないため`.app`バンドル化・署名・notarizationは自前スクリプトで行う(brew-browserの`build-app.sh`/`release.sh`相当)。

- 開発用ビルド: `swift build` → `Contents/MacOS/`・`Contents/Resources/`を組み立て → Info.plist合成 → ad-hoc署名(`codesign -s -`)
- 配布用ビルド: Developer ID + Hardened Runtimeで署名(ネストしたバンドルから順に、最後にアプリ本体)→ `codesign --verify --deep --strict`で検証 → zip化 → `notarytool submit` → staple

#### Lint / Format

**SwiftLint + SwiftFormat**(業界標準の組み合わせ。SwiftFormatはApple公式`swift-format`より普及度・機能面で優位)。

- SPM build tool pluginとして`Package.swift`の`targets`に追加し、ビルド時に自動実行・Xcode上に警告表示
- CI上ではプラグインの対話プロンプトを避けるため`-skipPackagePluginValidation`フラグが必要になる場合がある

#### CI

Swift専用の新規workflowファイル `.github/workflows/native.yml` を作成する。

- Lintジョブ(SwiftLint/SwiftFormat): `ubuntu-latest`で実行(Apple frameworksに依存しないため可能。macOSランナーの約1/10のコスト)
- ビルドジョブ(`swift build` / `swift test`): `macos-latest`で実行
- `paths: ['apps/native-macos/**']`フィルタでNative版変更時のみトリガー

#### pre-commit

既存`lefthook.yml`に、既存の`fmt-rust`/`lint-format-ts`と同様のパターンでSwift用ジョブを追加する。

```yaml
lint-format-swift:
  glob: 'apps/native-macos/**/*.swift'
  run: swift run swiftformat . && swift run swiftlint --autocorrect --strict
  stage_fixed: true
```

## 6. リスクと既知の制約

| リスク | 影響 | 緩和策 |
|---|---|---|
| Swift側とTauri側でロジックがドリフトする | 中 | データ契約(JSONスキーマ)のみ厳密に一致させる運用ルール。機能追加時は両実装のチェックリスト化を検討 |
| `security.rs`相当の正しさが重要な処理の移植漏れ | 中 | Rust側の実装とテストケースを忠実にSwift側へ移植する運用ルール(§4.4) |
| プラグイン解決ロジックの二重実装コスト | 低(現Spike範囲外) | Native版でプラグイン管理を実装する段階で再評価 |
| glass非アクティブ劣化 | 低 | 実機検証→Materialフォールバック(確定済み)。Phase 3-Aでスキャフォールド実装済み、実機での目視判定は`spec/phase3a-spike-results.md`参照(検証待ち) |
| `.xcodeproj`なしによるXcode GUI機能の一部制約(Instruments連携等) | 低 | Xcodeは`Package.swift`を直接開けるため多くの機能は利用可能。制約が顕在化したら`.xcodeproj`併用を再検討。Phase 3-Aで`record_trace.py`/`analyze_trace.py`によるCLI経由のトレース取得・解析が可能なことを確認(`spec/phase3a-spike-results.md`) |
| macOSランナーCIコスト | 低 | Lintはubuntu-latestに寄せ、ビルドのみmacos-latest |
| Hardened Runtime下でのJavaプロセス起動可否 | 低(検証済み) | Phase 3-Aで検証: 追加entitlementsなしでも`java -version`はexit 0で起動可能。実ワークロードでの再検証は3-7(サーバー起動/停止実装)で実施(`spec/phase3a-spike-results.md`) |

## 7. 主要出典

- brew-browser: <https://github.com/msitarzewski/brew-browser>
- UniFFI(不採用の記録): <https://mozilla.github.io/uniffi-rs/latest/futures.html> / <https://mozilla.github.io/uniffi-rs/latest/foreign_traits.html> / issues [#2576](https://github.com/mozilla/uniffi-rs/issues/2576), [#2811](https://github.com/mozilla/uniffi-rs/issues/2811)
- Ghostty(Zig core + Swift UI、素のC ABI): <https://mitchellh.com/writing/zig-and-swiftui>
- Matrix SDK: <https://github.com/matrix-org/matrix-rust-sdk>
- Rust-Swift FFI摩擦点: <https://forgeandcode.io/blog/building-rust-swift-ffi-bridge/>
- Tauri sidecar検討記録: <https://v2.tauri.app/develop/sidecar/> / <https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar>
- 段階的移行の設計原則: <https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction>
- Liquid Glass: <https://developer.apple.com/documentation/swiftui/view/glasseffect(_:in:)> / <https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views>
- WWDC25 What's new in SwiftUI: <https://developer.apple.com/videos/play/wwdc2025/256/> / <https://developer.apple.com/documentation/swiftui/windowlevel>
- Swift 6.2 Concurrency: <https://www.donnywals.com/setting-default-actor-isolation-in-xcode-26/> / <https://www.avanderlee.com/concurrency/approachable-concurrency-in-swift-6-2-a-clear-guide/>
- Floating Panel: <https://cindori.com/developer/floating-panel> / glass劣化報告 <https://www.hackingwithswift.com/forums/swiftui/glasseffect-in-floating-window-panel/30067>
- Notarization: <https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>
- SPM単体でのGUIアプリ開発: <https://forums.swift.org/t/is-it-possible-to-developer-a-swiftui-app-using-only-swiftpm/71755> / <https://www.objc.io/blog/2020/05/19/swiftui-without-an-xcodeproj/>
- Xcode + ローカルパッケージのハイブリッド構成(業界主流): <https://developer.apple.com/documentation/xcode/organizing-your-code-with-local-packages>
- SwiftLint: <https://github.com/realm/SwiftLint>
- SwiftFormat: <https://github.com/nicklockwood/SwiftFormat>
- GitHub ActionsでのSwift CI(ubuntu lintジョブ分離): <https://hoppsen.com/posts/unlock-the-secrets-of-swift-linting-with-swiftlint-and-swiftformat-on-github-actions/>
- lefthookでのSwiftLint/SwiftFormat統合: <https://www.swifttoolkit.dev/posts/git-hooks>
