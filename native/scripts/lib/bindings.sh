#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# UniFFI Swift binding generation, shared by native/build.sh (step 3) and
# native/test.sh (generated-bindings drift check).
#
# Sourced after log.sh, with NATIVE_DIR, ROOT_DIR and BUILD_DIR already set.
# These functions run in `||` contexts, where set -e is off, so every command
# that can fail is checked explicitly.

# The only two directories outside native/.build that this file writes to.
BINDINGS_CORE_DIR="$NATIVE_DIR/Sources/MCVectorCore/Generated"
BINDINGS_FFI_DIR="$NATIVE_DIR/Sources/MCVectorFFI"

# bindings_regenerate <host-dylib>
# Runs uniffi-bindgen in library mode into $BUILD_DIR/bindings.
bindings_regenerate() {
  local dylib="$1" out="$BUILD_DIR/bindings"
  if [ ! -f "$dylib" ]; then
    log_fail "Host library not found: $dylib"
    return 1
  fi
  ensure_inside_build "$out"
  rm -rf "$out" || return 1
  mkdir -p "$out" || return 1
  run_logged "bindgen" cargo run -p mcvector-ffi --bin uniffi-bindgen -- \
    generate --library "$dylib" --language swift --out-dir "$out" || return 1
}

# bindings_sync
# Copies the generated *.swift into BINDINGS_CORE_DIR and *.h into
# BINDINGS_FFI_DIR. A file is written only when its content differs (cmp -s), so
# git and SwiftPM see no change when nothing moved. The generated .modulemap and
# the hand-written module.modulemap are never touched.
bindings_sync() {
  local src dest_dir dest name src_dir="$BUILD_DIR/bindings"
  local changed=0 total=0
  for src in "$src_dir"/*.swift "$src_dir"/*.h; do
    if [ ! -f "$src" ]; then
      continue
    fi
    name="${src##*/}"
    case "$name" in
      *.swift) dest_dir="$BINDINGS_CORE_DIR" ;;
      *.h) dest_dir="$BINDINGS_FFI_DIR" ;;
      *) continue ;;
    esac
    total=$((total + 1))
    dest="$dest_dir/$name"
    if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
      continue
    fi
    mkdir -p "$dest_dir" || return 1
    cp "$src" "$dest" || return 1
    changed=$((changed + 1))
  done
  if [ "$total" -eq 0 ]; then
    log_fail "No bindings were generated in $src_dir"
    return 1
  fi
  if [ "$changed" -eq 0 ]; then
    log_skip "Generated bindings unchanged"
  else
    log_ok "Generated bindings updated ($changed file(s))"
  fi
}
