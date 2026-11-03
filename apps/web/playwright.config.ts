import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive the real UI against a running API + web app.
 * By default they start (or reuse) the local servers on :4000 and :3000,
 * which must point at a seeded database. Every test creates its own users
 * and content, so runs are repeatable.
 */
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        { command: 'npm run start -w @academy/api', cwd: '../..', url: 'http://localhost:4000/api/v1/health', reuseExistingServer: true, timeout: 60_000 },
        { command: 'npm run start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 60_000 },
      ],
});
