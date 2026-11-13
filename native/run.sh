#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Builds MC-Vector Native (unless --no-build is given) and launches it in this
# terminal. The app is exec'd, so its stdout and stderr stream here and Ctrl-C
# reaches the app directly.
#
# Usage: native/run.sh [--release] [--no-build] [-h|--help]
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd "$NATIVE_DIR/.." && pwd -P)"
BUILD_DIR="$NATIVE_DIR/.build"

source "$NATIVE_DIR/scripts/lib/log.sh"

usage() {
  cat <<'EOF'
Usage: native/run.sh [options]

Builds MC-Vector Native (unless told not to) and launches it in this terminal.
The app refuses to start while the Tauri edition (MC-Vector) is running.

Options:
  --release     Build and launch the release profile
  --no-build    Launch the existing app without building it first
  -h, --help    Show this help and exit
EOF
}

RELEASE=0
NO_BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --release) RELEASE=1 ;;
    --no-build) NO_BUILD=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_fail "Unknown option: $1"
      usage >&2
      exit 2
      ;;
  esac
  shift
done

cd "$ROOT_DIR"
setup_build_env

APP_DIR="$BUILD_DIR/app/MC-Vector Native.app"
EXECUTABLE="$APP_DIR/Contents/MacOS/MCVector"

if [ "$NO_BUILD" -eq 0 ]; then
  if [ "$RELEASE" -eq 1 ]; then
    "$NATIVE_DIR/build.sh" --release
  else
    "$NATIVE_DIR/build.sh"
  fi
else
  if [ "$RELEASE" -eq 1 ]; then
    log_warn "--release has no effect with --no-build: launching the last app that was built."
  fi
  if [ ! -x "$EXECUTABLE" ]; then
    log_fail "App not found: $APP_DIR (run native/run.sh without --no-build first)"
    exit 1
  fi
fi

printf '%s▸ Launching MC-Vector Native%s\n' "$C_CYAN" "$C_RESET"
exec "$EXECUTABLE"
