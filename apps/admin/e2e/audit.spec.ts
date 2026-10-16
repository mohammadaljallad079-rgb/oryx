import { expect, test } from '@playwright/test';
import { MODULES } from '@oryx/shared';
import { ENTERPRISE_ADMIN, SUPER_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Live audit walkthrough.
 *
 * Evidence capture and regression guard for the routed module surface. Every
 * AVAILABLE module in the catalog must resolve to a real page — a route that
 * drifts from the catalog's `route` (as `/subscription` once did, against a
 * page at `/subscriptions`) returns the Next.js 404 and fails here.
 *
 * Output: docs/audit/screenshots/
 */

const OUT = '../../docs/audit/screenshots';

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Routed modules that render for a platform principal, in catalog order. */
const ROUTED_MODULES = MODULES.filter((m) => m.status === 'AVAILABLE' && m.route.startsWith('/'));

test.describe('live module audit', () => {
  test('every AVAILABLE module route resolves to a real page', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });

    const broken: Array<{ key: string; route: string; status: number }> = [];

    for (const entry of ROUTED_MODULES) {
      const response = await page.goto(entry.route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);

      const status = response?.status() ?? 0;
      const body = await page.locator('body').innerText();
      const isErrorBoundary = /Application error|Internal Server Error|Unhandled Runtime Error/i.test(body);
      const isNotFound = /This page could not be found/i.test(body) || status === 404;

      if (status !== 200 || isErrorBoundary || isNotFound) {
        broken.push({ key: entry.key, route: entry.route, status });
      }

      await page.screenshot({ path: `${OUT}/module-${slugify(entry.key)}-en-dark.png` });
    }

    expect(broken, 'module catalog routes must resolve to a page').toEqual([]);
  });

  test('the platform governance surfaces render for the Super Admin', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');

    const routes = [
      '/modules',
      '/plans',
      '/subscriptions',
      '/roles',
      '/audit',
      '/security',
      '/support',
      '/website',
      '/application',
      '/application/flags',
      '/application/versions',
      '/api-management',
      '/integrations',
    ];

    for (const path of routes) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      expect(response?.status(), `${path} should resolve`).toBe(200);
      const body = await page.locator('body').innerText();
      expect(body, `${path} should not show an error boundary`).not.toMatch(
        /Application error|Internal Server Error|This page could not be found/i,
      );
      await page.screenshot({ path: `${OUT}/platform-${slugify(path)}-en-dark.png` });
    }
  });

  test('an enterprise company principal reaches the licensed ERP modules', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');

    const erp: Array<{ path: string; testId: string }> = [
      { path: '/accounting', testId: 'accounting-page' },
      { path: '/sales', testId: 'sales-page' },
      { path: '/purchasing', testId: 'purchasing-page' },
      { path: '/inventory', testId: 'inventory-page' },
      { path: '/hr', testId: 'hr-page' },
      { path: '/crm', testId: 'crm-page' },
      { path: '/operations', testId: 'operations-page' },
      { path: '/automotive/inspections', testId: 'inspections-page' },
      { path: '/automotive/maintenance', testId: 'maintenance-page' },
      { path: '/automotive/spare-parts', testId: 'spare-parts-page' },
    ];

    for (const { path, testId } of erp) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${path} should resolve`).toBe(200);
      // The tenant is entitled, so the module must render its interface, not a
      // permission or entitlement notice.
      await expect(page.getByTestId(testId), `${path} should render ${testId}`).toBeVisible({
        timeout: 20_000,
      });
      await page.screenshot({ path: `${OUT}/enterprise-${slugify(path)}-en-dark.png` });
    }
  });

  test('the dashboard is bilingual, themed and responsive', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);

    for (const locale of ['ar', 'en'] as const) {
      for (const theme of ['dark', 'light'] as const) {
        await setLocale(page, locale);
        await setTheme(page, theme);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(700);
        await expect(page.locator('html')).toHaveAttribute('data-dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.screenshot({ path: `${OUT}/dashboard-${locale}-${theme}.png` });
      }
    }

    for (const [label, width, height] of [
      ['tablet', 834, 1112],
      ['mobile', 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/dashboard-${label}-ar-dark.png` });
      // The page must not overflow horizontally at handset width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${label} width should not scroll horizontally`).toBeLessThanOrEqual(2);
    }

    // Same viewport as the approved reference, for a like-for-like comparison.
    await setLocale(page, 'ar');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/dashboard-reference-viewport-ar-dark.png` });
  });
});
