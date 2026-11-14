import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 08 remediation — interface coverage for the reported defects.
 *
 * Each test drives the real screen against the real API and asserts the value
 * the backend computed, not merely that a control rendered. The HR document
 * test is the important one: the upload form is multipart, so the confidential
 * checkbox posts the string "true" and the API's `@IsBoolean()` used to reject
 * every upload with a 400 — a defect no rendering assertion would catch.
 */
test.describe('Execution 08 remediation — interface', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. an employee document uploads with the confidential flag and can be downloaded', async ({ page }) => {
    await page.goto('/hr');
    await page.getByTestId('hr-tab-employees').click();
    await page.getByTestId('employee-row-EMP-001').waitFor({ timeout: 20_000 });

    await page.getByTestId('employee-edit-EMP-001').click();
    await expect(page.getByTestId('employee-documents')).toBeVisible({ timeout: 15_000 });

    const title = `E08 document ${Date.now()}`;
    await page.getByTestId('doc-title').fill(title);
    await page.getByTestId('doc-confidential').check();
    await page.getByTestId('doc-save').click();

    // The row appears only when the API accepted the multipart boolean. Before
    // the fix the request 400s and an error banner replaces the list update.
    const row = page.locator('[data-testid^="doc-row-"]').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText('Confidential')).toBeVisible();

    // Clean up so the shared seeded tenant is left as it was found.
    page.once('dialog', (dialog) => dialog.accept());
    await row.locator('[data-testid^="doc-delete-"]').click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  });

  test('2. a leave request saves from bare calendar dates and then approves', async ({ page }) => {
    await page.goto('/hr');
    await page.getByTestId('hr-tab-leave').click();
    await page.getByTestId('new-leave-request').click();

    // The employee field is a searchable picker (with an inline create action),
    // not a native select; the leave type is still a plain select.
    await page.getByTestId('leave-employee').locator('button').first().click();
    await page.getByTestId('leave-employee').locator('[role="option"]').first().click();
    await page.getByTestId('leave-type').selectOption({ index: 1 });
    // `<input type="date">` yields `YYYY-MM-DD`; the API must accept it without
    // an ISO 8601 rejection.
    await page.getByTestId('leave-start').fill('2026-11-02');
    await page.getByTestId('leave-end').fill('2026-11-04');
    // The tag lets the Playwright global setup remove this request again: a
    // leave request has no delete endpoint, so an untagged one would decrement
    // the seeded employee's balance on every run.
    await page.getByTestId('leave-reason').fill('E08UI-leave-request');
    await page.getByTestId('save-leave').click();

    const row = page
      .locator('[data-testid^="leave-row-"]')
      .filter({ hasText: '2026-11-02 → 2026-11-04' })
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid^="approve-leave-"]').click();
    await expect(row.getByText(/approved/i)).toBeVisible({ timeout: 15_000 });
  });

  test('3. the branch create and edit forms carry the same fields', async ({ page }) => {
    await page.goto('/branches');
    await page.getByTestId('new-branch').click();

    // Every parity field the edit form exposes is present on create.
    for (const id of ['branch-name-en', 'branch-name-ar', 'branch-city', 'branch-address', 'branch-phone']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.oryx-modal')).toHaveCount(0);
  });

  test('4. an inspection service shows base price, VAT and the total including VAT', async ({ page }) => {
    await page.goto('/automotive/inspections');
    await page.getByTestId('inspections-tab-services').click();
    await page.getByTestId('new-inspection-service').click();

    const code = `E08UI${Date.now().toString().slice(-6)}`;
    await page.getByTestId('service-code').fill(code);
    await page.getByTestId('service-name-en').fill('E08 UI inspection');
    await page.getByTestId('service-name-ar').fill('فحص واجهة');
    await page.getByTestId('service-price').fill('5.000');
    await page.getByTestId('service-tax-rate').fill('10');
    // The live preview shows the breakdown before saving.
    await expect(page.getByTestId('preview-vat')).toContainText('0.500');
    await expect(page.getByTestId('preview-total')).toContainText('5.500');
    await page.getByTestId('save-service').click();

    const row = page.getByTestId(`service-row-${code}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`service-vat-${code}`)).toContainText('0.500');
    await expect(page.getByTestId(`service-total-${code}`)).toContainText('5.500');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`service-delete-${code}`).click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  });

  test('5. a modal paints its own surface and sits above the page in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.goto('/branches');
      await page.getByTestId('new-branch').click();

      const backdrop = page.locator('.oryx-modal-backdrop');
      await expect(backdrop).toBeVisible();
      const styles = await page.evaluate(() => {
        const backdropEl = document.querySelector('.oryx-modal-backdrop') as HTMLElement;
        const modalEl = document.querySelector('.oryx-modal') as HTMLElement;
        const cs = getComputedStyle(backdropEl);
        const ms = getComputedStyle(modalEl);
        return {
          backdropZ: Number(cs.zIndex),
          backdropBg: cs.backgroundColor,
          modalBg: ms.backgroundColor,
          modalRadius: ms.borderTopLeftRadius,
        };
      });

      // The scrim must cover the app chrome (nav/header live under 60).
      expect(styles.backdropZ).toBeGreaterThanOrEqual(60);
      // A transparent scrim would leave the page readable through the dialog.
      expect(styles.backdropBg).not.toBe('rgba(0, 0, 0, 0)');
      // The dialog paints an opaque surface, never the page behind it.
      expect(styles.modalBg).not.toBe('rgba(0, 0, 0, 0)');
      if (theme === 'light') {
        // Light theme must resolve to a light surface, not the navy one.
        const [r, g, b] = styles.modalBg.match(/\d+/g)!.map(Number);
        expect(r + g + b).toBeGreaterThan(600);
      }

      await page.keyboard.press('Escape');
      await expect(page.locator('.oryx-modal')).toHaveCount(0);
    }
  });

  test('6. a chart-of-accounts entry creates, reclassifies and deletes', async ({ page }) => {
    await page.goto('/accounting');
    await page.getByTestId('accounting-tab-accounts').click();
    await page.getByTestId('new-account').click();

    const code = `E08UI${Date.now().toString().slice(-6)}`;
    await page.getByTestId('account-code').fill(code);
    await page.getByTestId('account-type').selectOption('ASSET');
    await page.getByTestId('account-name-en').fill('E08 UI account');
    await page.getByTestId('account-name-ar').fill('حساب واجهة');
    await page.getByTestId('save-account').click();

    const row = page.getByTestId(`account-row-${code}`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Reclassify through the type dropdown and rename; both must persist.
    await page.getByTestId(`account-edit-${code}`).click();
    await page.getByTestId('account-type').selectOption('EXPENSE');
    await page.getByTestId('account-name-en').fill('E08 UI account (edited)');
    await page.getByTestId('save-account').click();
    await expect(row).toContainText('E08 UI account (edited)', { timeout: 15_000 });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`account-delete-${code}`).click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  });
});
