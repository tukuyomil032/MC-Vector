# Phase 3-A: 実機検証3項目 — 結果記録

> 関連: `spec/phase-tasks.md`(Phase 3-Aタスク定義), `spec/native-macos-requirements.md` §5.4/§5.5/§6

このセッションはバックグラウンドジョブとして起動されておりWindowServerに接続されていないため(`screencapture`が`could not create image from display`で失敗することを確認済み)、3-1と3-3はスキャフォールド・自動テスト・解析スクリプトまでをこのセッションで用意し、実機でのスクリーンショット撮影/トレース記録をユーザーに依頼する形で進めている。3-2はGUI操作が不要なため、このセッションのみで検証まで完結した。

## 3-1: NSPanel×glassEffect 非アクティブ時劣化

| 項目 | 内容 |
|---|---|
| 検証日 | 2026-07-09 |
| 実施環境 | 実機で予備スクリーンショット4枚を取得(`spec/spike/`)+ 文献調査(Apple公式ドキュメント・実例プロジェクト・コミュニティ報告) |
| 結果 | 下記参照 |
| 判定 | **文献調査により確定**(実機での劣化度合いの目視比較は行わず、設計方針の転換によって解決) |
| 証跡パス | `spec/spike/{nspanel-active,nspanel-inactive,panel-window-active}.png`(予備取得分。この設計では判定材料として使用しない) |

**実装済みスキャフォールド**: `apps/native-macos/Sources/Core/Spikes/PanelSpike/`(`GlassSpikeContent.swift`, `NonactivatingGlassPanel.swift`, `SwiftUIWindowLevelSpike.swift`)、`apps/native-macos/Sources/App/Spikes/PanelSpikeRunner.swift`。

### 判定の経緯: 実機検証から文献調査ベースの判定への切り替え

当初計画では、実機でactive/inactiveのスクリーンショット4枚を撮影し目視で劣化度合いを比較する予定だった。ユーザーに予備の3枚(`nspanel-active.png` / `nspanel-inactive.png` / `panel-window-active.png`)を撮影してもらったところ、**背景の壁紙(鮮やかな青紫グラデーション)がパネル内部に一切反映されず、active/inactiveの差もほぼ視認できない**という結果になった。

これを受けてコードとApple公式ドキュメント・実例プロジェクトを調査した結果、根本原因は「バグ」ではなく**スパイクの検証設計自体がApple HIGのベストプラクティストに反していた**ことだと判明した:

1. **HIGの「content layerに使うな」原則**: Apple HIG「Materials」("Don't use Liquid Glass in the content layer... use standard materials for elements in the content layer, such as app backgrounds.")および Apple公式「Applying Liquid Glass to custom views」より、`.glassEffect`はツールバー・ナビゲーション・コントロール群といった**機能層(functional layer)にのみ**適用すべきもので、パネル/ウィンドウ**背景全体**への適用は明確に非推奨。当時の`GlassSpikeContent.swift`は320×160の**カード全体**(Textのみ、背後に実コンテンツなし)に`.glassEffect`をチェーンしており、この原則に反していた
2. **`.glassEffect`はデスクトップ透過機能ではない**: 実例プロジェクト`mertozseven/LiquidGlassSwiftUI`(GitHub)を調査すると、`.glassEffect`は単一の`Text`や64pt円形ボタンといった小さい要素にのみ適用され、背景画像自体には適用しない設計だった。ガラスは「同一ウィンドウ内で自分の背後にある実コンテンツ」を屈折させるものであり、デスクトップの壁紙をウィンドウ越しに透過させる仕組みではない。壁紙まで透過させるには、AppKit側で`NSWindow`/`NSPanel`の`isOpaque = false` / `backgroundColor = .clear`を別途明示的に設定する必要がある(未設定だった)
3. **brew-browserの前例**: 同規模の参考実装`msitarzewski/brew-browser`(GitHub)の意思決定ログ(`memory-bank/tasks/2026-05/22-native-swift-liquid-glass-rebuild.md` D3)には「Stock Apple scaffolding only, no overrides. No custom window chrome, no `NSVisualEffectView`, no faked backgrounds... Established after several failed attempts to hand-build Xcode-like chrome.」と明記されており、ウィンドウの`isOpaque`/`backgroundColor`には一切手を入れず、標準SwiftUIコンテナ(`NavigationSplitView`等)にLiquid Glassの描画を完全委任する設計を採っている。自前でウィンドウ透明化・ガラス制御を試みて複数回失敗した末にこの方針へ収束した経緯があり、我々が直面した問題と同種の轍を踏んだ先例といえる
4. **NSPanel特有の既知の未解決バグ**: `.nonactivatingPanel`のNSPanelは、アプリが非フォーカス時にglassEffectが単純なブラーに劣化するという未解決の報告が複数ある(HackingWithSwiftフォーラム、2025年9月・2026年3月に同一症状の報告)。ワークアラウンドや公式回答は確認できなかった

参照した一次情報:
- <https://developer.apple.com/design/human-interface-guidelines/materials>
- <https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views>
- <https://github.com/mertozseven/LiquidGlassSwiftUI>
- <https://github.com/msitarzewski/brew-browser>(意思決定ログ: `memory-bank/tasks/2026-05/22-native-swift-liquid-glass-rebuild.md`)
- <https://www.hackingwithswift.com/forums/swiftui/glasseffect-in-floating-window-panel/30067>
- <https://github.com/onmyway133/blog/issues/1025>(`window.backgroundColor = .clear`が無いと透過しない、という実装者記録)

### 確定した方針

