import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 03 — HR, CRM, operations and automotive UI acceptance.
 *
 * Drives the real admin screens. HR, CRM and operations are exercised against
 * the demo tenant (Professional plan); the automotive screens are exercised
 * against the ORYX-AUTO internal company (Enterprise plan), which is the tenant
 * that licenses them. Both themes and both languages are covered.
 */
test.describe('Execution 03 — HR, CRM, operations and automotive interfaces', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. HR dashboard, employees and leave render', async ({ page }) => {
    await page.goto('/hr');
    await expect(page.getByTestId('hr-page')).toBeVisible();
    await expect(page.getByTestId('hr-dashboard')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('hr-tab-employees').click();
    await expect(page.getByTestId('employee-row-EMP-001')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('hr-tab-payroll').click();
    await expect(page.getByTestId('hr-page')).toBeVisible();
  });

  test('2. CRM dashboard, leads and tickets render', async ({ page }) => {
    await page.goto('/crm');
    await expect(page.getByTestId('crm-page')).toBeVisible();
    await expect(page.getByTestId('crm-dashboard')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('crm-tab-leads').click();
    await expect(page.getByTestId('lead-search')).toBeVisible();
    await page.getByTestId('crm-tab-tickets').click();
    await expect(page.getByTestId('ticket-search')).toBeVisible();
  });

  test('3. operations dashboard and work orders render', async ({ page }) => {
    await page.goto('/operations');
    await expect(page.getByTestId('operations-page')).toBeVisible();
    await expect(page.getByTestId('operations-dashboard')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('operations-tab-work-orders').click();
    await expect(page.getByTestId('new-work-order')).toBeVisible();
    await page.getByTestId('operations-tab-calendar').click();
    await expect(page.getByTestId('operations-page')).toBeVisible();
  });

  test('7. both languages and both themes render the HR, CRM and operations pages', async ({ page }) => {
    for (const route of ['/hr', '/crm', '/operations']) {
      for (const theme of ['dark', 'light'] as const) {
        await page.goto(route);
        await setTheme(page, theme);
        await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
      }
      await setLocale(page, 'ar');
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await setLocale(page, 'en');
    }
  });

  test('8. Execution 03 pages fit a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/hr', '/crm', '/operations']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(3);
    }
  });
});

/**
 * The automotive modules are licensed to the ORYX-AUTO internal company on the
 * Enterprise plan, so they are exercised in their own session.
 */
test.describe('Execution 03 — automotive modules (Enterprise tenant)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('4. the vehicle registry and inspection services render', async ({ page }) => {
    await page.goto('/automotive/inspections');
    await expect(page.getByTestId('inspections-page')).toBeVisible();
    await page.getByTestId('inspections-tab-services').click();
    await expect(page.getByTestId('service-row-BASIC')).toBeVisible({ timeout: 20_000 });
  });

  test('5. the workshop job cards and providers render', async ({ page }) => {
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible();
    await expect(page.getByTestId('new-job-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('maintenance-tab-providers').click();
    await expect(page.getByTestId('new-provider')).toBeVisible();
  });

  test('6. the spare parts catalog and compatibility render', async ({ page }) => {
    await page.goto('/automotive/spare-parts');
    await expect(page.getByTestId('spare-parts-page')).toBeVisible();
    await page.getByTestId('parts-tab-compatibility').click();
    await expect(page.getByTestId('compat-make')).toBeVisible({ timeout: 20_000 });
  });

  test('9. automotive pages render in both languages and both themes', async ({ page }) => {
    for (const route of ['/automotive/inspections', '/automotive/maintenance', '/automotive/spare-parts']) {
      for (const theme of ['dark', 'light'] as const) {
        await page.goto(route);
        await setTheme(page, theme);
        await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
      }
      await setLocale(page, 'ar');
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await setLocale(page, 'en');
    }
  });
});
