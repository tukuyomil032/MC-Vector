# MC-Vector セキュリティ監査レポート（完全版・非省略）

- 日付: 2026-04-11
- 対象: `src-tauri/**`, `src/lib/**`, `src/renderer/**`, `src/store/**`, `src/App.tsx`, `src-tauri/capabilities/**`, `src-tauri/tauri.conf.json`
- 方式: ユーザー提示25項目の再検証 + 追加脅威ハンティング

## 判定凡例

- **Confirmed**: 現行コードで成立
- **Partially Confirmed**: 指摘の意図は正しいが、実装実態が異なる
- **Already Mitigated**: 既に対策済み
- **Not Applicable**: 現行構成では成立しない

---

# 🔴 Critical（致命的）

## 1. サーバー起動入力の境界未検証（任意実行パス）

- **ファイル**: `src-tauri/src/commands/server.rs`
- **該当コード**

```rust
let mut child = Command::new(&java_path)
    .args([
        &format!("-Xmx{}M", memory),
        &format!("-Xms{}M", memory),
        "-jar",
        &jar_file,
        "nogui",
    ])
    .current_dir(&server_path)
    .spawn()?;
```

- **問題**
  - shell展開は使っていないため「典型的な shell injection」ではない。
  - ただし `java_path` / `jar_file` / `server_path` を未検証で受けるため、アプリ権限内で想定外バイナリ・パスを実行できる。
- **修正diff（提案）**

```diff
+ use std::path::{Path, PathBuf};
+
+ fn resolve_within(base: &Path, input: &str) -> Result<PathBuf, String> {
+   let joined = base.join(input);
+   let canonical = joined.canonicalize().map_err(|e| e.to_string())?;
+   if !canonical.starts_with(base) {
+     return Err("Path escapes allowed root".into());
+   }
+   Ok(canonical)
+ }
+
+ let server_root = std::path::Path::new(&server_path).canonicalize().map_err(|e| e.to_string())?;
+ let java = PathBuf::from(&java_path);
+ if java.file_name().and_then(|n| n.to_str()) != Some("java") {
+   return Err("Invalid java binary".into());
+ }
+ let jar = resolve_within(&server_root, &jar_file)?;
- let mut child = Command::new(&java_path)
+ let mut child = Command::new(java)
    .arg("-jar")
-   .arg(&jar_file)
+   .arg(jar)
```

- **判定**: **Confirmed**

## 2. ngrok起動入力の境界未検証（バイナリ/プロトコル）

- **ファイル**: `src-tauri/src/commands/ngrok.rs`
- **該当コード**

```rust
pub async fn start_ngrok(
    app: AppHandle,
    state: State<'_, NgrokManager>,
    ngrok_path: String,
    protocol: String,
    port: u16,
    authtoken: String,
    server_id: String,
) -> Result<(), String> {
    let mut child = Command::new(&ngrok_path)
        .args([&protocol, &format!("{}", port), "--authtoken", &authtoken, "--log", "stdout"])
        .spawn()?;
```

- **問題**
  - `port` は `u16` なので「文字列port未検証」は不成立。
  - ただし `ngrok_path` と `protocol` が未検証で、想定外実行/引数操作が可能。
- **修正diff（提案）**

```diff
+ #[derive(Clone, Copy)]
+ enum TunnelProtocol { Tcp }
+
+ fn parse_protocol(v: &str) -> Result<TunnelProtocol, String> {
+   match v {
+     "tcp" => Ok(TunnelProtocol::Tcp),
+     _ => Err("Unsupported protocol".into()),
+   }
+ }
+
+ let protocol = parse_protocol(&protocol)?;
+ let ngrok = std::path::PathBuf::from(&ngrok_path).canonicalize().map_err(|e| e.to_string())?;
+ if ngrok.file_name().and_then(|n| n.to_str()) != Some("ngrok") {
+   return Err("Invalid ngrok path".into());
+ }
- .args([&protocol, &format!("{}", port), "--authtoken", &authtoken, "--log", "stdout"])
+ .args(["tcp", &port.to_string(), "--authtoken", &authtoken, "--log", "stdout"])
```

- **判定**: **Partially Confirmed**

## 3. Tauri権限が過剰（shell/fs）

