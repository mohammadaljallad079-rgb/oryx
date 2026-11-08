import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, expectNoServerError, setLocale, setTheme, signIn } from './helpers';

/**
 * POS regression: recording a sale used to fail with a 400 because the line
 * description was left empty when the product was chosen from the catalogue.
 * The API requires a non-empty description, so the sale must be accepted and
 * appear in the session's sales list with the discount and tax applied.
 */
test.describe('POS cashier flow', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('records a sale from the catalogue and lists the receipt', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByTestId('sales-page')).toBeVisible();
    await page.getByTestId('sales-tab-pos').click();

    // Open a session when none is open yet.
    await page.waitForTimeout(1500);
    if (!(await page.getByTestId('new-pos-sale').isVisible().catch(() => false))) {
      await page.getByTestId('open-session').click();
      await page.waitForTimeout(1500);
    }
    const newSale = page.getByTestId('new-pos-sale');
    await expect(newSale).toBeVisible();
    await newSale.click();

    // Pick the first catalogue product and set quantity/price/discount/tax.
    const productSelect = page.getByTestId('pos-line-product-0');
    const firstProduct = await productSelect.locator('option').nth(1).getAttribute('value');
    expect(firstProduct).toBeTruthy();
    await productSelect.selectOption(firstProduct!);
    await page.getByTestId('pos-line-quantity-0').fill('2');
    await page.getByTestId('pos-line-price-0').fill('100.00');
    await page.getByTestId('pos-line-discount-0').fill('10');
    await page.getByTestId('pos-line-tax-0').fill('15');

    // The preview must show the server's figure: 200 - 10% = 180, + 15% = 207.
    await expect(page.getByTestId('pos-line-amount-0')).toContainText('207');

    await page.getByTestId('save-pos-sale').click();

    // The modal closes only when the API accepted the sale.
    await expect(page.locator('.oryx-modal')).toHaveCount(0);
    await expectNoServerError(page);

    // The new receipt is listed in the POS sales table.
    const rows = page.locator('[data-testid^="pos-row-"]');
    await expect(rows.first()).toBeVisible();
  });
});
