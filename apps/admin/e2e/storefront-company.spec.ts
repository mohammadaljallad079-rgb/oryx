import { expect, test, type Page } from '@playwright/test';

import { COMPANY_ADMIN, SUPER_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * The public website trades for exactly one company, and a Super Admin names it.
 *
 * These checks cover the control-panel half of that rule: the card exists, it
 * reflects the tenant the site is serving right now, saving it moves the site,
 * and a company administrator never sees it. The website half — that the
 * catalogue is scoped to that tenant — is asserted against the API in
 * `apps/api/test/storefront-tenant.e2e-spec.ts`.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';
const CARD = '[data-testid="storefront-company-card"]';
const SELECT = '[data-testid="storefront-company-select"]';
const SETTINGS_URL = '/website/settings';

interface SiteContext {
  companyId: string;
  nameEn: string;
}

const readContext = (page: Page) =>
  page.evaluate(async (api) => {
    // `omit` keeps the refresh cookie off the request: these calls carry their
    // own bearer token, and CsrfGuard would otherwise demand the double-submit
    // header for the unsafe one.
    const res = await fetch(`${api}/storefront/context`, { credentials: 'omit' });
    return (await res.json()) as { companyId: string; nameEn: string };
  }, API);

test.describe('Website storefront company', () => {
  test('a Super Admin sees the company the website serves', async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await page.goto(SETTINGS_URL);

    await expect(page.locator(CARD)).toBeVisible();
    await expect(page.getByText('Storefront company', { exact: false })).toBeVisible();

    // The picker preselects the stored choice, and the hint names the tenant the
    // public API is serving, so the two cannot drift apart.
    const selected = await page.locator(SELECT).inputValue();
    const serving = await readContext(page);
    expect(serving.companyId).toBeTruthy();
    expect(selected === '' || selected === serving.companyId).toBe(true);
  });

  test('saving another company moves the website, and saving it back restores it', async ({
    page,
  }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await page.goto(SETTINGS_URL);
    await expect(page.locator(CARD)).toBeVisible();

    const token = await apiToken(page);
    const original: SiteContext = await readContext(page);

    const options = await page.locator(`${SELECT} option`).evaluateAll((nodes) =>
      nodes.map((node) => ({
        value: (node as HTMLOptionElement).value,
        label: node.textContent ?? '',
      })),
    );
    const target = options.find((option) => option.value && option.value !== original.companyId);
    expect(target, 'the seeded platform needs a second company to switch to').toBeTruthy();

    try {
      await page.locator(SELECT).selectOption(target!.value);
      await page.locator('[data-testid="storefront-company-save"]').click();
      await expect(page.locator('[data-testid="storefront-company-saved"]')).toBeVisible();

      await expect.poll(async () => (await readContext(page)).companyId).toBe(target!.value);
    } finally {
      const restored = await page.evaluate(
        async ({ api, bearer, companyId }) => {
          const res = await fetch(`${api}/platform/settings`, {
            method: 'PATCH',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
            body: JSON.stringify({ storefrontCompanyId: companyId }),
          });
          return res.status;
        },
        { api: API, bearer: token, companyId: original.companyId },
      );
      expect(restored).toBe(200);
    }

    await expect.poll(async () => (await readContext(page)).companyId).toBe(original.companyId);
  });

  test('the rendered website catalogue follows the chosen company', async ({ page, browser }) => {
    // The API assertions live in the e2e suite; this one proves the *page* a
    // visitor loads changes too, which is what the owner actually asked for.
    // Product ids are per tenant, so the id set is what distinguishes them —
    // the seeded catalogue repeats the same product names in every company.
    const CUSTOMER = process.env.ORYX_CUSTOMER_URL ?? 'http://localhost:3002';

    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await page.goto(SETTINGS_URL);
    await expect(page.locator(CARD)).toBeVisible();

    const token = await apiToken(page);
    const original = await readContext(page);

    const idsFor = (companyId: string) =>
      page.evaluate(
        async ({ api, companyId }) => {
          const res = await fetch(
            `${api}/customer/catalog/products?companyId=${companyId}&pageSize=100`,
            { credentials: 'omit' },
          );
          const body = (await res.json()) as { items: Array<{ id: string }> };
          return body.items.map((item) => item.id);
        },
        { api: API, companyId },
      );

    const site = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
    const sitePage = await site.newPage();
    const renderedIds = async () => {
      await sitePage.goto(`${CUSTOMER}/products`, { waitUntil: 'networkidle' });
      await sitePage.locator('.oryx-product-card').first().waitFor();
      return sitePage.locator('.oryx-product-card__media').evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')?.split('/').pop() ?? ''),
      );
    };

    const options = await page.locator(`${SELECT} option`).evaluateAll((nodes) =>
      nodes.map((node) => ({ value: (node as HTMLOptionElement).value })),
    );
    const target = options.find((option) => option.value && option.value !== original.companyId);
    expect(target, 'the seeded platform needs a second company to switch to').toBeTruthy();

    try {
      const originalIds = await idsFor(original.companyId);
      const before = await renderedIds();
      expect(before.length).toBeGreaterThan(0);
      expect(before.every((id) => originalIds.includes(id))).toBe(true);

      await page.locator(SELECT).selectOption(target!.value);
      await page.locator('[data-testid="storefront-company-save"]').click();
      await expect(page.locator('[data-testid="storefront-company-saved"]')).toBeVisible();

      const targetIds = await idsFor(target!.value);
      const after = await renderedIds();
      expect(after.length).toBeGreaterThan(0);
      expect(after.every((id) => targetIds.includes(id))).toBe(true);
      expect(after.some((id) => originalIds.includes(id))).toBe(false);
    } finally {
      await page.evaluate(
        async ({ api, bearer, companyId }) => {
          await fetch(`${api}/platform/settings`, {
            method: 'PATCH',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
            body: JSON.stringify({ storefrontCompanyId: companyId }),
          });
        },
        { api: API, bearer: token, companyId: original.companyId },
      );
      await site.close();
    }
  });

  test('a company administrator never sees the platform card', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await page.goto(SETTINGS_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
