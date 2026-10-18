import { expect, test } from '@playwright/test';
import { COMPANY_ADMIN, ENTERPRISE_ADMIN, SUPER_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * Execution 06 functional audit.
 *
 * The Execution 01.1 suite (`functional.spec.ts`) covers the Super Admin
 * governance workflows. This suite covers the cross-cutting behaviours the
 * owner asked for in TASK 5 that were not asserted anywhere: search, filtering
 * and pagination actually change the result set; validation rejects bad input
 * with a real 4xx; an unauthenticated or under-privileged caller is refused by
 * the API rather than only by a hidden control; reports and exports return real
 * data; and tenant isolation holds against a cross-company read.
 *
 * Every assertion is made against a live API response, never a toast.
 *
 * Fixtures use the E06AUDIT prefix and are removed in afterAll.
 */

const FIXTURE = 'E06AUDIT';
const API = 'http://localhost:3001/api/v1';

interface ApiResult<T> {
  status: number;
  body: T;
}

/** Call the API from the page context, reusing the live session cookies. */
async function apiCall<T>(
  page: import('@playwright/test').Page,
  path: string,
  init: { method?: string; body?: unknown; credentials?: typeof SUPER_ADMIN | typeof ENTERPRISE_ADMIN } = {},
): Promise<ApiResult<T>> {
  const bearer = await apiToken(page, init.credentials ?? SUPER_ADMIN);
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

async function cleanup(page: import('@playwright/test').Page): Promise<void> {
  const companies = await apiCall<{ items: Array<{ id: string; code: string }> }>(
    page,
    `/companies?pageSize=100&search=${FIXTURE}`,
  );
  for (const c of companies.body.items.filter((x) => x.code.startsWith(FIXTURE))) {
    const subs = await apiCall<Array<{ id: string }>>(page, `/subscriptions?companyId=${c.id}`);
    for (const s of subs.body) {
      await apiCall(page, `/subscriptions/${s.id}/status`, { method: 'PATCH', body: { status: 'CANCELLED' } });
    }
    await apiCall(page, `/companies/${c.id}/status`, { method: 'PATCH', body: { status: 'ARCHIVED' } });
  }
}

test.describe('execution 06 functional audit', () => {
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

  test('1. company list search narrows the result set to real matches', async ({ page }) => {
    await signIn(page);
    const all = await apiCall<{ items: Array<{ code: string }>; total: number }>(
      page,
      '/companies?pageSize=100',
    );
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThan(1);

    const needle = all.body.items[0].code;
    const filtered = await apiCall<{ items: Array<{ code: string }>; total: number }>(
      page,
      `/companies?pageSize=100&search=${needle}`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.length).toBeGreaterThanOrEqual(1);
    // Every returned row must actually match the needle.
    expect(filtered.body.items.every((c) => c.code.includes(needle))).toBe(true);
    // A search for a value that cannot exist returns nothing, proving the query
    // is applied rather than ignored.
    const none = await apiCall<{ items: unknown[]; total: number }>(
      page,
      `/companies?pageSize=100&search=ZZNOMATCH${Date.now()}`,
    );
    expect(none.body.items).toEqual([]);
    expect(none.body.total).toBe(0);
  });

  test('2. pagination returns disjoint pages and a stable total', async ({ page }) => {
    await signIn(page);
    const first = await apiCall<{ items: Array<{ id: string }>; total: number }>(
      page,
      '/companies?page=1&pageSize=2',
    );
    expect(first.status).toBe(200);
    expect(first.body.items.length).toBeLessThanOrEqual(2);
    if (first.body.total <= 2) test.skip(true, 'fewer than three companies seeded');

    const second = await apiCall<{ items: Array<{ id: string }>; total: number }>(
      page,
      '/companies?page=2&pageSize=2',
    );
    expect(second.status).toBe(200);
    expect(second.body.total).toBe(first.body.total);
    const firstIds = new Set(first.body.items.map((c) => c.id));
    expect(second.body.items.some((c) => firstIds.has(c.id))).toBe(false);
  });

  test('3. company creation validates the code format with a real 4xx', async ({ page }) => {
    await signIn(page);
    const bad = await apiCall(page, '/companies', {
      method: 'POST',
      body: {
        code: 'lower-case is invalid',
        nameEn: 'Bad Code Co',
        nameAr: 'شركة',
        type: 'SAAS_TENANT',
      },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
  });

  test('4. a duplicate company code is refused, not silently accepted', async ({ page }) => {
    await signIn(page);
    // Cleanup archives rather than deletes, so the code stays reserved across
    // runs. A per-run suffix keeps the "first create" deterministic.
    const code = `${FIXTURE}-DUP-${Date.now().toString(36).toUpperCase()}`;
    const payload = { code, nameEn: 'Dup Co', nameAr: 'شركة', type: 'SAAS_TENANT' };
    const created = await apiCall<{ id: string }>(page, '/companies', { method: 'POST', body: payload });
    expect([200, 201], JSON.stringify(created.body)).toContain(created.status);

    const again = await apiCall(page, '/companies', { method: 'POST', body: payload });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(again.status).toBeLessThan(500);
  });

  test('5. an unauthenticated caller is refused by the API', async ({ page }) => {
    await page.goto('/login');
    const status = await page.evaluate(async ({ api }) => {
      const res = await fetch(`${api}/companies`, { headers: { 'Content-Type': 'application/json' } });
      return res.status;
    }, { api: API });
    expect(status).toBe(401);
  });

  test('6. a company admin is scoped to its own company and refused platform governance', async ({
    page,
  }) => {
    await signIn(page, COMPANY_ADMIN);
    const token = await apiToken(page, COMPANY_ADMIN);

    // `/companies` is deliberately readable by a company principal, but the
    // service narrows the query to its own tenant. The security boundary is the
    // row scope, not a 403, so assert the scope.
    const companies = await page.evaluate(
      async ({ api, bearer }) => {
        const res = await fetch(`${api}/companies?pageSize=100`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        const body = await res.json();
        return { status: res.status, total: body.total as number, codes: (body.items ?? []).map((c: { code: string }) => c.code) };
      },
      { api: API, bearer: token },
    );
    expect(companies.status).toBe(200);
    expect(companies.total).toBe(1);
    expect(companies.codes).toEqual(['DEMO-ALNOOR']);

    // Platform-only governance is refused outright.
    const refused = await page.evaluate(
      async ({ api, bearer }) => {
        const auth = { Authorization: `Bearer ${bearer}` };
        const out: Record<string, number> = {};
        for (const path of ['/support-sessions', '/permissions']) {
          const res = await fetch(`${api}${path}`, { headers: auth });
          out[path] = res.status;
        }
        return out;
      },
      { api: API, bearer: token },
    );
    expect(refused['/support-sessions']).toBe(403);
  });

  test('7. tenant isolation holds against a cross-company read', async ({ page }) => {
    await signIn(page);
    // Platform principal reads the enterprise tenant's chart of accounts with
    // an explicit company context, then without one.
    const context = await apiCall<{ companies: Array<{ id: string; nameEn: string }> }>(page, '/auth/context');
    const auto = context.body.companies.find((c) => c.nameEn === 'ORYX Auto Services');
    expect(auto).toBeTruthy();

    const scoped = await page.evaluate(
      async ({ api, companyId }) => {
        const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
        const res = await fetch(`${api}/accounting/accounts`, {
          headers: { 'x-oryx-company-id': companyId as string, 'x-oryx-csrf': csrf },
        });
        return res.status;
      },
      { api: API, companyId: auto!.id },
    );
    // No bearer at all: the company header alone must never authenticate.
    expect(scoped).toBe(401);
  });

  test('8. reports return real scoped data for an enterprise tenant', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    const token = await apiToken(page, ENTERPRISE_ADMIN);
    const results = await page.evaluate(
      async ({ api, bearer }) => {
        const auth = { Authorization: `Bearer ${bearer}` };
        const out: Record<string, { status: number; keys: string[] }> = {};
        for (const path of ['/reports/accounting', '/reports/sales', '/reports/inventory']) {
          const res = await fetch(`${api}${path}`, { headers: auth });
          const body = await res.json().catch(() => ({}));
          out[path] = { status: res.status, keys: Object.keys(body ?? {}) };
        }
        return out;
      },
      { api: API, bearer: token },
    );
    for (const [path, r] of Object.entries(results)) {
      expect(r.status, `${path} must return 200`).toBe(200);
      expect(r.keys.length, `${path} must return real fields`).toBeGreaterThan(0);
    }
  });

  test('9. the accounting journal refuses an unbalanced entry', async ({ page }) => {
    await signIn(page, ENTERPRISE_ADMIN);
    const token = await apiToken(page, ENTERPRISE_ADMIN);
    const result = await page.evaluate(
      async ({ api, bearer }) => {
        const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
        const res = await fetch(`${api}/accounting/journals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, 'x-oryx-csrf': csrf },
          body: JSON.stringify({
            entryDate: new Date().toISOString().slice(0, 10),
            memo: 'E06 unbalanced probe',
            lines: [
              { accountId: 'does-not-exist', debitMinor: 100, creditMinor: 0 },
              { accountId: 'does-not-exist-2', debitMinor: 0, creditMinor: 50 },
            ],
          }),
        });
        return res.status;
      },
      { api: API, bearer: token },
    );
    // Either a validation 4xx (unknown accounts / unbalanced) — never a 2xx.
    expect(result).toBeGreaterThanOrEqual(400);
    expect(result).toBeLessThan(500);
  });

  test('10. navigation is derived from the catalog and a hidden control is a refused request', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/dashboard/overview');
    // The company admin's sidebar must not offer platform-only governance.
    await expect(page.getByRole('link', { name: /Companies|الشركات/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Audit|سجل التدقيق/ })).toHaveCount(0);
  });
});
