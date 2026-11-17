import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, signIn } from './helpers';

/** The three owner-facing workflows are discoverable in their real pages. */
test.describe('POS, company payment settings and banner image upload', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('payment methods are directly reachable from main Settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-payment-shortcut')).toBeVisible();
    await page.getByTestId('open-payment-method-settings').click();
    await expect(page.getByTestId('settings-panel-sales')).toBeVisible();
    await expect(page.getByTestId('company-payment-methods')).toBeVisible();
    await expect(page.getByTestId('payment-method-add')).toBeVisible();
  });

  test('banner editor offers direct file upload and image URL fallback', async ({ page }) => {
    await page.goto('/website');
    await page.getByTestId('cms-tab-banners').click();
    await page.getByTestId('new-cms-banner').click();
    await expect(page.getByTestId('banner-image-upload')).toBeVisible();
    await expect(page.getByTestId('banner-image-file')).toHaveAttribute('accept', /image\/png/);
    await expect(page.getByTestId('banner-image-url')).toBeVisible();
  });
});
