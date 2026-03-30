# MC-Vector Next Phase Plan

## 1. Requested Task Status Matrix

User-requested set:
`1, 2, 6, 8, 10, 11, 12, 13, 14, 17, 18, 19, 29, 30, 32, 36, 39, 40, 44, 47`

| Task | Title | Status | Notes |
|---|---|---|---|
| #1 | サーバープロファイル | pending | Phase 4 |
| #2 | サーバーテンプレート保存 | pending | Phase 4 |
| #6 | クラッシュ検知自動再起動 | done | retry/delay/limit implemented |
| #8 | サーバー複製 | pending | Phase 4 |
| #10 | インスタンスグループ管理 | pending | Phase 4 |
| #11 | ログ検索 | done | Ctrl/Cmd+F + match nav |
| #12 | ログフィルタ | done | ALL/INFO/WARN/ERROR/FATAL |
| #13 | ログ色分け | done | severity colors applied in console output |
| #14 | ログ保存 | done | save visible logs to .log/.txt |
| #17 | コマンド履歴 | done | up/down + draft restore |
| #18 | TPSリアルタイムグラフ | done | dashboard chart + log parser + Paper polling |
| #19 | CPU使用率グラフ | done | aligned to rolling 60s metric window |
| #29 | 依存関係チェック | done | Modrinth required dependency scan + bulk install prompt |
| #30 | 有効/無効トグル | done | in-card rename toggle: .jar <-> .jar.disabled |
| #32 | バージョン互換チェック | done | compatibility badges + pre-install warnings |
| #36 | ドラッグ&ドロップアップロード | done | external file drop upload in Files view |
| #39 | 自動バックアップスケジュール | done-partial | interval scheduler implemented; time-based policy pending |
| #40 | 差分バックアップ | done | metadata snapshot diff mode in Backups view |
| #44 | バックアップタグ | done | tags/notes editor persisted in backup metadata |
| #47 | ワールド削除GUI | done | world list + double-confirm delete flow |

## 2. Architecture Progress

- Zustand baseline introduced under `src/store`:
  - `serverStore.ts`
  - `consoleStore.ts`
  - `uiStore.ts`
  - `settingsStore.ts`
- `App.tsx` connected to stores for server/ui/theme/log core state.
- Plugin flow reliability improved with Hangar external-download fallback and richer API error surfacing.

## 3. Next Implementation Order

### Phase A (Stability + UX) - Completed

1. #13 ログ色分け
2. #14 ログ保存
3. #36 ドラッグ&ドロップアップロード

### Phase B (Monitoring) - Completed

1. #18 TPSリアルタイムグラフ
2. #19 CPUグラフの仕様合わせ（60秒ウィンドウ + 表示整合）

### Phase C (Plugin Depth) - Completed

1. #29 依存関係チェック
2. #30 有効/無効トグル
3. #32 バージョン互換チェック

### Phase D (Backup/World) - Completed

1. #40 差分バックアップ
2. #44 バックアップタグ
3. #47 ワールド削除GUI

### Phase E (Server Expansion) - Next

1. #1 サーバープロファイル
2. #2 サーバーテンプレート
3. #8 サーバー複製
4. #10 インスタンスグループ管理

## 4. Guardrail Checklist (Per Prompt)

1. No `any` in production code.
2. API payloads parsed through type guards before UI use.
3. `pnpm build` and diagnostics must pass.
4. Update this document after substantial task completion.
