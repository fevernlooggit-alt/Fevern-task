import { defineConfig } from '@playwright/test';

// Console smoke suite (PRD Phase 3 gate). Assumes:
//   - API running on :3000 against a freshly seeded DB (npm -w @icrm/api run db:seed)
//   - web dev server on :5173 (started automatically below)
// Run with: npm -w @icrm/web run e2e

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Use the environment's pre-installed Chromium when the default download is absent.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      command: 'npm -w @icrm/api run start',
      cwd: '../..',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm -w @icrm/web run dev',
      cwd: '../..',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
