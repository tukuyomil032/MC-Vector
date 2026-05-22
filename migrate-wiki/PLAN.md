# MC-Vector Wiki 移行計画

> Next.js+MDX 別リポジトリ → Astro Starlight モノレポ（`docs/`）への移行  
> `/clear` 後でもここを読めば全体状況を把握できる

---

## 概要

| 項目 | 内容 |
|------|------|
| 移行元 | `~/Documents/dev/JS-TS/Web/MC-Vector-Wiki`（Next.js 16 + MDX） |
| 移行先 | `mc-vector/docs/`（Astro Starlight パッケージ） |
| デプロイ先 | Vercel（自動生成 URL）|
| i18n | Phase 1 は英語のみ（後から日本語追加）|
| 対象読者 | エンドユーザー＋開発者の両方 |
| linter/formatter | ルート `lefthook.yml` に `docs/` グロブを追加して流用 |

---

## フェーズ一覧

| Phase | 内容 | ステータス |
|-------|------|----------|
| 0 | コードベース読み込み → Wiki コンテンツドラフト作成 | 未着手 |
| 1 | Starlight セットアップ | 未着手 |
| 2 | コンテンツ移行（16ページ）| 未着手 |
| 3 | TypeDoc + Rustdoc 連携 | 未着手 |
| 4 | GitHub Actions + Vercel 自動デプロイ | 未着手 |
| 5 | 旧Wikiリポジトリ廃止・後処理 | 未着手 |

---

## Phase 0: コードベース読み込み → Wiki ドラフト作成

**目的**: 現行コードベースの全機能・アーキテクチャを把握し、各 Wiki ページに載せる内容を `docs/` 内の MD ファイルとしてドラフトする。

**方針**:
- 既存の `docs/tutorial.md`, `docs/architecture.md`, `docs/development-guide.md` を書き直す形でドラフト化
- コンテンツは現行コードベース（`src/`, `src-tauri/`）から読み込んで最新情報で書く
- 旧 Wiki（`~/Documents/dev/JS-TS/Web/MC-Vector-Wiki`）は**構成の参考のみ**（本文は使わない）

### チェックリスト

- [ ] **0-1** `src/renderer/components/` 全体を読み込み、機能一覧を把握（サブエージェント並列）
- [ ] **0-2** `src-tauri/src/commands/` 全 Rust コマンドを読み込み（サブエージェント並列）
- [ ] **0-3** `docs/tutorial.md` を「Getting Started + Features 全ページ」のドラフトに書き直し
  - コミット: `docs: rewrite tutorial.md as wiki content draft`
- [ ] **0-4** `docs/architecture.md` を現行アーキテクチャで更新
  - コミット: `docs: update architecture.md to current state`
- [ ] **0-5** `docs/development-guide.md` を現行セットアップ手順で更新
  - コミット: `docs: update development-guide.md`

### 旧 Wiki の参照ページ構成（構造の参考）

旧 Wiki のカテゴリ・ページ構成を Starlight に継承する:

| 旧 Wiki ページ | Starlight 対応パス |
|---|---|
| getting-started/installation.mdx | guide/getting-started/installation.md |
| getting-started/server-creation.mdx | guide/getting-started/server-creation.md |
| features/server-lifecycle.mdx | guide/features/server-lifecycle.md |
| features/plugins-mods.mdx | guide/features/plugins-mods.md |
| features/backup-restore.mdx | guide/features/backup-restore.md |
| features/file-manager.mdx | guide/features/file-manager.md |
| features/console-logs.mdx | guide/features/console-logs.md |
| configuration/general-settings.mdx | guide/configuration/general-settings.md |
| configuration/server-properties.mdx | guide/configuration/server-properties.md |
| configuration/theme-customization.mdx | guide/configuration/theme.md |
| network-proxy/ngrok-tunnel.mdx | guide/network/ngrok.md |
| network-proxy/velocity-setup.mdx | guide/network/velocity.md |
| troubleshooting/common-errors.mdx | guide/troubleshooting/common-errors.md |
| troubleshooting/performance.mdx | guide/troubleshooting/performance.md |
| developer/setup.mdx | dev/setup.md |
| developer/architecture.mdx | dev/architecture.md |

---

## Phase 1: Starlight セットアップ

**前提条件**: Phase 0 完了

### チェックリスト

- [ ] **1-1** `pnpm-workspace.yaml` に `packages: ['docs']` を追加
  - コミット: `chore: add docs workspace to pnpm-workspace.yaml`
- [ ] **1-2** `docs/package.json` 作成（Astro + Starlight + biome devDep）
  - コミット: `chore: init @mc-vector/docs package`
- [ ] **1-3** `docs/astro.config.mjs` 作成（サイドバー設定含む）
  - コミット: `feat(docs): add astro.config.mjs with sidebar`
- [ ] **1-4** `docs/biome.json` 作成（ルートの `biome.json` を extends で継承）
  - コミット: `chore(docs): add biome.json extending root config`
