#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Captures the Native app's main window in a given UI state, so it can be compared
# side by side with the React reference screenshots
# (spec/idea/native-swiftui-edition/ui-reference/screens/<ID>.png).
#
# Each capture launches the debug app with fresh fixture data from
# native/scripts/fixtures/<fixture>/ copied into native/.build/fixtures/, passes
# --capture-state <ID>, waits until the app reports the state is ready, then
# grabs only the app window with `screencapture -l`. Output:
# native/.build/captures/<locale>/<ID>.png.
#
# Usage: native/scripts/capture.sh [--fixture e2e|groups|empty] [--locale en|ja]
#                                  [--no-build] <ID> [<ID>...]
# Requires: the debug app (native/build.sh), Screen Recording permission for the
# terminal running this script.
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
ROOT_DIR="$(cd "$NATIVE_DIR/.." && pwd -P)"
BUILD_DIR="$NATIVE_DIR/.build"

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

# prepare_fixture <dir>: fresh data folder for one launch.
prepare_fixture() {
  local dir="$1"
  ensure_inside_build "$dir"
  rm -rf "$dir"
  mkdir -p "$dir"
  if [ "$FIXTURE" != "empty" ]; then
    sed "s#__DATA_DIR__#$dir#g" "$NATIVE_DIR/scripts/fixtures/$FIXTURE/servers.json" > "$dir/servers.json"
    # Each registered server gets its managed folder, like a real installation,
    # so clone/delete/file actions have something to work on.
    local server_id
    for server_id in $(sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' "$dir/servers.json"); do
      mkdir -p "$dir/servers/$server_id"
      printf 'motd=%s\nserver-port=25565\n' "$server_id" > "$dir/servers/$server_id/server.properties"
      printf 'eula=true\n' > "$dir/servers/$server_id/eula.txt"
    done
  fi
  printf '{"locale":"%s"}\n' "$LOCALE" > "$dir/config.json"
}

failed=0
index=0
start="$(timer_start)"
for id in "${IDS[@]}"; do
  index=$((index + 1))
  log_step "$index" "${#IDS[@]}" "Capture $id ($FIXTURE, $LOCALE)"
  data_dir="$BUILD_DIR/fixtures/$FIXTURE-$LOCALE"
  prepare_fixture "$data_dir"
  log_file="$BUILD_DIR/logs/capture-$id.log"
  : > "$log_file"
  # Launch through LaunchServices like a normal app, so macOS lets it become
  # the active app (a process exec'd from a terminal stays in the background).
  # `open --stdout/--stderr` makes the launch fail, so the app reports readiness
  # by appending to MCVECTOR_CAPTURE_SIGNAL instead.
  open -n -F "$APP" --env "MCVECTOR_DATA_DIR=$data_dir" --env "MCVECTOR_CAPTURE_SIGNAL=$log_file" \
    --args --capture-state "$id"

  ready=0
  pid=""
  deadline=$((SECONDS + 20))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ -z "$pid" ]; then
      pid="$(pgrep -n -f "$EXE --capture-state $id" || true)"
    fi
    if grep -q "\[capture\] ready: $id" "$log_file" 2>/dev/null; then
      ready=1
      break
    fi
    sleep 0.25
  done
  wid=""
  if [ "$ready" -eq 1 ] && [ -n "$pid" ]; then
    sleep 1.2 # let sheets, alerts and transitions settle
    wid="$("$WINDOW_ID" "$pid" || true)"
  fi
  if [ -n "$wid" ]; then
    screencapture -o -x -l "$wid" "$OUT_DIR/$id.png"
    log_ok "$OUT_DIR/$id.png"
  else
    log_fail "No window for $id (see $log_file)"
    failed=1
  fi
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    # Wait until it is gone, so the next launch can take the instance lock.
    for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  fi
done

if [ "$failed" -ne 0 ]; then
  exit 1
fi
log_summary "Captures saved" "Folder: $OUT_DIR" "Count: ${#IDS[@]}" "Time: $(timer_elapsed "$start")s"
