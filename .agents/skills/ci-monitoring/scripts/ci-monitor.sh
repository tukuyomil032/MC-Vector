#!/usr/bin/env bash
# ci-monitor.sh — fzf でジョブをインタラクティブに閲覧 + 失敗分析
# Usage:
#   ci-monitor.sh                  # 最新の Run を fzf で選択
#   ci-monitor.sh <run-id>         # 特定の Run を直接開く
#   ci-monitor.sh --latest         # 最新 Run を非インタラクティブ表示
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ──────────────────────────────────────────────────
# ヘルパー
# ──────────────────────────────────────────────────

check_deps() {
  local missing=()
  command -v gh >/dev/null 2>&1 || missing+=("gh (GitHub CLI)")
  command -v jq >/dev/null 2>&1 || missing+=("jq")
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}以下のツールが必要です:${NC}" >&2
    printf '  • %s\n' "${missing[@]}" >&2
    exit 1
  fi
}

get_repo() {
  git remote get-url origin 2>/dev/null |
    sed 's/.*github\.com[:/]//' | sed 's/\.git$//'
}

get_branch() {
  git branch --show-current 2>/dev/null || echo "HEAD"
}

icon_for_conclusion() {
  case "$1" in
  success) echo "✓" ;;
  failure) echo "✗" ;;
  cancelled) echo "⊘" ;;
  skipped) echo "—" ;;
  *) echo "⋯" ;;
  esac
}

color_for_conclusion() {
  case "$1" in
  success) echo "$GREEN" ;;
  failure) echo "$RED" ;;
  cancelled) echo "$YELLOW" ;;
  *) echo "$DIM" ;;
  esac
}

format_time_ago() {
  local iso="$1"
  local epoch
  epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null ||
    date -d "$iso" +%s 2>/dev/null || echo 0)
  local now diff
  now=$(date +%s)
  diff=$((now - epoch))
  if [[ $diff -lt 60 ]]; then
    echo "${diff}s ago"
  elif [[ $diff -lt 3600 ]]; then
    echo "$((diff / 60))m ago"
  else
    echo "$((diff / 3600))h ago"
  fi
}

# ──────────────────────────────────────────────────
# 表示サブ関数
# ──────────────────────────────────────────────────

show_run_detail() {
  local run_id="$1"
  local repo="$2"

  echo ""
  echo -e "${BOLD}${CYAN}Run #${run_id}${NC}"
  echo ""

  # report-table.sh でジョブ一覧表示
  if [[ -x "$SCRIPT_DIR/report-table.sh" ]]; then
    bash "$SCRIPT_DIR/report-table.sh" "$run_id" --repo "$repo" || true
  fi

  # 失敗ジョブがあれば analyze-failure.sh へ
  local conclusion
  conclusion=$(gh run view "$run_id" --repo "$repo" --json conclusion \
    --jq '.conclusion' 2>/dev/null || echo "unknown")

  if [[ "$conclusion" == "failure" ]]; then
    echo -e "${YELLOW}${BOLD}失敗ログを解析します...${NC}"
    echo ""
    if [[ -x "$SCRIPT_DIR/analyze-failure.sh" ]]; then
      bash "$SCRIPT_DIR/analyze-failure.sh" "$run_id" --repo "$repo" || true
    fi

    # GitHub Actions Job Summary へ書き込み（CI 環境のみ）
    if [[ -x "$SCRIPT_DIR/gha-summary.sh" ]]; then
      bash "$SCRIPT_DIR/gha-summary.sh" "$run_id" --repo "$repo" || true
    fi

    # 後処理メニュー
    post_process_menu "$run_id" "$repo"
  fi
}

post_process_menu() {
  local run_id="$1"
  local repo="$2"

  echo ""
  echo -e "${BOLD}CI 監視が完了しました。追加アクションを選択してください:${NC}"
  echo ""

  local PS3="番号を選択 (Enter でスキップ): "
  local options=(
    "Markdown レポートを .claude/ci-reports/ に保存"
    "SKILL.md に失敗パターンを追記"
    "両方実行"
    "スキップ"
  )

  select opt in "${options[@]}"; do
    case "$REPLY" in
    1)
      save_markdown_report "$run_id" "$repo"
      break
      ;;
    2)
      append_to_skill "$run_id" "$repo"
      break
      ;;
    3)
      save_markdown_report "$run_id" "$repo"
      append_to_skill "$run_id" "$repo"
      break
      ;;
    4 | "")
      echo -e "${DIM}スキップしました。${NC}"
      break
      ;;
    *) echo "1〜4 を入力してください。" ;;
    esac
  done
}

