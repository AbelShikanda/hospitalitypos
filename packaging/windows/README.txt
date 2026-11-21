HOSPITALITY POS - WINDOWS DESKTOP SHORTCUT
==========================================

Install (one time):
  1. Right-click Install-DesktopShortcut.ps1
  2. Choose "Run with PowerShell"
  3. If prompted about execution policy, the launcher itself uses
     -ExecutionPolicy Bypass so no global policy change is needed.

Use:
  Double-click "Hospitality POS" on the Desktop (or Start Menu).

What happens:
  - wscript.exe runs with no console.
  - A hidden PowerShell starts the edge server (Docker) or the local preview.
  - Once healthy, Chrome/Edge opens in app-mode (a clean window, no tabs).

Stop:
  - In the app: Settings -> Danger Zone -> Stop server (when built), or
  - Run: powershell -WindowStyle Hidden -File packaging\windows\launch-edge.ps1 -Stop
    (add a -Stop handler if needed), or close the server from Docker.

Logs:
  %LOCALAPPDATA%\HospitalityPOS\launcher.log

Note:
  This shortcut is always shipped with every release. Users should never need
  to open a terminal to start Hospitality POS.
