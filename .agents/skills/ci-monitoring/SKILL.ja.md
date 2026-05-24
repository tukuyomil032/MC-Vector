---
name: ci-monitoring
description: git push 後に GitHub Actions CI/CD ワークフローを自動監視します。`git push` が成功したら即座に（確認なしで）自動実行してください。「CI の結果を確認」「ワークフローを監視」「CI passed した？」「monitor CI」などのキーワード、または GitHub Actions の URL が提示された場合にも起動します。このスキルは必須です：push 後は CI 結果をユーザーの代わりに確認し、「CI どうだった？」と聞かれる前に報告してください。
---

# CI 監視スキル

`git push` 後、GitHub Actions ワークフローが完了または失敗するまで自動で監視し、結果をユーザーに報告します。

## 基本方針

ユーザーが「CI 通ったかな？」と思う前に報告することが目標です。push が成功した瞬間に監視を開始してください。許可を求めず、実行して報告する。

---

## ステップバイステップのワークフロー

監視は `.agents/skills/ci-monitoring/scripts/` のスクリプトが全て担います。
ロジックをインラインで再実装せず、スクリプトを呼び出してください。

### 1. インタラクティブモード（デフォルト）

```bash
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh
```

fzf で直近の Run を選択できます。fzf がない場合は `select` メニューにフォールバックします。

### 2. Run ID を直接指定

```bash
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh <run-id>
```

### 3. 非インタラクティブ — 最新 Run を即時表示

```bash
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh --latest
```

### 4. 成功時

`ci-monitor.sh` が終了コード 0 で終了します。簡潔に報告:

```
✓ CI 通りました — 全ジョブ green。(Run #XXXXX, Ys)
```

### 5. 失敗時

`ci-monitor.sh` が自動で `analyze-failure.sh` を呼び出し、エラー分類テーブルを表示します。
その後、以下をインタラクティブに確認します:
1. `.claude/ci-reports/` に Markdown レポートを保存するか
2. `SKILL.md` に失敗パターンを追記するか

ログを直接アナライザーにパイプすることも可能:

```bash
gh run view <id> --log-failed | bash .agents/skills/ci-monitoring/scripts/analyze-failure.sh --stdin
```

---

## スクリプト一覧（参照用）

| スクリプト | 用途 |
|-----------|------|
| `ci-monitor.sh` | fzf インタラクティブジョブブラウザ（メインエントリポイント） |
| `analyze-failure.sh` | エラー行抽出 + カテゴリ分類（Rust/Test/Package/Network/Lint） |
| `report-table.sh` | ANSI カラーテーブル表示（ジョブ一覧） |
| `gha-summary.sh` | GitHub Actions Job Summary 書き込み（CI 環境のみ） |

---

## 主要コマンド一覧（手動実行参照用）

| 用途 | コマンド |
|------|---------|
| 直近の Run 一覧 | `gh run list --repo owner/repo --limit 5` |
| 完了まで監視 | `gh run watch <id> --repo owner/repo --exit-status` |
| ステータス確認 | `gh run view <id> --repo owner/repo` |
| 失敗ジョブのログ | `gh run view <id> --repo owner/repo --log-failed` |
| 全ログ | `gh run view <id> --log --repo owner/repo 2>&1` |
| 特定ジョブのログ | `gh api repos/owner/repo/actions/jobs/<job-id>/logs` |
| Run 内のジョブ ID | `gh run view <id> --repo owner/repo --json jobs --jq '.jobs[].databaseId'` |

---

## 報告フォーマット

**成功時:**
```
✓ CI 通りました — 19/19 テスト通過 (ubuntu-latest + windows-latest)
  Run #XXXXX · Ys · feat/branch
```

**失敗時:**
```
✗ CI 失敗 — ubuntu-latest ジョブ
  ジョブ: "Run E2E tests"（ステップ 12）
  エラー: ElementNotInteractableError at navigation.test.js:48
  → [関連ログ行を貼り付け]

考えられる原因: [あなたの分析]
```
