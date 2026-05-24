#!/usr/bin/env bash
# gha-summary.sh — GitHub Actions Job Summary に CI 結果を書き込む
# CI 環境（$GITHUB_STEP_SUMMARY が設定済み）でのみ動作します
# Usage: gha-summary.sh <run-id> [--repo owner/repo]
set -euo pipefail

RUN_ID="${1:-}"
REPO_ARG=""
if [[ "${2:-}" == "--repo" ]]; then
  REPO_ARG="${3:-}"
fi

# CI 環境でなければ静かに終了
if [[ -z "${GITHUB_STEP_SUMMARY:-}" ]]; then
  exit 0
fi

if [[ -z "$RUN_ID" ]]; then
  echo "Usage: $0 <run-id> [--repo owner/repo]" >&2
  exit 1
fi

REPO_FLAG=""
[[ -n "$REPO_ARG" ]] && REPO_FLAG="--repo $REPO_ARG"

# ジョブ情報を取得
JOB_JSON=$(gh run view "$RUN_ID" $REPO_FLAG --json jobs,conclusion,displayTitle,headBranch 2>/dev/null || true)
if [[ -z "$JOB_JSON" ]]; then
  echo "## ⚠️ CI Summary (Run #${RUN_ID})" >>"$GITHUB_STEP_SUMMARY"
  echo "ジョブ情報を取得できませんでした。" >>"$GITHUB_STEP_SUMMARY"
  exit 0
fi

overall=$(echo "$JOB_JSON" | jq -r '.conclusion // "unknown"')
title=$(echo "$JOB_JSON" | jq -r '.displayTitle // "—"')
branch=$(echo "$JOB_JSON" | jq -r '.headBranch // "—"')

# ヘッダー
{
  if [[ "$overall" == "success" ]]; then
    echo "## ✅ CI Passed — Run #${RUN_ID}"
  else
    echo "## ❌ CI Failed — Run #${RUN_ID}"
  fi
  echo ""
  echo "| Key | Value |"
  echo "|-----|-------|"
  echo "| Branch | \`${branch}\` |"
  echo "| Title | ${title} |"
  echo "| Overall | **${overall}** |"
  echo ""
  echo "### Jobs"
  echo ""
  echo "| Job | Status | Duration |"
  echo "|-----|--------|----------|"
} >>"$GITHUB_STEP_SUMMARY"

# ジョブ行を追記
echo "$JOB_JSON" | jq -r '.jobs[] |
  (if .conclusion == "success"   then "✅"
   elif .conclusion == "failure" then "❌"
   elif .conclusion == "cancelled" then "⊘"
   else "⋯" end) as $icon |
  (.startedAt // "" | if . != "" then . else null end) as $s |
  (.completedAt // "" | if . != "" then . else null end) as $e |
  "| \(.name) | \($icon) \(.conclusion // .status) | — |"
' >>"$GITHUB_STEP_SUMMARY" 2>/dev/null || true

# 失敗時はログ抜粋を追記
if [[ "$overall" == "failure" ]]; then
  {
    echo ""
    echo "### Failed Log (excerpt)"
    echo ""
    echo '```'
    gh run view "$RUN_ID" $REPO_FLAG --log-failed 2>&1 | head -50 || true
    echo '```'
  } >>"$GITHUB_STEP_SUMMARY"
fi

echo "✓ GitHub Actions Job Summary を更新しました。" >&2
