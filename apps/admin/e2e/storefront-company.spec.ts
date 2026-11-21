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

  test('a company administrator never sees the platform card', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await page.goto(SETTINGS_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(CARD)).toHaveCount(0);
  });
});
