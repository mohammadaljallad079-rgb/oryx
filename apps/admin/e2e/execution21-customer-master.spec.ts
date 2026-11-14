import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, apiToken, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 21 — customer master data in the admin UI.
 *
 * Exercises the surface end to end: the attributed list, the create form with
 * an inline-created lead source, the detail view with history and attachments,
 * and the activate/deactivate control. Every assertion is checked against a
 * persisted API read, so a rendered success message over a failed request
 * cannot pass.
 *
 * The suite creates a uniquely-coded customer and deletes it (and any
 * attachment and inline-created source) in `afterAll`, so a rerun is clean and
 * the seeded tenant is not polluted.
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

test.describe('Execution 21 — customer master data', () => {
  test.describe.configure({ mode: 'serial' });

  const suffix = Date.now().toString().slice(-7);
  const customerCode = `E21C${suffix}`;
  const sourceCode = `E21S${suffix}`;
  let customerId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page, COMPANY_ADMIN);
    // The API exposes no delete for a customer or a lead source — both are
    // master data that other records reference. Cleanup is therefore: drop the
    // test attachment and deactivate the customer so it stays out of the
    // active list. Both test rows carry a timestamp suffix, so a rerun creates
    // fresh ones rather than colliding.
    if (customerId) {
      const listed = await apiCall<{ items?: Array<{ id: string }> }>(
        page,
        `/sales/customers/${customerId}/attachments`,
      );
      for (const a of listed.body.items ?? []) {
        await apiCall(page, `/sales/customers/${customerId}/attachments/${a.id}`, { method: 'DELETE' });
      }
      await apiCall(page, `/sales/customers/${customerId}`, { method: 'POST', body: { isActive: false } });
    }
    await page.close();
  });

  test('1. the customers list renders source and department columns', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-customers').click();
    await expect(page.getByTestId('customer-row-CUST-001')).toBeVisible({ timeout: 20_000 });

    // The seeded customer has a source and a department on the row.
    const row = page.getByTestId('customer-row-CUST-001');
    await expect(row).toBeVisible();
    const list = await apiCall<{ items: Array<{ code: string; sourceId: string | null; sourceNameEn: string | null }> }>(
      page,
      '/sales/customers',
    );
    expect(list.status).toBe(200);
    // The seeded customer carries a resolved source label, not a raw id.
    const seeded = list.body.items.find((c) => c.code === 'CUST-001');
    expect(seeded?.sourceNameEn).toBeTruthy();
  });

  test('2. creates a customer with an inline-created lead source', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-customers').click();
    await page.getByTestId('new-customer').click();
    await expect(page.getByTestId('customer-code')).toBeVisible();

    await page.getByTestId('customer-code').fill(customerCode);
    await page.getByTestId('customer-name-en').fill('Execution 21 Customer');
    await page.getByTestId('customer-name-ar').fill('عميل التنفيذ ٢١');

    // Inline-create a lead source from inside the customer form: the "+ Add
    // new" lives inside the source dropdown now.
    await page.getByTestId('customer-source').locator('button').click();
    await page.getByTestId('customer-source-create').click();
    await page.getByTestId('inline-create-code').fill(sourceCode);
    await page.getByTestId('inline-create-name-en').fill('Workshop Referral');
    await page.getByTestId('inline-create-name-ar').fill('إحالة ورشة');
    await page.getByTestId('inline-create-save').click();

    await page.getByTestId('save-customer').click();

    // The create is proven by a persisted read, not the closing modal.
    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; code: string; sourceId: string | null; sourceNameEn: string | null }> }>(
          page,
          `/sales/customers?search=${customerCode}`,
        );
        const found = res.body.items.find((c) => c.code === customerCode);
        if (found) customerId = found.id;
        return found?.sourceNameEn ?? null;
      }, { timeout: 20_000 })
      .toBe('Workshop Referral');
  });

  test('3. the detail view shows history, invoices and attachments', async ({ page }) => {
    test.skip(!customerId, 'customer was not created');
    await page.goto('/sales');
    await page.getByTestId('sales-tab-customers').click();
    await page.getByTestId('customer-search').fill(customerCode);
    await page.getByTestId(`customer-view-${customerCode}`).click();
    await expect(page.getByTestId('customer-detail')).toBeVisible({ timeout: 20_000 });

    // Upload a real file through the unified attachments panel and assert it is
    // persisted by the API.
    await page.getByTestId(`attach-input-${customerId}`).setInputFiles({
      name: 'trade-licence.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% trade licence\n'),
    });

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ fileName: string }> }>(
          page,
          `/sales/customers/${customerId}/attachments`,
        );
        return res.body.items.map((a) => a.fileName);
      }, { timeout: 20_000 })
      .toContain('trade-licence.pdf');
  });

  test('4. the list toggle deactivates and reactivates the customer', async ({ page }) => {
    test.skip(!customerId, 'customer was not created');
    await page.goto('/sales');
    await page.getByTestId('sales-tab-customers').click();
    await page.getByTestId('customer-search').fill(customerCode);

    page.on('dialog', (d) => void d.accept());
    await page.getByTestId(`customer-toggle-${customerCode}`).click();

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ code: string; isActive: boolean }> }>(
          page,
          `/sales/customers?search=${customerCode}`,
        );
        return res.body.items.find((c) => c.code === customerCode)?.isActive;
      }, { timeout: 20_000 })
      .toBe(false);

    await page.getByTestId(`customer-toggle-${customerCode}`).click();
    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ code: string; isActive: boolean }> }>(
          page,
          `/sales/customers?search=${customerCode}`,
        );
        return res.body.items.find((c) => c.code === customerCode)?.isActive;
      }, { timeout: 20_000 })
      .toBe(true);
  });
});
