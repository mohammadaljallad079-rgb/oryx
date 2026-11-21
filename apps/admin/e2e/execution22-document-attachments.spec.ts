import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, ensureStock, setLocale, signIn } from './helpers';

/**
 * Attaching supporting paperwork to a sales invoice.
 *
 * The register row's action cell carries an "Attach" control that opens a modal
 * which uploads a real file to `POST /attachments/SALES_INVOICE/:id`, lists the
 * stored rows back from the API, opens one through a blob URL and removes it
 * again. Nothing is stubbed: the bytes travel through the same routes the
 * operator uses, so a pass means the control really stores and serves a file.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/** A tiny valid PNG, used as the scanned receipt. */
const SCAN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR42u3OMQEAAAgDoC252/hn0AsJqGmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJH0eFQMBAWvT7wAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Sales invoice — document attachments', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('an invoice stores, lists, opens and removes an attached scan', async ({ page }) => {
    const bearer = await apiToken(page, ENTERPRISE_ADMIN);

    // A fresh invoice with credit headroom, so the scenario is about the
    // attachment and not about a customer's credit limit.
    const created = await page.evaluate(
      async ({ api, bearer: token }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const stamp = Date.now();
        const customer = (await (
          await fetch(`${api}/sales/customers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              code: `ATT-${stamp}`,
              nameEn: 'Attachment Co',
              creditLimitMinor: 1_000_000_000,
            }),
          })
        ).json()) as { id: string };
        const products = (await (await fetch(`${api}/inventory/products?pageSize=1`, { headers })).json()) as {
          items: Array<{ id: string }>;
        };
        const warehouses = (await (await fetch(`${api}/inventory/warehouses?pageSize=1`, { headers })).json()) as {
          items: Array<{ id: string }>;
        };
        return { customerId: customer.id, productId: products.items[0].id, warehouseId: warehouses.items[0].id };
      },
      { api: API, bearer },
    );

    // The suite sells from the first seeded product, whose level drains across
    // runs; restore it so the invoice is refused by stock, not by the test.
    await ensureStock(page, bearer, created.productId, created.warehouseId);

    const invoice = await page.evaluate(
      async ({ api, bearer: token, ids }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        return (await (
          await fetch(`${api}/sales/invoices`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              customerId: ids.customerId,
              invoiceDate: new Date().toISOString().slice(0, 10),
              warehouseId: ids.warehouseId,
              lines: [
                {
                  productId: ids.productId,
                  description: 'Attachment acceptance line',
                  quantity: 10000,
                  unitPriceMinor: 10000,
                  taxPercentBp: 1500,
                },
              ],
            }),
          })
        ).json()) as { id: string; invoiceNumber: string };
      },
      { api: API, bearer, ids: created },
    );

    await page.goto('/sales');
    await expect(page.getByTestId(`invoice-row-${invoice.invoiceNumber}`)).toBeVisible({
      timeout: 30_000,
    });

    // Attachments are managed from the invoice details dialog; the row action
    // opens that dialog, which displays the stored list and upload control.
    await page.getByTestId(`invoice-attach-open-${invoice.invoiceNumber}`).click();
    await expect(page.getByTestId(`attachments-${invoice.id}`)).toBeVisible();

    await page.getByTestId(`attach-input-${invoice.id}`).setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: SCAN_PNG,
    });

    const attachment = page.locator('[data-testid^="attachment-"]').filter({ hasText: 'receipt.png' }).first();
    await expect(attachment).toBeVisible({ timeout: 30_000 });
    const attachmentTestId = await attachment.getAttribute('data-testid');
    const attachmentId = attachmentTestId!.replace('attachment-', '');

    await page.getByTestId(`attachment-preview-${attachmentId}`).click();
    await expect(page.getByTestId('attachment-preview-content')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId(`attachment-delete-${attachmentId}`).click();
    await expect(page.getByTestId(`attachment-${attachmentId}`)).toHaveCount(0, { timeout: 30_000 });
  });
});
