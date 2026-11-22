#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail
NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# Shared helpers consume ROOT_DIR.
# shellcheck disable=SC2034
ROOT_DIR="$(cd "$NATIVE_DIR/.." && pwd -P)"
BUILD_DIR="$NATIVE_DIR/.build"
# shellcheck source=native/scripts/lib/log.sh
source "$NATIVE_DIR/scripts/lib/log.sh"
# shellcheck source=native/scripts/lib/fixture.sh
source "$NATIVE_DIR/scripts/lib/fixture.sh"
LOCALE=en
NO_BUILD=0
ALL=0
# Shared fixture helper reads FIXTURE.
# shellcheck disable=SC2034
FIXTURE=e2e
IDS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --locale) if [ "$#" -lt 2 ]; then log_fail "Missing value for --locale"; exit 2; fi; LOCALE="$2"; shift ;;
    --no-build) NO_BUILD=1 ;;
    --all) ALL=1 ;;
    -h|--help) printf '%s\n' 'Usage: native/scripts/e2e.sh [--locale en|ja] [--no-build] [--all] [ID ...]'; exit 0 ;;
    -*) log_fail "Unknown option: $1"; exit 2 ;;
    *) IDS+=("$1") ;;
  esac
  shift
done
case "$LOCALE" in en|ja) ;; *) log_fail "Unsupported locale: $LOCALE"; exit 2 ;; esac
# Inventory must succeed: an unavailable process list cannot prove isolation.
if ! inventory="$(ps -axo pid=,comm=,args=)"; then
  log_fail 'Cannot inspect running processes; refusing to launch MCVector.'
  exit 2
fi
while IFS= read -r process; do
  case "$process" in
    *Contents/MacOS/MCVector*|*Contents/MacOS/mc-vector*|*"/MCVector "*|*"/mc-vector "*|*" MCVector "*|*" mc-vector "*)
      case "$process" in *' --capture-state '*) ;; *) log_fail "Another MCVector process is alive: $process"; exit 2 ;; esac ;;
  esac
done <<< "$inventory"
setup_build_env
APP="$BUILD_DIR/app/MC-Vector Native.app"
EXE="$APP/Contents/MacOS/MCVector"
init_fixture_run
write_stand_in_java
if [ "$NO_BUILD" -eq 0 ]; then "$NATIVE_DIR/build.sh"; fi
if [ ! -x "$EXE" ]; then log_fail "App not found: $APP (run native/build.sh)"; exit 2; fi
if [ "${#IDS[@]}" -eq 0 ]; then
  IDS=(E2E-relaunch E2E-navigate)
  while IFS= read -r id; do
    case "$id" in VERIFY-real-*) [ "$ALL" -eq 1 ] || continue ;; esac
    IDS+=("$id")
  done < <(rg --no-filename -o '"VERIFY-[A-Za-z0-9-]+"' "$NATIVE_DIR/Sources/MCVector/Capture" | tr -d '"' | sort -u)
fi
pid=""
cleanup_state() {
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
    wait "$pid" 2>/dev/null || true
    pid=""
  fi
  stop_fixture_servers
}
trap cleanup_state EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
quit_relaunch() {
  osascript -e 'tell application id "com.tukuyomi032.mcvector.native" to quit' >>"$log_file" 2>&1 || return 1
  for _ in $(seq 1 100); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid" 2>/dev/null || true; pid=""; return 0; }
    sleep 0.1
  done
  return 1
}
run_relaunch() {
  local iteration
  for iteration in 1 2; do
    # Signal is appended by the app; stdout/stderr are diagnostic only.
    # shellcheck disable=SC2094
    MCVECTOR_DATA_DIR="$data_dir" MCVECTOR_CAPTURE_SIGNAL="$log_file" MCVECTOR_DEBUG_JAVA="$STAND_IN_JAVA" "$EXE" >>"$log_file" 2>&1 &
    pid=$!
    sleep 7
    if ! kill -0 "$pid" 2>/dev/null; then reason="App exited during relaunch $iteration"; return; fi
    if ! quit_relaunch; then reason="Graceful quit failed during relaunch $iteration"; return; fi
    printf '[e2e] ok relaunch-%s\n' "$iteration" >>"$log_file"
  done
}
failed=0
results=()
index=0
for id in "${IDS[@]}"; do
  case "$id" in *[!A-Za-z0-9-]*|'') log_fail "Invalid state ID: $id"; exit 2 ;; esac
  index=$((index + 1))
  log_step "$index" "${#IDS[@]}" "E2E $id ($LOCALE)"
  state_start="$(timer_start)"
  data_dir="$RUN_DIR/fixtures/e2e-$LOCALE"
  log_file="$RUN_DIR/logs/e2e-$id.log"
  ensure_inside_run "$log_file"
  prepare_fixture "$data_dir"
  : >"$log_file"
  reason=""
  if [ "$id" = E2E-relaunch ]; then
    run_relaunch
  else
    timeout=30
    case "$id" in VERIFY-real-*) timeout=300 ;; esac
    if ! launch_fixture "$id" "$data_dir" "$log_file" "$timeout"; then
      reason='App launch failed'
    elif [ "$ready" -ne 1 ]; then
      reason="State did not become ready within $timeout seconds"
    else
      sleep 2
      if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then reason='App exited before or within 2 seconds after ready'; fi
    fi
  fi
  first_failure="$(rg -m 1 '^\[e2e\] fail|\[capture\] unknown capture state|\[capture\] state did not become ready' "$log_file" || true)"
  if [ -n "$first_failure" ]; then reason="$first_failure"; fi
  if [ -z "$reason" ] && ! rg -q '^\[e2e\] ok ' "$log_file"; then reason='No E2E success checks were emitted'; fi
  result=PASS
  if [ -n "$reason" ]; then result=FAIL; failed=1; log_fail "$id: $reason"; else log_ok "$id"; fi
  results+=("$(printf '%-32s %-6s %7s  %s' "$id" "$result" "$(timer_elapsed "$state_start")" "$reason")")
  cleanup_state
done
printf '\n%-32s %-6s %7s  %s\n' ID RESULT SECONDS REASON
printf '%s\n' "${results[@]}"
log_info "Logs: $RUN_DIR/logs"
exit "$failed"
