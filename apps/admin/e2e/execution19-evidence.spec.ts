import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 19 evidence capture.
 *
 * Screenshots for the seven remediation areas, in both themes and both
 * directions, written to docs/execution-reports/exec19/screens so the execution
 * report can embed them directly. This spec only captures evidence; the
 * behavioural assertions live in execution08-remediation.spec.ts.
 */
const OUT = '../../docs/execution-reports/exec19/screens';

test.describe('Execution 19 evidence', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`branch create + edit modals (${theme})`, async ({ page }) => {
      await signIn(page, ENTERPRISE_ADMIN);
      await setLocale(page, 'en');
      await setTheme(page, theme);
      await page.goto('/branches');
      await page.getByTestId('new-branch').click();
      await expect(page.getByTestId('branch-name-en')).toBeVisible();
      await page.screenshot({ path: `${OUT}/branch-create-${theme}-en.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 15_000 });
      const edit = page.locator('[data-testid^="edit-branch-"]').first();
      if (await edit.count()) {
        await edit.click();
        await expect(page.getByTestId('edit-branch-name-en')).toBeVisible();
        await page.screenshot({ path: `${OUT}/branch-edit-${theme}-en.png` });
      }
    });

    test(`chart-of-accounts create modal (${theme})`, async ({ page }) => {
      await signIn(page, ENTERPRISE_ADMIN);
      await setLocale(page, 'en');
      await setTheme(page, theme);
      await page.goto('/accounting');
      await page.getByTestId('new-account').click();
      await expect(page.getByTestId('account-type')).toBeVisible();
      // Open the parent dropdown so the popup surface is captured too.
      await page.getByTestId('account-parent').click();
      await page.screenshot({ path: `${OUT}/account-create-${theme}-en.png` });
    });

    test(`HR employee profile + documents (${theme})`, async ({ page }) => {
      await signIn(page, ENTERPRISE_ADMIN);
      await setLocale(page, 'en');
      await setTheme(page, theme);
      await page.goto('/hr');
      await page.getByTestId('hr-tab-employees').click();
      await page.getByTestId('employee-row-EMP-001').waitFor({ timeout: 20_000 });
      await page.getByTestId('employee-edit-EMP-001').click();
      await expect(page.getByTestId('employee-secondary-phone')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('employee-termination-date')).toBeVisible();
      await page.screenshot({ path: `${OUT}/hr-employee-${theme}-en.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 15_000 });
      await page.getByTestId('hr-tab-leave').click();
      await page.getByTestId('new-leave-request').click();
      await expect(page.getByTestId('leave-start')).toBeVisible();
      await page.screenshot({ path: `${OUT}/hr-leave-${theme}-en.png` });
    });

    test(`inspection booking + catalogue (${theme})`, async ({ page }) => {
      await signIn(page, ENTERPRISE_ADMIN);
      await setLocale(page, 'en');
      await setTheme(page, theme);
      await page.goto('/automotive/inspections');
      await expect(page.getByTestId('inspections-page')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('inspections-tab-services').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/inspection-services-${theme}-en.png` });
      await page.getByTestId('inspections-tab-bookings').click();
      await page.getByTestId('new-inspection-booking').click();
      await expect(page.getByTestId('booking-date')).toBeVisible();
      await page.screenshot({ path: `${OUT}/inspection-booking-${theme}-en.png` });
    });
  }

  test('modal light theme (arabic RTL)', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setTheme(page, 'light');
    await setLocale(page, 'ar');
    await page.goto('/branches');
    await page.getByTestId('new-branch').click();
    await expect(page.getByTestId('branch-name-en')).toBeVisible();
    await page.screenshot({ path: `${OUT}/branch-create-light-ar.png` });
  });
});
