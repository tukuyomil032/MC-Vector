#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Builds MC-Vector Native (SwiftUI) into native/.build/app/MC-Vector Native.app.
# Steps: [1/5] toolchain check, [2/5] Rust core, [3/5] UniFFI bindings,
# [4/5] Swift build, [5/5] app bundle assembly.
#
# Usage: native/build.sh [--release] [--universal] [--clean] [--verbose] [-h|--help]
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd "$NATIVE_DIR/.." && pwd -P)"
BUILD_DIR="$NATIVE_DIR/.build"

source "$NATIVE_DIR/scripts/lib/log.sh"
source "$NATIVE_DIR/scripts/lib/bindings.sh"

usage() {
  cat <<'EOF'
Usage: native/build.sh [options]

Builds MC-Vector Native (SwiftUI) into native/.build/app/MC-Vector Native.app.

Options:
  --release     Build the release profile (default: debug)
  --universal   Build arm64 and x86_64 and combine them into one binary
  --clean       Delete native/.build before building (clean build)
  --verbose     Stream tool output instead of writing it to native/.build/logs
  -h, --help    Show this help and exit
EOF
}

PROFILE="debug"
UNIVERSAL=0
CLEAN=0
ARCH_LABEL=""
HOST_TRIPLE=""
HOST_SWIFT_TRIPLE=""
HOST_ARCH_LABEL=""
APP_DIR=""
APP_BINARY=""
STAGING_DIR=""
BUILD_T0=""
RUST_TRIPLES=()
SWIFT_TRIPLES=()

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --release) PROFILE="release" ;;
      --universal) UNIVERSAL=1 ;;
      --clean) CLEAN=1 ;;
      --verbose) VERBOSE=1 ;;
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

on_interrupt() {
  trap - INT TERM
  if [ -n "$STAGING_DIR" ] && [ -d "$STAGING_DIR" ]; then
    ensure_inside_build "$STAGING_DIR"
    rm -rf "$STAGING_DIR"
  fi
  log_fail "Interrupted"
  exit 130
}

# stamp_is_fresh <stamp> <guard> <input>...
# True when the stamp exists, the guard path exists, every input exists and no
# input is newer than the stamp.
stamp_is_fresh() {
  local stamp="$1" guard="$2" input newer
  shift 2
  if [ ! -f "$stamp" ] || [ ! -e "$guard" ]; then
    return 1
  fi
  for input in "$@"; do
    if [ ! -e "$input" ]; then
      return 1
    fi
  done
  newer="$(find "$@" -newer "$stamp" -print -quit 2>/dev/null)" || newer=""
  [ -z "$newer" ]
}

# [1/5] Check toolchain
check_toolchain() {
  local t0 out ver major triple installed
  local -a missing=()
  t0="$(timer_start)"
  log_step 1 5 "Check toolchain"

  if ! command -v swift >/dev/null 2>&1; then
    log_fail "swift not found. Install Xcode with the Swift 6 toolchain."
    return 1
  fi
  out="$(swift --version 2>&1)" || out=""
  ver="$(printf '%s\n' "$out" | sed -n 's/.*Swift version \([0-9][0-9.]*\).*/\1/p' | sed -n '1p')"
  major="${ver%%.*}"
  case "$major" in
    ''|*[!0-9]*)
      log_fail "Could not read the Swift version from 'swift --version'."
      return 1
      ;;
  esac
  if [ "$major" -lt 6 ]; then
    log_fail "Swift 6 or newer is required (found Swift $ver)."
    return 1
  fi

  if ! command -v cargo >/dev/null 2>&1; then
    log_fail "cargo not found. Install Rust with rustup: https://rustup.rs"
    return 1
  fi

  if command -v rustup >/dev/null 2>&1; then
    installed="$(rustup target list --installed 2>/dev/null)" || installed=""
    for triple in "${RUST_TRIPLES[@]}"; do
      case $'\n'"$installed"$'\n' in
        *$'\n'"$triple"$'\n'*) ;;
        *) missing+=("$triple") ;;
      esac
    done
    if [ "${#missing[@]}" -gt 0 ]; then
      log_fail "Rust target not installed: ${missing[*]}"
      log_info "Install it with: rustup target add ${missing[*]}"
      return 1
    fi
  else
    log_warn "rustup not found, so installed Rust targets cannot be checked. Continuing."
  fi

  log_ok "Toolchain ready (Swift $ver)" "$(timer_elapsed "$t0")"
}

