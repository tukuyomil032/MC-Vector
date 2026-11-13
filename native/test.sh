#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Runs the native test suites and prints one summary table:
#   Rust      cargo test -p mcvector-core -p mcvector-ffi
#   Swift     swift test for native/ (needs the Rust static library)
#   Bindings  regenerates the UniFFI bindings and fails if git sees a change
#   Strings   regenerates Localizable.xcstrings and fails if git sees a change
#
# Every selected part runs even when an earlier one fails. Exit 0 when all pass,
# 1 when any part fails, 2 on a usage error.
#
# Usage: native/test.sh [--rust-only] [--swift-only] [--check-bindings]
#                       [--check-strings] [--filter <pattern>] [-h|--help]
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd "$NATIVE_DIR/.." && pwd -P)"
BUILD_DIR="$NATIVE_DIR/.build"

source "$NATIVE_DIR/scripts/lib/log.sh"
source "$NATIVE_DIR/scripts/lib/bindings.sh"

# Paths the drift checks compare, relative to ROOT_DIR (for git).
BINDING_GIT_PATHS=(native/Sources/MCVectorCore/Generated native/Sources/MCVectorFFI)
STRINGS_GIT_PATHS=(native/Resources/Localizable.xcstrings)

usage() {
  cat <<'EOF'
Usage: native/test.sh [options]

Runs the Rust tests, the Swift tests, the generated-bindings drift check and the
String Catalog drift check. With no selection option all four run. Selection
options may be combined.

Options:
  --rust-only         Run only: cargo test -p mcvector-core -p mcvector-ffi
  --swift-only        Run only: swift test for native/ (builds the Rust core first if needed)
  --check-bindings    Run only the generated-bindings drift check
  --check-strings     Run only the String Catalog drift check
  --filter <pattern>  Run only the tests matching <pattern> (Rust and Swift)
  -h, --help          Show this help and exit

Set VERBOSE=1 to stream tool output instead of writing native/.build/logs.
EOF
}

RUN_RUST=0
RUN_SWIFT=0
RUN_BINDINGS=0
RUN_STRINGS=0
FILTER=""

# Per-part results. PART_* hold the outcome of the part that just ran.
PART_STATUS=""
PART_TESTS="-"
PART_TIME="0"
RESULT_NAMES=()
RESULT_STATUS=()
RESULT_TIME=()
RESULT_TESTS=()

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --rust-only) RUN_RUST=1 ;;
      --swift-only) RUN_SWIFT=1 ;;
      --check-bindings) RUN_BINDINGS=1 ;;
      --check-strings) RUN_STRINGS=1 ;;
      --filter)
        if [ $# -lt 2 ] || [ -z "$2" ]; then
          log_fail "--filter needs a pattern"
          usage >&2
          exit 2
        fi
        FILTER="$2"
        shift
        ;;
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
}

# Rust: cargo test for the two FFI-facing crates.
run_rust_part() {
  local t0 rc=0 log="$BUILD_DIR/logs/test-rust.log" counts
  local -a args=(test -p mcvector-core -p mcvector-ffi)
  t0="$(timer_start)"
  if [ -n "$FILTER" ]; then
    args+=(-- "$FILTER")
  fi
  ensure_inside_build "$log"
  rm -f "$log"
  run_logged "test-rust" cargo "${args[@]}" || rc=$?

  # Sum the "test result:" lines (one per test binary and doc-test run).
  counts="$(awk '/^test result:/ { lines++; for (i = 1; i <= NF; i++) { if ($i == "passed;") p += $(i - 1); if ($i == "failed;") f += $(i - 1) } } END { if (lines > 0) printf "%d passed, %d failed", p, f }' "$log" 2>/dev/null)" || counts=""
  PART_TESTS="${counts:-n/a}"
  if [ "$rc" -eq 0 ]; then
    PART_STATUS="PASS"
  else
    PART_STATUS="FAIL"
  fi
  PART_TIME="$(timer_elapsed "$t0")"
}

# Swift: swift test for native/, linked against the Rust static library.
run_swift_part() {
  local t0 rc=0 log="$BUILD_DIR/logs/test-swift.log" counts
  local lib="$BUILD_DIR/rust/lib/libmcvector_ffi.a"
  local -a args=()
  t0="$(timer_start)"

  if [ ! -f "$lib" ]; then
    log_info "Rust static library not found: running native/build.sh first."
    if ! "$NATIVE_DIR/build.sh"; then
      log_fail "Could not build the Rust core needed by the Swift tests"
      PART_STATUS="FAIL"
      PART_TESTS="n/a"
      PART_TIME="$(timer_elapsed "$t0")"
      return 0
    fi
  fi

  args=(test --package-path "$NATIVE_DIR" --scratch-path "$BUILD_DIR/swift" \
    --cache-path "$BUILD_DIR/cache" -Xlinker -L -Xlinker "$BUILD_DIR/rust/lib")
  if [ -n "$FILTER" ]; then
    args+=(--filter "$FILTER")
  fi
  ensure_inside_build "$log"
  rm -f "$log"
  run_logged "test-swift" swift "${args[@]}" || rc=$?

  # Swift Testing: "Test run with N tests ..." plus one "Test ... failed after" line per failed test.
  # XCTest fallback: "Executed N tests, with F failures ..." (the last match is the total).
  counts="$(awk '
    /Test run with [0-9]+ tests?/ { for (i = 1; i <= NF; i++) if ($i == "with" && $(i + 1) ~ /^[0-9]+$/) { st = $(i + 1); break } }
    / Test .* failed after / && $0 !~ /Test run with/ { sf++ }
    /Executed [0-9]+ tests?, with [0-9]+ failures?/ { for (i = 1; i <= NF; i++) if ($i == "with") { xt = $2; xf = $(i + 1) } }
    END {
      if (st != "") printf "%d passed, %d failed", st - sf, sf
      else if (xt != "") printf "%d passed, %d failed", xt - xf, xf
    }' "$log" 2>/dev/null)" || counts=""
  PART_TESTS="${counts:-n/a}"
  if [ "$rc" -eq 0 ]; then
    PART_STATUS="PASS"
  else
    PART_STATUS="FAIL"
  fi
  PART_TIME="$(timer_elapsed "$t0")"
}