- **ファイル**: `src-tauri/capabilities/default.json`
- **該当コード**

```json
{
  "identifier": "shell:allow-spawn",
  "allow": [
    { "name": "java", "cmd": "java", "args": true },
    { "name": "ngrok", "cmd": "ngrok", "args": true }
  ]
},
"shell:allow-execute",
"shell:allow-kill",
"shell:allow-stdin-write",
"fs:read-all",
"fs:write-all"
```

- **問題**
  - `shell` と `fs` の許可範囲が広く、侵害時の被害範囲が大きい。
  - ユーザー指摘の `"shell": {"all": true}` は現行構成と差分があるが、実質的な過剰権限は成立。
- **修正diff（提案）**

```diff
- "shell:allow-execute",
- "fs:read-all",
- "fs:write-all"
+ {
+   "identifier": "shell:allow-spawn",
+   "allow": [
+     { "name": "java", "cmd": "java", "args": ["-Xmx*", "-Xms*", "-jar", "*.jar", "nogui"] },
+     { "name": "ngrok", "cmd": "$APPDATA/ngrok", "args": ["tcp", "*", "--authtoken", "*", "--log", "stdout"] }
+   ]
+ },
+ {
+   "identifier": "fs:scope",
+   "allow": [{ "path": "$APPDATA/servers/**" }, { "path": "$APPDATA/ngrok/**" }]
+ }
```

- **判定**: **Confirmed**

## 4. IPC呼び出しにコマンド境界チェックがない

- **ファイル**: `src/lib/tauri-api.ts`
- **該当コード**

```ts
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return await invoke<T>(cmd, args ?? {});
}
```

- **問題**
  - ラッパーが任意コマンド文字列を受けるため、XSS等が成立した場合に呼び出し面を横断しやすい。
- **修正diff（提案）**

```diff
+ const ALLOWED_COMMANDS = new Set([
+   'start_server','stop_server','send_command','is_server_running','get_server_pid',
+   'download_file','download_server_jar','create_backup','restore_backup',
+   'compress_item','extract_item','download_java',
+   'start_ngrok','stop_ngrok','download_ngrok','is_ngrok_installed',
+   'list_dir_with_metadata','can_update_app','get_app_location'
+ ]);
+
 export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
+  if (!ALLOWED_COMMANDS.has(cmd)) {
+    throw new Error(`Blocked tauri command: ${cmd}`);
+  }
   return await invoke<T>(cmd, args ?? {});
 }
```

- **判定**: **Confirmed**

## 5. 任意ファイル読み取り（Path Traversal / 境界逸脱）

- **ファイル**: `src/lib/file-commands.ts`, `src-tauri/src/commands/file_utils.rs`
- **該当コード**

```ts
export async function readFileContent(filePath: string): Promise<string> {
  return readTextFile(filePath);
}
```

```rust
pub async fn list_dir_with_metadata(path: String) -> Result<Vec<FileEntryInfo>, String> {
    let dir_path = Path::new(&path);
    // path境界チェックなし
}
```

- **問題**
  - 呼び出し元の入力制御に依存しており、境界外パスを拒否できない。
- **修正diff（提案）**

```diff
+ import { appDataDir } from '@tauri-apps/api/path';
+ function assertWithinRoot(root: string, target: string): string {
+   const normalizedRoot = root.replace(/\\/g, '/');
+   const normalizedTarget = target.replace(/\\/g, '/');
+   if (!normalizedTarget.startsWith(`${normalizedRoot}/`) && normalizedTarget !== normalizedRoot) {
+     throw new Error('Invalid path');
+   }
+   return normalizedTarget;
+ }
```

- **判定**: **Confirmed**

## 6. 任意ファイル書き込み（上書き/削除含む）

- **ファイル**: `src/lib/file-commands.ts`
- **該当コード**

```ts
export async function saveFileContent(filePath: string, content: string): Promise<void> {
  return writeTextFile(filePath, content);
}
export async function deleteItem(path: string): Promise<void> {
  await remove(path, { recursive: true });
}
```

- **問題**
  - 書き込み/削除の境界制御がなく、`fs:write-all` と組み合わさると被害範囲が広い。
- **修正diff（提案）**

