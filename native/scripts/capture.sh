#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Captures the Native app's main window in a given UI state, so it can be compared
# side by side with the React reference screenshots
# (spec/idea/native-swiftui-edition/ui-reference/screens/<ID>.png).
#
# Each capture launches the debug app with fresh fixture data from
# native/scripts/fixtures/<fixture>/ copied into the capture runtime directory,
# passes --capture-state <ID>, waits until the app reports the state is ready,
# then grabs only the app window with `screencapture -l`. Output:
# native/.build/captures/<locale>/<ID>.png.
#
# Usage: native/scripts/capture.sh [--fixture e2e|groups|empty] [--locale en|ja]
#                                  [--no-build] <ID> [<ID>...]
# Requires: the debug app (native/build.sh), Screen Recording permission for the
# terminal running this script.
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# Shared helpers consume ROOT_DIR.
# shellcheck disable=SC2034
ROOT_DIR="$(cd "$NATIVE_DIR/.." && pwd -P)"
BUILD_DIR="$NATIVE_DIR/.build"

# shellcheck source=native/scripts/lib/log.sh
source "$NATIVE_DIR/scripts/lib/log.sh"

usage() {
  cat <<'EOF'
Usage: native/scripts/capture.sh [options] <ID> [<ID>...]

Launches the debug app in each capture state and saves a window screenshot to
native/.build/captures/<locale>/<ID>.png.

Options:
  --fixture <name>  Server data from native/scripts/fixtures/<name> (default: e2e;
                    "empty" starts without servers)
  --locale <en|ja>  UI language written to the fixture config.json (default: en)
  --no-build        Do not run native/build.sh first
  MCVECTOR_CAPTURE_RUN_DIR=<absolute path> overrides the runtime directory
                    (default: ~/Library/Caches/com.tukuyomi032.mcvector.capture)
  -h, --help        Show this help and exit
EOF
}

FIXTURE="e2e"
LOCALE="en"
NO_BUILD=0
IDS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --fixture) FIXTURE="${2:-}"; shift ;;
    --locale) LOCALE="${2:-}"; shift ;;
    --no-build) NO_BUILD=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) log_fail "Unknown option: $1"; usage >&2; exit 2 ;;
    *) IDS+=("$1") ;;
  esac
  shift
done
if [ "${#IDS[@]}" -eq 0 ]; then
  usage >&2
  exit 2
fi
case "$LOCALE" in en|ja) ;; *) log_fail "Unsupported locale: $LOCALE"; exit 2 ;; esac
if [ "$FIXTURE" != "empty" ] && [ ! -f "$NATIVE_DIR/scripts/fixtures/$FIXTURE/servers.json" ]; then
  log_fail "Unknown fixture: $FIXTURE"
  exit 2
fi

setup_build_env
APP="$BUILD_DIR/app/MC-Vector Native.app"
EXE="$APP/Contents/MacOS/MCVector"
OUT_DIR="$BUILD_DIR/captures/$LOCALE"
TOOLS_DIR="$BUILD_DIR/tools"
ensure_inside_build "$OUT_DIR"
ensure_inside_build "$TOOLS_DIR"
mkdir -p "$OUT_DIR" "$TOOLS_DIR" "$BUILD_DIR/logs"

# shellcheck source=native/scripts/lib/fixture.sh
source "$NATIVE_DIR/scripts/lib/fixture.sh"
init_fixture_run

if [ "$NO_BUILD" -eq 0 ]; then
  "$NATIVE_DIR/build.sh"
fi
if [ ! -x "$EXE" ]; then
  log_fail "App not found: $APP (run native/build.sh)"
  exit 1
fi

# Compile the window lookup helper once; its module cache stays in native/.build.
WINDOW_ID="$TOOLS_DIR/window-id"
if [ ! -x "$WINDOW_ID" ] || [ "$NATIVE_DIR/scripts/lib/window-id.swift" -nt "$WINDOW_ID" ]; then
  run_logged "window-id" swiftc -O -module-cache-path "$BUILD_DIR/cache/module-cache" \
    -o "$WINDOW_ID" "$NATIVE_DIR/scripts/lib/window-id.swift"
fi

write_stand_in_java

failed=0
index=0
start="$(timer_start)"
for id in "${IDS[@]}"; do
  index=$((index + 1))
  log_step "$index" "${#IDS[@]}" "Capture $id ($FIXTURE, $LOCALE)"
  data_dir="$RUN_DIR/fixtures/$FIXTURE-$LOCALE"
  prepare_fixture "$data_dir"
  log_file="$RUN_DIR/logs/capture-$id.log"
  : > "$log_file"
  if ! launch_fixture "$id" "$data_dir" "$log_file" "${CAPTURE_TIMEOUT:-20}"; then
    log_fail "App launch failed for $id (see $log_file)"
    failed=1
    continue
  fi
  if [ "$ready" -eq 2 ]; then
    log_fail "$id needs Accessibility: allow \"MC-Vector Native\" in System Settings > Privacy & Security > Accessibility, then capture again"
    failed=1
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
      stop_fixture_servers
    fi
    continue
  fi
  wid=""
  if [ "$ready" -eq 1 ] && [ -n "$pid" ]; then
    sleep 1.2 # let sheets, alerts and transitions settle
    # The window list can lag behind the app for a moment; retry briefly.
    for _ in $(seq 1 10); do
      if ! kill -0 "$pid" 2>/dev/null; then
        log_fail "App exited (crash?) while capturing $id (see $log_file)"
        break
      fi
      case "$id" in
        CONFIRM-quit) wid="$("$WINDOW_ID" "$pid" 120 || true)" ;;
        *) wid="$("$WINDOW_ID" "$pid" || true)" ;;
      esac
      [ -n "$wid" ] && break
      sleep 0.3
    done
  fi
  if [ -n "$wid" ] && [ -n "${CAPTURE_RECORD:-}" ]; then
    # CAPTURE_RECORD=<seconds> also records the window, to show animations.
    screencapture -x -v -V "$CAPTURE_RECORD" -l "$wid" "$OUT_DIR/$id.mov" || true
  fi
  if [ -n "$wid" ]; then
    case "$id" in
      *-context-menu)
        # A context menu is its own window: take the window's screen area so
        # the menu drawn over it is included.
        rect="$(WINDOW_ID_BOUNDS=1 "$WINDOW_ID" "$pid" || true)"
        if [ -n "$rect" ]; then
          screencapture -o -x -R "$rect" "$OUT_DIR/$id.png"
        else
          screencapture -o -x -l "$wid" "$OUT_DIR/$id.png"
        fi
        ;;
      *) screencapture -o -x -l "$wid" "$OUT_DIR/$id.png" ;;
    esac
    log_ok "$OUT_DIR/$id.png"
  else
    log_fail "No window for $id (see $log_file)"
    failed=1
  fi
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    # Wait until it is gone, so the next launch can take the instance lock.
    for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    stop_fixture_servers
  fi
done

if [ "$failed" -ne 0 ]; then
  exit 1
fi
log_summary "Captures saved" "Folder: $OUT_DIR" "Count: ${#IDS[@]}" "Time: $(timer_elapsed "$start")s"
