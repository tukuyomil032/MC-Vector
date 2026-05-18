# MC-Vector 実装進捗 & フェーズ計画

> **更新日:** 2026-05-18
> **現在バージョン:** 2.0.54
> **ブランチ:** `main`

---

## 全体ステータス

| フェーズ  | 内容                                                                             | 状態                      |
| --------- | -------------------------------------------------------------------------------- | ------------------------- |
| Phase 1   | コマンド履歴・稼働時間・JVM・シンタックス強化                                    | ✅ 完了                   |
| Phase 2   | 正規表現検索・プロパティ検索・プレイヤー管理                                     | ✅ 完了                   |
| Phase 3   | バックアップ保持ポリシー・バージョンアップウィザード                             | ✅ 完了                   |
| Phase 4   | ファイル差分ビュー・プラグイン更新チェック・サーバーインポート・デスクトップ通知 | ✅ 完了                   |
| Phase 5   | 複数サーバー一括操作・SLP Ping ヘルスチェック                                    | ✅ 完了                   |
| **Infra** | **パッケージ追加・スタイリング基盤整備**                                         | **✅ 完了（2026-05-18）** |
| Phase 6   | スタイリング移行（Tailwind + CVA + Radix UI）                                    | ✅ 完了（2026-05-18）     |
| Phase 7   | React Query 移行・フォーム強化                                                   | ✅ 完了（2026-05-18）     |
| Phase 8   | UX強化（cmdk・sonner統合・Tauriプラグイン活用）                                  | 🔲 未着手                 |

---

## 完了済みフェーズ詳細

### Phase 1 ✅（コミット: `84c0eb3`, `f92a06f`）

| #   | アイデア               | 内容                                         |
| --- | ---------------------- | -------------------------------------------- |
| #1  | コマンド履歴           | サーバーコンソールの入力履歴（↑↓で呼び出し） |
| #4  | 稼働時間表示           | ダッシュボードに稼働時間カウンター追加       |
| #6  | JVM引数編集            | サーバーごとのJVM引数をUI編集                |
| #13 | JVM引数プリセット      | 推奨引数プリセット選択                       |
| #16 | シンタックスハイライト | コンソール出力の色分け（WARN/ERROR/INFO）    |

### Phase 2 ✅（コミット: `4d240a3`）

| #   | アイデア       | 内容                              |
| --- | -------------- | --------------------------------- |
| #3  | 正規表現検索   | コンソールログの正規表現フィルタ  |
| #12 | プロパティ検索 | server.properties のキー検索      |
| #15 | プレイヤー管理 | 接続中プレイヤー一覧・Kick/Ban UI |

### Phase 3 ✅（コミット: `e28c92b`〜`34debec`）

| #   | アイデア                   | 内容                                 |
| --- | -------------------------- | ------------------------------------ |
| #11 | バックアップ保持ポリシー   | 世代数/日数でバックアップ自動削除    |
| #26 | バージョンアップウィザード | Minecraft/Paper バージョン更新フロー |

### Phase 4 ✅（コミット: `7d9385b`〜`f750b8f`）

| #   | アイデア               | 内容                                      |
| --- | ---------------------- | ----------------------------------------- |
| #42 | ファイル差分ビュー     | 設定ファイルの変更差分表示（Monaco diff） |
| #7  | プラグイン更新チェック | インストール済みプラグインの新版チェック  |
| #33 | サーバーインポート     | 既存サーバーフォルダをMC-Vectorに取り込み |
| #31 | デスクトップ通知       | サーバー起動/停止/クラッシュ時の通知      |

### Phase 5 ✅（コミット: `e46aebe`, `7b24d1e`）

| #   | アイデア                | 内容                                      |
| --- | ----------------------- | ----------------------------------------- |
| #22 | 複数サーバー一括操作    | 複数サーバーの一括起動/停止               |
| #21 | SLP Ping ヘルスチェック | Minecraft SLPプロトコルでサーバー死活監視 |

---

## Infra（基盤整備）✅ 完了（2026-05-18）

> メイン機能フェーズとは別の横断的インフラ作業。

### 追加パッケージ（フロントエンド）

| パッケージ                      | 用途                            |
| ------------------------------- | ------------------------------- |
| `class-variance-authority`      | CVAコンポーネントバリアント管理 |
| `clsx` + `tailwind-merge`       | `cn()` ヘルパー基盤             |
| `@radix-ui/react-dialog`        | アクセシブルなダイアログ        |
| `@radix-ui/react-dropdown-menu` | ドロップダウンメニュー          |
| `@radix-ui/react-context-menu`  | コンテキストメニュー            |
| `@radix-ui/react-tabs`          | タブコンポーネント              |
| `@radix-ui/react-tooltip`       | ツールチップ                    |
| `@radix-ui/react-popover`       | ポップオーバー                  |
| `@radix-ui/react-select`        | セレクトボックス                |
| `@radix-ui/react-switch`        | トグルスイッチ                  |
| `@radix-ui/react-progress`      | プログレスバー                  |
| `@radix-ui/react-scroll-area`   | カスタムスクロール              |
| `sonner`                        | トースト通知                    |
| `cmdk`                          | コマンドパレット                |
| `@tanstack/react-query`         | 非同期状態管理・キャッシュ      |
| `@tanstack/react-virtual`       | 大量リスト仮想化                |
| `react-hook-form`               | フォーム管理                    |
| `zod` + `@hookform/resolvers`   | バリデーション                  |

### 追加Tauriプラグイン

