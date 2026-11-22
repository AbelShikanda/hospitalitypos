# Desktop App & Shortcuts

Every release **must** ship a desktop shortcut for every supported OS. Users
should never have to open a terminal to start Hospitality POS.

## What the "desktop app" is

The POS UI is a PWA. On desktop it runs in a **Chrome/Edge app-mode window**
(no tabs, no address bar) and is served by the **local edge server** on the
venue LAN. A small launcher boots that server and opens the window. A future
native wrapper (Tauri) is optional — it is not required for MVP.

## Launcher behaviour

1. Check `http://127.0.0.1:4000/api/health`. If already healthy, just open the window.
2. Prefer `docker/edge/docker-compose.yml` → `docker compose up -d`.
3. Else, if `apps/edge` exists → start it in the background.
4. Else, start the **branded preview server** so the shortcut works before
   Phase 0 is built. Once the real edge exists, the preview is bypassed.
5. Open Chrome/Edge with `--app=<url>`; fall back to the default browser.
6. Never open a console window; write everything to a log file.

Logs:
- Linux: `~/.local/state/hospitality-pos/launcher.log`
- Windows: `%LOCALAPPDATA%\HospitalityPOS\launcher.log`
- macOS: same XDG path as Linux unless overridden.

## Shortcuts by OS

| OS | Asset | Install |
| --- | --- | --- |
| Linux | `packaging/linux/hospitality-pos.desktop.in` | `bash scripts/install-desktop-shortcut.sh` |
| Windows | `packaging/windows/Launch-HospitalityPOS.vbs` + `Install-DesktopShortcut.ps1` | Right-click installer → Run with PowerShell |
| macOS | `packaging/macos/install-desktop-app.sh` | `bash packaging/macos/install-desktop-app.sh` |

Why no console:
- Linux `.desktop` uses `Terminal=false`.
- Windows `wscript.exe` has no console; PowerShell runs with `-WindowStyle Hidden`.
- macOS `.app` bundle launches the script directly — no Terminal.

## Release requirement

Every GitHub Release includes:
- [ ] The shortcut installer for Linux, Windows and macOS.
- [ ] The icon in SVG/PNG/ICO.
- [ ] A tested launcher that starts the edge with no console.
- [ ] A "Stop" action (right-click menu on Linux, in-app Danger Zone later).

## Testing

Set `POS_NO_OPEN=1` to test the launcher headlessly (no browser window). Then:

```bash
POS_NO_OPEN=1 scripts/launch-edge.sh --status
POS_NO_OPEN=1 scripts/launch-edge.sh
curl -s http://127.0.0.1:4000/api/health
POS_NO_OPEN=1 scripts/launch-edge.sh --stop
```

To reproduce a minimal desktop-session `PATH`:

```bash
env -i HOME="$HOME" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  POS_NO_OPEN=1 scripts/launch-edge.sh
```

## Troubleshooting

- **Port 4000 busy:** set `POS_PORT=4010`.
- **Works in a terminal, not from the shortcut:** desktop sessions often omit
  `~/.local/share/pnpm` from `PATH`. The launcher prepends it; if pnpm lives
  elsewhere, add that directory to `PATH` or run from a terminal once.
- **"Edge server did not become healthy":** check the log. Common causes are a
  root-owned `apps/edge/data` directory or a `better-sqlite3` native-module
  mismatch (for example, host-built modules inside Alpine).
- **Docker not running:** start Docker Desktop (Windows/macOS) or the daemon.
- **No browser found:** install Chrome/Chromium/Edge; the launcher falls back to
  the default browser.
- **Nothing happens:** check the log path above.
