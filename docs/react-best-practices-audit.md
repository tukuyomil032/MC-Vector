# React Best Practices Audit (Vercel + View Transitions)

- Date: 2026-04-09
- Branch: `audit/react-best-practices-plan`
- Scope: `src/**/*.tsx` (React frontend only)
- Method: parallel sub-agent audit + manual evidence verification
- Auditは完了し、監査起点の remediation は主要項目まで反映済み

## Executive Summary

現状の実装は、`React.lazy` による画面分割や、Zustand/i18nの型設計など良い土台があります。一方で、運用時に効いてくる高優先度課題として、**起動時ロケール初期化の欠落**、**ログ更新でApp全体が再レンダーされる構造**、**非同期イベント購読の解除レース**、**ナビゲーションのセマンティクス不足**が確認できました。

## 優先度付き指摘

| Priority | Category                        | Finding                                                                           | Status   | Evidence                                                                                                                                                                           |
| -------- | ------------------------------- | --------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | State initialization            | 起動時に保存ロケールを読み込んでいない                                            | **Done** | `src/main.tsx`                                                                                                                                                                     |
| P0       | Re-rendering                    | サーバーログ更新で `App` 全体が再レンダーされる                                   | **Done** | `src/App.tsx`, `src/renderer/components/ConsoleView.tsx`, `src/store/consoleStore.ts`                                                                                              |
| P1       | Async effects                   | `tauriListen` / `on*Change` の購読解除が Promise 解決競合に依存するパターンが散在 | **Done** | `src/renderer/components/FilesView.tsx`, `BackupsView.tsx`, `ServerSettings.tsx`, `JavaManagerModal.tsx`, `BackupTargetSelectorWindow.tsx`, `DashboardView.tsx`, `ConsoleView.tsx` |
| P1       | Accessibility / React semantics | `NavItem` が clickable `div` で、キーボード/ARIAセマンティクス不足                | **Done** | `src/App.tsx`, `src/styles/layout/_app-layout.scss`                                                                                                                                |
| P1       | Motion accessibility            | `prefers-reduced-motion` 分岐なしで画面遷移/カードアニメーションを実行            | **Done** | `src/App.tsx`, `src/renderer/components/PluginBrowser.tsx`                                                                                                                         |
| P2       | Rendering strategy              | コンソール描画が全件レンダリング + ANSIパースを描画時実行                         | **Done** | `src/renderer/components/ConsoleView.tsx`                                                                                                                                          |
| P2       | Async waterfalls                | プラグイン互換/更新判定が結果配列単位の同時実行で、Abort制御なし                  | **Done** | `src/renderer/components/PluginBrowser.tsx`                                                                                                                                        |
| P2       | Error containment               | `lazy` + `Suspense` はあるが Error Boundary がない                                | **Done** | `src/renderer/components/ViewErrorBoundary.tsx`, `src/App.tsx`                                                                                                                     |
| P3       | Code hygiene                    | 実処理のない空 `useEffect` が残存                                                 | **Done** | `src/App.tsx`                                                                                                                                                                      |

---

## 主要指摘の解説と改善方針

### 1) 起動時ロケール初期化の欠落 (P0)

`useI18nStore` に `initLocale()` がある一方、起動時に呼ばれていません。`DEFAULT_LOCALE` が `en` のため、再起動時に保存言語が反映されないリスクがあります。

**方向性**

- `main.tsx` で `root.render(...)` 前に `useI18nStore.getState().initLocale()` を実行
- もしくはアプリブートストラップ層を追加して初期化を集約

### 2) ログ更新時のApp全体再レンダー (P0)

`App` が `serverLogs` 全体を購読し、Console画面でのみ必要なログを `renderContent` で引き渡しています。`consoleStore` は flush ごとに `serverLogs` オブジェクトを更新するため、ログ頻度に応じて `App` 再レンダーが走ります。

**方向性**

- `serverLogs` 購読を `ConsoleView` 側へ移譲
- または `activeServer.id` 単位の selector を作り、`App` では購読しない

### 3) 非同期購読解除レースの共通パターン (P1)

`let unlisten` に Promise 完了後代入し cleanup で `unlisten?.()` する実装が複数箇所にあります。StrictMode下では mount/unmount が増えるため、解放漏れ・意図しないコールバック実行の温床になります。

**方向性**

- `useTauriListener` のような共通hookを作成
- `cancelled` フラグ + late resolve時の即時 dispose を標準化

### 4) ナビのセマンティクス不足 (P1)

`NavItem` が `div + onClick` 実装で、role/keyboard/`aria-current` を持ちません。

**方向性**

- `button` 要素へ変更し、`aria-current="page"` と `aria-label` を付与
- フォーカスリングとキーボード操作を明示

### 5) reduced-motion 非対応の遷移 (P1)

主要遷移で `framer-motion` を使っていますが、`prefers-reduced-motion` 判定がありません。

**方向性**

- `matchMedia('(prefers-reduced-motion: reduce)')` または `useReducedMotion` を導入
- duration/transformを縮退または無効化

### 6) ConsoleView の描画コスト (P2)

可視ログ全件を map し、各行で ANSI 分解を実行しています。ログ量が増えるとレンダリング/スクロール負荷が上がります。

**方向性**

- 仮想リスト導入（`react-window` or `@tanstack/react-virtual`）
- ANSI分解結果のキャッシュ
- key を `originalIndex` ベースに固定

### 7) PluginBrowser の非同期判定負荷 (P2)

検索結果のたびに互換性判定/更新判定を配列全体で並列実行しています。キャンセルは state 更新抑止のみで、ネットワークリクエスト自体は止まりません。

**方向性**

- debounce + concurrency 上限 + abort を併用
- server/version/project 組み合わせで判定結果キャッシュを強化

### 8) Lazyロード時の障害封じ込め不足 (P2)

`Suspense` のみで Error Boundary が無いため、動的import失敗時に復旧導線が弱いです。

**方向性**

- view領域に `ErrorBoundary` を追加し、再読み込み/ホーム遷移導線を提供

---

## View Transition 専用評価

### 現状

- 画面遷移: `framer-motion` (`App.tsx`)
- リスト/カード遷移: `framer-motion` (`PluginBrowser.tsx`)

### 適用候補（導入価値あり）

1. `currentView` 切替時のメインコンテンツ遷移（ページ遷移相当）
2. モーダル開閉（AddServer など）

### 非推奨（現状維持推奨）

1. プラグイン一覧の細かなスタッガー演出
2. ボタン hover/tap のマイクロインタラクション

### 導入条件

- WebView差異を考慮した feature detection を前提化
- 非対応環境は既存framer-motion/CSSへフォールバック
- reduced-motion を先に実装してから段階導入

---

## 良い実装（維持推奨）

- `React.lazy` + `Suspense` による主要ビュー分割（`App.tsx`）
- `consoleStore` のバッチflush設計（`LOG_FLUSH_INTERVAL_MS`）
- `PluginBrowser` のキャッシュ参照設計（`updateStatusCacheRef` 等）
- バックアップメタデータの型ガード/サニタイズ処理（`BackupsView.tsx`）

---

## 次フェーズ（実装修正）推奨順

1. P0を先行修正（ロケール初期化、ログ購読分離）
2. 購読解除レースの共通hook化
3. Navのセマンティクス修正 + reduced-motion対応
4. ConsoleView/PluginBrowserの負荷改善
5. ErrorBoundary追加
6. View Transitionのパイロット導入（1画面から）
