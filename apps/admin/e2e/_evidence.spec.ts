import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

const OUT = '../../docs/execution-reports/screenshots';

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

test('evidence: inspection booking date/time picker', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.goto('/automotive/inspections');
  await page.getByTestId('inspections-tab-bookings').click();
  await page.getByTestId('new-inspection-booking').click();
  await page.getByTestId('booking-date').waitFor({ timeout: 15_000 });
  await page.getByTestId('booking-date').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/e08-inspection-booking-date-en-light.png` });
});

test('evidence: inspection job types (en, light)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.goto('/automotive/inspections');
  await page.getByTestId('new-inspection-job').click();
  await expect(page.getByTestId('job-types')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/e09-inspection-job-types-en-light.png`, fullPage: true });
});

test('evidence: inspection job list shows the four types (en, light)', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.goto('/automotive/inspections');
  await expect(page.getByTestId('inspection-jobs')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/e09-inspection-jobs-list-en-light.png`, fullPage: true });
});

test('evidence: HR work-site edit/delete actions', async ({ page }) => {
  await signIn(page, ENTERPRISE_ADMIN);
  await setLocale(page, 'en');
  await setTheme(page, 'light');
  await page.goto('/hr');
  await page.getByTestId('hr-tab-policy').click();
  await expect(page.getByTestId('new-work-site')).toBeVisible({ timeout: 20_000 });

  // Create a disposable site so the row, its Edit and its Delete buttons are on
  // screen for the capture; remove it afterwards to leave the tenant as found.
  await page.getByTestId('new-work-site').click();
  await expect(page.getByTestId('work-site-code')).toHaveAttribute('readonly', '');
  await page.getByTestId('work-site-name-en').fill('Evidence Site');
  await page.getByTestId('work-site-lat').fill('26.2285');
  await page.getByTestId('work-site-lng').fill('50.5860');
  await page.getByTestId('submit-work-site').click();
  await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 20_000 });
  const editId = await page.getByRole('row').filter({ hasText: 'Evidence Site' }).locator('[data-testid^="edit-work-site-"]').getAttribute('data-testid');
  expect(editId).toBeTruthy();
  const code = editId!.replace('edit-work-site-', '');
  await expect(page.getByTestId(editId!)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/e09-work-site-actions-en-light.png`, fullPage: true });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId(`delete-work-site-${code}`).click();
  await expect(page.getByText(code)).toHaveCount(0, { timeout: 20_000 });
});
