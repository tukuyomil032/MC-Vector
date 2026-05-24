#!/usr/bin/env bash
# report-table.sh — ANSI カラーテーブルで CI ジョブ一覧を表示
# Usage: report-table.sh <run-id> [--repo owner/repo]
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

RUN_ID="${1:-}"
REPO_ARG=""
if [[ "${2:-}" == "--repo" ]]; then
  REPO_ARG="--repo ${3:-}"
elif [[ -z "$RUN_ID" ]]; then
  echo "Usage: $0 <run-id> [--repo owner/repo]" >&2
  exit 1
fi

# リポジトリを自動検出（引数なし時）
if [[ -z "$REPO_ARG" ]]; then
  DETECTED=$(git remote get-url origin 2>/dev/null \
    | sed 's/.*github\.com[:/]//' | sed 's/\.git$//')
  [[ -n "$DETECTED" ]] && REPO_ARG="--repo $DETECTED"
fi

# ジョブ JSON を取得
JOB_JSON=$(gh run view "$RUN_ID" $REPO_ARG --json jobs 2>/dev/null)
if [[ -z "$JOB_JSON" ]]; then
  echo -e "${RED}Run ID $RUN_ID のデータを取得できませんでした。${NC}" >&2
  exit 1
fi

# ヘッダー
echo ""
echo -e "${BOLD}${CYAN}┌────────────────────────────────────────────────────────────────────┐${NC}"
printf "${BOLD}${CYAN}│${NC} %-68s ${BOLD}${CYAN}│${NC}\n" "CI Jobs — Run #${RUN_ID}"
echo -e "${BOLD}${CYAN}├──────────────────────────┬──────────┬────────────┬──────────────────┤${NC}"
printf "${BOLD}${CYAN}│${NC} %-24s ${BOLD}${CYAN}│${NC} %-8s ${BOLD}${CYAN}│${NC} %-10s ${BOLD}${CYAN}│${NC} %-16s ${BOLD}${CYAN}│${NC}\n" \
  "Job" "Status" "Duration" "Runner"
echo -e "${BOLD}${CYAN}├──────────────────────────┼──────────┼────────────┼──────────────────┤${NC}"

# 各ジョブを処理
FAILED_COUNT=0
PASS_COUNT=0

while IFS= read -r job; do
  name=$(echo "$job" | jq -r '.name' | cut -c1-24)
  conclusion=$(echo "$job" | jq -r '.conclusion // "pending"')
  status=$(echo "$job" | jq -r '.status')
  started=$(echo "$job" | jq -r '.startedAt // empty')
  completed=$(echo "$job" | jq -r '.completedAt // empty')
  runner=$(echo "$job" | jq -r '.runnerName // "—"' | cut -c1-16)

  # 実行時間を計算
  duration="—"
  if [[ -n "$started" && -n "$completed" ]]; then
    start_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$started" +%s 2>/dev/null \
      || date -d "$started" +%s 2>/dev/null || echo 0)
    end_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$completed" +%s 2>/dev/null \
      || date -d "$completed" +%s 2>/dev/null || echo 0)
    diff=$((end_epoch - start_epoch))
    duration="$(( diff / 60 ))m $(( diff % 60 ))s"
  fi

  # ステータスカラー
  case "$conclusion" in
    success)
      status_str="${GREEN}✓ PASS${NC}"
      PASS_COUNT=$((PASS_COUNT + 1))
      ;;
    failure)
      status_str="${RED}✗ FAIL${NC}"
      FAILED_COUNT=$((FAILED_COUNT + 1))
      ;;
    cancelled)
      status_str="${YELLOW}⊘ CANCEL${NC}"
      ;;
    skipped)
      status_str="${DIM}— SKIP${NC}"
      ;;
    *)
      status_str="${YELLOW}⋯ ${status}${NC}"
      ;;
  esac

  printf "${BOLD}${CYAN}│${NC} %-24s ${BOLD}${CYAN}│${NC} " "$name"
  printf "%-8b ${BOLD}${CYAN}│${NC} %-10s ${BOLD}${CYAN}│${NC} %-16s ${BOLD}${CYAN}│${NC}\n" \
    "$status_str" "$duration" "$runner"

done < <(echo "$JOB_JSON" | jq -c '.jobs[]')

echo -e "${BOLD}${CYAN}└──────────────────────────┴──────────┴────────────┴──────────────────┘${NC}"

# サマリー
echo ""
if [[ $FAILED_COUNT -gt 0 ]]; then
  echo -e "${RED}${BOLD}✗ $FAILED_COUNT ジョブ失敗 / $((FAILED_COUNT + PASS_COUNT)) ジョブ${NC}"
else
  echo -e "${GREEN}${BOLD}✓ 全 $PASS_COUNT ジョブ成功${NC}"
fi
echo ""
