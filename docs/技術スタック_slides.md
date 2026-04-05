# 技術スタック（スライド用）

---

## Slide 1 — タイトル
- **技術スタック**
- 本プロジェクトで採用している主要技術をカテゴリ別に簡潔にまとめたスライド

---

## Slide 2 — 言語
- **TypeScript**（フロントエンド主要言語, 型安全）
- **JavaScript**（ビルドツール・ランタイム）
- **Rust**（Tauri ネイティブ / バックエンド）
- **CSS / Tailwind CSS**（スタイル）

---

## Slide 3 — フロントエンド／UI
- **React** / `react-dom`（UI）
- **@monaco-editor/react**（組み込みコードエディタ）
- **recharts**（チャート表示）
- **xterm + xterm-addon-fit**（ターミナル表示）

---

## Slide 4 — ランタイム & パッケージ管理
- **Tauri**（デスクトップアプリランタイム）
- **Node.js**（開発・ビルド環境）
- **pnpm**（packageManager: pnpm@10.26.2）

---

## Slide 5 — Tauri（JS 側）プラグイン
- `@tauri-apps/api` / `@tauri-apps/cli`
- 利用プラグイン（抜粋）: `plugin-dialog`, `plugin-fs`, `plugin-http`, `plugin-opener`, `plugin-os`, `plugin-process`, `plugin-shell`, `plugin-store`, `plugin-updater`

---

## Slide 6 — Rust（ネイティブ）主要クレート
- `tauri` / `tauri-build`
- `serde`, `serde_json`（シリアライズ）
- `tokio`（非同期ランタイム）
- `reqwest`（HTTP クライアント）
- `sysinfo`（システム情報）
- `zip`, `tar`, `flate2`（アーカイブ処理）
- `futures-util`（非同期ユーティリティ）
- プラグイン群: `tauri-plugin-*`（single-instance, updater, log, process, 等）

---

## Slide 7 — ビルド / 開発ツール
- **Vite**（開発サーバ・ビルド）
- `@vitejs/plugin-react`（React 統合）
- **TypeScript**（`tsc -b`）
- **PostCSS / Autoprefixer / Tailwind CSS**
- **@biomejs/biome**（format / lint）
- **husky**, **lint-staged**（コミットフロー整備）

---

## Slide 8 — 主要設定 / ファイル（参照用）
- `package.json`（依存・スクリプト）
- `src-tauri/Cargo.toml`（Rust 依存）
- `tauri.conf.json`（Tauri 設定）
- `vite.config.ts`, `tsconfig.*.json`, `tailwind.config.js`

---

## Slide 9 — アーキテクチャ要約（1枚で伝える要点）
- フロントエンド: React + Vite（UI）
- ネイティブ: Tauri + Rust（OS 連携・重い処理・非同期処理）
- 通信: Tauri JS API とカスタム Rust コマンドで連携

---

## Slide 10 — スライド作成時の注意（表示上の取捨選択）
- 1スライドあたり 3〜6 点に絞る（読みやすさ重視）
- アイコン（React, Rust, Tauri 等）を使うと視認性向上
- 必須情報: 言語 / ランタイム / 主要ライブラリ / ビルドツール
- 詳細はハンドアウト（`docs/技術スタック.md`）に誘導する