save_markdown_report() {
  local run_id="$1"
  local repo="$2"
  local report_dir
  report_dir="$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.claude/ci-reports"
  mkdir -p "$report_dir"

  local date_str
  date_str=$(date +%Y-%m-%d)
  local out_file="$report_dir/${date_str}-run-${run_id}.md"

  {
    echo "# CI Failure Report — Run #${run_id}"
    echo ""
    echo "- **Date:** $(date '+%Y-%m-%d %H:%M')"
    echo "- **Repo:** $repo"
    echo "- **Run:** https://github.com/${repo}/actions/runs/${run_id}"
    echo ""
    echo "## Job Summary"
    echo ""
    gh run view "$run_id" --repo "$repo" --json jobs \
      --jq '.jobs[] | "| \(.name) | \(.conclusion // .status) | \(.startedAt // "—") |"' 2>/dev/null |
      {
        echo "| Job | Status | Started |"
        echo "|-----|--------|---------|"
        cat
      } || true
    echo ""
    echo "## Failed Log (excerpt)"
    echo ""
    echo '```'
    gh run view "$run_id" --repo "$repo" --log-failed 2>&1 | head -100 || true
    echo '```'
  } >"$out_file"

  echo -e "${GREEN}✓ レポートを保存しました: ${out_file}${NC}"
}

append_to_skill() {
  local run_id="$1"
  local repo="$2"

  # 失敗パターンを抽出
  local log_excerpt
  log_excerpt=$(gh run view "$run_id" --repo "$repo" --log-failed 2>&1 | head -50 || true)

  local skill_file
  skill_file="$(git rev-parse --show-toplevel 2>/dev/null || echo .)/.agents/skills/ci-monitoring/SKILL.md"
  local global_skill="$HOME/.claude/skills/ci-monitoring/SKILL.md"

  local target=""
  [[ -f "$skill_file" ]] && target="$skill_file"
  [[ -z "$target" && -f "$global_skill" ]] && target="$global_skill"

  if [[ -z "$target" ]]; then
    echo -e "${YELLOW}SKILL.md が見つかりませんでした。${NC}" >&2
    return
  fi

  local date_str run_url
  date_str=$(date +%Y-%m-%d)
  run_url="https://github.com/${repo}/actions/runs/${run_id}"

  {
    echo ""
    echo "<!-- failure-pattern: $date_str -->"
    echo "## Known Failure: $(date '+%Y-%m-%d') — Run #${run_id}"
    echo ""
    echo "**Repo:** $repo"
    echo "**URL:** $run_url"
    echo ""
    echo '```'
    echo "$log_excerpt"
    echo '```'
  } >>"$target"

  echo -e "${GREEN}✓ 失敗パターンを SKILL.md に追記しました: ${target}${NC}"
}

# ──────────────────────────────────────────────────
# メイン
# ──────────────────────────────────────────────────

check_deps

REPO=$(get_repo)
BRANCH=$(get_branch)

if [[ -z "$REPO" ]]; then
  echo -e "${RED}git リポジトリまたは GitHub remote が見つかりません。${NC}" >&2
  exit 1
fi

echo -e "${DIM}リポジトリ: ${REPO}  ブランチ: ${BRANCH}${NC}"
echo ""

# 引数処理
MODE="interactive"
DIRECT_RUN_ID=""

case "${1:-}" in
--latest) MODE="latest" ;;
--help | -h)
  echo "Usage: $0 [<run-id> | --latest | --help]"
  echo ""
  echo "  (引数なし)   fzf でインタラクティブにジョブ選択"
  echo "  <run-id>    特定の Run を直接表示・分析"
  echo "  --latest    最新 Run を即時表示（非インタラクティブ）"
  exit 0
  ;;
"")
  MODE="interactive"
  ;;