| プラグイン                             | 用途                                 |
| -------------------------------------- | ------------------------------------ |
| `@tauri-apps/plugin-window-state`      | ウィンドウ位置・サイズの再起動後復元 |
| `@tauri-apps/plugin-clipboard-manager` | クリップボードコピー機能             |
| `@tauri-apps/plugin-global-shortcut`   | グローバルショートカットキー         |

### 作成ファイル

| ファイル        | 内容                                                  |
| --------------- | ----------------------------------------------------- |
| `src/lib/ui.ts` | `cn()` ヘルパー + `cva`/`VariantProps` 再エクスポート |

### 変更ファイル

| ファイル               | 変更内容                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `src/main.tsx`         | `QueryClientProvider` + sonner `<Toaster />` をルートに追加 |
| `src-tauri/Cargo.toml` | Tauriプラグイン3本のRustクレート追加                        |
| `src-tauri/src/lib.rs` | 3本のプラグインを `.plugin()` チェーンに登録                |

---

## Phase 6：スタイリング移行（Tailwind + CVA + Radix UI）✅ 完了（2026-05-18）

> **方針:** 既存SCSSは維持しつつ、新規コンポーネントをTailwind+CVAで書き直す段階的移行。

### タスク一覧

| タスク | 内容                                                   | 優先度 | 状態                                                                    |
| ------ | ------------------------------------------------------ | ------ | ----------------------------------------------------------------------- |
| 6-1    | `Button` コンポーネント CVA化                          | 高     | ✅ 完了                                                                 |
| 6-2    | 全モーダルを Radix `Dialog` ベースに置き換え           | 高     | ✅ 完了（AddServerChoice/AddServer/ImportServer/AppUpdate/JavaManager） |
| 6-3    | `Dropdown / ContextMenu` を Radix ベースに置き換え     | 高     | ✅ 完了（PR #104）                                                      |
| 6-4    | `Tabs` を Radix `Tabs` ベースに置き換え                | 中     | ✅ 完了（PR #104）                                                      |
| 6-5    | `Tooltip` を Radix `Tooltip` ベースに置き換え          | 中     | ✅ 完了（PR #105）                                                      |
| 6-6    | `Select / Switch / Progress` を Radix ベースに置き換え | 中     | ✅ 完了（PR #105）                                                      |
| 6-7    | 既存SCSSの中で重複・未使用クラスを整理（部分削除）     | 低     | ✅ 完了（PR #105）                                                      |

### 進め方

```
新規コンポーネントを書く場合:
  → import { cn, cva } from '@/lib/ui'
  → import * as Dialog from '@radix-ui/react-dialog'
  → Tailwindクラスで直接スタイリング

既存コンポーネントを修正する場合:
  → SCSSクラスを残したまま、まずRadixプリミティブに差し替え
  → 安定後にTailwindクラスへスタイル移行
  → SCSSクラスを削除
```

---

## Phase 7：React Query 移行・フォーム強化 ✅ 完了（2026-05-18）

### タスク一覧

| タスク | 内容                                                    | 対象                 | 状態          |
| ------ | ------------------------------------------------------- | -------------------- | ------------- |
| 7-1    | Modrinth/Hangar API呼び出しを React Query に移行        | `PluginBrowser.tsx`  | ✅ 完了       |
| 7-2    | サーバー状態ポーリングを React Query に移行             | `DashboardView.tsx`  | ✅ 完了（ping のみ）|
| 7-3    | サーバー作成フォームを react-hook-form + zod に移行     | `AddServerModal.tsx` | ✅ 完了       |
| 7-4    | 設定フォームを react-hook-form + zod に移行             | `SettingsWindow.tsx` | ⏭️ スキップ（対象なし）|
| 7-5    | プラグイン一覧・バックアップ一覧に React Virtual を適用 | `BackupsView.tsx`    | ✅ 完了       |

---

## Phase 8：UX強化 🔲

### タスク一覧

| タスク | 内容                                                 | パッケージ                             |
| ------ | ---------------------------------------------------- | -------------------------------------- |
| 8-1    | コマンドパレット実装（Cmd+K）                        | `cmdk`                                 |
| 8-2    | サーバーIP/ポートのワンクリックコピー                | `@tauri-apps/plugin-clipboard-manager` |
| 8-3    | グローバルショートカット設定（起動/停止/コンソール） | `@tauri-apps/plugin-global-shortcut`   |
| 8-4    | 既存ToastProviderをsonnerに統合                      | `sonner`                               |
| 8-5    | window-state の動作確認・微調整                      | `@tauri-apps/plugin-window-state`      |

---

## スタイリングルール（現行）

`.claude/rules/frontend/styling.md` より:

- **短い1回限りのTailwindユーティリティ** → TSXにインライン
- **長い・繰り返すクラスチェーン** → `src/styles/` 以下のSCSSクラス
- `@apply` に無効な値（例: `bg-white/3`）は使わない → 明示的CSSカラー値を使う
- ダークテーマパレット: 背景 `#121214`、アクセント `#5865F2`

### 新規コンポーネントのテンプレート

```tsx
import { cn, cva, type VariantProps } from '@/lib/ui';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-[#5865F2] text-white hover:bg-[#4752c4]',
        ghost: 'bg-transparent hover:bg-white/10',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-7 px-3',
        md: 'h-9 px-4',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

---

## 開発フロー

```bash
pnpm dev:plain      # Vite開発サーバー（localhost:5173）
pnpm tauri:dev      # デスクトップアプリ全体
pnpm build          # フロントエンドビルド（TypeScript確認に使う）
pnpm check:fix      # lint + format 自動修正
```

---

## コミット規則

```bash
git commit -m "feat: ..." \
           -m "詳細説明" \
           -m "Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

プレフィックス: `feat:` / `fix:` / `ref:` / `docs:` / `chore:`
