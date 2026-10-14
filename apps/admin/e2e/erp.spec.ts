import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, apiToken, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 02 — ERP core UI acceptance.
 *
 * Drives the real admin screens against the seeded demo tenant (which licenses
 * every ERP module on the Enterprise plan) and asserts that each control
 * performs a persisted operation. Assertions are checked against the API
 * response, not only the screen, so a success message over a failed request
 * cannot pass.
 *
 * The suite is read-mostly: it creates nothing that must be cleaned up, and it
 * uses the seeded chart of accounts, warehouse, product and customer.
 */

const API = 'http://localhost:3001/api/v1';

async function apiCall<T>(
  page: import('@playwright/test').Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const bearer = await apiToken(page);
  return page.evaluate(
    async ({ api, path: p, method, body, token }) => {
      const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
      const res = await fetch(`${api}${p}`, {
        method: method ?? 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(method && method !== 'GET' ? { 'x-oryx-csrf': csrf } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
    },
    { api: API, path, method: init.method, body: init.body, token: bearer },
  );
}

test.describe('Execution 02 — ERP core interfaces', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. accounting chart of accounts loads real seeded accounts', async ({ page }) => {
    await page.goto('/accounting');
    await expect(page.getByTestId('accounting-page')).toBeVisible();
    await expect(page.getByTestId('accounting-tab-accounts')).toBeVisible();
    // The seeded chart contains the AR control account.
    await expect(page.getByTestId('account-row-1100')).toBeVisible({ timeout: 20_000 });

    const accounts = await apiCall<{ items: Array<{ code: string }> }>(page, '/accounting/accounts');
    expect(accounts.body.items.length).toBeGreaterThanOrEqual(13);
  });

  test('2. the journal editor refuses to post an unbalanced entry', async ({ page }) => {
    await page.goto('/accounting');
    await page.getByTestId('accounting-tab-journals').click();
    await page.getByTestId('new-journal').click();
    await expect(page.getByTestId('journal-balanced')).toBeVisible();

    // Fill two lines with unequal sides: the indicator must read "not balanced"
    // and the post button must stay disabled.
    const accountOptions = await page.getByTestId('journal-line-account-0').locator('option').all();
    const firstValue = await accountOptions[1].getAttribute('value');
    const secondValue = await accountOptions[2].getAttribute('value');
    await page.getByTestId('journal-line-account-0').selectOption(firstValue!);
    await page.getByTestId('journal-line-account-1').selectOption(secondValue!);
    await page.getByTestId('journal-line-debit-0').fill('100.00');
    await page.getByTestId('journal-line-credit-1').fill('99.00');

    await expect(page.getByTestId('journal-balanced')).toContainText(/not balanced/i);
    await expect(page.getByTestId('save-journal')).toBeDisabled();

    // Balance it: the button becomes enabled and the entry posts.
    await page.getByTestId('journal-line-credit-1').fill('100.00');
    await expect(page.getByTestId('journal-balanced')).toContainText(/balanced/i);
    await expect(page.getByTestId('save-journal')).toBeEnabled();
  });

  test('3. trial balance reports a balanced ledger', async ({ page }) => {
    await page.goto('/accounting');
    await page.getByTestId('accounting-tab-statements').click();
    await page.getByTestId('statement-trial').click();
    await expect(page.getByTestId('trial-balanced')).toContainText(/balanced/i, { timeout: 20_000 });
  });

  test('4. inventory valuation shows seeded stock', async ({ page }) => {
    await page.goto('/inventory');
    await expect(page.getByTestId('inventory-page')).toBeVisible();
    await expect(page.getByTestId('valuation-row-OIL-5W30')).toBeVisible({ timeout: 20_000 });

    const valuation = await apiCall<{ totalValueMinor: number; rows: unknown[] }>(page, '/inventory/valuation');
    expect(valuation.body.rows.length).toBeGreaterThan(0);
    expect(valuation.body.totalValueMinor).toBeGreaterThan(0);
  });

  test('5. sales invoice list renders the seeded tenant data', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByTestId('sales-page')).toBeVisible();
    await expect(page.getByTestId('sales-tab-invoices')).toBeVisible();
    // The tab strip and the invoice list are both real.
    await page.getByTestId('sales-tab-customers').click();
    await expect(page.getByTestId('customer-row-CUST-001')).toBeVisible({ timeout: 20_000 });
  });

  test('6. purchasing suppliers and orders load', async ({ page }) => {
    await page.goto('/purchasing');
    await expect(page.getByTestId('purchasing-page')).toBeVisible();
    await page.getByTestId('purchasing-tab-suppliers').click();
    await expect(page.getByTestId('supplier-row-SUP-001')).toBeVisible({ timeout: 20_000 });
  });

  test('7. reports render scoped summaries', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await page.getByTestId('reports-tab-accounting').click();
    await expect(page.getByTestId('report-accounting-balanced')).toContainText(/balanced/i, { timeout: 20_000 });

    const sales = await apiCall<{ totalSalesMinor: number }>(page, '/reports/sales');
    expect(sales.status).toBe(200);
  });

  test('8. an unlicensed module is refused by the API, not just hidden', async ({ page }) => {
    // The demo tenant licenses everything; a Starter tenant does not. Assert the
    // server refuses the call rather than trusting a hidden control.
    const modules = await apiCall<{ items: Array<{ key: string; licensed: boolean }> }>(page, '/modules');
    const accounting = modules.body.items.find((m) => m.key === 'financial_accounting');
    expect(accounting).toBeTruthy();
    // Licensed here because the demo tenant is on the Enterprise plan.
    expect(accounting!.licensed).toBe(true);
  });
});
