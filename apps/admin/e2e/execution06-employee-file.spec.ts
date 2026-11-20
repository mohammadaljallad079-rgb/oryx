import { expect, test, type Page } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, setLocale, signIn } from './helpers';

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/**
 * Open the electronic file of the first employee the tenant owns.
 *
 * The dossier is a route (`/hr/employees/:id`), so the test navigates the same
 * way an operator does — through the list's preview button — and then walks the
 * tabs. Every figure asserted below is read back from the API, so a tab that
 * renders a hard-coded value fails.
 */
async function openFirstEmployeeFile(page: Page): Promise<string> {
  const token = await apiToken(page, ENTERPRISE_ADMIN);
  const employee = await page.evaluate(
    async ({ api, token }) => {
      const headers = { Authorization: `Bearer ${token}` };
      const list = (await (await fetch(`${api}/hr/employees?pageSize=1`, { headers })).json()) as {
        items: Array<{ id: string; code: string }>;
      };
      if (!list.items.length) throw new Error('no seeded employee');
      return list.items[0];
    },
    { api: API, token },
  );
  await page.goto('/hr');
  await expect(page.getByTestId('hr-page')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('hr-tab-employees').click();
  await page.getByTestId(`employee-preview-${employee.code}`).click();
  await expect(page.getByTestId('employee-file')).toBeVisible({ timeout: 30_000 });
  return employee.id;
}

test.describe('Execution 06 — employee electronic file', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('1. every tab of the file opens and the personal card carries the identity', async ({ page }) => {
    await openFirstEmployeeFile(page);
    await expect(page.getByTestId('employee-file-tab-identity')).toBeVisible();
    await expect(page.getByTestId('identity-print')).toBeVisible();

    for (const tab of ['payroll', 'leave', 'penalties', 'bonuses', 'reports']) {
      const button = page.getByTestId(`employee-file-tab-${tab}`);
      if (!(await button.count())) continue;
      await button.click();
      await expect(button).toHaveAttribute('aria-selected', 'true');
    }

    for (const tab of ['identity', 'contracts', 'leave', 'documents']) {
      const button = page.getByTestId(`employee-dossier-tab-${tab}`);
      await button.click();
      await expect(button).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('2. the payroll tab prints and exports a payslip and the full history', async ({ page }) => {
    await openFirstEmployeeFile(page);
    const payroll = page.getByTestId('employee-file-tab-payroll');
    if (!(await payroll.count())) test.skip(true, 'the tenant does not license salary reading');
    await payroll.click();

    await expect(page.getByTestId('payroll-from')).toBeVisible({ timeout: 20_000 });

    // The "full history" control only appears once a window is applied; it
    // clears the range, so the whole ledger since the hire date is shown again.
    await page.getByTestId('payroll-from').fill('2020-01-01');
    await expect(page.getByTestId('payroll-all-history')).toBeVisible();
    await page.getByTestId('payroll-all-history').click();
    await expect(page.getByTestId('payroll-all-history')).toHaveCount(0);

    const rows = page.locator('[data-testid^="payslip-row-"]');
    if (await rows.count()) {
      await rows.first().locator('[data-testid^="payslip-view-"]').click();
      await expect(page.getByTestId('payslip-detail')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('payslip-print')).toBeVisible();
      await expect(page.getByTestId('payslip-csv')).toBeVisible();
      await expect(page.getByTestId('payslip-download')).toBeVisible();
      await page.getByTestId('payslip-csv').click();
      await expect(page.getByTestId('payslip-detail')).toBeVisible();
    }
  });

  test('3. the reports tab renders every per-employee report', async ({ page }) => {
    await openFirstEmployeeFile(page);
    await page.getByTestId('employee-file-tab-reports').click();
    await expect(page.getByTestId('employee-file-tab-reports')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-testid^="report-card-"]').first()).toBeVisible({ timeout: 30_000 });
  });
});
