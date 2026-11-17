import { expect, test } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * Spare parts are products.
 *
 * The spare-parts workspace must live beside the warehouses and the product
 * catalogue it draws on, not in a second inventory system: the module is a tab
 * of Warehouses & Inventory and the legacy `/automotive/spare-parts` route keeps
 * resolving to the same panel. A part is a `Product`, so the catalogue lists
 * real SKUs from the same table the inventory module reads.
 */

test.describe('Spare parts — inventory integration', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test('1. the module lives in Warehouses & Inventory and lists real product SKUs', async ({ page }) => {
    // A product that exists in the tenant, so the catalogue has something real
    // to show and the assertion is not vacuous.
    const bearer = await apiToken(page, ENTERPRISE_ADMIN);
    const sku = await page.evaluate(
      async ({ api, bearer: token }) => {
        const headers = { Authorization: `Bearer ${token}` };
        const products = (await (await fetch(`${api}/inventory/products?pageSize=1`, { headers })).json()) as {
          items: Array<{ sku: string }>;
        };
        return products.items[0]?.sku ?? null;
      },
      { api: process.env.ORYX_API ?? 'http://localhost:3001/api/v1', bearer },
    );
    expect(sku).toBeTruthy();

    await page.goto('/inventory');
    await expect(page.getByTestId('inventory-page')).toBeVisible();

    // The Spare parts tab is present for an enterprise tenant and opens the
    // shared workspace.
    const partsTab = page.getByTestId('inventory-tab-parts');
    await expect(partsTab).toBeVisible();
    await partsTab.click();
    await expect(page.getByTestId('parts-tab-catalog')).toBeVisible();

    // The catalogue is the product catalogue: the real SKU appears.
    await expect(page.getByTestId(`part-catalog-${sku}`)).toBeVisible({ timeout: 30_000 });

    // The fitment and reservation surfaces are reachable from the same panel.
    await page.getByTestId('parts-tab-compatibility').click();
    await expect(page.getByTestId('compat-make')).toBeVisible();
    await page.getByTestId('parts-tab-reservations').click();
    await expect(page.getByTestId('parts-tab-reservations')).toHaveAttribute('aria-selected', 'true');
  });

  test('2. the legacy /automotive/spare-parts route still resolves to the same panel', async ({ page }) => {
    await page.goto('/automotive/spare-parts');
    await expect(page.getByTestId('spare-parts-page')).toBeVisible();
    // The route renders the shared workspace body, so a bookmark keeps working.
    await page.getByTestId('parts-tab-catalog').click();
    await expect(page.getByTestId('parts-search')).toBeVisible();
  });
});
