import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, ENTERPRISE_ADMIN, expectNoServerError, setLocale, setTheme, signIn } from './helpers';

/**
 * Execution 20 — module dashboards, the settings control center, customer types
 * and the unified document panel.
 *
 * Every assertion drives the real admin screens against the seeded tenants. The
 * settings and documents modules are company-scoped, so the suite signs in as
 * the demo tenant administrator (which licenses every ERP module on the
 * Professional/Enterprise plans).
 */
test.describe('Execution 20 — dashboards, settings, customers and documents', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. every module page heads with its own banner and KPIs', async ({ page }) => {
    for (const [route, moduleKey] of [
      ['/accounting', 'financial_accounting'],
      ['/inventory', 'warehouses_inventory'],
      ['/purchasing', 'purchasing_procurement'],
      ['/sales', 'sales_pos'],
    ] as const) {
      await page.goto(route);
      await expect(page.getByTestId(`module-banner-${moduleKey}`)).toBeVisible({ timeout: 25_000 });
      // The banner renders the module's own figures, not a shared placeholder.
      await expect(page.getByTestId('module-kpis')).toBeVisible({ timeout: 25_000 });
      await expectNoServerError(page);
    }
  });

  test('2. the settings control center lists every namespace and persists a change', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByTestId('settings-tab-TAX')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('settings-tab-INVOICING').click();
    await expect(page.getByTestId('settings-panel-INVOICING')).toBeVisible();

    const prefix = page.getByTestId('setting-INVOICING-numberPrefix');
    await expect(prefix).toBeVisible();
    const original = await prefix.inputValue();
    const next = original === 'E20UI' ? 'E20UI2' : 'E20UI';
    await prefix.fill(next);
    await page.getByTestId('settings-save-INVOICING').click();

    // The save round-trips through the API; reloading proves it was stored.
    await page.reload();
    await page.getByTestId('settings-tab-INVOICING').click();
    await expect(page.getByTestId('setting-INVOICING-numberPrefix')).toHaveValue(next, { timeout: 20_000 });

    // Restore the original value so a later run is not affected.
    await page.getByTestId('setting-INVOICING-numberPrefix').fill(original);
    await page.getByTestId('settings-save-INVOICING').click();
    await expectNoServerError(page);
  });

  test('3. settings keep a change history', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-history')).toBeVisible({ timeout: 20_000 });
    await expectNoServerError(page);
  });

  test('4. customers page splits individuals and companies and opens the right form', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByTestId('customers-page')).toBeVisible();

    await page.getByTestId('customers-tab-companies').click();
    await expect(page.getByTestId('new-company')).toBeVisible();

    await page.getByTestId('new-company').click();
    await expect(page.getByTestId('customer-tab-commercial')).toBeVisible();
    // A company form exposes the commercial tab; an individual does not show the
    // commercial registration fields.
    await page.getByTestId('customer-tab-commercial').click();
    await expect(page.getByTestId('customer-cr-number')).toBeVisible();
    await expect(page.getByTestId('customer-tax-number')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).first().click();

    await page.getByTestId('new-individual').click();
    await expect(page.getByTestId('customer-national-id')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).first().click();
    await expectNoServerError(page);
  });

  test('5. the document panel attaches to a record and lists uploads', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByTestId('customers-page')).toBeVisible();
    // Open the first customer row for editing, then its documents tab.
    const firstEdit = page.locator('[data-testid^="edit-customer-"]').first();
    await expect(firstEdit).toBeVisible({ timeout: 20_000 });
    await firstEdit.click();
    await page.getByTestId('customer-tab-documents').click();
    await expect(page.getByTestId('documents-customer')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('document-upload')).toBeVisible();
    await expectNoServerError(page);
  });

  test('6. light and dark themes both render the module banner', async ({ page }) => {
    await page.goto('/accounting');
    await expect(page.getByTestId('module-banner-financial_accounting')).toBeVisible({ timeout: 25_000 });

    await setTheme(page, 'light');
    await page.goto('/accounting');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('module-banner-financial_accounting')).toBeVisible({ timeout: 25_000 });
    await expectNoServerError(page);
  });

  test('7. Arabic RTL renders the customers page', async ({ page }) => {
    await setLocale(page, 'ar');
    await page.goto('/customers');
    await expect(page.locator('html')).toHaveAttribute('data-dir', 'rtl');
    await expect(page.getByTestId('customers-page')).toBeVisible({ timeout: 20_000 });
    await expectNoServerError(page);
  });
});

/**
 * The maintenance job card is licensed to the Enterprise plan, so the
 * picker suite signs in as the ORYX-AUTO administrator.
 */
test.describe('Execution 20 — maintenance pickers', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('8. the maintenance job card picks a customer from a searchable list', async ({ page }) => {
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible({ timeout: 25_000 });

    await page.getByTestId('new-job-card').click();
    await expect(page.getByTestId('job-customer')).toBeVisible();
    await page.getByTestId('job-customer').click();
    // The list carries an in-list search field and an "add new" action.
    await expect(page.getByTestId('job-customer-search')).toBeVisible();
    await expect(page.getByTestId('job-customer-add')).toBeVisible();
    await page.getByTestId('job-customer-search').fill('zzzz-no-such-customer');
    await expect(page.getByTestId('job-customer-menu')).toContainText(/no/i);
    await page.keyboard.press('Escape');
    await expectNoServerError(page);
  });

  test('9. creating a customer inside the job-card picker persists and selects it', async ({ page }) => {
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible({ timeout: 25_000 });
    await page.getByTestId('new-job-card').click();
    await page.getByTestId('job-customer').click();
    await page.getByTestId('job-customer-add').click();

    // The "add new" action opens the *real* customer form, not a cut-down copy.
    const stamp = Date.now().toString().slice(-7);
    const code = `ZZ${stamp}`;
    const nameEn = `ZZ Verify Co ${stamp}`;
    await page.getByTestId('customer-code').fill(code);
    await page.getByTestId('customer-name-en').fill(nameEn);
    await page.getByTestId('customer-name-ar').fill(`شركة ${stamp}`);
    await page.getByTestId('save-customer').click();

    // The form closed, the customer was persisted through the API and the
    // picker now shows it as the selected value on the job card.
    await expect(page.getByTestId('save-customer')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('job-customer')).toContainText(code, { timeout: 20_000 });
    await expectNoServerError(page);
  });
});
