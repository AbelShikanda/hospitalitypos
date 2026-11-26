import { defineConfig } from '@playwright/test';

const port = 4100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'rm -f /tmp/hpos-e2e.db /tmp/hpos-e2e.db-shm /tmp/hpos-e2e.db-wal && ' +
      'pnpm --filter @hpos/web build && ' +
      `PORT=${port} DATABASE_URL=file:/tmp/hpos-e2e.db pnpm --filter @hpos/edge start`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
