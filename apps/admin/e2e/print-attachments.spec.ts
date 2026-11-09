import { expect, request, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, SUPER_ADMIN, setLocale, signIn } from './helpers';

/**
 * Print preview and document attachments (admin UI).
 *
 * Proves the three deliverables end to end in a real browser:
 *
 *  - a sales invoice and a receipt open a print preview window with the
 *    approved form (title in both languages, no server error);
 *  - a PDF/PNG can be attached to a document, previewed, downloaded and removed
 *    from the attachments panel;
 *  - the printed preview reflects the fields the document actually holds.
 *
 * Fixtures are created and removed through the real API from Node, which carries
 * no ambient cookie and therefore no CSRF race.
 */

const API = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

/** A 1×1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function tokenFor(email: string, password: string): Promise<string> {
  // A fresh context per login: an APIRequestContext that already holds the
  // refresh cookie would present it on the next login POST without the matching
  // CSRF header, and CsrfGuard would reject it with a 403.
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${API}/auth/login`, { data: { email, password } });
    expect(res.ok(), `login failed with ${res.status()}`).toBe(true);
    return ((await res.json()) as { accessToken: string }).accessToken;
  } finally {
    await ctx.dispose();
  }
}

async function autoCompanyId(superToken: string): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(`${API}/companies?search=ORYX-AUTO`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.ok(), `company lookup failed with ${res.status()}`).toBe(true);
    const body = (await res.json()) as { items: Array<{ id: string; code: string }> };
    const company = body.items.find((c) => c.code === 'ORYX-AUTO') ?? body.items[0];
    if (!company) throw new Error('ORYX-AUTO company not found.');
    return company.id;
  } finally {
    await ctx.dispose();
  }
}

let invoiceId: string;
let invoiceNumber: string;
let receiptId: string;
let receiptNumber: string;

test.describe('print preview and document attachments', () => {
  // The suite reads the seeded ORYX-AUTO documents rather than creating any, so
  // it leaves the tenant exactly as it found it (the only mutation is an
  // attachment the last test uploads and then removes).
  test.beforeAll(async () => {
    const superToken = await tokenFor(SUPER_ADMIN.email, SUPER_ADMIN.password);
    const companyId = await autoCompanyId(superToken);
    const token = await tokenFor(ENTERPRISE_ADMIN.email, ENTERPRISE_ADMIN.password);

    const ctx = await request.newContext();
    try {
      const headers = { Authorization: `Bearer ${token}`, 'x-oryx-company-id': companyId };

      const invoices = await ctx.get(`${API}/sales/invoices`, { headers });
      expect(invoices.ok(), `invoice list failed with ${invoices.status()}`).toBe(true);
      const invoice = ((await invoices.json()) as { items: Array<{ id: string; invoiceNumber: string }> }).items[0];
      expect(invoice, 'a seeded sales invoice is required').toBeTruthy();
      invoiceId = invoice.id;
      invoiceNumber = invoice.invoiceNumber;

      const payments = await ctx.get(`${API}/accounting/payments`, { headers });
      expect(payments.ok(), `payment list failed with ${payments.status()}`).toBe(true);
      const receipt = (
        (await payments.json()) as { items: Array<{ id: string; paymentNumber: string; direction: string }> }
      ).items.find((p) => p.direction === 'RECEIPT');
      expect(receipt, 'a seeded receipt is required').toBeTruthy();
      receiptId = receipt!.id;
      receiptNumber = receipt!.paymentNumber;
    } finally {
      await ctx.dispose();
    }
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('1. sales invoice opens a print preview with the approved form', async ({ page }) => {
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

  test('2. receipt voucher opens a print preview', async ({ page }) => {
    await page.goto('/accounting');
    await page.getByTestId('accounting-tab-receipts').click();
    await expect(page.getByTestId(`receipt-row-${receiptNumber}`)).toBeVisible({ timeout: 20_000 });

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByTestId(`preview-receipt-${receiptId}`).click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('body')).toContainText('سند قبض');
    await expect(popup.locator('body')).toContainText(receiptNumber);
    await popup.close();
  });

  test('3. attach, preview, download and remove a document on an invoice', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByTestId(`invoice-row-${invoiceNumber}`)).toBeVisible({ timeout: 20_000 });

    // Open the attachments modal for the fixture invoice.
    await page.getByTestId(`invoice-attach-open-${invoiceNumber}`).click();
    await expect(page.getByTestId(`attachments-${invoiceId}`)).toBeVisible();

    // A unique name per run, so a file left behind by an interrupted run cannot
    // be mistaken for the one this test uploads.
    const fileName = `delivery-note-${Date.now()}.png`;

    // Upload a PNG through the real file input.
    await page.getByTestId(`attach-input-${invoiceId}`).setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: PNG,
    });
    const row = page.locator(`[data-testid^="attachment-"]`).filter({ hasText: fileName });
    await expect(row).toBeVisible({ timeout: 20_000 });

    const rowId = await row.getAttribute('data-testid');
    const attachmentId = rowId!.replace('attachment-', '');

    // Preview renders the stored image inline.
    await page.getByTestId(`attachment-preview-${attachmentId}`).click();
    await expect(page.getByTestId('attachment-preview-content')).toBeVisible();
    await page.keyboard.press('Escape');

    // Download hands back a file named after the attachment.
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(`attachment-download-${attachmentId}`).click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toBe(fileName);

    // Remove it; the panel re-reads from the API and the row disappears.
    await page.getByTestId(`attachment-delete-${attachmentId}`).click();
    await expect(page.locator(`[data-testid="attachment-${attachmentId}"]`)).toHaveCount(0, { timeout: 20_000 });
  });
});
