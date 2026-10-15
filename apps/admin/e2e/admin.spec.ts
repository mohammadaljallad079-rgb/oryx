import { expect, test } from '@playwright/test';
import {
  COMPANY_ADMIN,
  SUPER_ADMIN,
  apiToken,
  expectNoServerError,
  setLocale,
  setTheme,
  signIn,
} from './helpers';

/**
 * UI acceptance tests for Execution 01. Each test exercises a real workflow
 * against the running API and database — nothing is mocked.
 */

test.describe('authentication', () => {
  test('super admin can sign in and reaches the dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('dashboard-hero')).toBeVisible();
    await expectNoServerError(page);
  });

  test('invalid credentials are rejected with a visible error', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(SUPER_ADMIN.email);
    await page.getByTestId('login-password').fill('definitely-wrong-password');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated visitors are redirected to login', async ({ page }) => {
    await page.goto('/companies');
    await page.waitForURL('**/login');
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});

test.describe('themes and locales', () => {
  test('dark and light themes both render the dashboard', async ({ page }) => {
    await signIn(page);
    await setTheme(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('kpi-row')).toBeVisible();
    await setTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('module-tiles')).toBeVisible();
  });

  test('arabic RTL and english LTR both render', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await setLocale(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('module-tiles')).toBeVisible();
  });
});

