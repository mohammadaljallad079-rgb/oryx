import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

const OUT = '../../docs/execution-reports/screenshots';

test('evidence: invoice print preview (en, dark)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await page.goto('/sales');
  await expect(page.getByTestId('sales-page')).toBeVisible();
  const previewBtn = page.locator('[data-testid^="preview-sales_invoice-"]').first();
  await previewBtn.waitFor({ timeout: 20_000 });
  const [popup] = await Promise.all([page.waitForEvent('popup'), previewBtn.click()]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.setViewportSize({ width: 900, height: 1200 });
  await popup.waitForTimeout(800);
  await popup.screenshot({ path: `${OUT}/e08-invoice-print-preview-en.png`, fullPage: true });
  await popup.close();
});

test('evidence: light-theme modal', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.goto('/branches');
  await page.getByTestId('new-branch').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/e08-branch-modal-light-en.png` });
});

test('evidence: dark-theme modal', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'dark');
  await page.goto('/branches');
  await page.getByTestId('new-branch').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/e08-branch-modal-dark-en.png` });
});

test('evidence: inspection service VAT (ar, light)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'ar');
  await setTheme(page, 'light');
  await page.goto('/automotive/inspections');
  await page.getByTestId('inspections-tab-services').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/e08-inspection-services-ar-light.png`, fullPage: true });
});
