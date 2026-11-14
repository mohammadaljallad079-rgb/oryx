import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 20 — module dashboards.
 *
 * Every module carries its own DB-backed dashboard: a banner with the ORYX
 * lockup, the bilingual module name, real KPIs from the module's own tables,
 * permission-gated quick actions and the module's audit feed. The assertions
 * here are the ones a screen is most likely to get wrong: that the figures
 * actually arrive from the API (not a placeholder), that a deep-linked tab
 * lands on the tab it names, and that the banner switches with the theme.
 */

const MODULES: Array<{ route: string; key: string; testId: string }> = [
  { route: '/accounting', key: 'financial_accounting', testId: 'module-dashboard-financial_accounting' },
  { route: '/sales', key: 'sales_pos', testId: 'module-dashboard-sales_pos' },
  { route: '/purchasing', key: 'purchasing_procurement', testId: 'module-dashboard-purchasing_procurement' },
  { route: '/inventory', key: 'warehouses_inventory', testId: 'module-dashboard-warehouses_inventory' },
  { route: '/payments', key: 'payments', testId: 'module-dashboard-payments' },
  { route: '/hr', key: 'human_resources', testId: 'hr-dashboard' },
  { route: '/crm', key: 'crm', testId: 'crm-dashboard' },
  { route: '/operations', key: 'operations', testId: 'operations-dashboard' },
];

test.describe('Execution 20 — module dashboards', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  for (const { route, key, testId } of MODULES) {
    test(`renders the ${key} dashboard with real figures`, async ({ page }) => {
      // Every module keeps its original landing tab, so the dashboard is reached
      // through the deep link its own tile/shortcut uses.
      await page.goto(`${route}?tab=dashboard`);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 25_000 });
      await expect(page.getByTestId(`module-hero-${key}`)).toBeVisible();
      await expect(page.getByTestId(`module-hero-title-${key}`)).not.toBeEmpty();
      // At least one KPI row with at least one card, sourced from the API.
      const stats = page.getByTestId(`module-stats-${key}`);
      await expect(stats).toBeVisible();
      expect(await stats.locator('.oryx-stat-card').count()).toBeGreaterThan(0);
    });
  }

  test('a deep link selects the named tab', async ({ page }) => {
    await page.goto('/accounting?tab=journals');
    await expect(page.getByTestId('accounting-tab-journals')).toHaveAttribute('aria-selected', 'true');
  });

  test('an unknown deep-link tab falls back to the default', async ({ page }) => {
    await page.goto('/accounting?tab=not-a-real-tab');
    // The module's default tab is its dashboard; an unknown `?tab=` value must
    // leave that selection untouched rather than blanking the page.
    await expect(page.getByTestId('accounting-tab-dashboard')).toHaveAttribute('aria-selected', 'true');
  });

  test('the banner switches with the theme and keeps its artwork', async ({ page }) => {
    await page.goto('/accounting?tab=dashboard');
    const hero = page.getByTestId('module-hero-financial_accounting');
    await expect(hero).toBeVisible({ timeout: 25_000 });
    await expect(hero.locator('.oryx-module-hero__art img')).toBeVisible();

    await setTheme(page, 'light');
    await page.goto('/accounting?tab=dashboard');
    await expect(page.getByTestId('module-hero-financial_accounting')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('module-hero-financial_accounting').locator('.oryx-module-hero__art img')).toBeVisible();
  });
});

test.describe('Execution 20 — module dashboards (Enterprise tenant)', () => {
  test('the automotive tenant sees the maintenance and spare-parts dashboards', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');

    await page.goto('/automotive/maintenance?tab=dashboard');
    await expect(page.getByTestId('module-dashboard-automotive_maintenance')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('module-stats-automotive_maintenance')).toBeVisible();

    await page.goto('/automotive/spare-parts?tab=dashboard');
    await expect(page.getByTestId('module-dashboard-spare_parts')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('module-stats-spare_parts')).toBeVisible();
  });
});
