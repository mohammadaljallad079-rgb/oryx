import { defineConfig } from 'vitest/config';

/**
 * The customer app's unit tests live in `test/`. The Playwright specs in
 * `e2e/` are driven by `playwright.config.ts`, so they are excluded here —
 * Vitest's default glob would otherwise try to run them and fail.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
