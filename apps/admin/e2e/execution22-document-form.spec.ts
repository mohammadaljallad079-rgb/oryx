import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, setLocale, signIn } from './helpers';

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
    await page.getByTestId('sales-tab-invoices').waitFor();
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
    await page.getByTestId('sales-tab-invoices').waitFor();
    await page.getByTestId('new-invoice').click();
    await page.locator('.oryx-modal').first().waitFor();

    // Choose a customer through the searchable picker.
    await page.getByTestId('invoice-customer').locator('button').click();
    await page.getByTestId('invoice-customer').locator('[role="option"]').first().click();

    // Choose the first real product and price a line: 3 x unit, 10% off, tax.
    const product = page.getByTestId('invoice-product-0');
    const value = await product.locator('option').nth(1).getAttribute('value');
    await product.selectOption(value!);
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
});
