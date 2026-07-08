#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PACKAGE_DIR/.build/release"
APP_BUNDLE="$PACKAGE_DIR/.build/spike/HardenedRuntimeSpike.app"
ENTITLEMENTS_DIR="$SCRIPT_DIR/entitlements"

echo "==> Building release binary"
swift build -c release --package-path "$PACKAGE_DIR"

echo "==> Assembling minimal .app bundle"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
cp "$BUILD_DIR/App" "$APP_BUNDLE/Contents/MacOS/App"

cat > "$APP_BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>App</string>
    <key>CFBundleIdentifier</key>
    <string>dev.mc-vector.native.spike.hardened-runtime</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
</dict>
</plist>
PLIST

declare -a RESULTS=()

for plist in "$ENTITLEMENTS_DIR"/spike-*.plist; do
    name="$(basename "$plist" .plist)"
    echo "==> Signing with entitlements: $name"
    codesign --force --options runtime -s - --entitlements "$plist" "$APP_BUNDLE"

    echo "==> Running (MCV_SPIKE=hardened-runtime-java) with $name"
    set +e
    OUTPUT="$(MCV_SPIKE=hardened-runtime-java "$APP_BUNDLE/Contents/MacOS/App" 2>&1)"
    STATUS=$?
    set -e

    echo "--- $name (exit=$STATUS) ---"
    echo "$OUTPUT"
    echo "---------------------------"
    RESULTS+=("$name: exit=$STATUS")
done

echo ""
echo "==> Summary"
for line in "${RESULTS[@]}"; do
    echo "$line"
done
