import { test } from '@playwright/test';
import { SUPER_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Ad-hoc capture used while aligning the shell with the approved reference.
 * Not part of the regression suite: it is skipped unless CAPTURE_PHASE is set,
 * so a normal `test:ui` run neither counts it nor rewrites the audit images.
 *
 * Run explicitly with:
 *   CAPTURE_PHASE=after npx playwright test capture.spec.ts
 */
const OUT = '../../docs/audit/branding';

test.skip(!process.env.CAPTURE_PHASE, 'set CAPTURE_PHASE to run the capture');

test('capture current dashboard', async ({ page }) => {
  const phase = process.env.CAPTURE_PHASE ?? 'after';
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${phase}-login-ar-dark.png` });

  await signIn(page, SUPER_ADMIN);
  await setLocale(page, 'ar');
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${phase}-dashboard-ar-dark.png` });

  await setLocale(page, 'en');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${phase}-dashboard-en-dark.png` });

  await setTheme(page, 'light');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${phase}-dashboard-en-light.png` });

  await setLocale(page, 'ar');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${phase}-dashboard-ar-light.png` });
});
