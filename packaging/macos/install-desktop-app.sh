#!/usr/bin/env bash
# Build a macOS .app bundle (no Terminal window) and put it on the Desktop.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
APP="$HOME/Applications/Hospitality POS.app"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Hospitality POS</string>
  <key>CFBundleDisplayName</key><string>Hospitality POS</string>
  <key>CFBundleIdentifier</key><string>com.hospitalitypos.launcher</string>
  <key>CFBundleExecutable</key><string>HospitalityPOS</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>10.15</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/HospitalityPOS" <<EOF
#!/bin/bash
exec "$ROOT/scripts/launch-edge.sh"
EOF
chmod +x "$APP/Contents/MacOS/HospitalityPOS"
chmod +x "$ROOT/scripts/launch-edge.sh"

PNG="$ROOT/packaging/icons/hospitality-pos.png"
if [[ -f "$PNG" ]] && command -v iconutil >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
  ICONSET="$APP/Contents/Resources/icon.iconset"
  mkdir -p "$ICONSET"
  while read -r size name; do
    sips -z "$size" "$size" "$PNG" --out "$ICONSET/$name" >/dev/null 2>&1 || true
  done <<'SIZES'
16 icon_16x16.png
32 icon_16x16@2x.png
32 icon_32x32.png
64 icon_32x32@2x.png
128 icon_128x128.png
256 icon_128x128@2x.png
256 icon_256x256.png
512 icon_256x256@2x.png
512 icon_512x512.png
1024 icon_512x512@2x.png
SIZES
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" >/dev/null 2>&1 || true
  if [[ -f "$APP/Contents/Resources/AppIcon.icns" ]]; then
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true
  fi
  rm -rf "$ICONSET"
fi

if [[ -d "$HOME/Desktop" ]]; then
  ln -sfn "$APP" "$HOME/Desktop/Hospitality POS.app"
  echo "Desktop shortcut: $HOME/Desktop/Hospitality POS.app"
fi
echo "Installed app: $APP"
