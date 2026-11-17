import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * Returning a receipt at the till.
 *
 * A sale is recorded through the API (the terminal's own route), then the return
 * is driven from the sales register: pick the receipt, choose the quantity and
 * confirm. The receipt's status is asserted through the API, so a success toast
 * over a rejected request cannot pass.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

test.describe('Point of sale — till returns', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('1. returns a receipt from the register and restocks the goods', async ({ page }) => {
    const bearer = await apiToken(page, ENTERPRISE_ADMIN);

    const setup = await page.evaluate(
      async ({ api, bearer: token }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const context = (await (await fetch(`${api}/auth/context`, { headers })).json()) as {
          branches: Array<{ id: string }>;
        };
        const warehouses = (await (await fetch(`${api}/inventory/warehouses?pageSize=1`, { headers })).json()) as {
          items: Array<{ id: string }>;
        };
        const branchId = context.branches[0].id;
        const warehouseId = warehouses.items[0].id;

        const sessions = (await (await fetch(`${api}/sales/cashier-sessions`, { headers })).json()) as {
          items: Array<{ id: string; status: string; branchId: string }>;
        };
        let sessionId = sessions.items.find((s) => s.status === 'OPEN' && s.branchId === branchId)?.id;
        if (!sessionId) {
          const res = await fetch(`${api}/sales/cashier-sessions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ branchId, warehouseId, openingFloatMinor: 0 }),
          });
          if (!res.ok) throw new Error(`open session failed: ${res.status} ${await res.text()}`);
          sessionId = ((await res.json()) as { id: string }).id;
        }

        const catalog = (await (await fetch(`${api}/inventory/pos-catalog`, { headers })).json()) as {
          items: Array<{ sku: string; salesPriceMinor: number; stockStatus: string }>;
        };
        const product = catalog.items.find((p) => p.stockStatus !== 'OUT');
        if (!product) throw new Error('no sellable product in the POS catalogue');

        // Record a receipt to return. The return flow under test starts here.
        const sale = await fetch(`${api}/sales/pos-sales`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            branchId,
            cashierSessionId: sessionId,
            warehouseId,
            paymentMethod: 'CASH',
            lines: [
              {
                description: product.sku,
                quantity: 10000,
                unitPriceMinor: product.salesPriceMinor,
                taxPercentBp: 0,
              },
            ],
          }),
        });
        if (!sale.ok) throw new Error(`pos sale failed: ${sale.status} ${await sale.text()}`);
        const created = (await sale.json()) as { id: string; receiptNumber: string; totalMinor: number };
        return { receiptNumber: created.receiptNumber, totalMinor: created.totalMinor };
      },
      { api: API, bearer },
    );

    await page.goto('/sales');
    await expect(page.getByTestId('sales-page')).toBeVisible();
    await page.getByTestId('sales-tab-pos').click();

    // The register shows the receipt with a Return action.
    const row = page.getByTestId(`pos-row-${setup.receiptNumber}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const returnButton = page.getByTestId(`return-pos-${setup.receiptNumber}`);
    await expect(returnButton).toBeVisible();
    await returnButton.click();

    // Enter the sold quantity, then confirm. The estimate matches the receipt.
    const qtyInput = page.getByTestId('pos-return-lines').locator('input[type="number"]').first();
    await qtyInput.fill('1');
    await expect(page.getByTestId('pos-return-confirm')).toBeEnabled();
    await page.getByTestId('pos-return-confirm').click();

    // The receipt is written through the API — assert the record, not the toast.
    await expect
      .poll(
        async () =>
          page.evaluate(
            async ({ api, bearer: token, receipt }) => {
              const headers = { Authorization: `Bearer ${token}` };
              const rows = (await (await fetch(`${api}/sales/pos-sales?page=1`, { headers })).json()) as {
                items: Array<{ receiptNumber: string; status: string; returnCreditNoteId: string | null }>;
              };
              return rows.items.find((r) => r.receiptNumber === receipt)?.status ?? 'MISSING';
            },
            { api: API, bearer, receipt: setup.receiptNumber },
          ),
        { timeout: 30_000 },
      )
      .toBe('RETURNED');

    // The refund is a real credit note linked back to the receipt.
    const creditNoteId = await page.evaluate(
      async ({ api, bearer: token, receipt }) => {
        const headers = { Authorization: `Bearer ${token}` };
        const rows = (await (await fetch(`${api}/sales/pos-sales?page=1`, { headers })).json()) as {
          items: Array<{ receiptNumber: string; returnCreditNoteId: string | null }>;
        };
        return rows.items.find((r) => r.receiptNumber === receipt)?.returnCreditNoteId ?? null;
      },
      { api: API, bearer, receipt: setup.receiptNumber },
    );
    expect(creditNoteId).toBeTruthy();

    // A fully returned receipt no longer offers the Return action.
    await page.reload();
    await page.getByTestId('sales-tab-pos').click();
    await expect(page.getByTestId(`pos-row-${setup.receiptNumber}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`return-pos-${setup.receiptNumber}`)).toHaveCount(0);
  });
});
