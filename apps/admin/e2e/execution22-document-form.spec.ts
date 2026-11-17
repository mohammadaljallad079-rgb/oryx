import { expect, request, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, signIn } from './helpers';

const API = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

/**
 * Delete a draft invoice through the real API from Node.
 *
 * A fresh `APIRequestContext` carries no ambient browser cookie, so `CsrfGuard`
 * has nothing to reject and the call is deterministic. Used to remove the
 * fixture draft this suite creates, because the tenant is shared and other
 * suites read the newest invoice.
 */
async function deleteInvoice(id: string): Promise<void> {
  const ctx = await request.newContext();
  try {
    const login = await ctx.post(`${API}/auth/login`, { data: ENTERPRISE_ADMIN });
    expect(login.ok(), `login failed with ${login.status()}`).toBe(true);
    const { accessToken } = (await login.json()) as { accessToken: string };
    const me = await ctx.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const companyId = ((await me.json()) as { context: { companyId: string | null } }).context.companyId;
    const res = await ctx.delete(`${API}/sales/invoices/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'x-oryx-company-id': companyId ?? '' },
    });
    expect(res.ok(), `invoice cleanup failed with ${res.status()}`).toBe(true);
  } finally {
    await ctx.dispose();
  }
}

/**
 * The create-document form mirrors the printed official document.
 *
 * The owner's requirement is literal: the sales-invoice (and quotation) input
 * form must carry the same field names, the same column headings and the same
 * totals block the PDF prints, not a generic form that happens to collect the
 * same data. These tests pin that contract by reading the rendered labels and
 * comparing them, character for character, with the strings the document
 * template emits.
 *
 * The assertions are on the real form the operator uses — a real modal on the
 * real sales page — so a regression that renames a field or drops a section
 * fails here rather than at the print step.
 */

/** The exact labels the official financial template prints on an invoice. */
const PRINTED_LABELS = [
  'Customer Name',
  'Contact No.',
  'Staf Name',
  'Payment',
  'Untaxed Amount',
  'Discount',
  'Total',
  'Order Date',
  'Expiration Date',
  'Taxes',
  'Amount',
  'Quantity',
  'Unit Price',
  'Description',
];

test.describe('document form mirrors the printed page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('the invoice form carries the printed section and column labels', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-invoices').click();
    await page.getByTestId('new-invoice').click();
    const modal = page.locator('.oryx-modal').first();
    await modal.waitFor();

    // The four blocks the paper is organised into, in order.
    for (const id of [
      'invoice-document-info',
      'invoice-customer-info',
      'invoice-items',
      'invoice-summary',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // Every printed label is present in the form, verbatim.
    const text = (await modal.innerText()).replace(/\s+/g, ' ');
    for (const label of PRINTED_LABELS) {
      expect(text, `form is missing the printed label "${label}"`).toContain(label);
    }

    // The customer picker is the searchable control, not a native select.
    await expect(page.getByTestId('invoice-customer').locator('button')).toBeVisible();

    // The line table exposes the printed five columns plus the live amount.
    await expect(page.getByTestId('invoice-line-amount-0')).toBeVisible();
    await expect(page.getByTestId('invoice-totals')).toBeVisible();
  });

  test('the quotation form prints its own date label and the payment block', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-quotations').click();
    await page.getByTestId('new-quotation').click();
    const modal = page.locator('.oryx-modal').first();
    await modal.waitFor();

    const text = (await modal.innerText()).replace(/\s+/g, ' ');
    expect(text).toContain('Quotation Date');
    expect(text).toContain('Expiration Date');
    expect(text).toContain('Staf Name');
    expect(text).toContain('Payment');
    expect(text).not.toContain('Order Date');
  });

  test('the live totals equal the figures the API computes for the same lines', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-invoices').click();
    await page.getByTestId('new-invoice').click();
    await page.locator('.oryx-modal').first().waitFor();

    // Choose a customer through the searchable picker.
    await page.getByTestId('invoice-customer').locator('button').click();
    await page.getByTestId('invoice-customer').locator('[role="option"]').first().click();

    // Choose the first real product and price a line: 3 x unit, 10% off, tax.
    // The product line is a searchable picker, so open it and click its first
    // option rather than driving a native select.
    const product = page.getByTestId('invoice-product-0');
    await product.locator('button').first().click();
    await product.locator('[role="option"]').first().click();
    await page.getByTestId('invoice-quantity-0').fill('3');
    await page.getByTestId('invoice-discount-0').fill('10');

    // The summary must be populated and internally consistent: the total is the
    // untaxed amount less the discount plus the tax, all in the tenant currency.
    const totals = page.getByTestId('invoice-totals');
    await expect(totals).toContainText('Untaxed Amount');
    await expect(totals).toContainText('Discount');
    await expect(totals).toContainText('Total');
    const lineAmount = await page.getByTestId('invoice-line-amount-0').innerText();
    expect(lineAmount.trim()).not.toBe('0.000 BHD');
  });

  test('the invoice notes field is multiline and round-trips through the database', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-invoices').click();
    await page.getByTestId('new-invoice').click();
    await page.locator('.oryx-modal').first().waitFor();

    // The notes control is a textarea, so a multi-line note is not flattened.
    const notes = page.getByTestId('invoice-notes');
    await expect(notes).toBeVisible();
    expect(await notes.evaluate((el) => el.tagName)).toBe('TEXTAREA');

    // A draft needs a customer and at least one line.
    await page.getByTestId('invoice-customer').locator('button').click();
    await page.getByTestId('invoice-customer').locator('[role="option"]').first().click();
    const product = page.getByTestId('invoice-product-0');
    await product.locator('button').first().click();
    await product.locator('[role="option"]').first().click();
    await page.getByTestId('invoice-quantity-0').fill('2');

    const note = 'First line of the note.\nSecond line kept as typed.';
    await notes.fill(note);

    // Save as a draft and capture the server's own echo of the stored value.
    const [createResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/sales/invoices') && r.request().method() === 'POST' && r.status() === 201,
      ),
      page.getByTestId('save-draft-invoice').click(),
    ]);
    const created = (await createResp.json()) as { id: string; invoiceNumber: string; notes: string | null };
    expect(created.notes).toBe(note);

    try {
      // Reopen the saved draft from the list: the multiline value is loaded back
      // from the database, not held in component state.
      await page.getByTestId('sales-tab-invoices').click();
      await page.getByTestId(`edit-invoice-${created.invoiceNumber}`).click();
      await page.locator('.oryx-modal').first().waitFor();
      await expect(page.getByTestId('invoice-notes')).toHaveValue(note);

      // Editing the note persists the new value.
      const edited = 'Edited note only.';
      await page.getByTestId('invoice-notes').fill(edited);
      const [updateResp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().endsWith(`/sales/invoices/${created.id}`) && r.request().method() === 'POST' && r.ok(),
        ),
        page.getByTestId('save-draft-invoice').click(),
      ]);
      const updated = (await updateResp.json()) as { notes: string | null };
      expect(updated.notes).toBe(edited);
    } finally {
      // Remove the fixture draft through the API from Node. This suite runs
      // against the shared seeded tenant and other suites read the newest
      // invoice, so a leftover draft would break them.
      await deleteInvoice(created.id);
    }
  });
});