```diff
- return writeTextFile(filePath, content);
+ const safePath = assertWithinServerRoot(filePath);
+ return writeTextFile(safePath, content);
```

- **判定**: **Confirmed**

---

# 🟠 High

## 7. ログXSS

- **ファイル**: `src-tauri/src/commands/server.rs`, `src/renderer/components/ConsoleView.tsx`
- **該当コード**

```rust
line,
```

```tsx
<span key={i} style={style}>
  {seg.text}
</span>
```

- **問題**
  - ログは未サニタイズで送信されるが、React描画はエスケープされるため直接XSSは成立しにくい。
- **修正diff（提案）**

```diff
+ // HTMLコンテキストで再利用する将来に備え、送信前に制御文字除去を追加
+ fn sanitize_log_line(input: &str) -> String { ... }
```

- **判定**: **Partially Confirmed**

## 8. ngrokプロセス終了時のwait不足

- **ファイル**: `src-tauri/src/commands/ngrok.rs`
- **該当コード**

```rust
if let Some(mut child) = proc.take() {
    let _ = child.kill().await;
}
```

- **問題**
  - kill後の待機が不足し、終了整合が崩れる可能性がある。
- **修正diff（提案）**

```diff
if let Some(mut child) = proc.take() {
    let _ = child.kill().await;
+   let _ = child.wait().await;
}
```

- **判定**: **Confirmed**

## 9. 外部バイナリパス未固定

- **ファイル**: `src-tauri/src/commands/ngrok.rs`
- **該当コード**

```rust
Command::new(&ngrok_path)
```

- **問題**
  - 実行パスが可変で、想定外バイナリを起動し得る。
- **修正diff（提案）**

```diff
- Command::new(&ngrok_path)
+ Command::new(resolve_managed_ngrok_path(&ngrok_path)?)
```

- **判定**: **Confirmed**

## 10. 設定値のスキーマ検証不足

- **ファイル**: `src/lib/config-commands.ts`, `src/lib/server-commands.ts`
- **該当コード**

```ts
return (await store.get<MinecraftServer[]>('servers')) ?? [];
```

- **問題**
  - 永続化データを型アサーション寄りで取り扱っており、破損値/予期しない型への堅牢性が弱い。
- **修正diff（提案）**

```diff
+ import { parseServerArray } from './guards/server-store-guards';
- return (await store.get<MinecraftServer[]>('servers')) ?? [];
+ return parseServerArray(await store.get<unknown>('servers'));
```

- **判定**: **Partially Confirmed**

## 11. 環境変数漏洩

- **ファイル**: 該当なし（`process.env` のログ出力未検出）
- **該当コード**

```ts
// no matches: process.env
```

- **問題**
  - 現行コードでは該当実装なし。
- **修正diff（提案）**

```diff
+ // 継続監視のみ（実装変更不要）
```

- **判定**: **Not Applicable**

## 12. 無制限プロセス生成（DoS）

- **ファイル**: `src-tauri/src/commands/server.rs`
- **該当コード**

```rust
if servers.contains_key(&server_id) {
    return Err("Server is already running".into());
}
```

- **問題**
  - 同一ID重複は防げるが、全体上限はない。
- **修正diff（提案）**

```diff
+ const MAX_RUNNING_SERVERS: usize = 8;
{
    let servers = state.servers.lock().await;
+   if servers.len() >= MAX_RUNNING_SERVERS {
+     return Err("Too many running servers".into());
+   }
    if servers.contains_key(&server_id) { ... }
}
```

- **判定**: **Partially Confirmed**

---

# 🟡 Medium

## 13. 詳細エラー露出

- **ファイル**: `src/lib/update-commands.ts`, `src/lib/tauri-api.ts`, 他多数
- **該当コード**

```ts
console.error(`[Tauri] invoke ${cmd} failed`, e);
```

- **問題**
  - 開発/診断には有用だが、ユーザー表示へ原文が混入する箇所がある。
- **修正diff（提案）**

```diff
- throw e;
+ throw new Error('Operation failed');
```

- **判定**: **Confirmed**

## 14. i18n経由インジェクション

- **ファイル**: `src/i18n/index.ts`
- **該当コード**