# [2/5] Build Rust core
build_rust_core() {
  local t0 triple lib lib_dir="$BUILD_DIR/rust/lib"
  local -a cargo_args=() inputs=()
  t0="$(timer_start)"
  log_step 2 5 "Build Rust core"

  for triple in "${RUST_TRIPLES[@]}"; do
    cargo_args=(build -p mcvector-ffi --target "$triple")
    if [ "$PROFILE" = "release" ]; then
      cargo_args+=(--release)
    fi
    run_logged "cargo-build-$triple" cargo "${cargo_args[@]}" || return 1
    lib="$CARGO_TARGET_DIR/$triple/$PROFILE/libmcvector_ffi.a"
    if [ ! -f "$lib" ]; then
      log_fail "Expected static library not found: $lib"
      return 1
    fi
    inputs+=("$lib")
  done

  # Only the static library goes here, so the linker cannot pick a dylib.
  ensure_inside_build "$lib_dir"
  rm -rf "$lib_dir" || return 1
  mkdir -p "$lib_dir" || return 1
  if [ "${#inputs[@]}" -eq 1 ]; then
    cp "${inputs[0]}" "$lib_dir/libmcvector_ffi.a" || return 1
  else
    lipo -create "${inputs[@]}" -output "$lib_dir/libmcvector_ffi.a" || return 1
  fi
  log_ok "Rust core built ($ARCH_LABEL)" "$(timer_elapsed "$t0")"
}

# [3/5] Generate bindings
generate_bindings_step() {
  local t0 dylib="$CARGO_TARGET_DIR/$HOST_TRIPLE/$PROFILE/libmcvector_ffi.dylib"
  local stamp="$BUILD_DIR/stamps/bindings.stamp"
  t0="$(timer_start)"
  log_step 3 5 "Generate bindings"

  if stamp_is_fresh "$stamp" "$BINDINGS_CORE_DIR" "$dylib"; then
    log_skip "Up to date"
    return 0
  fi
  bindings_regenerate "$dylib" || return 1
  bindings_sync || return 1
  ensure_inside_build "$BUILD_DIR/stamps"
  mkdir -p "$BUILD_DIR/stamps" || return 1
  touch "$stamp" || return 1
  log_ok "Bindings generated" "$(timer_elapsed "$t0")"
}

# [4/5] Build Swift
build_swift() {
  local t0 triple cfg="debug" bin_dir out
  local -a flags=() bins=()
  t0="$(timer_start)"
  log_step 4 5 "Build Swift"
  if [ "$PROFILE" = "release" ]; then
    cfg="release"
  fi

  for triple in "${SWIFT_TRIPLES[@]}"; do
    flags=(--package-path "$NATIVE_DIR" --scratch-path "$BUILD_DIR/swift" \
      --cache-path "$BUILD_DIR/cache" -c "$cfg" --triple "$triple")
    run_logged "swift-build-$triple" swift build "${flags[@]}" \
      -Xlinker -L -Xlinker "$BUILD_DIR/rust/lib" --product MCVector || return 1
    bin_dir="$(swift build "${flags[@]}" --show-bin-path 2>/dev/null)" || {
      log_fail "Could not resolve the Swift build directory for $triple"
      return 1
    }
    bins+=("$bin_dir/MCVector")
  done

  if [ "${#bins[@]}" -eq 1 ]; then
    APP_BINARY="${bins[0]}"
  else
    out="$BUILD_DIR/swift/universal"
    ensure_inside_build "$out"
    mkdir -p "$out" || return 1
    lipo -create "${bins[@]}" -output "$out/MCVector" || return 1
    APP_BINARY="$out/MCVector"
  fi
  if [ ! -f "$APP_BINARY" ]; then
    log_fail "Swift executable not found: $APP_BINARY"
    return 1
  fi
  log_ok "Swift built ($ARCH_LABEL)" "$(timer_elapsed "$t0")"
}