- [ ] **1-5** `lefthook.yml` に `lint-format-docs` コマンドを追加
  - コミット: `chore: add docs lint command to lefthook.yml`
- [ ] **1-6** `docs/src/styles/custom.css` 作成（zinc ブランドカラー CSS 変数）
  - コミット: `feat(docs): add MC-Vector brand color CSS variables`
- [ ] **1-7** `docs/CLAUDE.md` 作成
  - コミット: `docs: add docs/CLAUDE.md`
- [ ] **1-8** `docs/public/favicon.svg` と `docs/public/logo.svg` を追加
  - コミット: `feat(docs): add favicon and logo assets`
- [ ] **1-9** `docs/src/content/docs/index.mdx`（Hero ページ）作成
  - コミット: `feat(docs): add docs homepage hero`

**検証**: `pnpm --filter @mc-vector/docs dev` → http://localhost:4321 で表示確認

---

## Phase 2: コンテンツ移行（16 ページ）

**前提条件**: Phase 1 完了、Phase 0 のドラフト作成済み

### チェックリスト

- [ ] **2-1** `guide/getting-started/`（2 ページ）作成
  - installation.md, server-creation.md
  - コミット: `feat(docs): add getting-started section`
- [ ] **2-2** `guide/features/`（5 ページ）作成
  - server-lifecycle.md, plugins-mods.md, backup-restore.md, file-manager.md, console-logs.md
  - コミット: `feat(docs): add features section`
- [ ] **2-3** `guide/configuration/`（3 ページ）作成
  - general-settings.md, server-properties.md, theme.md
  - コミット: `feat(docs): add configuration section`
- [ ] **2-4** `guide/network/`（2 ページ）作成
  - ngrok.md, velocity.md
  - コミット: `feat(docs): add network section`
- [ ] **2-5** `guide/troubleshooting/`（2 ページ）作成
  - common-errors.md, performance.md
  - コミット: `feat(docs): add troubleshooting section`
- [ ] **2-6** `dev/`（2 ページ）作成
  - setup.md, architecture.md
  - コミット: `feat(docs): add developer section`
- [ ] **2-7** 旧 Wiki の動画アセット（9 本 MP4）を `docs/public/videos/` にコピー
  - コミット: `feat(docs): add video assets from old wiki`
- [ ] **2-8** `<Video />` カスタム MDX コンポーネント作成
  - コミット: `feat(docs): add Video MDX component`
- [ ] **2-9** 全ページの内部リンク検証・修正
  - コミット: `fix(docs): fix broken links in content`

**検証**: `pnpm --filter @mc-vector/docs build` がエラーなし

---

## Phase 3: TypeDoc + Rustdoc 連携

**前提条件**: Phase 2 完了

### チェックリスト

- [ ] **3-1** `docs/typedoc.json` 作成
  - entryPoints: `../src/lib`, `../src/store`, `../src/renderer/components`
  - tsconfig: `../tsconfig.app.json`
  - コミット: `feat(docs): add typedoc.json config`
- [ ] **3-2** `docs/scripts/generate-api-docs.mjs` 作成
  - コミット: `feat(docs): add TypeDoc generation script`
- [ ] **3-3** `.gitignore` に `docs/src/content/docs/api/typescript/` と `docs/public/rustdoc/` を追加
  - コミット: `chore: gitignore TypeDoc and Rustdoc output`
- [ ] **3-4** `pnpm --filter @mc-vector/docs typedoc` で生成確認
  - コミット: `feat(docs): integrate TypeDoc into docs build`
- [ ] **3-5** `docs/src/content/docs/api/rust/index.md` 作成（Rustdoc リンクページ）
  - コミット: `feat(docs): add Rust API reference page`
- [ ] **3-6** `docs/package.json` に `build:full` スクリプト追加
  - コミット: `chore(docs): add build:full script`

**検証**: `pnpm --filter @mc-vector/docs build:full` 成功

---

## Phase 4: GitHub Actions + Vercel 自動デプロイ

**前提条件**: Phase 3 完了

### チェックリスト

- [ ] **4-1** Vercel で `mc-vector-docs` プロジェクトを新規作成（**手動**）
  - フレームワーク: Other、出力ディレクトリ: `docs/dist`
