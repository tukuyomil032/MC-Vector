# MC-Vector Next Phase Plan — Rust Core化 + macOS Native版

> 最終更新: 2026-07-08
> 要件定義・実現可能性調査: `docs/native-macos-requirements.md`

## 全体像

```text
Rust Core Engine (mc-vector-core + mc-vector-daemon)
  ├─ MC-Vector Classic (Tauri / React) — クロスプラットフォーム安定版
  └─ MC-Vector Native (SwiftUI / AppKit) — macOS Tahoe+ 旗艦版
```

## フェーズマトリクス

| Phase | 内容 | 状態 | 備考 |
|---|---|---|---|
| 0 | 要件定義・実現可能性調査 | ✅ 完了 (2026-07-08) | `docs/native-macos-requirements.md` |
| 1 | Rust Core extraction (workspace化・型生成導入・ジョブシステム・EventSink化) | 未着手 | 着手時に `/writing-plans` で実装プラン作成 |
| 2 | Server Provisioning のRust化 (`provision_server`ジョブ・ロールバック・registry atomic update) | 未着手 | |
| 3 | Plugin / Mod install のRust化 (provider client・互換性判定・DL/verify/install job) | 未着手 | |
| 4 | デーモン化 + Shared schemas (mc-vector-daemon、JSON-RPC over UDS、Swift Codable生成) | 未着手 | Native Spike の前提 |
| 5 | Native macOS Spike (SwiftUI: 一覧/詳細/起動停止/ログ/Floating Console/Activity Drawer) | 未着手 | 最初期に実機検証4項目を実施(要件定義 §5.6) |
| 6 | Tahoe UI refinement (Liquid Glass調整・Toolbar/Inspector・アニメーション) | 未着手 | |

## 運用ルール(Phase 1〜終了まで)

- Core化を優先し、Tauri版の大型新機能は抑制(バグ修正のみ)
- 新規ロジックは最初からCore側(Tauri非依存)に実装する
- 各フェーズは新ブランチ + PR単位で進める(スカッシュマージ不使用)
- 言語を問わず各タスクにテストコードを追加する
