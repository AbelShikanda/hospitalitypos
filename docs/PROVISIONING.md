# Device provisioning

This guide prepares a venue edge box and its LAN devices. The edge is the source
of truth; the cloud is optional.

## Edge box

- Small x86 mini-PC or fanless box, 4 GB RAM, 32 GB storage, wired Ethernet.
- Linux with Node.js 24 and pnpm 10 available on the PATH.
- Reserve a DHCP address or set a static IP. Tablets and printers must reach it
  on the same LAN.
- Keep the venue's internet modem separate from the edge LAN where practical;
  selling must continue when the modem is down.

## Install

1. Copy the release bundle to the box and run the one-command launcher.
2. Confirm `http://<edge-ip>:4000/api/health` returns `status: ok`.
3. Seed happens automatically; sign in on a tablet with staff PIN `1234` and
   change staff PINs before the pilot.
4. Install the desktop shortcut with `scripts/install-desktop-shortcut.sh`.
   The shortcut must never open a terminal window.

## Network

| Device | Requirement |
| --- | --- |
| Tablets | PWA at `http://<edge-ip>:4000`, port 4000 allowed on LAN |
| KDS | Same URL, role `kitchen` or `manager` |
| Receipt printer | Raw ESC/POS TCP on `PRINTER_HOST:PRINTER_PORT` (default 9100) |
| Cash drawer | Connected to receipt printer, kicked with ESC/POS pulse |
| Barcode scanner | HID keyboard mode, no special driver |

## Optional cloud sync

Set `CLOUD_SYNC_URL`, `CLOUD_TOKEN`, `POS_TENANT_ID` and `POS_VERSION`. The edge
pushes idempotent outbox events every 30 seconds, pulls catalog changes, and
sends heartbeats. Cloud sync is never required for selling.

## Backups

- Run `pnpm backup:drill` after install and weekly thereafter.
- Backups land in `data/backups/` with a SHA-256 checksum printed to the log.
- Copy backups off the box to encrypted storage.
- Record the restore drill result in the pilot checklist.
