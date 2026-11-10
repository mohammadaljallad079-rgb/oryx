import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, ensureStock, expectNoServerError, setLocale, setTheme, signIn } from './helpers';

/**
 * Sales-register document actions.
 *
 * Before this suite the sales register had no way to produce the official
 * document for a record: the only entry point was the documents page, which
 * asks an operator to paste a record id. The suite drives the real register,
 * issues a real PDF through the API-backed cell, opens it, and asserts the
 * response is an actual PDF whose bytes came from the documents endpoint.
 *
 * Nothing is stubbed. The PDF is fetched from `GET /documents/:id/file`, which
 * is the same route the admin preview frame uses, so a passing test means the
 * button the operator sees really produces a document.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

interface Scenario {
  customerId: string;
  productId: string;
  warehouseId: string;
}

/**
 * Build the fixture rows over HTTP.
 *
 * The seeded customer is deliberately not reused: the demo tenant's first
 * customer sits at its credit limit, so an invoice against it is refused by a
 * real business rule and would make the test assert credit, not documents. A
 * fresh customer with headroom keeps the scenario about documents.
 */
async function scenario(page: import('@playwright/test').Page, token: string): Promise<Scenario> {
  const ids = await page.evaluate(
    async ({ api, bearer }) => {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` };
      const stamp = Date.now();
      const customer = (await (
        await fetch(`${api}/sales/customers`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            code: `DOC-${stamp}`,
            nameEn: 'Document Action Co',
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
      return {
        customerId: customer.id,
        productId: products.items[0].id,
        warehouseId: warehouses.items[0].id,
      };
    },
    { api: API, bearer: token },
  );
  // The suite sells from the first seeded product, whose level drains across
  // runs; restore it so the invoice is refused by stock, not by the test.
  await ensureStock(page, token, ids.productId, ids.warehouseId);
  return ids;
}

test.describe('Sales register — official document actions', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. an invoice row issues, previews and downloads a real PDF', async ({ page }) => {
    const bearer = await apiToken(page, ENTERPRISE_ADMIN);
    const ids = await scenario(page, bearer);

    const created = await page.evaluate(
      async ({ api, bearer: token, ids: idsIn }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const res = await fetch(`${api}/sales/invoices`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: idsIn.customerId,
            invoiceDate: new Date().toISOString().slice(0, 10),
            warehouseId: idsIn.warehouseId,
            lines: [
              {
                productId: idsIn.productId,
                description: 'Document action acceptance line',
                quantity: 10000,
                unitPriceMinor: 10000,
                taxPercentBp: 1500,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error(`invoice create failed: ${res.status} ${await res.text()}`);
        return (await res.json()) as { id: string; invoiceNumber: string };
      },
      { api: API, bearer, ids },
    );

    await page.goto('/sales');
    await expect(page.getByTestId('sales-page')).toBeVisible();
    await expect(page.getByTestId('sales-tab-invoices')).toBeVisible();

    // The row for the invoice this test created carries the action cell.
    const row = page.getByTestId(`invoice-row-${created.invoiceNumber}`);
    await expect(row).toBeVisible({ timeout: 30_000 });

    // No document exists yet, so the cell offers to issue one.
    const issueButton = page.getByTestId(`doc-issue-${created.id}`);
    await expect(issueButton).toBeVisible({ timeout: 30_000 });
    await issueButton.click();

    // After issuing, the cell swaps to preview/reissue.
    const previewButton = page.getByTestId(`doc-preview-${created.id}`);
    await expect(previewButton).toBeVisible({ timeout: 45_000 });
    await previewButton.click();

    // The modal holds the browser's own PDF viewer over a blob from the API.
    const frame = page.getByTestId(`doc-frame-${created.id}`);
    await expect(frame).toBeVisible({ timeout: 30_000 });
    const source = await frame.getAttribute('src');
    expect(source).toMatch(/^blob:/);

    // The download and print controls are present and enabled once loaded.
    await expect(page.getByTestId(`doc-download-${created.id}`)).toBeEnabled();
    await expect(page.getByTestId(`doc-print-${created.id}`)).toBeEnabled();

    // Assert the stored document really is a PDF by fetching it directly. The
    // id comes from the register the cell itself reads, so this checks the same
    // record the button acted on.
    const stored = await page.evaluate(
      async ({ api, bearer: token, sourceId }) => {
        const headers = { Authorization: `Bearer ${token}` };
        const rows = (await (
          await fetch(`${api}/documents?sourceType=SalesInvoice&sourceId=${sourceId}`, { headers })
        ).json()) as Array<{ id: string; type: string }>;
        const doc = rows.find((r) => r.type === 'SALES_INVOICE');
        if (!doc) return { status: 0, header: '' };
        const res = await fetch(`${api}/documents/${doc.id}/file`, { headers });
        const buf = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, header: String.fromCharCode(...buf.slice(0, 5)) };
      },
      { api: API, bearer, sourceId: created.id },
    );
    expect(stored.status).toBe(200);
    expect(stored.header).toBe('%PDF-');
  });

  test('2. a quotation row issues and previews its document', async ({ page }) => {
    const bearer = await apiToken(page, ENTERPRISE_ADMIN);
    const ids = await scenario(page, bearer);

    const created = await page.evaluate(
      async ({ api, bearer: token, ids: idsIn }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const res = await fetch(`${api}/sales/quotations`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: idsIn.customerId,
            issueDate: new Date().toISOString().slice(0, 10),
            lines: [
              {
                productId: idsIn.productId,
                description: 'Document action acceptance line',
                quantity: 10000,
                unitPriceMinor: 10000,
                taxPercentBp: 1500,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error(`quotation create failed: ${res.status} ${await res.text()}`);
        return (await res.json()) as { id: string; quoteNumber: string };
      },
      { api: API, bearer, ids },
    );

    await page.goto('/sales');
    await page.getByTestId('sales-tab-quotations').click();
    const row = page.getByTestId(`quotation-row-${created.quoteNumber}`);
    await expect(row).toBeVisible({ timeout: 30_000 });

    const issueButton = page.getByTestId(`doc-issue-${created.id}`);
    await expect(issueButton).toBeVisible({ timeout: 30_000 });
    await issueButton.click();
    await expect(page.getByTestId(`doc-preview-${created.id}`)).toBeVisible({ timeout: 45_000 });
  });

  test('3. the issued document appears in the register and verifies anonymously', async ({ page }) => {
    const bearer = await apiToken(page, ENTERPRISE_ADMIN);
    const ids = await scenario(page, bearer);

    const issued = await page.evaluate(
      async ({ api, bearer: token, ids: idsIn }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const invoice = (await (
          await fetch(`${api}/sales/invoices`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              customerId: idsIn.customerId,
              invoiceDate: new Date().toISOString().slice(0, 10),
              warehouseId: idsIn.warehouseId,
              lines: [
                {
                  productId: idsIn.productId,
                  description: 'Register acceptance line',
                  quantity: 10000,
                  unitPriceMinor: 10000,
                  taxPercentBp: 1500,
                },
              ],
            }),
          })
        ).json()) as { id: string };
        const doc = (await (
          await fetch(`${api}/documents/issue`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'SALES_INVOICE', sourceId: invoice.id }),
          })
        ).json()) as { id: string; documentNumber: string; verificationToken: string };
        return { ...doc, invoiceId: invoice.id };
      },
      { api: API, bearer, ids },
    );

    expect(issued.documentNumber).toBeTruthy();

    // The register is a lookup: choose the source record, then search.
    await page.goto('/documents');
    await expect(page.getByTestId('documents-page')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('documents-tab-issue').click();
    await page.getByTestId('documents-source-type').selectOption('SalesInvoice');
    await page.getByTestId('documents-source-id').fill(issued.invoiceId);
    await page.getByTestId('documents-lookup').click();
    await expect(page.getByTestId(`document-row-${issued.id}`)).toBeVisible({ timeout: 30_000 });

    // The QR verification endpoint is anonymous: a reviewer who scans the code
    // sees the status without an account. The route wraps the view in
    // `{ found, document }` and reports `valid`/`revoked` rather than the raw
    // database status.
    const verified = await page.evaluate(
      async ({ api, verificationToken }) => {
        const res = await fetch(`${api}/documents/verify/${verificationToken}`);
        return { status: res.status, body: (await res.json()) as { found?: boolean; document?: { status?: string } } };
      },
      { api: API, verificationToken: issued.verificationToken },
    );
    expect(verified.status).toBe(200);
    expect(verified.body.found).toBe(true);
    expect(verified.body.document?.status).toBe('VALID');
  });

  test('4. the tenant register lists, searches, filters and opens the issued PDF', async ({ page }) => {
    const bearer = await apiToken(page, ENTERPRISE_ADMIN);
    const ids = await scenario(page, bearer);

    // Issue a real invoice document so the register has a known row to find.
    const issued = await page.evaluate(
      async ({ api, bearer: token, ids: idsIn }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const invoice = (await (
          await fetch(`${api}/sales/invoices`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              customerId: idsIn.customerId,
              invoiceDate: new Date().toISOString().slice(0, 10),
              warehouseId: idsIn.warehouseId,
              lines: [
                {
                  productId: idsIn.productId,
                  description: 'Register search line',
                  quantity: 10000,
                  unitPriceMinor: 10000,
                  taxPercentBp: 1500,
                },
              ],
            }),
          })
        ).json()) as { id: string };
        return (await (
          await fetch(`${api}/documents/issue`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'SALES_INVOICE', sourceId: invoice.id }),
          })
        ).json()) as { documentNumber: string; verificationToken: string };
      },
      { api: API, bearer, ids },
    );
    expect(issued.documentNumber).toBeTruthy();

    await page.goto('/documents');
    await expect(page.getByTestId('document-register')).toBeVisible({ timeout: 30_000 });

    // The register is server-backed: searching by the number the API returned
    // must narrow the table to exactly that row.
    await page.getByTestId('register-search').fill(issued.documentNumber);
    const row = page.getByTestId(`register-row-${issued.documentNumber}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('Tax invoice');
    await expect(row).toContainText('Issued');
    await expectNoServerError(page);

    // The type filter keeps the row; a filter that excludes the type drops it.
    await page.getByTestId('register-type').selectOption('SALES_INVOICE');
    await expect(row).toBeVisible();
    await page.getByTestId('register-type').selectOption('QUOTATION');
    await expect(row).toHaveCount(0);
    await page.getByTestId('register-type').selectOption('');

    // Opening the row fetches the stored PDF from the documents endpoint and
    // shows it in an in-page frame over a blob URL. A popup would be blank:
    // the bytes need the staff token, so they are fetched asynchronously and
    // `window.open` is no longer tied to the click by then.
    await page.getByTestId(`register-open-${issued.documentNumber}`).click();
    const frame = page.getByTestId('register-frame');
    await expect(frame).toBeVisible({ timeout: 15_000 });
    await expect(frame).toHaveAttribute('src', /^blob:/, { timeout: 15_000 });
    await expect(page.getByTestId('register-download')).toBeEnabled();
    await expect(page.getByTestId('register-print')).toBeEnabled();
    await page.getByTestId('register-detail').waitFor();
    await page.getByTestId('register-preview-close').click();
    await expect(frame).toHaveCount(0);

    // The verification link the register exposes resolves anonymously.
    const verified = await page.evaluate(
      async ({ api, token }) => {
        const res = await fetch(`${api}/documents/verify/${token}`);
        return { status: res.status, body: (await res.json()) as { document?: { status?: string } } };
      },
      { api: API, token: issued.verificationToken },
    );
    expect(verified.status).toBe(200);
    expect(verified.body.document?.status).toBe('VALID');
  });
});