*)
  DIRECT_RUN_ID="$1"
  MODE="direct"
  ;;
esac

# ──────── 直接指定モード ────────
if [[ "$MODE" == "direct" ]]; then
  show_run_detail "$DIRECT_RUN_ID" "$REPO"
  exit 0
fi

# ──────── 最新 Run モード ────────
if [[ "$MODE" == "latest" ]]; then
  echo -e "${DIM}最新の Run を取得中...${NC}"
  RUN_ID=$(gh run list --repo "$REPO" --branch "$BRANCH" --limit 1 \
    --json databaseId --jq '.[0].databaseId' 2>/dev/null)
  if [[ -z "$RUN_ID" ]]; then
    echo -e "${YELLOW}$BRANCH に Run が見つかりません。全ブランチで検索します。${NC}"
    RUN_ID=$(gh run list --repo "$REPO" --limit 1 \
      --json databaseId --jq '.[0].databaseId' 2>/dev/null)
  fi
  if [[ -z "$RUN_ID" ]]; then
    echo -e "${RED}Run が見つかりませんでした。${NC}" >&2
    exit 1
  fi
  show_run_detail "$RUN_ID" "$REPO"
  exit 0
fi

# ──────── インタラクティブモード (fzf) ────────
if ! command -v fzf >/dev/null 2>&1; then
  echo -e "${YELLOW}fzf が見つかりません。フォールバック: select メニューを使用します。${NC}"
  echo ""

  # Run 一覧を取得して select で選択
  RUNS_JSON=$(gh run list --repo "$REPO" --limit 10 \
    --json databaseId,displayTitle,conclusion,createdAt,headBranch 2>/dev/null)

  mapfile -t RUN_LABELS < <(echo "$RUNS_JSON" | jq -r '.[] |
    (if .conclusion == "failure" then "✗" elif .conclusion == "success" then "✓" else "⋯" end)
    + " #\(.databaseId) [\(.headBranch)] \(.displayTitle | .[0:40])"')
  mapfile -t RUN_IDS < <(echo "$RUNS_JSON" | jq -r '.[].databaseId')

  PS3="Run を選択 (q で終了): "
  select label in "${RUN_LABELS[@]}" "終了"; do
    if [[ "$label" == "終了" ]]; then
      exit 0
    fi
    idx=$((REPLY - 1))
    if [[ $idx -ge 0 && $idx -lt ${#RUN_IDS[@]} ]]; then
      show_run_detail "${RUN_IDS[$idx]}" "$REPO"
      break
    fi
  done
  exit 0
fi

# fzf を使ったインタラクティブ選択
echo -e "${DIM}Run 一覧を取得中...${NC}"
RUNS_JSON=$(gh run list --repo "$REPO" --limit 20 \
  --json databaseId,displayTitle,conclusion,createdAt,headBranch,status 2>/dev/null)

# fzf 表示用の行を生成: "<id>  <icon> <branch> <title> <time>"
FZF_LINES=$(echo "$RUNS_JSON" | jq -r '.[] |
  (if .conclusion == "failure"   then "✗"
   elif .conclusion == "success" then "✓"
   elif .status == "in_progress" then "⋯"
   else "—" end) as $icon |
  "\(.databaseId)  \($icon) [\(.headBranch | .[0:20])] \(.displayTitle | .[0:45])"')

if [[ -z "$FZF_LINES" ]]; then
  echo -e "${YELLOW}$REPO に Run が見つかりませんでした。${NC}" >&2
  exit 1
fi

SELECTED=$(echo "$FZF_LINES" | fzf \
  --ansi \
  --prompt="CI Run > " \
  --header="Enter: 詳細表示  Ctrl-C: キャンセル  リポジトリ: $REPO" \
  --preview="gh run view {1} --repo $REPO 2>/dev/null | head -30" \
  --preview-window="right:50%:wrap" \
  --height="60%" \
  --border ||
  true)

if [[ -z "$SELECTED" ]]; then
  echo -e "${DIM}キャンセルしました。${NC}"
  exit 0
fi

CHOSEN_ID=$(echo "$SELECTED" | awk '{print $1}')
show_run_detail "$CHOSEN_ID" "$REPO"
