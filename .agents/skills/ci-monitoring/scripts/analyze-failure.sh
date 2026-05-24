#!/usr/bin/env bash
# analyze-failure.sh — CI 失敗ログからエラーを分類して表示
# Usage: analyze-failure.sh <run-id> [--repo owner/repo]
# または: cat log.txt | analyze-failure.sh --stdin
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

STDIN_MODE=false
RUN_ID=""
REPO_ARG=""

# 引数解析
while [[ $# -gt 0 ]]; do
  case "$1" in
  --stdin)
    STDIN_MODE=true
    shift
    ;;
  --repo)
    REPO_ARG="--repo $2"
    shift 2
    ;;
  *)
    RUN_ID="$1"
    shift
    ;;
  esac
done

if [[ "$STDIN_MODE" == false && -z "$RUN_ID" ]]; then
  echo "Usage: $0 <run-id> [--repo owner/repo]" >&2
  echo "       cat log.txt | $0 --stdin" >&2
  exit 1
fi

# リポジトリを自動検出
if [[ -z "$REPO_ARG" ]]; then
  DETECTED=$(git remote get-url origin 2>/dev/null |
    sed 's/.*github\.com[:/]//' | sed 's/\.git$//')
  [[ -n "$DETECTED" ]] && REPO_ARG="--repo $DETECTED"
fi

# ログを取得
if [[ "$STDIN_MODE" == true ]]; then
  LOG_CONTENT=$(cat)
else
  echo -e "${DIM}ログを取得中...${NC}" >&2
  LOG_CONTENT=$(gh run view "$RUN_ID" $REPO_ARG --log-failed 2>&1 ||
    gh run view "$RUN_ID" $REPO_ARG --log 2>&1 | head -500)
fi

if [[ -z "$LOG_CONTENT" ]]; then
  echo -e "${YELLOW}ログが空または取得できませんでした。${NC}" >&2
  exit 1
fi

# カテゴリ分類パターン
declare -A PATTERNS=(
  ["Rust Compile"]='error\[E[0-9]+\]|^error: |-->.*\.rs:'
  ["Test Failure"]='FAILED.*test|test.*FAILED|assertion.*failed|AssertionError|panicked at'
  ["Package Error"]='npm ERR!|pnpm ERR!|ELIFECYCLE|yarn error|Cannot find module'
  ["Network Error"]='Connection refused|ECONNREFUSED|ETIMEDOUT|dial tcp.*timeout|TLS handshake'
  ["Lint / Format"]='oxlint|eslint.*error|biome.*error|clippy.*error'
  ["Build Tool"]='cargo.*error|webpack.*error|vite.*error|tsc.*error|TypeScript error'
  ["Permission"]='EACCES|Permission denied|access denied'
)

declare -A CATEGORY_COLORS=(
  ["Rust Compile"]="$RED"
  ["Test Failure"]="$RED"
  ["Package Error"]="$YELLOW"
  ["Network Error"]="$CYAN"
  ["Lint / Format"]="$MAGENTA"
  ["Build Tool"]="$RED"
  ["Permission"]="$YELLOW"
)

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║  CI 失敗分析レポート${NC}$([ -n "$RUN_ID" ] && echo "  (Run #${RUN_ID})" || echo "")$(printf '%*s' $((44 - ${#RUN_ID})) '')${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

FOUND_ANY=false

for category in "Rust Compile" "Build Tool" "Test Failure" "Package Error" "Lint / Format" "Network Error" "Permission"; do
  pattern="${PATTERNS[$category]}"
  color="${CATEGORY_COLORS[$category]}"

  matched=$(echo "$LOG_CONTENT" | grep -E "$pattern" | head -5 || true)
  if [[ -z "$matched" ]]; then
    continue
  fi

  FOUND_ANY=true
  echo -e "${BOLD}${color}▶ $category${NC}"
  echo -e "${DIM}──────────────────────────────────────────────────────────────────${NC}"

  # ファイル名・行番号の抽出を試みる
  file_ref=$(echo "$matched" | grep -oE '[a-zA-Z0-9_/.-]+\.(rs|ts|tsx|js|jsx|toml|yaml|yml):[0-9]+' | head -3 || true)
  if [[ -n "$file_ref" ]]; then
    echo -e "${DIM}  参照箇所:${NC}"
    while IFS= read -r ref; do
      echo -e "    ${CYAN}→ $ref${NC}"
    done <<<"$file_ref"
    echo ""
  fi

  echo -e "${DIM}  エラー行:${NC}"
  while IFS= read -r line; do
    echo -e "    ${color}$line${NC}"
  done <<<"$matched"
  echo ""
done

if [[ "$FOUND_ANY" == false ]]; then
  echo -e "${YELLOW}既知のエラーパターンにマッチする行が見つかりませんでした。${NC}"
  echo ""
  echo -e "${DIM}最後の 20 行:${NC}"
  echo "$LOG_CONTENT" | tail -20 | while IFS= read -r line; do
    echo -e "  ${DIM}$line${NC}"
  done
fi

# フッター
echo -e "${DIM}──────────────────────────────────────────────────────────────────${NC}"
echo -e "${DIM}  ヒント: 詳細ログは gh run view <id> --log-failed で確認${NC}"
echo ""
