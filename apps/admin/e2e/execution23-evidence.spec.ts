import { expect, test, type Page } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 23 — consolidated evidence capture for the outstanding requirement
 * batches.
 *
 * This spec only captures screenshots; the behavioural assertions for the same
 * areas live in `execution08-remediation.spec.ts`, `execution10-document-actions
 * .spec.ts`, `execution19-datepicker.spec.ts` and `execution22-document-form
 * .spec.ts`. Output lands under `.run/evidence/exec23/` so the preview host
 * serves it at `/evidence/exec23/`.
 */
const OUT = '../../.run/evidence/exec23';

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 15_000 });
}

test.describe('Execution 23 evidence', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`modals in the ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);

      await page.goto('/branches');
      await page.getByTestId('new-branch').click();
      await expect(page.getByTestId('branch-name-en')).toBeVisible();
      await page.screenshot({ path: `${OUT}/modal-branch-create-${theme}.png` });
      await closeModal(page);

      await page.goto('/accounting');
      await page.getByTestId('accounting-tab-accounts').click();
      await page.getByTestId('new-account').click();
      await expect(page.getByTestId('account-type')).toBeVisible();
      await page.screenshot({ path: `${OUT}/modal-account-${theme}.png` });
      await closeModal(page);

      await page.goto('/automotive/inspections');
      await page.getByTestId('inspections-tab-services').click();
      await page.getByTestId('new-inspection-service').click();
      await expect(page.getByTestId('service-price')).toBeVisible();
      await page.screenshot({ path: `${OUT}/modal-inspection-service-${theme}.png` });
      await closeModal(page);
    });
  }

  test('sales invoice detail shows line pricing and the totals breakdown', async ({ page }) => {
    await setTheme(page, 'light');
    await page.goto('/sales');
    await page.getByTestId('sales-tab-invoices').click();

    const firstRow = page.locator('[data-testid^="invoice-row-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 20_000 });
    const invoiceNumber = (await firstRow.locator('td').first().innerText()).trim();
    await page.getByTestId(`invoice-attach-open-${invoiceNumber}`).click();
    await expect(page.getByTestId('invoice-line-details')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/invoice-detail-lines-light.png` });
    await closeModal(page);
  });

  test('HR employee form carries the secondary phone, end date and documents', async ({ page }) => {
    await setTheme(page, 'light');
    await page.goto('/hr');
    await page.getByTestId('hr-tab-employees').click();
    await page.getByTestId('employee-row-EMP-001').waitFor({ timeout: 20_000 });
    await page.getByTestId('employee-edit-EMP-001').click();

    await expect(page.getByTestId('employee-secondary-phone')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('employee-termination-date')).toBeVisible();
    await expect(page.getByTestId('employee-documents')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/hr-employee-form-light.png` });
    await closeModal(page);
  });

  test('a leave request saves from bare calendar dates', async ({ page }) => {
    await setTheme(page, 'light');
    await page.goto('/hr');
    await page.getByTestId('hr-tab-leave').click();
    await page.getByTestId('new-leave-request').click();
    await expect(page.getByTestId('leave-start')).toBeVisible();
    await page.screenshot({ path: `${OUT}/leave-request-modal-light.png` });
    await closeModal(page);
  });

  test('the inspection booking form shows the date picker and the VAT breakdown', async ({ page }) => {
    await setTheme(page, 'light');
    await page.goto('/automotive/inspections');
    await page.getByTestId('inspections-tab-bookings').click();
    await page.getByTestId('new-inspection-booking').click();
    await expect(page.getByTestId('booking-date')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('booking-date').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/inspection-booking-light.png` });
    await closeModal(page);
  });
});
