# Discord Webhook セットアップガイド

## 1. Discord Webhook URL の取得

### STEP 1: Discord Server での設定

1. **Discord サーバーを開く** → 通知を受け取りたいチャンネルを右クリック
2. **「チャンネルを編集」** を選択
3. 左サイドバーから **「連携」** → **「ウェブフック」** をクリック
4. **「新しいウェブフック」** をクリック
5. ウェブフック名を設定（例: `GitHub Actions`）
6. **「コピー」** をクリックして Webhook URL をコピー
   - 形式: `https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN`

---

## 2. GitHub Secrets への登録

### STEP 2: GitHub Repository の設定

1. GitHub リポジトリページを開く
2. **Settings** → **Secrets and variables** → **Actions** をクリック
3. **New repository secret** をクリック
4. 以下を入力：
   - **Name**: `DISCORD_WEBHOOK_URL`
   - **Secret**: 上記でコピーした Discord Webhook URL
5. **Add secret** をクリックで保存

---

## 3. ワークフローでの使用

修正した `update-versions.yml` で、以下の環境変数を通じてアクセスします：

```yaml
env:
  DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

---

## 4. Webhook メッセージ形式（Embed 使用）

- **Color**: 16進数カラーコード（例: `0x00ff00` = 緑、`0xff0000` = 赤）
- **Title**: メッセージタイトル
- **Description**: メッセージ本文
- **Fields**: 追加情報（key-value）
- **Timestamp**: ISO 8601 形式のタイムスタンプ

---

## 5. cURL コマンドでのテスト送信（任意）

```bash
curl -X POST \
  "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "embeds": [{
      "title": "テストメッセージ",
      "description": "Discord Webhook が正常に機能しています",
      "color": 3066993
    }]
  }'
```

---

## 注意事項

- **Webhook URL は秘密裏に管理** — GitHub Secrets で保管し、ログ出力しないこと
- **レート制限** — Discord の API には使用制限あり（通常は問題なし）
- **チャンネル削除時** — Webhook URL は無効になるため、再度設定が必要

