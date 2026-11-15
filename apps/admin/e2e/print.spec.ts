import { expect, request, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, signIn } from './helpers';

/**
 * Sales document print preview (admin UI).
 *
 * Proves the deliverable end to end in a real browser: the sales invoice row
 * carries a print action that opens a preview window rendering the approved
 * ORYX form — the title in both languages and the document's own number, with no
 * server error.
 *
 * The invoice is created through the real API from Node (which carries no
 * ambient cookie and therefore no CSRF race) and removed again, so the seeded
 * tenant is left exactly as it was found.
 */

const API = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

async function tokenFor(email: string, password: string): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${API}/auth/login`, { data: { email, password } });
    expect(res.ok(), `login failed with ${res.status()}`).toBe(true);
    return ((await res.json()) as { accessToken: string }).accessToken;
  } finally {
    await ctx.dispose();
  }
}

async function companyIdByCode(superToken: string, code: string): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(`${API}/companies?search=${code}`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.ok(), `company lookup failed with ${res.status()}`).toBe(true);
    const body = (await res.json()) as { items: Array<{ id: string; code: string }> };
    const company = body.items.find((c) => c.code === code) ?? body.items[0];
    if (!company) throw new Error(`${code} company not found.`);
    return company.id;
  } finally {
    await ctx.dispose();
  }
}

let invoiceId: string;
let invoiceNumber: string;
let creditNoteId: string;
let creditNoteNumber: string;
let customerId: string;
let warehouseId: string;
let productId: string;
let token: string;
let companyId: string;

test.describe('sales document print preview', () => {
  test.beforeAll(async () => {
    const superToken = await tokenFor(ENTERPRISE_ADMIN.email, ENTERPRISE_ADMIN.password);
    companyId = await companyIdByCode(superToken, 'ORYX-AUTO');
    token = await tokenFor(ENTERPRISE_ADMIN.email, ENTERPRISE_ADMIN.password);

    const ctx = await request.newContext();
    const headers = { Authorization: `Bearer ${token}`, 'x-oryx-company-id': companyId };
    try {
      const warehouses = await ctx.get(`${API}/inventory/warehouses`, { headers });
      expect(warehouses.ok(), `warehouse list failed with ${warehouses.status()}`).toBe(true);
      warehouseId = ((await warehouses.json()) as { items: Array<{ id: string }> }).items[0]?.id;
      expect(warehouseId, 'a seeded warehouse is required').toBeTruthy();

      const products = await ctx.get(`${API}/inventory/products`, { headers });
      expect(products.ok(), `product list failed with ${products.status()}`).toBe(true);
      productId = ((await products.json()) as { items: Array<{ id: string }> }).items[0]?.id;
      expect(productId, 'a seeded product is required').toBeTruthy();

      const customers = await ctx.get(`${API}/sales/customers`, { headers });
      expect(customers.ok(), `customer list failed with ${customers.status()}`).toBe(true);
      customerId = ((await customers.json()) as { items: Array<{ id: string }> }).items[0]?.id;
      expect(customerId, 'a seeded customer is required').toBeTruthy();

      const created = await ctx.post(`${API}/sales/invoices`, {
        headers,
        data: {
          customerId,
          invoiceDate: '2026-05-02',
          warehouseId,
          salespersonName: 'Browser Print Tester',
          lines: [{ productId, description: 'Print preview line', quantity: 10000, unitPriceMinor: 1000, taxPercentBp: 1000 }],
        },
      });
      expect(created.ok(), `invoice creation failed with ${created.status()} ${await created.text()}`).toBe(true);
      const invoice = (await created.json()) as { id: string; invoiceNumber: string };
      invoiceId = invoice.id;
      invoiceNumber = invoice.invoiceNumber;

      const note = await ctx.post(`${API}/sales/credit-notes`, {
        headers,
        data: {
          customerId,
          invoiceId,
          issueDate: '2026-05-04',
          warehouseId,
          reason: 'Browser print preview',
          lines: [{ productId, description: 'Returned line', quantity: 10000, unitPriceMinor: 1000, taxPercentBp: 1000 }],
        },
      });
      expect(note.ok(), `credit note creation failed with ${note.status()} ${await note.text()}`).toBe(true);
      const creditNote = (await note.json()) as { id: string; creditNoteNumber: string };
      creditNoteId = creditNote.id;
      creditNoteNumber = creditNote.creditNoteNumber;
    } finally {
      await ctx.dispose();
    }
  });

  test.afterAll(async () => {
    const ctx = await request.newContext();
    try {
      await ctx.delete(`${API}/sales/credit-notes/${creditNoteId}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': companyId },
      });
      await ctx.delete(`${API}/sales/invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': companyId },
      });
    } finally {
      await ctx.dispose();
    }
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('the invoice print action opens the approved form', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByTestId('sales-page')).toBeVisible();
    await expect(page.getByTestId(`invoice-row-${invoiceNumber}`)).toBeVisible({ timeout: 20_000 });

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByTestId(`preview-sales_invoice-${invoiceId}`).click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('body')).toContainText('فاتورة');
    await expect(popup.locator('body')).toContainText('INVOICE');
    await expect(popup.locator('body')).toContainText(invoiceNumber);
    await expect(popup.locator('body')).not.toContainText('Internal Server Error');
    await popup.close();
  });

  test('the credit note print action opens the return voucher', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByTestId('sales-page')).toBeVisible();
    await page.getByTestId('sales-tab-credit-notes').click();
    await expect(page.getByTestId(`credit-note-row-${creditNoteNumber}`)).toBeVisible({ timeout: 20_000 });

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByTestId(`preview-credit_note-${creditNoteId}`).click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('body')).toContainText('إشعار دائن');
    await expect(popup.locator('body')).toContainText(creditNoteNumber);
    await expect(popup.locator('body')).not.toContainText('Internal Server Error');
    await popup.close();
  });
});
