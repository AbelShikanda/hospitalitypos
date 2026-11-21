#!/usr/bin/env bash
# Install desktop + application-menu shortcuts for the current Linux user.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

LAUNCHER="$ROOT/scripts/launch-edge.sh"
TEMPLATE="$ROOT/packaging/linux/hospitality-pos.desktop.in"
ICON="$ROOT/packaging/icons/hospitality-pos.svg"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$APP_DIR/hospitality-pos.desktop"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"

chmod +x "$LAUNCHER"
mkdir -p "$APP_DIR"

sed -e "s|@ROOT@|$ROOT|g" "$TEMPLATE" >"$DESKTOP_FILE"
chmod +x "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

if [[ -d "$DESKTOP_DIR" ]]; then
  cp "$DESKTOP_FILE" "$DESKTOP_DIR/hospitality-pos.desktop"
  chmod +x "$DESKTOP_DIR/hospitality-pos.desktop"
  if command -v gio >/dev/null 2>&1; then
    gio set "$DESKTOP_DIR/hospitality-pos.desktop" metadata::trusted true >/dev/null 2>&1 || true
  fi
  echo "Desktop shortcut: $DESKTOP_DIR/hospitality-pos.desktop"
else
  echo "No Desktop directory found; installed app menu entry only."
fi

echo "App menu entry: $DESKTOP_FILE"
echo "Icon: $ICON"
