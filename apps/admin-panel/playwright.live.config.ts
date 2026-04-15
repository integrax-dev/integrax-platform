import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/live',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_WEB_BASE_URL ?? 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  globalSetup: './e2e/live/setup.ts',
  globalTeardown: './e2e/live/teardown.ts',
  webServer: {
    command: 'node e2e/live/start-web.mjs',
    url: process.env.E2E_WEB_BASE_URL ?? 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
