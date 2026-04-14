# MC-Vector Engineering Requirements

**Document target version:** `2.0.51`

## 1. Scope

このドキュメントは、`docs/improvements.md` の機能群を実装する際の必須ルールとフェーズ分割を定義する。
対象はフロントエンド(React/TypeScript/SCSS)とTauri(Rust)の両方。

## 2. Mandatory Coding Rules

1. `any` の使用を禁止する。外部入力は `unknown` で受け取り、型ガードで絞り込む。
2. APIレスポンス(Modrinth/Hangar/Spigot/GitHub)は必ずアダプター層で正規化してからUIへ渡す。
3. プラットフォーム分岐はユニオン型で管理し、文字列の暗黙比較を避ける。
4. 失敗時は握りつぶさず、ログ出力とユーザー通知(Toast)を両方行う。
5. UIはTSXで構造、SCSSで見た目を担当し、長いユーティリティ列を残さない。

## 3. Architecture Requirements

### 3.1 Zustand State Stores

`src/store` に以下の分割ストアを導入する。

- `serverStore.ts`: サーバー一覧、選択サーバー、稼働状態
- `consoleStore.ts`: ログバッファ、検索語、レベルフィルタ、自動スクロール
- `uiStore.ts`: 現在ビュー、サイドバー開閉、モーダル表示
- `settingsStore.ts`: テーマ、アプリ設定、更新通知状態

### 3.2 Log Stream Throttling

- 高頻度ログをそのまま描画しない。
- 50msバッファでまとめて描画する。
- レベル(INFO/WARN/ERROR)をタグ化してフィルタ性能を上げる。

### 3.3 Server State Machine

Rust側のサーバー状態を次の遷移で統一する。

- `Stopped -> Starting -> Running -> Stopping -> Stopped`
- `Running -> Crashed -> Restarting -> Starting`

UIの操作可否(Start/Stop/Restartボタン)はこの状態機械に従って制御する。

### 3.4 Plugin Source Adapter Layer

`src/lib/plugin-commands.ts` に統一インターフェースを定義する。

```ts
interface PluginSourceAdapter {
  search(query: string, gameVersion: string, page: number): Promise<PluginProject[]>;
  resolveDownload(project: PluginProject, gameVersion: string): Promise<PluginDownload | null>;
}
```

各ソース(Modrinth/Hangar/Spigot/CurseForge)はこの契約に合わせる。

### 3.5 Target Project Structure

新規実装は次の構造を優先し、責務を分離する。

```text
src/
├── store/
│   ├── serverStore.ts
│   ├── consoleStore.ts
│   ├── uiStore.ts
│   └── settingsStore.ts
├── lib/
│   ├── adapters/
│   │   ├── plugin/
│   │   └── updater/
│   └── guards/
└── renderer/
  └── components/
```

必須ルール:

1. API レスポンスの shape 判定は `src/lib/guards` で実施する。
2. ソース別の API 差異吸収は `src/lib/adapters` で実施する。
3. UI 層は正規化済みデータのみを扱い、生レスポンスを直接利用しない。

## 4. Phase Plan

### Phase 1: Reliability and UX Baseline

- Updater配信整合修正(署名、latest.json、CI条件分岐)
- Hangar検索/導入の実動化
- Spigotのアプリ内検索と導入
- Plugin BrowserのモダンUI化

### Phase 2: Operations Essentials

- #11 ログ検索
- #12 ログフィルタ
- #17 コマンド履歴
- #39 自動バックアップスケジュール
- #6 クラッシュ検知自動再起動

### Phase 3: Plugin and Compatibility Depth

- #29 依存関係チェック
- #30 有効/無効トグル
- #32 バージョン互換チェック
- #28 更新通知

### Phase 4: Server and Template Expansion

- #1 サーバープロファイル
- #2 サーバーテンプレート
- #8 サーバー複製
- #10 インスタンスグループ管理

## 5. Quality Gates

各フェーズ完了時に以下を必須実施する。

1. `pnpm build`
2. `pnpm biome:check`
3. 影響範囲の手動確認(Plugin導入、起動/停止、更新確認)
4. ドキュメント更新(`AGENTS.md`, `docs/improvements.md`, 本ファイル)

## 6. Commit Policy

- フェーズ単位でコミットを作成する。
- コミットメッセージは `feat:`, `fix:`, `refactor:`, `docs:` で開始する。
- 1コミットに複数フェーズを混在させない。