# Bindings: regenerate exactly like build.sh step 3, then fail on any difference
# from git (tracked changes, staged changes or untracked files).
run_bindings_part() {
  local t0 rc=0 host_dylib="$CARGO_TARGET_DIR/$HOST_TRIPLE/debug/libmcvector_ffi.dylib"
  t0="$(timer_start)"
  PART_TESTS="-"

  # Build the host library first so the generated bindings match the current source.
  run_logged "cargo-build-host" cargo build -p mcvector-ffi --target "$HOST_TRIPLE" || rc=$?
  if [ "$rc" -eq 0 ]; then
    bindings_regenerate "$host_dylib" || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    bindings_sync || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    if ! git -C "$ROOT_DIR" diff --quiet -- "${BINDING_GIT_PATHS[@]}" \
      || [ -n "$(git -C "$ROOT_DIR" status --porcelain -- "${BINDING_GIT_PATHS[@]}")" ]; then
      log_fail "Generated bindings are out of date: run native/build.sh and commit native/Sources/MCVectorCore/Generated and native/Sources/MCVectorFFI"
      rc=1
    fi
  fi

  if [ "$rc" -eq 0 ]; then
    PART_STATUS="PASS"
  else
    PART_STATUS="FAIL"
  fi
  PART_TIME="$(timer_elapsed "$t0")"
}

# Strings: regenerate Localizable.xcstrings with the sync script, then fail on any
# difference from git (tracked changes, staged changes or untracked files).
run_strings_part() {
  local t0 rc=0
  t0="$(timer_start)"
  PART_TESTS="-"

  if ! command -v bun >/dev/null 2>&1; then
    log_fail "bun not found: install it from https://bun.sh to run the strings drift check"
    rc=1
  fi
  if [ "$rc" -eq 0 ]; then
    run_logged "sync-strings" bun "$NATIVE_DIR/scripts/sync-strings.ts" || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    if ! git -C "$ROOT_DIR" diff --quiet -- "${STRINGS_GIT_PATHS[@]}" \
      || [ -n "$(git -C "$ROOT_DIR" status --porcelain -- "${STRINGS_GIT_PATHS[@]}")" ]; then
      log_fail "Localizable.xcstrings is out of date: run bun native/scripts/sync-strings.ts and commit native/Resources/Localizable.xcstrings"
      rc=1
    fi
  fi

  if [ "$rc" -eq 0 ]; then
    PART_STATUS="PASS"
  else
    PART_STATUS="FAIL"
  fi
  PART_TIME="$(timer_elapsed "$t0")"
}

record_result() {
  RESULT_NAMES+=("$1")
  RESULT_STATUS+=("$PART_STATUS")
  RESULT_TIME+=("$PART_TIME")
  RESULT_TESTS+=("$PART_TESTS")
}

# summarize: prints the result table. Returns 0 when every part passed.
summarize() {
  local i title
  local failed=0
  local -a lines=()
  lines+=("$(printf '%-8s | %-6s | %-6s | %s' 'Part' 'Result' 'Time' 'Tests')")
  for ((i = 0; i < ${#RESULT_NAMES[@]}; i++)); do
    if [ "${RESULT_STATUS[$i]}" = "FAIL" ]; then
      failed=1
    fi
    lines+=("$(printf '%-8s | %-6s | %-6s | %s' "${RESULT_NAMES[$i]}" "${RESULT_STATUS[$i]}" "${RESULT_TIME[$i]}s" "${RESULT_TESTS[$i]}")")
  done
  if [ "$failed" -eq 0 ]; then
    title="All tests passed"
  else
    title="Some tests failed"
  fi
  log_summary "$title" "${lines[@]}"
  [ "$failed" -eq 0 ]
}

main() {
  local step=0 total=0

  if [ "$RUN_RUST" -eq 0 ] && [ "$RUN_SWIFT" -eq 0 ] && [ "$RUN_BINDINGS" -eq 0 ] \
    && [ "$RUN_STRINGS" -eq 0 ]; then
    RUN_RUST=1
    RUN_SWIFT=1
    RUN_BINDINGS=1
    RUN_STRINGS=1
  fi
  total=$(( RUN_RUST + RUN_SWIFT + RUN_BINDINGS + RUN_STRINGS ))

  cd "$ROOT_DIR"
  setup_build_env
  host_triple_setup

  if [ "$RUN_RUST" -eq 1 ]; then
    step=$((step + 1))
    log_step "$step" "$total" "Rust tests"
    run_rust_part
    record_result "Rust"
  fi
  if [ "$RUN_SWIFT" -eq 1 ]; then
    step=$((step + 1))
    log_step "$step" "$total" "Swift tests"
    run_swift_part
    record_result "Swift"
  fi
  if [ "$RUN_BINDINGS" -eq 1 ]; then
    step=$((step + 1))
    log_step "$step" "$total" "Bindings drift check"
    run_bindings_part
    record_result "Bindings"
  fi
  if [ "$RUN_STRINGS" -eq 1 ]; then
    step=$((step + 1))
    log_step "$step" "$total" "Strings drift check"
    run_strings_part
    record_result "Strings"
  fi

  summarize || exit 1
}

parse_args "$@"
main
