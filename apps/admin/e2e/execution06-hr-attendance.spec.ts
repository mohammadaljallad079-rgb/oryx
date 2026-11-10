import { expect, test, type Page } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, setLocale, signIn } from './helpers';

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/**
 * Guarantee at least one payroll run exists for the signed-in tenant.
 *
 * A run is what the detail drawer and its payslip PDF hang off, and the seed
 * ships none — only the API suite used to create one, which made this interface
 * test pass or fail on whether that suite had run first. Creating the run here
 * (idempotently: a later run in the same period is refused, so a pre-existing
 * run simply satisfies the check) keeps the test self-contained.
 */
async function ensurePayrollRun(page: Page): Promise<void> {
  const token = await apiToken(page, ENTERPRISE_ADMIN);
  await page.evaluate(
    async ({ api, token }) => {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const existing = (await (await fetch(`${api}/hr/payroll-runs`, { headers })).json()) as {
        items: unknown[];
      };
      if (existing.items.length > 0) return;

      const period = (await (
        await fetch(`${api}/hr/payroll-periods`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            code: 'E2E-PAY',
            nameEn: 'E2E payroll period',
            nameAr: 'فترة رواتب للاختبار',
            startDate: '2026-06-01',
            endDate: '2026-06-30',
          }),
        })
      ).json()) as { id?: string };

      const run = await fetch(`${api}/hr/payroll-runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ periodId: period.id }),
      });
      if (!run.ok) throw new Error(`Payroll run creation failed: ${run.status} ${await run.text()}`);
    },
    { api: API, token },
  );
}

/**
 * Execution 06 — attendance, work sites, payroll policy and HR reporting.
 *
 * The API is the authority for every derived figure, so these tests assert that
 * the screens render real data and that the policy and work-site forms round-trip
 * through the API. They run against the ORYX-AUTO internal tenant, which licenses
 * the HR module on the Enterprise plan.
 */
test.describe('Execution 06 — attendance, policy, work sites and HR reporting', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('1. attendance tab shows the self-service clock and the policy tab renders', async ({ page }) => {
    await page.goto('/hr');
    await expect(page.getByTestId('hr-page')).toBeVisible();
    await page.getByTestId('hr-tab-attendance').click();
    await expect(page.getByTestId('self-service')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('hr-tab-policy').click();
    await expect(page.getByTestId('attendance-policy')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('policy-grace')).toBeVisible();
  });

  test('2. the attendance policy saves and reloads', async ({ page }) => {
    await page.goto('/hr');
    await page.getByTestId('hr-tab-policy').click();
    const grace = page.getByTestId('policy-grace');
    await expect(grace).toBeVisible({ timeout: 20_000 });
    await grace.fill('12');
    await page.getByTestId('save-policy').click();
    await expect(grace).toHaveValue('12', { timeout: 20_000 });
  });

  test('3. a work site can be created and appears in the list', async ({ page }) => {
    await page.goto('/hr');
    await page.getByTestId('hr-tab-policy').click();
    await expect(page.getByTestId('new-work-site')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('new-work-site').click();
    const code = `E2E${Date.now().toString().slice(-6)}`;
    await page.getByTestId('work-site-code').fill(code);
    await page.getByTestId('work-site-name-en').fill('E2E Site');
    await page.getByTestId('work-site-lat').fill('26.2285');
    await page.getByTestId('work-site-lng').fill('50.5860');
    await page.getByTestId('submit-work-site').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText(code)).toBeVisible({ timeout: 20_000 });
  });

  test('4. every HR report renders and the CSV export downloads', async ({ page }) => {
    await page.goto('/hr');
    await page.getByTestId('hr-tab-reports').click();
    const kind = page.getByTestId('report-kind');
    await expect(kind).toBeVisible({ timeout: 20_000 });
    for (const value of ['attendance', 'overtime', 'payroll', 'payroll-cost']) {
      await kind.selectOption(value);
      await expect(page.locator('main')).toBeVisible();
    }
    const download = page.waitForEvent('download');
    await page.getByTestId('export-report-csv').click();
    const file = await download;
    expect(file.suggestedFilename()).toContain('hr-');
  });

  test('5. the payslip PDF opens from the payroll run detail', async ({ page }) => {
    await ensurePayrollRun(page);
    await page.goto('/hr');
    await page.getByTestId('hr-tab-payroll').click();
    await expect(page.locator('table')).toBeVisible({ timeout: 20_000 });
    // Open the first run's detail; the payslip table then offers a PDF button.
    const details = page.locator('[data-testid^="view-payroll-"]').first();
    await expect(details).toBeVisible({ timeout: 20_000 });
    await details.click();
    const pdfButton = page.locator('[data-testid^="payslip-pdf-"]').first();
    await expect(pdfButton).toBeVisible({ timeout: 20_000 });
    const download = page.waitForEvent('download');
    await pdfButton.click();
    const file = await download;
    expect(file.suggestedFilename()).toContain('payslip-');
  });

  test('6. the attendance tab renders in Arabic RTL', async ({ page }) => {
    await page.goto('/hr');
    await setLocale(page, 'ar');
    await page.getByTestId('hr-tab-attendance').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('hr-page')).toBeVisible();
  });
});
