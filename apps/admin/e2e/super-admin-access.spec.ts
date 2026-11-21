import { expect, test } from '@playwright/test';
import { SUPER_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * Regression suite for the Super Admin access and sign-in defects.
 *
 * Two defects are pinned here:
 *
 * 1. A platform Super Admin resolved only the eighteen PLATFORM-scope
 *    permissions, so every tenant ERP endpoint answered 403 even after the
 *    operator selected a company. The fix makes a platform principal resolve
 *    the company-scope permissions of its selected tenant context.
 * 2. A leading or trailing space in the email field failed validation with a
 *    400 before the service could trim it, and the login screen reported that
 *    as "invalid email or password".
 *
 * Both are asserted against the live API, not only the screen.
 */

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

test.describe('Super Admin access and sign-in', () => {
  test('signs in when the email carries surrounding whitespace', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(`  ${SUPER_ADMIN.email}  `);
    await page.getByTestId('login-password').fill(SUPER_ADMIN.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await expect(page.getByTestId('dashboard')).toBeVisible();
  });

  test('resolves the full permission catalog once a company is selected', async ({ page }) => {
    await signIn(page);
    const token = await apiToken(page);

    const body = await page.evaluate(
      async ({ api, bearer }) => {
        const auth = { Authorization: `Bearer ${bearer}` };
        const bare = await fetch(`${api}/auth/context`, { headers: auth });
        const bareJson = await bare.json();

        const context = await fetch(`${api}/auth/context`, { headers: auth });
        const companies = (await context.json()).companies as Array<{ id: string; nameEn: string }>;
        const auto = companies.find((c) => c.nameEn === 'ORYX Auto Services');
        if (!auto) return { bare: bareJson.permissions as string[], scoped: [] as string[] };

        const scoped = await fetch(`${api}/auth/context`, {
          headers: { ...auth, 'x-oryx-company-id': auto.id },
        });
        return { bare: bareJson.permissions as string[], scoped: (await scoped.json()).permissions as string[] };
      },
      { api: API, bearer: token },
    );

    // With no tenant context the platform principal holds only its PLATFORM
    // permissions. That baseline is the security boundary, not a defect.
    expect(body.bare).toContain('platform.company.create');
    expect(body.bare).not.toContain('erp.accounting.read');

    // Selecting a company adds the tenant's company-scope permissions.
    expect(body.scoped.length).toBeGreaterThan(100);
    expect(body.scoped).toContain('platform.company.create');
    expect(body.scoped).toContain('erp.accounting.read');
    expect(body.scoped).toContain('erp.sales.read');
    expect(body.scoped).toContain('erp.inventory.read');
  });

  test('reaches a tenant ERP endpoint after selecting a company', async ({ page }) => {
    await signIn(page);
    const token = await apiToken(page);

    const result = await page.evaluate(
      async ({ api, bearer }) => {
        const auth = { Authorization: `Bearer ${bearer}` };
        const contextRes = await fetch(`${api}/auth/context`, { headers: auth });
        const context = await contextRes.json();
        const company = (context.companies as Array<{ id: string; nameEn: string }>).find(
          (c) => c.nameEn === 'ORYX Auto Services',
        );
        if (!company) return { companyId: null, status: 0 };

        const res = await fetch(`${api}/accounting/accounts`, {
          headers: { ...auth, 'x-oryx-company-id': company.id },
        });
        return { companyId: company.id, status: res.status };
      },
      { api: API, bearer: token },
    );

    expect(result.companyId).toBeTruthy();
    expect(result.status).toBe(200);
  });

  test('still refuses tenant data when no company context is selected', async ({ page }) => {
    await signIn(page);
    const token = await apiToken(page);

    const status = await page.evaluate(
      async ({ api, bearer }) => {
        const res = await fetch(`${api}/accounting/accounts`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        return res.status;
      },
      { api: API, bearer: token },
    );

    // A platform principal with no tenant context has no tenant permissions.
    // This is the boundary that keeps "select a company" meaningful.
    expect(status).toBe(403);
  });

  test('masks the password by default and reveals it through the toggle', async ({ page }) => {
    await page.goto('/login');

    const password = page.getByTestId('login-password');
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByTestId('login-password-toggle').click();
    await expect(password).toHaveAttribute('type', 'text');

    await page.getByTestId('login-password-toggle').click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('offers the password-change form on the security screen', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/security');

    await expect(page.getByTestId('password-card')).toBeVisible();
    await expect(page.getByTestId('password-current')).toHaveAttribute('type', 'password');
    await expect(page.getByTestId('password-new')).toHaveAttribute('type', 'password');

    // A local mismatch must be reported without a round trip and without
    // navigating away from the form.
    const card = page.getByTestId('password-card');
    await page.getByTestId('password-current').fill(SUPER_ADMIN.password);
    await page.getByTestId('password-new').fill('a-long-enough-new-password');
    await page.getByTestId('password-confirm').fill('a-different-new-password');
    await page.getByTestId('password-submit').click();

    await expect(card.getByRole('alert')).toContainText('do not match');
    await expect(page).toHaveURL(/\/security$/);

    // The toggle reveals the value without altering what was typed.
    await page.getByTestId('password-new-toggle').click();
    await expect(page.getByTestId('password-new')).toHaveAttribute('type', 'text');
    await expect(page.getByTestId('password-new')).toHaveValue('a-long-enough-new-password');
  });
});
