import { expect, request, test } from '@playwright/test';
import { SUPER_ADMIN, expectNoServerError, setLocale, setTheme, signIn } from './helpers';

/**
 * Store or clear BenefitPay credentials through the real API.
 *
 * This runs from Node in a cookie-less context: the request carries only the
 * bearer token, so CsrfGuard has no ambient cookie to protect and the call is
 * deterministic. Doing it from inside the page instead would race the page's
 * own refresh rotation.
 */
async function setBenefitPayCredentials(values: {
  merchantId: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  webhookSecret: string;
}): Promise<void> {
  // Build absolute URLs: Playwright resolves a leading-slash path against the
  // baseURL's origin, which would silently drop the /api/v1 prefix.
  const api = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

  const loginCtx = await request.newContext();
  let token: string;
  try {
    const login = await loginCtx.post(`${api}/auth/login`, {
      data: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
    });
    expect(login.ok(), `login failed with ${login.status()}`).toBe(true);
    token = ((await login.json()) as { accessToken: string }).accessToken;
  } finally {
    await loginCtx.dispose();
  }

  const ctx = await request.newContext();
  try {
    const res = await ctx.put(`${api}/integrations/BENEFITPAY/credentials`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        credentials: [
          { key: 'BENEFITPAY_MERCHANT_ID', value: values.merchantId },
          { key: 'BENEFITPAY_API_KEY', value: values.apiKey },
          { key: 'BENEFITPAY_API_SECRET', value: values.apiSecret },
          { key: 'BENEFITPAY_BASE_URL', value: values.baseUrl },
          { key: 'BENEFITPAY_WEBHOOK_SECRET', value: values.webhookSecret },
        ],
      },
    });
    expect(res.ok(), `credential write failed with ${res.status()}`).toBe(true);
  } finally {
    await ctx.dispose();
  }
}

/** Throwaway sandbox strings, not live bank credentials. */
const BENEFITPAY_TEST_CREDENTIALS = {
  merchantId: 'MERCHANT-E2E-0001',
  apiKey: 'key-e2e-00000001',
  apiSecret: 'secret-e2e-00000001',
  baseUrl: 'https://sandbox.benefitpay.example',
  webhookSecret: 'whsec-e2e-00000001',
};

const BENEFITPAY_CLEARED = {
  merchantId: '',
  apiKey: '',
  apiSecret: '',
  baseUrl: '',
  webhookSecret: '',
};

/**
 * Execution 05 — External Integrations Center acceptance.
 *
 * The center is a platform-governance screen, so the suite signs in as the
 * Super Admin. Every assertion drives the real API through the UI; a page that
 * rendered while its request failed would show the error banner and fail here.
 *
 * The central claim under test is honesty: a provider that holds credentials
 * but has never completed a verified call must not be presented as working.
 */
test.describe('Execution 05 — external integrations center', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SUPER_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
  });

  test('1. lists every provider from the shared catalog with derived state', async ({ page }) => {
    await page.goto('/integrations');
    await expect(page.getByTestId('integrations-page')).toBeVisible();
    await expect(page.getByTestId('integrations-table')).toBeVisible({ timeout: 20_000 });

    // Internal providers need no credentials and are therefore operational.
    await expect(page.getByTestId('integration-row-CASH')).toBeVisible();
    await expect(page.getByTestId('integration-row-BENEFITPAY')).toBeVisible();
    await expect(page.getByTestId('integration-row-EMAIL')).toBeVisible();
    await expectNoServerError(page);
  });

  test('2. never shows a gateway as operational before it is configured', async ({ page }) => {
    await page.goto('/integrations');
    const row = page.getByTestId('integration-row-BENEFITPAY');
    await expect(row).toBeVisible({ timeout: 20_000 });

    // "Operational" is the only green state; an unconfigured gateway must not
    // carry it. The row text names the awaiting state instead.
    await expect(row).toContainText(/awaiting credentials/i);
    await expect(row).not.toContainText(/operational/i);
  });

  test('3. reports the providers blocking production readiness', async ({ page }) => {
    await page.goto('/integrations');
    await expect(page.getByTestId('integration-summary-total')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('integration-summary-operational')).toBeVisible();
    await expect(page.getByTestId('integration-summary-awaiting')).toBeVisible();
    await expect(page.locator('body')).toContainText(/blocks production readiness/i);
  });

  test('4. opens a provider, exposes its credential form and refuses a useless enable', async ({
    page,
  }) => {
    await page.goto('/integrations');
    await page.getByTestId('integration-row-BENEFITPAY').getByRole('button').click();

    // The credential fields are real inputs, one per catalog credential.
    await expect(page.getByTestId('credential-BENEFITPAY_API_KEY')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('credential-BENEFITPAY_API_SECRET')).toBeVisible();
    await expect(page.getByTestId('credential-BENEFITPAY_MERCHANT_ID')).toBeVisible();

    // With credentials missing, enable is disabled outright — the UI never
    // offers an action the API would reject.
    await expect(page.getByTestId('integration-toggle-enabled')).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(page.locator('.oryx-modal')).toHaveCount(0);
    await expectNoServerError(page);
  });

  test('5. runs a connection test and records the honest result', async ({ page }) => {
    // Seed every required credential so the verify call reaches the adapter
    // instead of stopping at the missing-credential guard.
    await setBenefitPayCredentials(BENEFITPAY_TEST_CREDENTIALS);
    try {
      await page.goto('/integrations');
      await page.getByTestId('integration-row-BENEFITPAY').getByRole('button').click();
      await expect(page.getByTestId('integration-verify')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('integration-verify').click();

      // The adapter exists but the vendor call is not implemented, so the check
      // must report that plainly rather than claiming success.
      await expect(page.getByTestId('integration-checks')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('integration-checks')).toContainText(/not implemented/i);
      await expectNoServerError(page);
    } finally {
      // Remove the throwaway credentials again: an empty value deletes the row.
      // Leaving them behind would flip BENEFITPAY to CONFIGURED for every later
      // test in the suite, which is exactly the state the other tests assert
      // against.
      await setBenefitPayCredentials(BENEFITPAY_CLEARED);
    }
  });

  test('6. renders in both languages and both themes', async ({ page }) => {
    for (const theme of ['dark', 'light'] as const) {
      await page.goto('/integrations');
      await setTheme(page, theme);
      await expect(page.getByTestId('integrations-table')).toBeVisible({ timeout: 20_000 });
    }

    await setLocale(page, 'ar');
    await page.goto('/integrations');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('integrations-table')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('body')).toContainText('مركز التكاملات');
    await expectNoServerError(page);
  });
});
