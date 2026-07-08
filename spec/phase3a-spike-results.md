# Phase 3-A: 実機検証3項目 — 結果記録

> 関連: `spec/phase-tasks.md`(Phase 3-Aタスク定義), `spec/native-macos-requirements.md` §5.4/§5.5/§6

このセッションはバックグラウンドジョブとして起動されておりWindowServerに接続されていないため(`screencapture`が`could not create image from display`で失敗することを確認済み)、3-1と3-3はスキャフォールド・自動テスト・解析スクリプトまでをこのセッションで用意し、実機でのスクリーンショット撮影/トレース記録をユーザーに依頼する形で進めている。3-2はGUI操作が不要なため、このセッションのみで検証まで完結した。

## 3-1: NSPanel×glassEffect 非アクティブ時劣化

| 項目 | 内容 |
|---|---|
| 検証日 | 未実施(ユーザー実機待ち) |
| 実施環境 | ユーザー実機(macOS Tahoe 26+) |
| 結果 | — |
| 判定 | 未確定 |
| 証跡パス | `apps/native-macos/spec-assets/3-1/{nspanel,window}-{active,inactive}.png`(未作成) |

**実装済みスキャフォールド**: `apps/native-macos/Sources/Core/Spikes/PanelSpike/`(`GlassSpikeContent.swift`, `NonactivatingGlassPanel.swift`, `SwiftUIWindowLevelSpike.swift`)、`apps/native-macos/Sources/App/Spikes/PanelSpikeRunner.swift`。

**ユーザーへの依頼**: `swift run App` を `MCV_SPIKE=panel-nspanel` と `MCV_SPIKE=panel-window` のそれぞれで起動し、他アプリへフォーカスを移して非アクティブ化した状態を含むスクリーンショットを4枚(`nspanel-active.png` / `nspanel-inactive.png` / `window-active.png` / `window-inactive.png`)撮影の上、`apps/native-macos/spec-assets/3-1/` 配下に保存してほしい。保存後、Claudeが画像を読み込み劣化度合いを比較し、本セクションと `native-macos-requirements.md` §5.4 に確定した実装方式を追記する。

## 3-2: Hardened Runtime下のJavaプロセス起動

| 項目 | 内容 |
|---|---|
| 検証日 | 2026-07-08 |
| 実施環境 | このセッション(macOS 26 / Xcode 26.5.1 / Swift 6.3、Homebrew OpenJDK 25.0.2) |
| 結果 | baseline(entitlements無し)/ `allow-jit` / `allow-unsigned-executable-memory`+`disable-library-validation` の3パターンいずれも `java -version` がexit code 0で成功。stderrにJVMバージョン情報が正常出力され、`Killed`やcodesign関連エラーは発生しなかった |
| 判定 | Hardened Runtime + ad-hoc署名下でも、追加entitlementsなしでJavaサブプロセスの起動自体は可能。ただし検証は`-version`起動のみであり、JITを本格的に使う実ワークロード(サーバー起動後の稼働)でのentitlements要否は未検証 |
| 証跡パス | `apps/native-macos/Scripts/hardened-runtime-spike.sh` 実行ログ(本ファイル上部に転記) |

**実装済み**: `apps/native-macos/Sources/Core/Spikes/JavaLaunchHarness.swift`(actor化したProcessラッパー)、`apps/native-macos/Scripts/hardened-runtime-spike.sh`、`apps/native-macos/Scripts/entitlements/spike-{baseline,allow-jit,allow-unsigned-executable-memory}.plist`。

**実行結果ログ(要約)**:

```
spike-allow-jit: exit=0
spike-allow-unsigned-executable-memory: exit=0
spike-baseline: exit=0
```

**今後の課題**: 実際のMinecraftサーバーjarを長時間稼働させた際のJIT挙動・GC・ネイティブライブラリロード(一部modが使用)まで含めた検証は3-Bのサーバー起動/停止実装(3-7)時に改めて行う。

## 3-3: 高頻度ログ描画パフォーマンス

| 項目 | 内容 |
|---|---|
| 検証日 | 未実施(ユーザー実機待ち) |
| 実施環境 | ユーザー実機(macOS Tahoe 26+、Instruments) |
| 結果 | — |
| 判定 | 未確定 |
| 証跡パス | `.trace`ファイル(未取得、パスは取得後にユーザーから共有) |

**実装済みスキャフォールド**: `apps/native-macos/Sources/Core/Spikes/LogSpike/`(`DummyLogGenerator.swift`, `LogBatcher.swift`, `LogStreamSpikeView.swift`)。`LogBatcher`のユニットテストは`Tests/CoreTests/LogBatcherTests.swift`で完了済み(同一ウィンドウ内のグルーピング、ウィンドウ境界での分割、空入力の3パターン)。

**ユーザーへの依頼**: `swift run App` を `MCV_SPIKE=log-stream`(`MCV_LOG_SPIKE_VARIANT=list` または `scroll`)で起動し、`.claude/skills/swiftui-expert-skill/scripts/record_trace.py --launch <path> --template "SwiftUI" --time-limit 30s` でトレースを取得してほしい。取得済み`.trace`はClaudeが`analyze_trace.py --trace <path>`で解析し、ヒッチ/CPUホットスポットからバッチ化/仮想化戦略を決定する。

## まとめ

- 3-2は検証完了。追加entitlementsなしでもJavaサブプロセス起動自体は妨げられないことが判明し、`native-macos-requirements.md` §5.3の「entitlements要否の洗い出し」という設計課題に対する一次情報が得られた。
- 3-1・3-3はスキャフォールド・自動テストまで完了し、実機でのみ可能な操作(スクリーンショット撮影・Instrumentsトレース記録)をユーザーに依頼した状態で本タスクを一旦クローズする。成果物が揃い次第、このファイルと`native-macos-requirements.md` §5.4/§6を追加コミットで更新する。
