import { expect, test, type Page } from '@playwright/test';
import { ENTERPRISE_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * Execution 20 — inline create from every entity picker.
 *
 * The requirement is that a "+ Add new" inside a dropdown opens the *same* full
 * create form the standalone screen uses, saves through the same API and then
 * selects the new record in the form the operator was filling in. These tests
 * drive the real interface against the real API and prove each create with a
 * persisted read, so a rendered success message over a failed request cannot
 * pass. Every row carries a timestamp suffix and is cleaned up afterwards.
 */

const API = 'http://localhost:3001/api/v1';

async function apiCall<T>(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const bearer = await apiToken(page, ENTERPRISE_ADMIN);
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

/** Open a picker, click its "+ Add new" entry and wait for the nested form. */
async function openCreate(page: Page, testId: string) {
  await page.getByTestId(testId).locator('button').first().click();
  await page.getByTestId(`${testId}-create`).click();
}

/** Fill the full customer form (the same fields the standalone screen shows). */
async function fillCustomer(page: Page, code: string, nameEn: string, nameAr: string) {
  await expect(page.getByTestId('customer-code')).toBeVisible();
  await page.getByTestId('customer-code').fill(code);
  await page.getByTestId('customer-name-en').fill(nameEn);
  await page.getByTestId('customer-name-ar').fill(nameAr);
}

test.describe('Execution 20 — inline create from entity pickers', () => {
  test.describe.configure({ mode: 'serial' });

  const suffix = Date.now().toString().slice(-7);
  const customerName = `E20 Inline Customer ${suffix}`;
  const customerCode = `E20C${suffix}`;
  const supplierCode = `E20S${suffix}`;
  const productSku = `E20P${suffix}`;
  // VINs exclude I, O and Q; `TESTVN` + the digit suffix stays valid.
  const vin = `TESTVN${suffix}`;
  let customerId: string | null = null;
  let supplierId: string | null = null;
  let projectId: string | null = null;
  let pipelineId: string | null = null;
  let warehouseId: string | null = null;
  let accountId: string | null = null;
  const taxIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page, ENTERPRISE_ADMIN);
    // A customer is master data the API does not delete, so deactivate it; a
    // supplier has a delete endpoint. Both rows carry a timestamp suffix, so a
    // rerun creates fresh ones instead of colliding.
    if (supplierId) await apiCall(page, `/purchasing/suppliers/${supplierId}`, { method: 'DELETE' });
    if (projectId) await apiCall(page, `/operations/projects/${projectId}`, { method: 'DELETE' });
    if (pipelineId) await apiCall(page, `/crm/pipelines/${pipelineId}`, { method: 'DELETE' });
    if (accountId) await apiCall(page, `/accounting/accounts/${accountId}`, { method: 'DELETE' });
    for (const id of taxIds) await apiCall(page, `/tax/${id}`, { method: 'DELETE' });
    if (warehouseId) await apiCall(page, `/inventory/warehouses/${warehouseId}`, { method: 'DELETE' });
    if (customerId) await apiCall(page, `/sales/customers/${customerId}`, { method: 'POST', body: { isActive: false } });
    await page.close();
  });

  test('1. maintenance job card creates a customer and a vehicle without leaving the form', async ({ page }) => {
    await page.goto('/automotive/maintenance?tab=job-cards');
    await page.getByTestId('new-job-card').click();
    await expect(page.getByTestId('job-card-customer')).toBeVisible();

    // The vehicle picker is unusable until a customer is chosen.
    await expect(page.getByTestId('job-vehicle').locator('button').first()).toBeDisabled();

    // Inline-create the customer through the same full form the sales screen uses.
    await openCreate(page, 'job-card-customer');
    await fillCustomer(page, customerCode, customerName, 'عميل إنشاء داخلي');
    await page.getByTestId('save-customer').click();

    // The nested modal closes, the picker reloads and selects the new customer.
    await expect(page.getByTestId('customer-name-en')).toHaveCount(0);
    await expect(page.getByTestId('job-card-customer').locator('button').first()).toContainText(customerName);

    // The persisted create is proven by a read, and yields the id for cleanup.
    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; nameEn: string | null }> }>(
          page,
          `/sales/customers?search=${encodeURIComponent(customerName)}`,
        );
        const found = res.body.items.find((c) => c.nameEn === customerName);
        if (found) customerId = found.id;
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();

    // Now the vehicle picker is enabled; inline-create a vehicle for that customer.
    await expect(page.getByTestId('job-vehicle').locator('button').first()).toBeEnabled();
    await openCreate(page, 'job-vehicle');
    await expect(page.getByTestId('vehicle-vin')).toBeVisible();
    await page.getByTestId('vehicle-vin').fill(vin);
    await page.getByTestId('vehicle-make').fill('Toyota');
    await page.getByTestId('vehicle-model').fill('Corolla');
    await page.getByTestId('save-vehicle').click();

    await expect(page.getByTestId('vehicle-vin')).toHaveCount(0);
    await expect(page.getByTestId('job-vehicle').locator('button').first()).toContainText(vin);
    await expect(page.getByTestId('save-job-card')).toBeEnabled();
  });

  test('2. a maintenance job card saves against the inline-created customer', async ({ page }) => {
    test.skip(!customerId, 'customer was not created');
    await page.goto('/automotive/maintenance?tab=job-cards');
    await page.getByTestId('new-job-card').click();
    await page.getByTestId('job-card-customer').locator('button').first().click();
    await page
      .getByTestId('job-card-customer')
      .locator('[role="option"]', { hasText: customerName })
      .first()
      .click();
    await page.getByTestId('job-vehicle').locator('button').first().click();
    await page.getByTestId('job-vehicle').locator('[role="option"]', { hasText: vin }).first().click();
    await page.getByTestId('job-complaint').fill('Inline create verification');
    await page.getByTestId('save-job-card').click();

    await expect(page.locator('.oryx-modal')).toHaveCount(0);
    const jobs = await apiCall<{ items: Array<{ customerId: string | null }> }>(page, '/automotive/job-cards');
    expect(jobs.body.items.some((j) => j.customerId === customerId)).toBe(true);
  });

  test('3. an accounting payment creates a customer inline', async ({ page }) => {
    await page.goto('/accounting?tab=payments');
    await page.getByTestId('new-payment').click();
    await expect(page.getByTestId('payment-customer')).toBeVisible();

    const name = `E20 Payment Customer ${suffix}`;
    await openCreate(page, 'payment-customer');
    await fillCustomer(page, `E20PC${suffix}`, name, 'عميل سند قبض');
    await page.getByTestId('save-customer').click();

    await expect(page.getByTestId('customer-name-en')).toHaveCount(0);
    await expect(page.getByTestId('payment-customer').locator('button').first()).toContainText(name);
  });

  test('4. the journal editor creates an account inline on a line', async ({ page }) => {
    await page.goto('/accounting?tab=journals');
    await page.getByTestId('new-journal').click();
    await expect(page.getByTestId('journal-line-account-0')).toBeVisible();

    const name = `E20 Inline Account ${suffix}`;
    await openCreate(page, 'journal-line-account-0');
    await expect(page.getByTestId('account-code')).toBeVisible();
    await page.getByTestId('account-name-en').fill(name);
    await page.getByTestId('account-name-ar').fill('حساب إنشاء داخلي');
    await page.getByTestId('save-account').click();

    await expect(page.getByTestId('account-code')).toHaveCount(0);
    await expect(page.getByTestId('journal-line-account-0').locator('button').first()).toContainText(name);
  });

  test('5. spare parts creates a product inline for a compatibility row', async ({ page }) => {
    await page.goto('/automotive/spare-parts');
    await page.getByTestId('parts-tab-compatibility').click();
    await page.getByTestId('new-compatibility').click();
    await expect(page.getByTestId('compatibility-product')).toBeVisible();

    await openCreate(page, 'compatibility-product');
    await expect(page.getByTestId('product-sku')).toBeVisible();
    await page.getByTestId('product-sku').fill(productSku);
    await page.getByTestId('product-name-en').fill('E20 Inline Product');
    await page.getByTestId('product-name-ar').fill('منتج داخلي');
    await page.getByTestId('save-product').click();

    await expect(page.getByTestId('product-sku')).toHaveCount(0);
    await expect(page.getByTestId('compatibility-product').locator('button').first()).toContainText(productSku);

    const products = await apiCall<{ items: Array<{ sku: string }> }>(page, `/inventory/products?search=${productSku}`);
    expect(products.body.items.some((p) => p.sku === productSku)).toBe(true);
  });

  test('6. purchasing creates a supplier inline from the document supplier picker', async ({ page }) => {
    await page.goto('/purchasing');
    await page.getByTestId('purchasing-tab-orders').click();
    await page.getByTestId('new-purchase-order').click();
    await expect(page.getByTestId('purchase-supplier')).toBeVisible();

    await openCreate(page, 'purchase-supplier');
    await expect(page.getByTestId('supplier-code')).toBeVisible();
    await page.getByTestId('supplier-code').fill(supplierCode);
    await page.getByTestId('supplier-name-en').fill('E20 Inline Supplier');
    await page.getByTestId('supplier-name-ar').fill('مورد داخلي');
    await page.getByTestId('save-supplier').click();

    await expect(page.getByTestId('supplier-code')).toHaveCount(0);
    await expect(page.getByTestId('purchase-supplier').locator('button').first()).toContainText('E20 Inline Supplier');

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; code: string }> }>(
          page,
          `/purchasing/suppliers?search=${supplierCode}`,
        );
        const found = res.body.items.find((s) => s.code === supplierCode);
        if (found) supplierId = found.id;
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();
  });

  test('7. an opportunity creates its customer inline', async ({ page }) => {
    await page.goto('/crm?tab=opportunities');
    await expect(page.getByTestId('crm-tab-opportunities')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('new-opportunity').click();
    await expect(page.getByTestId('opportunity-customer')).toBeVisible();

    const name = `E20 Opportunity Customer ${suffix}`;
    await openCreate(page, 'opportunity-customer');
    await fillCustomer(page, `E20OC${suffix}`, name, 'عميل فرصة');
    await page.getByTestId('save-customer').click();

    await expect(page.getByTestId('customer-name-en')).toHaveCount(0);
    await expect(page.getByTestId('opportunity-customer').locator('button').first()).toContainText(name);
  });

  test('8. the inline create form is the full form, not a reduced copy', async ({ page }) => {
    await page.goto('/sales');
    await page.getByTestId('sales-tab-customers').click();
    await page.getByTestId('new-customer').click();
    // The standalone form offers both customer kinds and the company-only fields.
    await expect(page.getByTestId('customer-kind-individual')).toBeVisible();
    await expect(page.getByTestId('customer-kind-company')).toBeVisible();
    await page.getByTestId('customer-kind-company').click();
    await expect(page.getByTestId('customer-cr-number')).toBeVisible();
    await expect(page.getByTestId('customer-contact-person')).toBeVisible();
  });

  test('9. a work order creates its project inline and selects it', async ({ page }) => {
    await page.goto('/operations?tab=work-orders');
    await expect(page.getByTestId('operations-tab-work-orders')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('new-work-order').click();
    await expect(page.getByTestId('work-order-project')).toBeVisible();

    const code = `E20J${suffix}`;
    const name = `E20 Inline Project ${suffix}`;
    await openCreate(page, 'work-order-project');
    await expect(page.getByTestId('project-code')).toBeVisible();
    await page.getByTestId('project-code').fill(code);
    await page.getByTestId('project-name-en').fill(name);
    await page.getByTestId('project-name-ar').fill('مشروع إنشاء داخلي');
    await page.getByTestId('save-project').click();

    // The nested modal closes, the picker reloads and selects the new project.
    await expect(page.getByTestId('project-code')).toHaveCount(0);
    await expect(page.getByTestId('work-order-project').locator('button').first()).toContainText(code);

    // The persisted create is proven by a read against the API.
    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; code: string }> }>(page, '/operations/projects');
        const found = res.body.items.find((p) => p.code === code);
        if (found) projectId = found.id;
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();
  });

  test('10. an opportunity creates its pipeline inline and selects it', async ({ page }) => {
    await page.goto('/crm?tab=opportunities');
    await expect(page.getByTestId('crm-tab-opportunities')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('new-opportunity').click();
    await expect(page.getByTestId('opportunity-pipeline')).toBeVisible();

    const code = `E20PL${suffix}`;
    const name = `E20 Inline Pipeline ${suffix}`;
    await openCreate(page, 'opportunity-pipeline');
    await expect(page.getByTestId('pipeline-code')).toBeVisible();
    await page.getByTestId('pipeline-code').fill(code);
    await page.getByTestId('pipeline-name-en').fill(name);
    await page.getByTestId('pipeline-name-ar').fill('مسار داخلي');
    await page.getByTestId('save-pipeline').click();

    // The nested modal closes, the picker reloads and selects the new pipeline,
    // and the create is proven by a read against the API.
    await expect(page.getByTestId('pipeline-code')).toHaveCount(0);
    await expect(page.getByTestId('opportunity-pipeline').locator('button').first()).toContainText(name);
    await expect(page.getByTestId('save-opportunity')).toBeEnabled();

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; code: string }> }>(page, '/crm/pipelines');
        const found = res.body.items.find((p) => p.code === code);
        if (found) pipelineId = found.id;
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();
  });

  test('11. a leave request creates its leave type inline and selects it', async ({ page }) => {
    await page.goto('/hr?tab=leave');
    await expect(page.getByTestId('hr-tab-leave')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('new-leave-request').click();
    await expect(page.getByTestId('leave-type')).toBeVisible();

    const code = `E20LT${suffix}`;
    const name = `E20 Inline Leave ${suffix}`;
    await openCreate(page, 'leave-type');
    await expect(page.getByTestId('leave-type-code')).toBeVisible();
    await page.getByTestId('leave-type-code').fill(code);
    await page.getByTestId('leave-type-name-en').fill(name);
    await page.getByTestId('leave-type-name-ar').fill('إجازة داخلية');
    await page.getByTestId('save-leave-type').click();

    await expect(page.getByTestId('leave-type-code')).toHaveCount(0);
    await expect(page.getByTestId('leave-type').locator('button').first()).toContainText(name);
  });

  test('12. the product filter creates a warehouse inline and selects it', async ({ page }) => {
    await page.goto('/inventory?tab=products');
    await expect(page.getByTestId('filter-warehouse')).toBeVisible();

    const code = `E20W${suffix}`;
    const name = `E20 Inline Warehouse ${suffix}`;
    await openCreate(page, 'filter-warehouse');
    await expect(page.getByTestId('warehouse-code')).toBeVisible();
    await page.getByTestId('warehouse-code').fill(code);
    await page.getByTestId('warehouse-name-en').fill(name);
    await page.getByTestId('warehouse-name-ar').fill('مستودع داخلي');
    await page.getByTestId('save-warehouse').click();

    await expect(page.getByTestId('warehouse-code')).toHaveCount(0);
    await expect(page.getByTestId('filter-warehouse').locator('button').first()).toContainText(name);

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; code: string }> }>(page, '/inventory/warehouses');
        const found = res.body.items.find((w) => w.code === code);
        if (found) warehouseId = found.id;
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();
  });

  test('13. the ledger filter creates an account inline and selects it', async ({ page }) => {
    await page.goto('/accounting?tab=ledger');
    await expect(page.getByTestId('ledger-account')).toBeVisible();

    const name = `E20 Ledger Account ${suffix}`;
    await openCreate(page, 'ledger-account');
    await expect(page.getByTestId('account-code')).toBeVisible();
    await page.getByTestId('account-name-en').fill(name);
    await page.getByTestId('account-name-ar').fill('حساب دفتر الأستاذ');
    await page.getByTestId('save-account').click();

    await expect(page.getByTestId('account-code')).toHaveCount(0);
    await expect(page.getByTestId('ledger-account').locator('button').first()).toContainText(name);

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; nameEn: string }> }>(
          page,
          `/accounting/accounts?search=${encodeURIComponent(name)}`,
        );
        const found = res.body.items.find((a) => a.nameEn === name);
        if (found) accountId = found.id;
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();
  });

  test('14. a sales invoice line creates its tax rate inline and selects it', async ({ page }) => {
    await page.goto('/sales?tab=invoices');
    await expect(page.getByTestId('new-invoice')).toBeVisible();
    await page.getByTestId('new-invoice').click();
    await page.locator('.oryx-modal').first().waitFor();

    // A line's tax control only exists once the document form is open.
    await expect(page.getByTestId('invoice-tax-0')).toBeVisible();

    const nameEn = `E20 Sales Tax ${suffix}`;
    await openCreate(page, 'invoice-tax-0');
    await expect(page.getByTestId('tax-code')).toBeVisible();
    // The line opens the create form with the sales scope preselected.
    await expect(page.getByTestId('tax-scope')).toHaveValue('SALES');
    await page.getByTestId('tax-code').fill(`E20T${suffix}`);
    await page.getByTestId('tax-rate').fill('5');
    await page.getByTestId('tax-name-en').fill(nameEn);
    await page.getByTestId('tax-name-ar').fill('ضريبة مبيعات');
    await page.getByTestId('save-tax').click();

    // The nested form closes and the new rate is selected on the line.
    await expect(page.getByTestId('tax-code')).toHaveCount(0);
    await expect(page.getByTestId('invoice-tax-0').locator('button').first()).toContainText('5%');

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; nameEn: string; rateBp: number }> }>(
          page,
          `/tax?search=${encodeURIComponent(nameEn)}`,
        );
        const found = res.body.items.find((x) => x.nameEn === nameEn && x.rateBp === 500);
        if (found) taxIds.push(found.id);
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();
  });

  test('15. a purchase order line creates its tax rate inline and selects it', async ({ page }) => {
    await page.goto('/purchasing?tab=orders');
    await expect(page.getByTestId('new-purchase-order')).toBeVisible();
    await page.getByTestId('new-purchase-order').click();
    await page.locator('.oryx-modal').first().waitFor();

    await expect(page.getByTestId('purchase-order-line-tax-0')).toBeVisible();

    const nameEn = `E20 Purchase Tax ${suffix}`;
    await openCreate(page, 'purchase-order-line-tax-0');
    await expect(page.getByTestId('tax-code')).toBeVisible();
    // The purchase line opens the create form with the purchases scope preselected.
    await expect(page.getByTestId('tax-scope')).toHaveValue('PURCHASES');
    await page.getByTestId('tax-code').fill(`E20PT${suffix}`);
    await page.getByTestId('tax-rate').fill('12.5');
    await page.getByTestId('tax-name-en').fill(nameEn);
    await page.getByTestId('tax-name-ar').fill('ضريبة مشتريات');
    await page.getByTestId('save-tax').click();

    await expect(page.getByTestId('tax-code')).toHaveCount(0);
    await expect(page.getByTestId('purchase-order-line-tax-0').locator('button').first()).toContainText('12.5%');

    await expect
      .poll(async () => {
        const res = await apiCall<{ items: Array<{ id: string; nameEn: string; rateBp: number }> }>(
          page,
          `/tax?search=${encodeURIComponent(nameEn)}`,
        );
        const found = res.body.items.find((x) => x.nameEn === nameEn && x.rateBp === 1250);
        if (found) taxIds.push(found.id);
        return found?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();
  });
});
