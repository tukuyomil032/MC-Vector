#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Shared helpers for native/build.sh, native/run.sh, native/test.sh and
# native/scripts/lib/bindings.sh:
#   - console output: log_step, log_ok, log_skip, log_warn, log_fail, log_info,
#     log_summary (boxed), timer_start / timer_elapsed
#   - run_logged: runs a tool and keeps its output in native/.build/logs
#   - ensure_inside_build: refuses any write outside native/.build (REPO-002)
#   - setup_build_env / host_triple_setup: build-local environment and triples
#
# Sourced, never executed. The caller sets NATIVE_DIR, ROOT_DIR and BUILD_DIR
# before sourcing. Written for bash 3.2 (the stock macOS /bin/bash).

# --- Output mode --------------------------------------------------------------
# Colors and box drawing are off when NO_COLOR is set (to any value) or when
# stdout is not a terminal. Status symbols are printed in every mode.
if [ -n "${NO_COLOR+x}" ] || [ ! -t 1 ]; then
  LOG_PLAIN=1
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_CYAN=""
else
  LOG_PLAIN=0
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
fi

# 1 streams tool output to the terminal (build.sh --verbose); 0 logs it.
VERBOSE="${VERBOSE:-0}"

# --- Console output -----------------------------------------------------------

# log_step <n> <total> <title>
log_step() {
  printf '%s▸ [%s/%s]%s %s%s%s\n' "$C_CYAN" "$1" "$2" "$C_RESET" "$C_BOLD" "$3" "$C_RESET"
}

# log_ok <msg> [seconds]
log_ok() {
  if [ -n "${2:-}" ]; then
    printf '%s✔%s %s  %s%ss%s\n' "$C_GREEN" "$C_RESET" "$1" "$C_DIM" "$2" "$C_RESET"
  else
    printf '%s✔%s %s\n' "$C_GREEN" "$C_RESET" "$1"
  fi
}

# log_skip <msg>
log_skip() {
  printf '%s↷ %s%s\n' "$C_DIM" "$1" "$C_RESET"
}

# log_warn <msg>   (stderr)
log_warn() {
  printf '%s⚠ %s%s\n' "$C_YELLOW" "$1" "$C_RESET" >&2
}

# log_fail <msg>   (stderr)
log_fail() {
  printf '%s✖ %s%s\n' "$C_RED" "$1" "$C_RESET" >&2
}

# log_info <msg>
log_info() {
  printf '%s  %s%s\n' "$C_DIM" "$1" "$C_RESET"
}