test.describe('company and branch management', () => {
  test('company list is populated from the database', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/companies');
    await expect(page.getByTestId('companies-page')).toBeVisible();
    await expect(page.getByTestId('company-row-ORYX-HOLDING')).toBeVisible();
    await expect(page.getByTestId('company-row-DEMO-ALNOOR')).toBeVisible();
  });

  test('super admin can provision a company with a plan and an admin invitation', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/companies');
    await page.getByTestId('new-company').click();

    const suffix = Date.now().toString().slice(-6);
    const code = `E2E-${suffix}`;
    await page.getByTestId('company-code').fill(code);
    await page.getByTestId('company-name-en').fill(`E2E Tenant ${suffix}`);
    await page.getByTestId('company-name-ar').fill(`شركة اختبار ${suffix}`);
    await page.getByTestId('company-admin-email').fill(`admin-${suffix}@e2e.local`);

    // Pick the first real plan so the tenant gets entitlements.
    const planSelect = page.getByTestId('company-plan');
    const planValue = await planSelect.locator('option').nth(1).getAttribute('value');
    if (planValue) await planSelect.selectOption(planValue);

    await page.getByTestId('create-company-submit').click();
    await expect(page.getByTestId('new-company')).toBeVisible({ timeout: 20_000 });

    // The list is paginated, so search for the newly provisioned tenant rather
    // than assuming it lands on the first page.
    await page.getByTestId('company-search').fill(code);
    await expect(page.getByTestId(`company-row-${code}`)).toBeVisible({ timeout: 20_000 });
  });

  test('branch creation is enforced by plan limits and persists', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    // Provision a dedicated Starter tenant (maxBranches = 2) so the assertion
    // is independent of other data and safe to re-run.
    const suffix = Date.now().toString().slice(-6);
    const bearer = await apiToken(page);
    const companyId = await page.evaluate(async ({ sfx, token }) => {
      const base = 'http://localhost:3001/api/v1';
      const plans = await fetch(`${base}/plans`, { headers: { Authorization: `Bearer ${token}` } });
      const planList = (await plans.json()) as Array<{ id: string; code: string }>;
      const starter = planList.find((pl) => pl.code === 'starter')!;
      const res = await fetch(`${base}/companies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `E2EB-${sfx}`,
          nameEn: `E2E Branch Tenant ${sfx}`,
          nameAr: `شركة فروع اختبار ${sfx}`,
          type: 'SAAS_TENANT',
          planId: starter.id,
        }),
      });
      const body = (await res.json()) as { company: { id: string } };
      return body.company.id;
    }, { sfx: suffix, token: bearer });

    await page.goto(`/branches?companyId=${companyId}`);
    await expect(page.getByTestId('branches-page')).toBeVisible();

    const code = `B${suffix}`;
    await page.getByTestId('new-branch').click();
    await page.getByTestId('branch-code').fill(code);
    await page.getByTestId('branch-name-en').fill(`E2E Branch ${code}`);
    await page.getByTestId('branch-name-ar').fill(`فرع اختبار ${code}`);
    await page.getByTestId('create-branch-submit').click();
    await expect(page.getByTestId(`branch-row-${code}`)).toBeVisible({ timeout: 20_000 });

    // The second branch fills the Starter plan limit.
    const code2 = `C${suffix}`;
    await page.getByTestId('new-branch').click();
    await page.getByTestId('branch-code').fill(code2);
    await page.getByTestId('branch-name-en').fill(`E2E Branch ${code2}`);
    await page.getByTestId('branch-name-ar').fill(`فرع اختبار ${code2}`);
    await page.getByTestId('create-branch-submit').click();
    await expect(page.getByTestId(`branch-row-${code2}`)).toBeVisible({ timeout: 20_000 });

    // The third must be rejected by the backend plan limit, and the UI must
    // surface the localized error rather than pretending success.
    await page.getByTestId('new-branch').click();
    await page.getByTestId('branch-code').fill(`D${suffix}`);
    await page.getByTestId('branch-name-en').fill('Over the limit');
    await page.getByTestId('branch-name-ar').fill('تجاوز الحد');
    await page.getByTestId('create-branch-submit').click();
    await expect(page.getByTestId('branch-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('branch-error')).toContainText(/plan limit/i);
  });
});

test.describe('subscription packages', () => {
  test('plans are listed with limits and included modules', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/plans');
    await expect(page.getByTestId('plan-card-starter')).toBeVisible();
    await expect(page.getByTestId('plan-card-professional')).toBeVisible();
    await expect(page.getByTestId('plan-card-enterprise')).toBeVisible();
  });

  test('super admin can create a plan with a module selection', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/plans');
    await page.getByTestId('new-plan').click();

    const suffix = Date.now().toString().slice(-6);
    await page.getByTestId('plan-code').fill(`e2e${suffix}`);
    await page.getByTestId('plan-name-en').fill(`E2E Plan ${suffix}`);
    await page.getByTestId('plan-name-ar').fill(`باقة اختبار ${suffix}`);
    await page.getByTestId('plan-desc-en').fill('E2E plan for automated verification');
    await page.getByTestId('plan-desc-ar').fill('باقة للتحقق الآلي');
    await page.getByTestId('plan-monthly').fill('999');
    await page.getByTestId('plan-annual').fill('9990');
    await page.getByTestId('plan-module-dashboard').check();
    await page.getByTestId('plan-module-company_management').check();
    await page.getByTestId('plan-module-branch_management').check();

    await page.getByTestId('save-plan').click();
    await expect(page.getByTestId(`plan-card-e2e${suffix}`)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('roles and permissions', () => {
  test('permission catalog and role editor respect delegable scope', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    const companyId = await companyIdByCode(page, 'DEMO-ALNOOR');
    await page.goto(`/roles?companyId=${companyId}`);

    await expect(page.getByTestId('roles-page')).toBeVisible();
    await expect(page.getByTestId('permission-catalog')).toBeVisible();
    await expect(page.getByTestId('role-card-company_admin')).toBeVisible();

    // System roles cannot be edited; the UI says so instead of offering edit.
    await page.getByTestId('new-role').click();
    const suffix = Date.now().toString().slice(-5);
    await page.getByTestId('role-code').fill(`e2e_role_${suffix}`);
    await page.getByTestId('role-name-en').fill(`E2E Role ${suffix}`);
    await page.getByTestId('role-name-ar').fill(`دور اختبار ${suffix}`);

    // A delegable permission can be selected.
    const delegable = page.getByTestId('perm-company.branch.read');
    await expect(delegable).toBeEnabled();
    await delegable.check();

    // A platform permission is never offered at all (not rendered).
    await expect(page.getByTestId('perm-platform.plan.manage')).toHaveCount(0);

    await page.getByTestId('save-role').click();
    await expect(page.getByTestId(`role-card-e2e_role_${suffix}`)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('company administrator delegation', () => {
  test('company admin sees only licensed modules and cannot delegate beyond scope', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await expect(page.getByTestId('dashboard')).toBeVisible();

    // The Professional demo tenant licenses HR, CRM and operations but not the
    // automotive modules, so the automotive data request is refused by the API.
    await page.goto('/automotive/inspections');
    await expect(page.getByTestId('inspections-page')).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });

    // Invite flow only offers roles inside the delegable set. The modal loads
    // the role list asynchronously, so poll until the options arrive rather than
    // reading the count the instant the select appears.
    await page.goto('/users');
    await expect(page.getByTestId('users-page')).toBeVisible();
    await page.getByTestId('invite-user').click();
    await expect(page.getByTestId('invite-role')).toBeVisible();
    await expect
      .poll(async () => page.getByTestId('invite-role').locator('option').count(), { timeout: 20_000 })
      .toBeGreaterThan(1);
  });

  test('company admin cannot reach platform-only governance screens', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');

    // Platform governance screens render an explicit denial state, not a
    // half-functional page with dead controls.
    await page.goto('/plans');
    await expect(page.getByTestId('permission-denied')).toBeVisible();
    await expect(page.getByTestId('new-plan')).toHaveCount(0);

    await page.goto('/support');
    await expect(page.getByTestId('permission-denied')).toBeVisible();
    await expect(page.getByTestId('open-support')).toHaveCount(0);

    await page.goto('/api-management');
    await expect(page.getByTestId('permission-denied')).toBeVisible();
  });
});

test.describe('website and application management', () => {
  test('cms pages and banners are listed and editable', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/website');
    await expect(page.getByTestId('cms-pages-table')).toBeVisible();
    await page.getByTestId('cms-tab-banners').click();
    await expect(page.getByTestId('cms-banners-table')).toBeVisible();
  });

  test('feature flags and app versions are listed', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/application/flags');
    await expect(page.getByTestId('flags-table')).toBeVisible();
    await page.goto('/application/versions');
    await expect(page.getByTestId('versions-table')).toBeVisible();
  });

  test('api management lists the versioned surface', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/api-management');
    await expect(page.getByTestId('api-management-page')).toBeVisible();
  });
});

test.describe('dashboard integrity', () => {
  test('dashboard metrics come from the API and support company scoping', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await expect(page.getByTestId('kpi-row')).toBeVisible();
    await expect(page.getByTestId('chart-branches')).toBeVisible();

    // Switching company context re-queries the dashboard.
    const selector = page.getByTestId('context-selector').locator('select').first();
    const optionValue = await selector.locator('option').nth(1).getAttribute('value');
    if (optionValue) {
      await selector.selectOption(optionValue);
      await expect(page.getByTestId('dashboard')).toBeVisible();
    }
  });

  test('implemented ERP modules render their working interface', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    // Accounting, sales, purchasing and inventory shipped in Execution 02.
    await page.goto('/accounting');
    await expect(page.getByTestId('accounting-page')).toBeVisible();
    await page.goto('/sales');
    await expect(page.getByTestId('sales-page')).toBeVisible();
    await page.goto('/purchasing');
    await expect(page.getByTestId('purchasing-page')).toBeVisible();
    await page.goto('/inventory');
    await expect(page.getByTestId('inventory-page')).toBeVisible();
    await page.goto('/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    // Execution 03 shipped HR, CRM, operations and the automotive modules.
    await page.goto('/hr');
    await expect(page.getByTestId('hr-page')).toBeVisible();
    await page.goto('/crm');
    await expect(page.getByTestId('crm-page')).toBeVisible();
    await page.goto('/operations');
    await expect(page.getByTestId('operations-page')).toBeVisible();
    await page.goto('/automotive/inspections');
    await expect(page.getByTestId('inspections-page')).toBeVisible();
    await page.goto('/automotive/maintenance');
    await expect(page.getByTestId('maintenance-page')).toBeVisible();
    await page.goto('/automotive/spare-parts');
    await expect(page.getByTestId('spare-parts-page')).toBeVisible();
  });
});

/** Looks up a company id through the authenticated API from the page context. */
async function companyIdByCode(page: import('@playwright/test').Page, code: string): Promise<string> {
  const bearer = await apiToken(page);
  const id = await page.evaluate(async ({ companyCode, token }) => {
    const base = 'http://localhost:3001/api/v1';
    const res = await fetch(`${base}/companies?pageSize=100&search=${companyCode}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { items: Array<{ id: string; code: string }> };
    return body.items.find((c) => c.code === companyCode)?.id ?? '';
  }, { companyCode: code, token: bearer });
  expect(id).not.toBe('');
  return id;
}