```ts
return interpolate(value, params);
```

- **問題**
  - 翻訳辞書はローカル静的データで、現時点で外部入力混入経路は確認できない。
- **修正diff（提案）**

```diff
+ // 現時点では実装変更不要（将来、外部翻訳配信時にサニタイズ導入）
```

- **判定**: **Not Applicable**

## 15. アップデート署名未検証

- **ファイル**: `src-tauri/tauri.conf.json`, `src/lib/update-commands.ts`
- **該当コード**

```json
"updater": { "active": true, "pubkey": "..." }
```

```ts
if (lower.includes('signature verification failed')) { ... }
```

- **問題**
  - 署名検証は既存構成で有効。
- **修正diff（提案）**

```diff
+ // 維持（定期鍵ローテーション手順だけ文書化）
```

- **判定**: **Already Mitigated**

## 16. JSON.parse未ガード

- **ファイル**: `src/lib/file-commands.ts`
- **該当コード**

```ts
return JSON.parse(content);
```

- **問題**
  - 例外はcatchされるが、返却値の構造検証がない。
- **修正diff（提案）**

```diff
+ import { isRecord } from './guards/json-guards';
  const parsed = JSON.parse(content);
+ return isRecord(parsed) ? parsed : null;
```

- **判定**: **Partially Confirmed**

## 17. ログ肥大化

- **ファイル**: `src/store/consoleStore.ts`
- **該当コード**

```ts
const MAX_LOG_LINES = 2000;
nextServerLogs[pendingServerId] =
  merged.length > MAX_LOG_LINES ? merged.slice(-MAX_LOG_LINES) : merged;
```

- **問題**
  - 上限制御あり。
- **修正diff（提案）**

```diff
+ // 現状維持（閾値を設定項目化する改善は任意）
```

- **判定**: **Already Mitigated**

## 18. イベントリスナーリーク

- **ファイル**: `src/App.tsx`, `src/renderer/components/ConsoleView.tsx`, `ServerSettings.tsx` など
- **該当コード**

```ts
return () => {
  cancelled = true;
  unlisten?.();
};
```

- **問題**
  - 主要箇所は cleanup 実装済み。残タスクは共通hook化による再発防止。
- **修正diff（提案）**

```diff
+ // useTauriListener 共通hookへ統一（再発防止）
```

- **判定**: **Already Mitigated**

## 19. CORS未制御

- **ファイル**: 該当なし（サーバーAPI層未導入）
- **該当コード**

```ts
// app.use(cors()) を使うWeb API層は未実装
```

- **問題**
  - 現行アーキテクチャでは対象外。
- **修正diff（提案）**

```diff
+ // 将来API導入時に origin allowlist を必須化
```

- **判定**: **Not Applicable**

## 20. 権限境界なし（ロール管理不在）

- **ファイル**: アプリ全体設計
- **該当コード**

```txt
ローカル単一ユーザー前提でRBACなし
```

- **問題**
  - マルチユーザー運用要件が入ると不足。
- **修正diff（提案）**

```diff
+ define PermissionModel { local_admin, operator, viewer }
+ gate dangerous actions by permission model
```

- **判定**: **Partially Confirmed**

---

# 🧠 設計問題

## 21. 信頼境界の一元化不足

- **ファイル**: `src/lib/*` ↔ `src-tauri/src/commands/*`
- **該当コード**

```txt
入力検証が各所分散
```

- **問題**: 検証漏れが起きやすい。
- **修正diff（提案）**

```diff
+ add shared validate module (path/command/port/url)
```

- **判定**: **Confirmed**

## 22. 認可レイヤー不在

- **ファイル**: IPC呼び出し全体
- **該当コード**

```txt
invoke前の権限制御がない
```

- **問題**: 操作権限の段階化ができない。
- **修正diff（提案）**

```diff
+ add command-level policy check in tauriInvoke wrapper
```

- **判定**: **Confirmed**

## 23. 監査ログ不足

- **ファイル**: 主要コマンド（start/stop/delete/download）
- **該当コード**

```txt
セキュリティイベントの永続監査ログなし
```

- **問題**: 事後追跡が困難。
- **修正diff（提案）**

```diff
+ emit structured audit events + persist local audit log file
```