# log_summary <title> <line>...
# Draws the lines in a box with a titled top edge. Plain mode prints
# "== title ==" followed by the lines, without any box characters.
log_summary() {
  local title="$1" line width
  shift
  if [ "$LOG_PLAIN" = "1" ]; then
    printf '== %s ==\n' "$title"
    for line in "$@"; do
      printf '%s\n' "$line"
    done
    return 0
  fi
  width=$(( ${#title} + 4 ))
  for line in "$@"; do
    if [ $(( ${#line} + 2 )) -gt "$width" ]; then
      width=$(( ${#line} + 2 ))
    fi
  done
  printf '╭─ %s%s%s %s╮\n' "$C_BOLD" "$title" "$C_RESET" \
    "$(_log_repeat '─' $(( width - ${#title} - 3 )))"
  for line in "$@"; do
    printf '│ %s%s│\n' "$line" "$(_log_repeat ' ' $(( width - ${#line} - 1 )))"
  done
  printf '╰%s╯\n' "$(_log_repeat '─' "$width")"
}

# _log_repeat <text> <count>: prints <text> <count> times, no newline.
_log_repeat() {
  local text="$1" count="$2" out="" i=0
  while [ "$i" -lt "$count" ]; do
    out="$out$text"
    i=$((i + 1))
  done
  printf '%s' "$out"
}

# timer_start: prints the current epoch second. Keep it for timer_elapsed.
timer_start() {
  /bin/date +%s
}

# timer_elapsed <start>: prints the whole seconds since <start>.
timer_elapsed() {
  local now
  now="$(/bin/date +%s)"
  printf '%s' $(( now - $1 ))
}

# --- Running tools ------------------------------------------------------------

# run_logged <name> <command> [args...]
# Runs the command with stdout and stderr going to $BUILD_DIR/logs/<name>.log,
# or straight to the terminal when VERBOSE=1. On failure it prints the exit code
# and the last 40 lines of the log (stderr), then returns the exit code.
run_logged() {
  local name="$1" rc=0 logdir logfile
  shift
  if [ "$VERBOSE" = "1" ]; then
    "$@" || rc=$?
  else
    logdir="$BUILD_DIR/logs"
    logfile="$logdir/$name.log"
    ensure_inside_build "$logdir"
    mkdir -p "$logdir"
    ensure_inside_build "$logfile"
    "$@" >"$logfile" 2>&1 || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    return 0
  fi
  log_fail "$name failed (exit $rc)"
  if [ "$VERBOSE" != "1" ]; then
    printf 'Last 40 lines of %s:\n' "$logfile" >&2
    tail -n 40 "$logfile" >&2
  fi
  return "$rc"
}

# --- Build environment --------------------------------------------------------

# _log_resolve_path <path>
# Prints the physical absolute path of <path>, following symlinks. A path that
# does not exist yet is resolved through its nearest existing ancestor. Fails
# for dangling or file symlinks and for a file used as a directory.
_log_resolve_path() {
  local p="$1" rem="" base parent phys
  case "$p" in
    /*) ;;
    *) p="$PWD/$p" ;;
  esac
  p="${p%/}"
  if [ -z "$p" ]; then
    p="/"
  fi
  while [ ! -e "$p" ] && [ ! -L "$p" ]; do
    base="${p##*/}"
    rem="$base${rem:+/$rem}"
    parent="${p%/*}"
    if [ -z "$parent" ]; then
      parent="/"
    fi
    p="$parent"
  done
  if [ -L "$p" ] && [ ! -d "$p" ]; then
    return 1
  fi
  if [ -d "$p" ]; then
    phys="$(cd "$p" && pwd -P)" || return 1
  elif [ -z "$rem" ]; then
    base="${p##*/}"
    parent="${p%/*}"
    if [ -z "$parent" ]; then
      parent="/"
    fi
    phys="$(cd "$parent" && pwd -P)" || return 1
    if [ "$phys" = "/" ]; then
      phys="/$base"
    else
      phys="$phys/$base"
    fi
  else
    return 1
  fi
  if [ -n "$rem" ]; then
    if [ "$phys" = "/" ]; then
      phys="/$rem"
    else
      phys="$phys/$rem"
    fi
  fi
  printf '%s\n' "$phys"
}

# ensure_inside_build <path>
# Aborts with exit 1 unless <path> resolves to $BUILD_DIR or to a path below it.
# Call it on every output directory or file before writing to it.
ensure_inside_build() {
  local target="$1" resolved
  case "/$target/" in
    */../*|*/./*)
      log_fail "Refusing output path with '.' or '..' components: $target"
      exit 1
      ;;
  esac
  if ! resolved="$(_log_resolve_path "$target")"; then
    log_fail "Cannot resolve output path safely: $target"
    exit 1
  fi
  case "$resolved/" in
    "$BUILD_DIR/"*) return 0 ;;
  esac
  log_fail "Refusing to write outside $BUILD_DIR: $target"
  exit 1
}

# setup_build_env
# Creates $BUILD_DIR/tmp and exports the build-local tool environment. Every
# script calls this before it runs any tool (REPO-002).
setup_build_env() {
  ensure_inside_build "$BUILD_DIR/tmp"
  mkdir -p "$BUILD_DIR/tmp"
  export CARGO_TARGET_DIR="$BUILD_DIR/cargo"
  export TMPDIR="$BUILD_DIR/tmp/"
}

# host_triple_setup
# Sets HOST_TRIPLE (Rust), HOST_SWIFT_TRIPLE (Swift) and HOST_ARCH_LABEL.
# The caller reads these variables, so shellcheck cannot see the use.
# shellcheck disable=SC2034
host_triple_setup() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    arm64)
      HOST_TRIPLE="aarch64-apple-darwin"
      HOST_SWIFT_TRIPLE="arm64-apple-macosx15.0"
      HOST_ARCH_LABEL="arm64"
      ;;
    x86_64)
      HOST_TRIPLE="x86_64-apple-darwin"
      HOST_SWIFT_TRIPLE="x86_64-apple-macosx15.0"
      HOST_ARCH_LABEL="x86_64"
      ;;
    *)
      log_fail "Unsupported host architecture: $arch"
      exit 1
      ;;
  esac
}