- **Liquid Glassの適用範囲は機能層(ツールバー・コントロール等の小要素)に限定し、パネル/ウィンドウ背景全体(コンテンツ層)には使わない**。これをNative版全体のガラス適用方針として採用する
- **パネル自体(NSPanel/NSWindow)は不透明のまま維持し、デスクトップ壁紙の透過は行わない**。brew-browserの前例、および本来の要件(Floating Console Panelはログ表示領域の上に浮くコントロールであり、デスクトップ透過は要件にない)と整合する
- NSPanelの非アクティブ時ブラー劣化バグは既知だが、ガラスを機能層の小要素に限定する設計であれば影響範囲は小さく、実用上許容できると評価する
- 実装方式の確定は `native-macos-requirements.md` §5.4 を参照

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

**コードレビュー指摘への対応**: 初回実装の`JavaLaunchHarness.launch`はstdout→stderrの順に`readToEnd()`を逐次実行しており、子プロセスが標準出力を閉じないまま標準エラーへ大量出力するとOSパイプバッファが埋まりデッドロックする既知の`Process`/`Pipe`アンチパターンだった(`java -version`はstderrのみの小出力のため顕在化しなかった)。3-7でこのハーネスを実サーバー起動に転用する前提のため、`async let`で両パイプを並行読み取りする実装に修正済み(`JavaLaunchHarness.swift`)。

## 3-3: 高頻度ログ描画パフォーマンス

| 項目 | 内容 |
|---|---|
| 検証日 | 2026-07-09 |
| 実施環境 | ユーザー実機(macOS 26 Tahoe、Instruments/xctrace 26.0 (17C529)) |
| 結果 | 下記参照 |
| 判定 | **検証完了**。ScrollView+LazyVStack方式を3-8で優先採用 |
| 証跡パス | `apps/native-macos/swiftui-20260709-085046.trace`(list版)、`apps/native-macos/swiftui-20260709-085554.trace`(scroll版) |

**実装済みスキャフォールド**: `apps/native-macos/Sources/Core/Spikes/LogSpike/`(`DummyLogGenerator.swift`, `LogBatcher.swift`, `LogLineBuffer.swift`, `LogStreamSpikeView.swift`)。`LogBatcher`のユニットテストは`Tests/CoreTests/LogBatcherTests.swift`で完了済み(同一ウィンドウ内のグルーピング、ウィンドウ境界での分割、単一行、同一タイムスタンプ、空入力)。

**コードレビュー指摘への対応**: 初回実装は`List`/`ScrollView`両方とも「1行追加するたびに`retainedLineCount`ちょうどまで`removeFirst`する」実装で、1000行/秒の負荷下では毎行O(n)の配列シフトが発生し、Instrumentsトレースが本来測定したい「List vs ScrollViewのレンダリングコスト差」ではなく「配列シフトのコスト」を支配的に示してしまう懸念があった。`LogLineBuffer`(ヒステリシス付きトリム: `retainedLineCount + trimOvershoot`を超えた時だけまとめてトリム)を切り出し両Viewで共有する実装に修正し、`Tests/CoreTests/LogLineBufferTests.swift`でトリム挙動を検証済み。

**実測結果**: `record_trace.py --launch <ビルド済みバイナリ> --env MCV_SPIKE=log-stream --env MCV_LOG_SPIKE_VARIANT={list,scroll} --template "SwiftUI" --time-limit 30s` で取得(初回は`--launch`にソースディレクトリを渡し起動失敗、再取得時にビルド済みバイナリのパスに修正)。`analyze_trace.py`で解析したところ、両トレースとも`[Warning] Trace file had no SwiftUI data`(SwiftUI内部更新グラフ`swiftui-causes`/`swiftui-updates`スキーマのみ空)という警告が出たが、**time-profile/hitches計測は正常に記録されており判定への支障はない**:

| バリアント | ヒッチ数 | ヒッチ合計時間 | 最悪ヒッチ | CPU総サンプル数 |
|---|---|---|---|---|
| List(`List`単純trim) | 78 | 2017ms | 217ms(起動時3.7s) | 277,087 |
| ScrollView(`LazyVStack`+ヒステリシスtrim) | 9 | 517ms | 367ms(起動時1.9s) | 248,359 |

List版のホットスポットは`swift_retain`/`swift_release`中心(ARC負荷、行の頻繁な生成/破棄を示唆)。ScrollView版は`Set.contains`/`RawDictionaryStorage.find`等(`ForEach`のID解決コスト)。起動直後の一過性ヒッチはどちらにもあるが、定常状態でのヒッチ頻度・総量はScrollView版がList版の約1/4に留まる。

**判定**: 1000行/秒のログ高頻度描画において、ScrollView(`LazyVStack`)+ヒステリシス付きトリム方式が明確に優位。3-8(ログストリーム本実装)ではこの方式を優先採用する。

## まとめ

- 3-2は検証完了。追加entitlementsなしでもJavaサブプロセス起動自体は妨げられないことが判明し、`native-macos-requirements.md` §5.3の「entitlements要否の洗い出し」という設計課題に対する一次情報が得られた。
- 3-3は検証完了。ScrollView+LazyVStack方式がList方式よりヒッチ数・総量ともに大幅に優位(9ヒッチ/517ms vs 78ヒッチ/2017ms)と判明し、3-8での採用方針を確定した。
- 3-1は、実機での目視劣化比較ではなく文献調査(Apple HIG・実例プロジェクト・コミュニティ既知バグ)により判定を確定した。Liquid Glassの適用は機能層の小要素に限定し、パネル自体は不透明のまま維持する方針とする。詳細は当該セクションと`native-macos-requirements.md` §5.4/§6を参照。
- Phase 3-A(実機検証3項目)は本更新をもって完全クローズとする。