- **判定**: **Confirmed**

## 24. FSサンドボックスが緩い

- **ファイル**: `src-tauri/capabilities/default.json`
- **該当コード**

```json
"fs:read-all",
"fs:write-all",
{ "identifier": "fs:scope", "allow": [{ "path": "$HOME/**" }] }
```

- **問題**: 実質サンドボックスが広すぎる。
- **修正diff（提案）**

```diff
- "$HOME/**"
+ "$APPDATA/servers/**"
+ "$APPDATA/ngrok/**"
```

- **判定**: **Confirmed**

## 25. レート制限なし

- **ファイル**: コマンド送信/ダウンロード起点
- **該当コード**

```txt
send_command, download_file にレート制御なし
```

- **問題**: 過剰連打/大量呼び出し耐性が弱い。
- **修正diff（提案）**

```diff
+ add per-server command throttle (token bucket)
+ add concurrent download limit
```

- **判定**: **Confirmed**

---

# ➕ 追加検知（今回の監査で新規抽出）

## 26. 任意URL + 任意保存先ダウンロード

- **ファイル**: `src-tauri/src/commands/download.rs`
- **該当コード**

```rust
pub async fn download_file(app: AppHandle, url: String, dest: String, event_id: String) -> Result<(), String>
```

- **問題**: URL/保存先の妥当性検証なし。
- **優先度**: High

## 27. バックアップ対象の境界外ファイル混入余地

- **ファイル**: `src-tauri/src/commands/backup.rs`
- **該当コード**

```rust
let full_path = source_path.join(rel);
if full_path.exists() { files.push(full_path); }
```

- **問題**: `../` 混入時に境界外ファイルを含める余地。
- **優先度**: High

## 28. CSP無効化

- **ファイル**: `src-tauri/tauri.conf.json`
- **該当コード**

```json
"security": { "csp": null }
```

- **問題**: XSS成立時の被害抑止が弱い。
- **優先度**: High

## 29. FS権限の過大スコープ

- **ファイル**: `src-tauri/capabilities/default.json`
- **該当コード**

```json
"fs:read-all", "fs:write-all"
```

- **問題**: ローカル全域操作に近い。
- **優先度**: Critical

## 30. ngrokトークンがプロセス引数に露出

- **ファイル**: `src-tauri/src/commands/ngrok.rs`
- **該当コード**

```rust
.args([..., "--authtoken", &authtoken, ...])
```

- **問題**: OSプロセス一覧経由で露出する可能性。
- **優先度**: High

---

## 評価

- **現状推定**: 4.0 / 10
- **Critical/High修正後推定**: 8.5 / 10

## このブランチで反映した修正（Critical/High先行）

- `src-tauri/src/commands/server.rs`
  - `java_path` / `server_path` / `jar_file` の入力検証を追加
  - メモリ上限下限チェックを追加
  - 同時実行サーバー数の上限を追加
  - サーバーコマンド送信レート制御（最小送信間隔）を追加
- `src-tauri/src/commands/ngrok.rs`
  - `ngrok_path` / `protocol` / token の入力検証を追加
  - プロセス停止時に `kill` 後 `wait` を追加
- `src/lib/file-commands.ts`
  - AppData配下ルートへのパス境界チェックを追加
  - create/move/delete/read/write の全操作に共通ガードを適用
- `src/lib/tauri-api.ts`
  - IPCコマンド allowlist を追加し、未許可コマンドを遮断
  - 呼び出し失敗時の公開エラーメッセージを簡素化
- `src/lib/file-commands.ts`
  - JSON読み込み時の構造ガードを追加（プリミティブ値を拒否）
- `src-tauri/capabilities/default.json`
  - `shell:*` 許可と `fs:read-all` / `fs:write-all` を削除
- `src-tauri/src/lib.rs`
  - `tauri_plugin_shell` 初期化を削除
- `src-tauri/tauri.conf.json`
  - `csp: null` を明示ポリシーへ変更

## 結論

- ユーザー提示リストの方向性は妥当だが、現行コード構造に合わせた再マッピングが必要だった。
- 直近は **Critical/Highの実装修正を先行**し、`App.tsx` 分離は次フェーズへ切り出す方針が最も安全。
