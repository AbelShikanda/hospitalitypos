#!/usr/bin/env bash
# Start the Hospitality POS edge server (or the preview fallback) and open the
# app in a chrome-less window. Designed to be run from a desktop shortcut, so it
# must never require a terminal and must never open a console window.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

PORT="${POS_PORT:-4000}"
HOST="${POS_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/hospitality-pos"
LOG="$STATE_DIR/launcher.log"
PID_FILE="$STATE_DIR/preview.pid"
mkdir -p "$STATE_DIR"

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"$LOG"; }

notify() {
  log "NOTIFY: $*"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send --app-name="Hospitality POS" "Hospitality POS" "$*" >/dev/null 2>&1 || true
  elif command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$*\" with title \"Hospitality POS\"" >/dev/null 2>&1 || true
  fi
}

healthy() {
  curl -fsS --max-time 2 "$URL/api/health" 2>/dev/null | grep -q '"status":"ok"'
}

open_app() {
  if [[ "${POS_NO_OPEN:-0}" == "1" ]]; then
    log "POS_NO_OPEN=1; not opening a browser"
    return 0
  fi

  local browser
  for browser in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser; do
    if command -v "$browser" >/dev/null 2>&1; then
      nohup "$browser" --app="$URL" --new-window --class=HospitalityPOS >/dev/null 2>&1 &
      log "Opened $browser --app=$URL"
      return 0
    fi
  done

  if [[ "$(uname -s)" == "Darwin" ]]; then
    for app in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
      if [[ -d "/Applications/$app.app" ]]; then
        nohup open -na "$app" --args --app="$URL" >/dev/null 2>&1 &
        log "Opened $app --app=$URL"
        return 0
      fi
    done
    nohup open "$URL" >/dev/null 2>&1 &
    log "Opened default browser $URL"
    return 0
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    nohup xdg-open "$URL" >/dev/null 2>&1 &
    log "Opened default browser $URL"
    return 0
  fi

  notify "No browser found to open $URL"
  return 1
}

wait_healthy() {
  local tries="${1:-60}" i
  for ((i = 0; i < tries; i++)); do
    if healthy; then return 0; fi
    sleep 1
  done
  return 1
}

stop_preview() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      log "Stopped preview pid $pid"
    fi
    rm -f "$PID_FILE"
  fi
}

case "${1:-}" in
  --stop)
    stop_preview
    if command -v pkill >/dev/null 2>&1; then
      pkill -f "@hpos/edge start" 2>/dev/null || true
    fi
    if command -v fuser >/dev/null 2>&1; then
      fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    fi
    if [[ -f "$ROOT/docker/edge/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
      (cd "$ROOT" && docker compose -f docker/edge/docker-compose.yml stop >>"$LOG" 2>&1) || true
    fi
    notify "Hospitality POS stopped."
    exit 0
    ;;
  --status)
    if healthy; then echo "running: $URL"; else echo "not running"; fi
    exit 0
    ;;
esac

if healthy; then
  log "Already running at $URL"
  open_app
  exit 0
fi

# 1) Local dev edge (fastest when pnpm is available).
if [[ -f "$ROOT/apps/edge/package.json" ]] && command -v pnpm >/dev/null 2>&1; then
  log "Starting edge via pnpm"
  (cd "$ROOT" && nohup pnpm --filter @hpos/edge start >>"$LOG" 2>&1 & echo $! >"$PID_FILE")
  if wait_healthy 60; then open_app; exit 0; fi
  notify "Edge server did not become healthy. See $LOG"
  exit 1
fi

# 2) Docker Compose fallback for release bundles.
if [[ -f "$ROOT/docker/edge/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
  log "Starting edge via docker compose"
  if ! (cd "$ROOT" && docker compose -f docker/edge/docker-compose.yml up -d >>"$LOG" 2>&1); then
    notify "Failed to start the edge server. See $LOG"
    exit 1
  fi
  if wait_healthy 90; then open_app; exit 0; fi
  notify "Edge server did not become healthy. See $LOG"
  exit 1
fi

# 3) Preview fallback so the shortcut works before the app is built.
if ! command -v node >/dev/null 2>&1; then
  notify "Node.js is required to start the app."
  exit 1
fi
log "Starting preview server"
nohup node "$ROOT/scripts/preview-server.mjs" --host "$HOST" --port "$PORT" >>"$LOG" 2>&1 &
echo $! >"$PID_FILE"
if wait_healthy 20; then open_app; exit 0; fi
notify "Preview server failed to start. See $LOG"
exit 1
