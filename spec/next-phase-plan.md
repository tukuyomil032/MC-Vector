# MC-Vector Next Phase Plan — Tauri版整理 + macOS Native版

> 最終更新: 2026-07-08(独立実装方針への転換)
> 要件定義・実現可能性調査: `spec/native-macos-requirements.md`

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
| 2 | Native macOS Spike セットアップ(SPM構成・SwiftLint/SwiftFormat・`native.yml`・lefthook追加) | 未着手 | Package.swift(executable+library+testTarget)を`apps/native-macos/`に作成するところから開始 |
| 3 | Native macOS Spike 本体(SwiftUI: 一覧/詳細/起動停止/ログ/Floating Console/Activity Drawer) | 未着手 | 最初期に実機検証3項目を実施(要件定義 §5.5)。サーバープロセス管理はSwift側で独自実装 |
| 4 | データ契約の文書化(servers.jsonスキーマ等) | 未着手 | JSON Schemaとして`spec/`または将来の`shared/schemas/`に記録するか判断 |
| 5 | Tahoe UI refinement (Liquid Glass調整・Toolbar/Inspector・アニメーション) | 未着手 | |

## 運用ルール

- Tauri版とNative版はロジックを共有しない。共有するのはデータ契約(JSONスキーマ)のみ
- `security.rs`相当の正しさが重要な処理は、Swift移植時にロジックとテストケースを忠実に移植する
- 各フェーズは新ブランチ + PR単位で進める(スカッシュマージ不使用)
- 言語を問わず各タスクにテストコードを追加する
- プラグイン管理等をNative版に実装する段階で「二重実装がつらい」と分かった場合は、共有方式(FFI/プロセス分離)への転換を再評価する(`spec/native-macos-requirements.md` §4.2の記録を参照)
