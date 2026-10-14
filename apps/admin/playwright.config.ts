import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the ORYX admin UI.
 *
 * The suite assumes the API (port 3001) and the admin app (port 3000) are
 * already running — see docs/LOCAL_DEVELOPMENT.md. Screenshots are written to
 * docs/execution-reports/screenshots/ so the execution report can reference
 * them directly.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/playwright-report.json' }]],
  use: {
    baseURL: process.env.ORYX_ADMIN_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    timezoneId: 'Asia/Riyadh',
  },
  projects: [
    {
      name: 'desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
