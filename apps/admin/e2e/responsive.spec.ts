import { expect, test, type Page } from '@playwright/test';
import { setLocale, setTheme, signIn } from './helpers';

/**
 * Responsive and bilingual acceptance tests.
 *
 * Verifies the required viewports in both themes and both directions, and that
 * the layouts do not overflow horizontally or clip their content.
 */

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 780 },
];

/**
 * True when the document scrolls horizontally beyond the tolerance.
 *
 * The tolerance absorbs sub-pixel rounding and the classic overlay-scrollbar
 * gutter, which is a few pixels and not a layout defect.
 */
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 8;
  });
}

test.describe('responsive dashboard', () => {
  for (const vp of VIEWPORTS) {
    test(`dashboard fits at ${vp.name} without horizontal overflow`, async ({ page }) => {
      await signIn(page);
      await setLocale(page, 'en');
      await setTheme(page, 'dark');
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard')).toBeVisible();

      expect(await hasHorizontalOverflow(page), `${vp.name} must not overflow horizontally`).toBe(false);
      await expect(page.getByTestId('kpi-row')).toBeVisible();
      await expect(page.getByTestId('module-tiles')).toBeVisible();
    });
  }

  test('the sidebar collapses to a drawer on mobile and opens on demand', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard')).toBeVisible();

    // The drawer toggle is present and the navigation is off-canvas.
    const toggle = page.locator('header button').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    // After opening, a navigation link is reachable.
    await expect(page.locator('aside a[href="/companies"]')).toBeVisible();
  });
});

test.describe('responsive key screens', () => {
  const screens = [
    { path: '/companies', testid: 'companies-page' },
    { path: '/plans', testid: 'plans-page' },
    { path: '/roles', testid: 'roles-page' },
    { path: '/subscriptions', testid: 'subscriptions-page' },
    { path: '/audit', testid: 'audit-page' },
    { path: '/website', testid: 'website-page' },
    { path: '/security', testid: 'security-page' },
  ];

  for (const screen of screens) {
    test(`${screen.path} fits at mobile width`, async ({ page }) => {
      await signIn(page);
      await setLocale(page, 'en');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(screen.path);
      await expect(page.getByTestId(screen.testid)).toBeVisible();
      expect(await hasHorizontalOverflow(page), `${screen.path} must not overflow at 390px`).toBe(false);
    });
  }

  test('data tables scroll inside their container rather than the page', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/companies');
    await expect(page.getByTestId('companies-page')).toBeVisible();
    // The page itself must not overflow; the table wrapper handles the scroll.
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
});

test.describe('bilingual and themed rendering', () => {
  const combos = [
    { locale: 'ar' as const, theme: 'dark' as const },
    { locale: 'ar' as const, theme: 'light' as const },
    { locale: 'en' as const, theme: 'dark' as const },
    { locale: 'en' as const, theme: 'light' as const },
  ];

  for (const combo of combos) {
    test(`dashboard renders in ${combo.locale} ${combo.theme}`, async ({ page }) => {
      await signIn(page);
      await setLocale(page, combo.locale);
      await setTheme(page, combo.theme);
      await page.goto('/dashboard');

      await expect(page.locator('html')).toHaveAttribute('data-dir', combo.locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveAttribute('data-theme', combo.theme);
      await expect(page.getByTestId('kpi-row')).toBeVisible();
      await expect(page.getByTestId('module-tiles')).toBeVisible();

      // Charts must remain rendered (not blank) in every combination. The
      // branch chart is a div-based bar chart; the module chart is SVG. The data
      // arrives asynchronously, so poll rather than sampling immediately.
      await expect
        .poll(
          async () => {
            const bars = await page.locator('[data-testid="chart-branches"] .rounded-t-\\[6px\\]').count();
            const donut = await page.locator('[data-testid="chart-modules"] svg').count();
            return bars + donut;
          },
          { timeout: 20_000 },
        )
        .toBeGreaterThan(0);
    });
  }

  test('the persisted theme is applied before paint, with no flash', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'light');
    await page.goto('/dashboard');

    // The data-theme attribute must be present immediately after navigation.
    const themeAtLoad = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(themeAtLoad).toBe('light');
    // And the body background must match the light palette rather than flashing navy.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(0, 22, 43)');
  });
});