# [5/5] Assemble app
# The bundle is written to native/.build/app/.staging first, then moved into
# place, so an interrupted build never leaves a half-made app behind.
assemble_app() {
  local t0 version build_number template crate_toml catalog stamp app staging staged_app
  t0="$(timer_start)"
  log_step 5 5 "Assemble app"

  template="$NATIVE_DIR/Resources/Info.plist"
  crate_toml="$ROOT_DIR/crates/mcvector-ffi/Cargo.toml"
  catalog="$NATIVE_DIR/Resources/Localizable.xcstrings"
  stamp="$BUILD_DIR/stamps/app.stamp"
  app="$BUILD_DIR/app/MC-Vector Native.app"
  staging="$BUILD_DIR/app/.staging"
  staged_app="$staging/MC-Vector Native.app"
  APP_DIR="$app"

  if [ ! -f "$template" ]; then
    log_fail "Info.plist template not found: $template"
    return 1
  fi
  if stamp_is_fresh "$stamp" "$app/Contents/MacOS/MCVector" \
    "$APP_BINARY" "$template" "$crate_toml" "$catalog" "$NATIVE_DIR/Resources"; then
    log_skip "Up to date"
    return 0
  fi

  version="$(awk -F'"' '/^\[/ { pkg = ($0 == "[package]") } pkg && /^version[ \t]*=/ { print $2; exit }' \
    "$crate_toml" 2>/dev/null)" || version=""
  if [ -z "$version" ]; then
    log_fail "Could not read the package version from $crate_toml"
    return 1
  fi
  build_number="$(git -C "$ROOT_DIR" rev-list --count HEAD 2>/dev/null)" || build_number=""
  if [ -z "$build_number" ]; then
    build_number="1"
  fi

  ensure_inside_build "$staging"
  rm -rf "$staging" || return 1
  mkdir -p "$staged_app/Contents/MacOS" "$staged_app/Contents/Resources" || return 1
  STAGING_DIR="$staging"

  cp "$APP_BINARY" "$staged_app/Contents/MacOS/MCVector" || return 1
  chmod 755 "$staged_app/Contents/MacOS/MCVector" || return 1
  sed -e "s|__VERSION__|$version|g" -e "s|__BUILD__|$build_number|g" \
    "$template" >"$staged_app/Contents/Info.plist" || return 1
  if ! plutil -lint "$staged_app/Contents/Info.plist" >/dev/null 2>&1; then
    log_fail "Generated Info.plist is not valid (plutil -lint)"
    return 1
  fi
  if [ -f "$NATIVE_DIR/Resources/AppIcon.icns" ]; then
    cp "$NATIVE_DIR/Resources/AppIcon.icns" "$staged_app/Contents/Resources/" || return 1
  fi
  # The String Catalog is compiled into en.lproj and ja.lproj inside the bundle.
  run_logged "xcstrings-compile" xcrun xcstringstool compile "$catalog" \
    --output-directory "$staged_app/Contents/Resources" || return 1
  if [ ! -f "$staged_app/Contents/Resources/en.lproj/Localizable.strings" ] \
    || [ ! -f "$staged_app/Contents/Resources/ja.lproj/Localizable.strings" ]; then
    log_fail "xcstringstool did not produce en.lproj and ja.lproj Localizable.strings"
    return 1
  fi
  run_logged "codesign" codesign --force --deep --sign - "$staged_app" || return 1

  ensure_inside_build "$app"
  rm -rf "$app" || return 1
  mv "$staged_app" "$app" || return 1
  rm -rf "$staging" || return 1
  STAGING_DIR=""
  ensure_inside_build "$BUILD_DIR/stamps"
  mkdir -p "$BUILD_DIR/stamps" || return 1
  touch "$stamp" || return 1
  log_ok "App assembled" "$(timer_elapsed "$t0")"
}

main() {
  parse_args "$@"
  BUILD_T0="$(timer_start)"
  trap on_interrupt INT TERM
  cd "$ROOT_DIR"

  host_triple_setup
  if [ "$UNIVERSAL" -eq 1 ]; then
    RUST_TRIPLES=(aarch64-apple-darwin x86_64-apple-darwin)
    SWIFT_TRIPLES=(arm64-apple-macosx15.0 x86_64-apple-macosx15.0)
    ARCH_LABEL="arm64 + x86_64 (universal)"
  else
    RUST_TRIPLES=("$HOST_TRIPLE")
    SWIFT_TRIPLES=("$HOST_SWIFT_TRIPLE")
    ARCH_LABEL="$HOST_ARCH_LABEL"
  fi

  if [ "$CLEAN" -eq 1 ]; then
    ensure_inside_build "$BUILD_DIR"
    rm -rf "$BUILD_DIR"
    log_info "Removed $BUILD_DIR"
  fi
  setup_build_env

  check_toolchain
  build_rust_core
  generate_bindings_step
  build_swift
  assemble_app

  log_summary "Build succeeded" \
    "App: $APP_DIR" \
    "Size: $(du -sh "$APP_DIR" | awk '{print $1}')" \
    "Profile: $PROFILE" \
    "Arch: $ARCH_LABEL" \
    "Time: $(timer_elapsed "$BUILD_T0")s"
}

main "$@"
