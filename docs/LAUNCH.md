# Launch drills

Run these before a pilot venue goes live. Automated checks are commands; manual
checks require a person at the venue.

## 1. Outage resilience

- [x] Automated: edge sync test keeps outbox events queued when the cloud is
      unavailable (`apps/edge/src/sync.test.ts`).
- [ ] Manual: unplug the venue internet during service. Sell with cash, manual
      M-Pesa and PDQ standalone. Reconnect and confirm cloud reports match.

## 2. Power loss

- [x] Automated: order writes use SQLite transactions and idempotency keys.
- [ ] Manual: cut power mid-order, reboot the edge, confirm no duplicate orders
      or corrupted database.

## 3. Load

Run from a machine on the venue LAN:

```bash
CLIENTS=10 BASE_URL=http://<edge-ip>:4000 pnpm load:test
```

Expected: 10 concurrent orders complete with zero failures. Record timings.

## 4. Security

- [x] Automated: tenant isolation tests cover menu, orders, stock, reports,
      shifts, payments and cloud sync.
- [x] Automated: Daraja callbacks reject unknown checkout IDs.
- [ ] Manual: review staff PINs, remove demo staff, confirm no secrets in logs.

## 5. Backup and restore

```bash
pnpm backup:drill
```

Expected: a timestamped backup plus a passing checksum restore drill. Copy the
backup off-box to encrypted storage.

## 6. Update drill

- [ ] Publish a release with a version bump and changelog.
- [ ] Confirm the PWA shows an update banner without forcing a reload while a
      bill is open.
- [ ] Confirm the edge auto-update window and rollback on failed health check.

## 7. Lifecycle drill

- [ ] Restart the edge from a staff device with the correct role.
- [ ] Confirm open bills are still present after restart.
- [ ] Shut down the edge and verify the "Server stopped" screen and recovery.

## 8. Hosted-mode audit

- [ ] Install the hosted demo PWA from GitHub Pages.
- [ ] Confirm printer, KDS, lifecycle and cloud controls are hidden.
- [ ] Confirm the app opens offline from the installed icon.
- [ ] Confirm Pages subpath assets and service-worker scope.

## 9. Pilot sign-off

- [ ] One full service day with real staff.
- [ ] No lost orders or double charges.
- [ ] Cash variance explained.
- [ ] Printer and drawer worked without manual intervention.
- [ ] Owner can read the Z-report and cloud aggregates.
