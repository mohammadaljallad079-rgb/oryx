import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, expectNoServerError, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 04 — customer platform, booking engine, provider portal and
 * payments UI acceptance.
 *
 * These screens are licensed by the Enterprise plan, so the suite signs in as
 * the ORYX-AUTO administrator rather than the demo tenant. Each screen is
 * driven through its real tabs, which fetch from the API; a page that rendered
 * but whose API call failed would show the error banner, and the assertion
 * below fails on that.
 */
test.describe('Execution 04 — customer platform, bookings, providers and payments', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. customer platform renders accounts and counters', async ({ page }) => {
    await page.goto('/customer');
    await expect(page.getByTestId('customer-platform-page')).toBeVisible();
    await expect(page.getByTestId('cp-stat-accounts')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cp-search')).toBeVisible();
    await expectNoServerError(page);
  });

  test('2. booking engine renders list, calendar and resources', async ({ page }) => {
    await page.goto('/bookings');
    await expect(page.getByTestId('bookings-page')).toBeVisible();
    await expect(page.getByTestId('booking-status')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('booking-tab-calendar').click();
    await expect(page.getByTestId('calendar-from')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('booking-tab-resources').click();
    await expect(page.getByTestId('bookings-page')).toBeVisible();
    await expectNoServerError(page);
  });

  test('3. provider portal lists the approved provider and its tabs', async ({ page }) => {
    await page.goto('/providers');
    await expect(page.getByTestId('providers-page')).toBeVisible();
    await expect(page.getByTestId('provider-row-ORYX-AUTO-P1')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('providers-tab-requests').click();
    await expect(page.getByTestId('request-status')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('providers-tab-settlements').click();
    await expect(page.getByTestId('settlement-status')).toBeVisible({ timeout: 20_000 });
    await expectNoServerError(page);
  });

  test('4. payments console shows provider readiness and reconciliation', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payments-page')).toBeVisible();
    await expect(page.getByTestId('intent-status')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('payments-tab-providers').click();
    // BenefitPay ships without credentials, so it must report unconfigured
    // rather than pretending to be live.
    await expect(page.getByTestId('provider-status-BENEFITPAY')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('payments-tab-reconciliation').click();
    await expect(page.getByTestId('recon-unmatched')).toBeVisible({ timeout: 20_000 });
    await expectNoServerError(page);
  });

  test('5. every Execution 04 screen renders in both languages and both themes', async ({ page }) => {
    for (const route of ['/customer', '/bookings', '/providers', '/payments']) {
      for (const theme of ['dark', 'light'] as const) {
        await page.goto(route);
        await setTheme(page, theme);
        await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
      }
      await setLocale(page, 'ar');
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expectNoServerError(page);
      await setLocale(page, 'en');
    }
  });
});