- [ ] **4-2** GitHub Secrets に以下を追加（**手動**）
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID_DOCS`（アプリ本体 Vercel プロジェクトとは別）
- [ ] **4-3** `.github/workflows/docs.yml` 作成
  - コミット: `ci: add docs build and deploy workflow`
- [ ] **4-4** `docs/**` への空コミットで CI パイプライン動作確認
  - コミット: `chore: trigger docs CI`
- [ ] **4-5** `src/**` 変更時のトリガー（TypeDoc 再生成）を確認

**docs.yml の設定ポイント**:
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'src/**'
      - 'src-tauri/src/**'
```
- セットアップ: `voidzero-dev/setup-vp@v1`（既存 CI と同一）
- Rust: `dtolnay/rust-toolchain@stable` + `swatinem/rust-cache@v2`
- デプロイ: `amondnet/vercel-action@v25` with `--prod`

**注意**: 既存 `release.yml` が gh-pages ブランチを `latest.json` 専用で使用。docs は Vercel に分離してコンフリクト回避。

---

## Phase 5: 旧 Wiki リポジトリ廃止・後処理

**前提条件**: Phase 4 完了・本番デプロイ URL 確認済み

### チェックリスト

- [ ] **5-1** `CLAUDE.md` の `docs/engineering-requirements.md` 参照（存在しないファイル）を修正
  - コミット: `fix: update CLAUDE.md doc references`
- [ ] **5-2** `docs/` 内の移行済み旧 MD ファイルを削除
  - 対象: `tutorial.md`, `architecture.md`, `development-guide.md`, `mc-vector-package-research.md`, `next-phase-plan.md`
  - コミット: `chore(docs): remove legacy markdown files`
- [ ] **5-3** `README.md` のドキュメントリンクを新 Vercel URL に更新
  - コミット: `docs: update README with new wiki URL`
- [ ] **5-4** 旧 Wiki リポジトリをアーカイブ（**GitHub で手動**）

---

## lefthook.yml 追加内容

現在の `lefthook.yml` に以下を追加する（既存コマンドはそのまま）:

```yaml
  lint-format-docs:
    glob: 'docs/src/**/*.{ts,mjs,astro}'
    run: pnpm --filter @mc-vector/docs check:fix
    stage_fixed: true
```

`docs/package.json` に追加するスクリプト:
```json
"check": "astro check && biome check docs/src",
"check:fix": "biome check --write docs/src"
```

`docs/biome.json`:
```json
{
  "extends": ["../../biome.json"]
}
```

biome は Astro ファイル（`.astro`）のフォーマットに対応しているため流用可能。

---

## docs/CLAUDE.md の内容

```markdown
# docs/CLAUDE.md — Starlight Documentation Site

## Commands
pnpm --filter @mc-vector/docs dev          # Dev server → http://localhost:4321
pnpm --filter @mc-vector/docs build        # Production build → docs/dist/
pnpm --filter @mc-vector/docs build:full   # TypeDoc + Astro full build
pnpm --filter @mc-vector/docs preview      # Preview production build
pnpm --filter @mc-vector/docs typedoc      # Regenerate TypeScript API docs

## Content Guidelines
- Frontmatter required: `title`, `description`, `sidebar.order`
- Developer pages: add `sidebar.badge: { text: Developer, variant: note }`
- `api/typescript/` is auto-generated — DO NOT edit manually
- `public/rustdoc/` is auto-generated — DO NOT edit manually
- Internal links: Starlight slug format `/guide/features/dashboard`, not relative paths
- After adding a new page: update `sidebar` in astro.config.mjs

## Directory Structure
- guide/getting-started/  — Installation, First server
- guide/features/         — Server lifecycle, plugins, backups, file manager, console
- guide/configuration/    — Server properties, general settings, theme
- guide/network/          — ngrok, Velocity/proxy
- guide/troubleshooting/  — Common errors, performance
- dev/                    — Environment setup, architecture
- api/typescript/         — Auto-generated (TypeDoc) — gitignored
- api/rust/               — Rustdoc reference page

## After changes
Run `pnpm --filter @mc-vector/docs build` — catches broken links and build errors.
```

---

## Starlight スキル候補（手動インストール）

現在グローバルスキルに Astro 専用なし。流用可能な既存スキル:

| スキル | 用途 |
|--------|------|
| `vercel-react-best-practices` | Vite/MDX 共通パターン流用 |
| `web-design-guidelines` | ドキュメントサイト UI レビュー |
| `tauri-v2` | Rustdoc / Rust バックエンド部分 |

新規: `astro-starlight`（仮称）— Claude Code スキルリポジトリで検索して存在すれば追加。

---

## 注意点まとめ

1. **pnpm workspace**: `packages: ['docs']` 追加後、ルート `pnpm install` で docs も自動インストール
2. **Astro + Starlight バージョン**: Astro 5.x + Starlight 0.30+ の組み合わせ（major 版互換性に注意）
3. **TypeDoc の tsconfig 参照**: `../tsconfig.app.json` への相対パス。TypeDoc 0.26+ なら `"moduleResolution": "bundler"` は問題なし
4. **動画アセット（9 本）**: 旧 Wiki `public/videos/*.mp4` を `docs/public/videos/` にコピー、カスタム `<Video />` MDX コンポーネントで埋め込む
5. **gh-pages 共存**: 既存 `release.yml` が gh-pages ブランチを `latest.json` に使用。docs は Vercel に分離
6. **CLAUDE.md の参照切れ**: `docs/engineering-requirements.md` が存在しない → Phase 5 で修正
