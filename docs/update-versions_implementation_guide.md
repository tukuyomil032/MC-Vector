# update-versions.yml Discord 通知機能 実装ガイド

## 概要

このワークフローは Minecraft バージョン更新を監視し、新しいバージョンが検知されたときに、詳細情報を Discord に通知します。

---

## セットアップ手順

### 1. Discord Webhook URL の取得と登録

詳細な手順は [Discord_webhook_setup.md](Discord_webhook_setup.md) を参照してください。

簡潔な流れ：
1. Discord サーバー内の通知チャンネルで、「チャンネル編集」→「連携」→「ウェブフック」から新規作成
2. Webhook URL をコピー
3. GitHub リポジトリの **Settings** → **Secrets and variables** → **Actions** で `DISCORD_WEBHOOK_URL` という名前で保存

---

## ワークフローの仕様

### 2.1 実行トリガー

- **スケジュール実行**: 毎日 15:00 UTC（`0 15 * * *`）
- **手動実行**: Actions タブから `workflow_dispatch` で いつでも実行可能

### 2.2 取得・記録される情報

| 情報 | 説明 | 取得方法 |
|------|------|---------|
| **実行日時** | ワークフロー開始時刻（UTC） | `Record start time` ステップ |
| **実行時間** | ワークフロー全体の実行時間（分秒） | 開始と終了のエポック時間から計算 |
| **検知バージョン** | 新規に検知された Minecraft バージョン（複数可） | `update-output.json` の `.detected` 配列 |
| **コミット ID** | ワークフロー実行時の HEAD コミット（短形式 7 文字） | `git rev-parse HEAD` |
| **PR リンク** | 作成された Pull Request へのハイパーリンク | `peter-evans/create-pull-request` アクション出力 |
| **PR 番号** | Pull Request の番号 | 上記同様 |
| **ワークフロー実行 ID** | 各ワークフロー実行の一意 ID へのリンク | GitHub Actions のビルトイン変数 |

### 2.3 Discord 埋め込みメッセージの フォーマット

メッセージは以下の内容で構成されます（Embed フォーマット）：

```
🎯 ワークフロー表示レイアウト
┌────────────────────────────────────────┐
│ ✅ バージョン更新検知                    │ ← タイトル
│ 新しい Minecraft バージョンが検知      │ ← 説明文
│ されました                              │
├────────────────────────────────────────┤
│ 🔍 検知バージョン                      │
│ 1.20.2, 1.20.3, 24w03a                │ ← 検知された全バージョン
├────────────────────────────────────────┤
│ 📌 Pull Request                        │
│ [PR #42](https://...)                  │ ← PR リンク付き番号
├────────────────────────────────────────┤
│ 📝 コミット ID      ⏱️ 実行時間        │
│ `abc1234`           2m45s              │ ← インライン表示
├────────────────────────────────────────┤
│ 🎯 ワークフロー実行                     │
│ [12345678](https://...)                │ ← 実行ダッシュボードへのリンク
├────────────────────────────────────────┤
│ 📅 実行日時                            │
│ 2024-01-15T15:00:00Z                   │ ← ISO 8601 形式
└────────────────────────────────────────┘
```

**更新がない場合の表示:**
- 色: グレー（9807270）
- タイトル: `ℹ️ 更新なし`
- PR: `なし`

---

## ワークフロー実行ログの見方

GitHub リポジトリ内：
1. **Actions** タブをクリック
2. **Update Minecraft versions** をクリック
3. 実行履歴から目的の実行を選択
4. 各ステップの出力を確認可能

重要なステップ：
- `Run update script`: `update-output.json` の内容が表示
- `Send Discord notification`: cURL 実行ログ＆ HTTP レスポンス確認

---

## トラブルシューティング

### 問題: Discord に通知が送信されない

**症状**: ワークフローは成功しているが、Discord にメッセージが届かない

**確認事項**:

1. **Webhook URL が正しく登録されているか**
   ```bash
   # ローカルでテスト（シェルから）
   curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"content":"テスト"}' \
     "YOUR_WEBHOOK_URL"
   ```

2. **GitHub Secrets に `DISCORD_WEBHOOK_URL` として保存されているか**
   - Settings → Secrets and variables → Actions で確認

3. **チャンネルが削除されていないか**
   - Webhook は作成元チャンネルが削除されると無効化

4. **ボット権限の確認**
   - Discord チャンネル設定で Webhook 権限が有効か確認

### 問題: "Webhook URL not found" エラー

**原因**: `DISCORD_WEBHOOK_URL` 環境変数が未設定

**解決策**: GitHub Secrets に登録し、リポジトリ内で新規ワークフロー実行

### 問題: JSON パース エラー

**原因**: `update-output.json` の形式が想定外

**確認方法**: 
- ワークフロー内 `Run update script` ステップで出力を確認
- `scripts/update-versions.js` の出力形式が以下を満たしているか確認：
  ```json
  {
    "detected": ["1.20.2", "1.20.3"],
    "changed": true
  }
  ```

---

## カスタマイズ例

### 通知受信チャンネルを変更

複数チャンネルに通知したい場合、ワークフローを複数回実行：

```yaml
- name: Send Discord notification (general)
  run: curl -X POST -H 'Content-Type: application/json' ... "${{ secrets.DISCORD_WEBHOOK_GENERAL }}"

- name: Send Discord notification (dev)
  run: curl -X POST -H 'Content-Type: application/json' ... "${{ secrets.DISCORD_WEBHOOK_DEV }}"
```

### 埋め込みメッセージの色を変更

Embed フィールド内の `"color"` を 10 進整数に変更：
- `3066993`: 緑（成功）
- `16711680`: 赤（失敗）
- `16776960`: 黄色（注意）
- `9807270`: グレー（なし）

---

## セキュリティに関する注意

- 🔒 **Webhook URL は絶対に公開しないこと**
  - GitHub Secrets で保管し、ログ出力しない
  - カスタマイズ時に curl コマンドにそのまま埋め込まない

- 🔓 **Webhook を無効化して再生成したいとき**
  - Discord チャンネルの Webhook 管理から「削除」を選択
  - GitHub Secrets の該当エントリを更新

---

## 参考文献

- [GitHub Actions 環境変数](https://docs.github.com/en/actions/learn-github-actions/environment-variables)
- [Discord Webhook Documentation](https://discord.com/developers/docs/resources/webhook)
- [GitHub Secrets 管理](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

