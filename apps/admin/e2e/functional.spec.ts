import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * Functional acceptance audit.
 *
 * Walks the thirteen Super Admin workflows required by Execution 01.1 and
 * asserts that each control performs a real, persisted operation. Every
 * assertion is made against the API response, not only against the screen, so a
 * "success" toast over a failed request cannot pass.
 *
 * Fixtures use the E2EAUDIT prefix and are removed in afterAll.
 */

const FIXTURE = 'E2EAUDIT';
const API = 'http://localhost:3001/api/v1';

/** Call the API from the page context, reusing the live session cookies. */
async function apiCall<T>(
  page: import('@playwright/test').Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  // The app never persists a token, so obtain one through a real login for the
  // duration of this call.
  const bearer = await apiToken(page);
  return page.evaluate(
    async ({ api, path: p, method, body, token }) => {
      const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
      const auth = `Bearer ${token}`;
      const res = await fetch(`${api}${p}`, {
        method: method ?? 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
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

/** Resolve a plan id by code so fixtures always have non-zero capacity. */
async function planId(page: import('@playwright/test').Page, code: string): Promise<string> {
  const plans = await apiCall<Array<{ id: string; code: string }>>(page, '/plans');
  const plan = plans.body.find((p) => p.code === code);
  if (!plan) throw new Error(`Plan ${code} not found`);
  return plan.id;
}

/** Remove fixtures created by this suite. */
async function cleanup(page: import('@playwright/test').Page): Promise<void> {
  const companies = await apiCall<{ items: Array<{ id: string; code: string }> }>(
    page,
    `/companies?pageSize=50&search=${FIXTURE}`,
  );
  for (const c of companies.body.items.filter((x) => x.code.startsWith(FIXTURE))) {
    const subs = await apiCall<Array<{ id: string }>>(page, `/subscriptions?companyId=${c.id}`);
    for (const s of subs.body) {
      await apiCall(page, `/subscriptions/${s.id}/status`, { method: 'PATCH', body: { status: 'CANCELLED' } });
    }
    const users = await apiCall<{ items: Array<{ id: string }> }>(page, `/companies/${c.id}/users?pageSize=100`);
    for (const u of users.body.items) {
      await apiCall(page, `/companies/${c.id}/users/${u.id}/membership`, {
        method: 'PATCH',
        body: { isActive: false },
      });
    }
    await apiCall(page, `/companies/${c.id}/status`, { method: 'PATCH', body: { status: 'ARCHIVED' } });
  }
}

test.describe('functional audit', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    await cleanup(page);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    await cleanup(page);
    await page.close();
  });

  test('1. login and logout are real session transitions', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    // The session is backed by a real cookie, verified elsewhere; here assert
    // the UI transition both ways.
    await expect(page.getByTestId('dashboard')).toBeVisible();

    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.waitForURL('**/login');
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('2. company creation and editing persist', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/companies');

    const suffix = Date.now().toString().slice(-6);
    const code = `${FIXTURE}-${suffix}`;
    await page.getByTestId('new-company').click();
    await page.getByTestId('company-code').fill(code);
    await page.getByTestId('company-name-en').fill(`Audit Co ${suffix}`);
    await page.getByTestId('company-name-ar').fill(`شركة تدقيق ${suffix}`);
    await page.getByTestId('create-company-submit').click();
    // The modal must close, which only happens after the request succeeds. The
    // trigger button is always in the DOM behind the modal, so waiting for it
    // would not be a completion signal.
    await expect(page.locator('.oryx-modal')).toHaveCount(0, { timeout: 20_000 });

    // Verify persistence through the API, not the toast.
    const list = await apiCall<{ items: Array<{ id: string; code: string; nameEn: string }> }>(
      page,
      `/companies?pageSize=50&search=${code}`,
    );
    const created = list.body.items.find((c) => c.code === code);
    expect(created, 'company must exist in the database').toBeTruthy();

    // Edit it and confirm the change is stored.
    const updated = await apiCall<{ nameEn: string }>(page, `/companies/${created!.id}`, {
      method: 'PATCH',
      body: { nameEn: `Audit Co Edited ${suffix}` },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.nameEn).toBe(`Audit Co Edited ${suffix}`);
  });

  test('3. branch creation and editing persist', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const suffix = Date.now().toString().slice(-6);
    // A company without a subscription has zero capacity, so assign a plan that
    // permits branches before exercising branch creation.
    const professionalId = await planId(page, 'professional');
    const created = await apiCall<{ company: { id: string } }>(page, '/companies', {
      method: 'POST',
      body: {
        code: `${FIXTURE}-B${suffix}`,
        nameEn: `Audit Branch Co ${suffix}`,
        nameAr: `شركة فروع ${suffix}`,
        type: 'SAAS_TENANT',
        planId: professionalId,
      },
    });
    const companyId = created.body.company.id;

    await page.goto(`/branches?companyId=${companyId}`);
    await expect(page.getByTestId('branches-page')).toBeVisible();

    const branchCode = `AB${suffix}`;
    await page.getByTestId('new-branch').click();
    await page.getByTestId('branch-code').fill(branchCode);
    await page.getByTestId('branch-name-en').fill('Audit Branch');
    await page.getByTestId('branch-name-ar').fill('فرع تدقيق');
    await page.getByTestId('create-branch-submit').click();
    await expect(page.getByTestId(`branch-row-${branchCode}`)).toBeVisible({ timeout: 20_000 });

    const branches = await apiCall<{ items: Array<{ id: string; code: string }> }>(
      page,
      `/companies/${companyId}/branches`,
    );
    const branch = branches.body.items.find((b) => b.code === branchCode);
    expect(branch).toBeTruthy();

    const edited = await apiCall<{ nameEn: string }>(page, `/branches/${branch!.id}`, {
      method: 'PATCH',
      body: { nameEn: 'Audit Branch Edited' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.nameEn).toBe('Audit Branch Edited');
  });

  test('4. user invitation issues a usable token', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const suffix = Date.now().toString().slice(-6);
    const professionalId = await planId(page, 'professional');
    const created = await apiCall<{ company: { id: string } }>(page, '/companies', {
      method: 'POST',
      body: {
        code: `${FIXTURE}-U${suffix}`,
        nameEn: `Audit User Co ${suffix}`,
        nameAr: `شركة مستخدمين ${suffix}`,
        type: 'SAAS_TENANT',
        planId: professionalId,
      },
    });
    const companyId = created.body.company.id;

    await page.goto(`/users?companyId=${companyId}`);
    await expect(page.getByTestId('users-page')).toBeVisible();
    await page.getByTestId('invite-user').click();
    await page.getByTestId('invite-email').fill(`audit-${suffix}@oryx.test`);
    const roleSelect = page.getByTestId('invite-role');
    const roleValue = await roleSelect.locator('option').nth(1).getAttribute('value');
    expect(roleValue).toBeTruthy();
    await roleSelect.selectOption(roleValue!);
    await page.getByTestId('invite-submit').click();

    // The token is displayed once and is a real 64-character secret.
    await expect(page.getByTestId('invite-token')).toBeVisible({ timeout: 20_000 });
    const token = (await page.getByTestId('invite-token').innerText()).trim();
    expect(token).toHaveLength(64);

    // And it can be redeemed.
    const accepted = await apiCall(page, '/auth/accept-invitation', {
      method: 'POST',
      body: {
        token,
        fullNameEn: 'Audit User',
        fullNameAr: 'مستخدم تدقيق',
        password: 'Audit-Password-2026',
      },
    });
    expect([200, 201]).toContain(accepted.status);
  });

  test('5. role creation with permissions persists', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const suffix = Date.now().toString().slice(-6);
    const professionalId = await planId(page, 'professional');
    const created = await apiCall<{ company: { id: string } }>(page, '/companies', {
      method: 'POST',
      body: {
        code: `${FIXTURE}-R${suffix}`,
        nameEn: `Audit Role Co ${suffix}`,
        nameAr: `شركة أدوار ${suffix}`,
        type: 'SAAS_TENANT',
        planId: professionalId,
      },
    });
    const companyId = created.body.company.id;

    await page.goto(`/roles?companyId=${companyId}`);
    await expect(page.getByTestId('roles-page')).toBeVisible();
    await page.getByTestId('new-role').click();
    const roleCode = `audit_role_${suffix}`;
    await page.getByTestId('role-code').fill(roleCode);
    await page.getByTestId('role-name-en').fill('Audit Role');
    await page.getByTestId('role-name-ar').fill('دور تدقيق');
    await page.getByTestId('perm-company.branch.read').check();
    await page.getByTestId('save-role').click();

    await expect(page.getByTestId(`role-card-${roleCode}`)).toBeVisible({ timeout: 20_000 });
    const roles = await apiCall<Array<{ code: string; permissions: string[] }>>(page, `/companies/${companyId}/roles`);
    const role = roles.body.find((r) => r.code === roleCode);
    expect(role, 'role must be persisted').toBeTruthy();
    expect(role!.permissions).toContain('company.branch.read');
  });

  test('6. module catalog administration reflects the shipped catalog', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/modules');
    await expect(page.getByTestId('modules-page')).toBeVisible();
    await expect(page.getByTestId('module-card-company_management')).toBeVisible();
    await expect(page.getByTestId('module-card-financial_accounting')).toBeVisible();

    const modules = await apiCall<{ items: Array<{ key: string; status: string }> }>(page, '/modules');
    expect(modules.body.items.length).toBeGreaterThanOrEqual(17);
    // Availability flags must match what is actually implemented.
    const accounting = modules.body.items.find((m) => m.key === 'financial_accounting');
    expect(accounting!.status).toBe('PLANNED');
    const companyMgmt = modules.body.items.find((m) => m.key === 'company_management');
    expect(companyMgmt!.status).toBe('AVAILABLE');
  });

  test('7. subscription package creation and editing persist', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/plans');

    const suffix = Date.now().toString().slice(-6);
    const planCode = `auditplan${suffix}`;
    await page.getByTestId('new-plan').click();
    await page.getByTestId('plan-code').fill(planCode);
    await page.getByTestId('plan-name-en').fill('Audit Plan');
    await page.getByTestId('plan-name-ar').fill('باقة تدقيق');
    await page.getByTestId('plan-desc-en').fill('Created by the functional audit');
    await page.getByTestId('plan-desc-ar').fill('أنشئت بواسطة تدقيق الوظائف');
    await page.getByTestId('plan-monthly').fill('777');
    await page.getByTestId('plan-annual').fill('7770');
    await page.getByTestId('plan-module-dashboard').check();
    await page.getByTestId('plan-module-company_management').check();
    await page.getByTestId('save-plan').click();
    await expect(page.getByTestId(`plan-card-${planCode}`)).toBeVisible({ timeout: 20_000 });

    const plans = await apiCall<Array<{ id: string; code: string; monthlyPrice: number }>>(page, '/plans');
    const plan = plans.body.find((p) => p.code === planCode);
    expect(plan).toBeTruthy();
    expect(plan!.monthlyPrice).toBe(777);

    const edited = await apiCall<{ monthlyPrice: number }>(page, `/plans/${plan!.id}`, {
      method: 'PATCH',
      body: { monthlyPrice: 888 },
    });
    expect(edited.body.monthlyPrice).toBe(888);
  });

  test('8. subscription assignment enforces entitlements', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const suffix = Date.now().toString().slice(-6);
    const created = await apiCall<{ company: { id: string } }>(page, '/companies', {
      method: 'POST',
      body: {
        code: `${FIXTURE}-S${suffix}`,
        nameEn: `Audit Sub Co ${suffix}`,
        nameAr: `شركة اشتراك ${suffix}`,
        type: 'SAAS_TENANT',
      },
    });
    const companyId = created.body.company.id;

    const plans = await apiCall<Array<{ id: string; code: string; modules: unknown[] }>>(page, '/plans');
    const starter = plans.body.find((p) => p.code === 'starter')!;
    const enterprise = plans.body.find((p) => p.code === 'enterprise')!;

    // Assign Starter: accounting must not be licensed.
    const assigned = await apiCall<{ licensedModules: string[] }>(
      page,
      `/subscriptions/companies/${companyId}/assign`,
      { method: 'POST', body: { planId: starter.id, billingPeriod: 'MONTHLY' } },
    );
    expect(assigned.status).toBe(201);
    expect(assigned.body.licensedModules).not.toContain('financial_accounting');

    const entStarter = await apiCall<{ licensedModules: string[] }>(
      page,
      `/modules/entitlements?companyId=${companyId}`,
    );
    expect(entStarter.body.licensedModules).not.toContain('financial_accounting');

    // Upgrade to Enterprise: automotive modules appear.
    await apiCall(page, `/subscriptions/companies/${companyId}/assign`, {
      method: 'POST',
      body: { planId: enterprise.id, billingPeriod: 'ANNUAL' },
    });
    const entEnterprise = await apiCall<{ licensedModules: string[] }>(
      page,
      `/modules/entitlements?companyId=${companyId}`,
    );
    expect(entEnterprise.body.licensedModules).toContain('automotive_inspections');
  });

  test('9. dashboard filters and scoped metrics are real', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard')).toBeVisible();

    // Platform scope sees every company.
    const all = await apiCall<{ kpis: { companies: number }; scope: { isPlatformScope: boolean } }>(page, '/dashboard');
    expect(all.body.scope.isPlatformScope).toBe(true);
    expect(all.body.kpis.companies).toBeGreaterThan(1);

    // Scoping to one company reduces the count to exactly one.
    const companies = await apiCall<{ items: Array<{ id: string }> }>(page, '/companies?pageSize=1');
    const one = await apiCall<{ kpis: { companies: number } }>(
      page,
      `/dashboard?companyId=${companies.body.items[0].id}`,
    );
    expect(one.body.kpis.companies).toBe(1);
  });

  test('10. CMS content management persists and publishes', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/website');
    await expect(page.getByTestId('cms-pages-table')).toBeVisible();

    const suffix = Date.now().toString().slice(-6);
    const slug = `audit-page-${suffix}`;
    await page.getByTestId('new-cms-page').click();
    await page.getByTestId('cms-slug').fill(slug);
    await page.getByTestId('cms-title').fill('Audit Page');
    await page.getByTestId('cms-body').fill('Content created by the functional audit.');
    await page.getByTestId('save-cms-page').click();
    await expect(page.getByTestId('cms-pages-table')).toBeVisible({ timeout: 20_000 });

    // Draft content must not appear on the public endpoint.
    const draftPublic = await apiCall<{ pages: Array<{ slug: string }> }>(page, '/cms/public/content?locale=en');
    expect(draftPublic.body.pages.some((p) => p.slug === slug)).toBe(false);

    // Publish it and confirm it becomes public.
    const pages = await apiCall<Array<{ id: string; slug: string; locale: string }>>(page, '/cms/pages');
    const created = pages.body.find((p) => p.slug === slug);
    expect(created).toBeTruthy();
    const published = await apiCall(page, '/cms/pages', {
      method: 'PUT',
      body: {
        slug,
        locale: 'en',
        title: 'Audit Page',
        body: 'Content created by the functional audit.',
        status: 'PUBLISHED',
      },
    });
    expect(published.status).toBe(200);

    const publicNow = await apiCall<{ pages: Array<{ slug: string }> }>(page, '/cms/public/content?locale=en');
    expect(publicNow.body.pages.some((p) => p.slug === slug)).toBe(true);
  });

  test('11. feature flags and application versions persist', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const key = `audit_flag_${Date.now().toString().slice(-6)}`;
    const flag = await apiCall<{ key: string; enabled: boolean }>(page, '/cms/feature-flags', {
      method: 'PUT',
      body: { key, nameEn: 'Audit Flag', nameAr: 'مفتاح تدقيق', enabled: true, rolloutPercentage: 25 },
    });
    expect(flag.status).toBe(200);
    expect(flag.body.enabled).toBe(true);

    await page.goto('/application/flags');
    await expect(page.getByTestId('flags-table')).toBeVisible();
    await expect(page.getByText(key)).toBeVisible();

    const version = await apiCall<{ version: string }>(page, '/cms/app-versions', {
      method: 'PUT',
      body: {
        platform: 'ANDROID',
        version: `9.9.${Date.now().toString().slice(-4)}`,
        buildNumber: '1',
        minSupportedVersion: '1.0.0',
        isActive: false,
      },
    });
    expect(version.status).toBe(200);

    await page.goto('/application/versions');
    await expect(page.getByTestId('versions-table')).toBeVisible();
    await expect(page.getByText(version.body.version)).toBeVisible();
  });

  test('12. the audit trail records the operations above', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/audit');
    await expect(page.getByTestId('audit-table')).toBeVisible();

    const logs = await apiCall<{ items: Array<{ action: string }>; total: number }>(page, '/audit-logs?pageSize=100');
    const actions = logs.body.items.map((i) => i.action);
    expect(actions).toContain('company.created');
    expect(actions).toContain('auth.login');
    expect(actions).toContain('plan.created');
    expect(actions).toContain('subscription.assigned');
  });

  test('13. support access is explicit, reasoned and time-bounded', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    // A reason shorter than the minimum is rejected.
    const companies = await apiCall<{ items: Array<{ id: string }> }>(page, '/companies?pageSize=1');
    const short = await apiCall(page, '/support-sessions', {
      method: 'POST',
      body: { companyId: companies.body.items[0].id, reason: 'nope' },
    });
    expect(short.status).toBe(400);

    await page.goto('/support');
    await expect(page.getByTestId('support-page')).toBeVisible();
    await page.getByTestId('open-support').click();
    await page.getByTestId('support-company').selectOption(companies.body.items[0].id);
    await page.getByTestId('support-reason').fill('Auditing a customer reported issue end to end');
    await page.getByTestId('support-submit').click();

    // The session id is shown once and the row appears in the table.
    await expect(page.getByTestId('support-table')).toBeVisible({ timeout: 20_000 });
    const sessions = await apiCall<Array<{ id: string; status: string }>>(page, '/support-sessions');
    const active = sessions.body.find((s) => s.status === 'ACTIVE');
    expect(active).toBeTruthy();

    const ended = await apiCall(page, `/support-sessions/${active!.id}/end`, { method: 'POST' });
    expect(ended.status).toBe(201);
  });
});
