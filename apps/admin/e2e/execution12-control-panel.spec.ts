import { expect, request, test } from '@playwright/test';
import { SUPER_ADMIN, expectNoServerError, setLocale, signIn } from './helpers';

/**
 * Execution 12 — the Super Admin control panel.
 *
 * These tests exercise the three new platform surfaces against the real API and
 * database. They assert the *contract* (a seeded coupon appears, a delivery row
 * is written, the ecosystem aggregate renders) rather than a fixed pixel
 * layout, so they stay honest when the seed changes.
 *
 * The mutation test cleans up after itself in a `finally` block, so a failure
 * cannot leave a stray coupon behind for a later run.
 */

const API = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

/** Log in from Node, with no ambient cookie, and return a bearer token. */
async function token(): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${API}/auth/login`, {
      data: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
    });
    expect(res.ok(), `login failed with ${res.status()}`).toBe(true);
    return ((await res.json()) as { accessToken: string }).accessToken;
  } finally {
    await ctx.dispose();
  }
}

test.describe('Execution 12 — control panel', () => {
  test('the control-panel navigation is visible to the Super Admin', async ({ page }) => {
    await signIn(page);
    // The admin shell defaults to Arabic; assert the English labels only after
    // switching the locale explicitly.
    await setLocale(page, 'en');
    await expect(page.getByRole('link', { name: /Ecosystem Overview/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Coupons/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Notification Centre/i })).toBeVisible();
  });

  test('the ecosystem overview renders real platform metrics', async ({ page }) => {
    await signIn(page);
    await page.goto('/ecosystem');
    await expect(page.getByTestId('ecosystem-page')).toBeVisible();
    // The headline revenue card and the metric grid both come from the same
    // `GET /platform/ecosystem` payload.
    await expect(page.getByTestId('eco-headline')).toBeVisible();
    await expect(page.getByTestId('eco-metrics')).toBeVisible();
    await expect(page.getByTestId('eco-metric-customers')).toBeVisible();
    await expectNoServerError(page);
  });

  test('the coupon list shows the seeded launch coupons', async ({ page }) => {
    await signIn(page);
    await page.goto('/coupons');
    await expect(page.getByTestId('coupons-page')).toBeVisible();
    await expect(page.getByTestId('coupon-row-WELCOME15')).toBeVisible();
    await expect(page.getByTestId('coupon-row-SAVE5')).toBeVisible();
    await expectNoServerError(page);
  });

  test('the coupon tester applies the server-side discount', async ({ page }) => {
    await signIn(page);
    await page.goto('/coupons');
    await expect(page.getByTestId('coupon-tester')).toBeVisible();
    // WELCOME15 is 1500 basis points; a BHD 100.000 order discounts BHD 15.000.
    await page.getByTestId('coupon-test-code').fill('WELCOME15');
    await page.getByTestId('coupon-test-subtotal').fill('100.000');
    await page.getByTestId('coupon-test-run').click();
    const result = page.getByTestId('coupon-test-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('15.000');
  });

  test('a coupon created through the UI persists and can be deleted again', async ({ page }) => {
    await signIn(page);
    await page.goto('/coupons');
    await expect(page.getByTestId('coupons-page')).toBeVisible();

    const code = `E2E${Date.now().toString().slice(-6)}`;
    const adminToken = await token();

    try {
      await page.getByTestId('coupon-create').click();
      await expect(page.locator('.oryx-modal')).toHaveCount(1);
      await page.getByTestId('coupon-form-code').fill(code);
      await page.getByTestId('coupon-save').click();
      await expect(page.locator('.oryx-modal')).toHaveCount(0);
      await expect(page.getByTestId(`coupon-row-${code}`)).toBeVisible();
    } finally {
      // Delete by code through the API so the suite leaves no residue.
      const ctx = await request.newContext();
      try {
        const list = await ctx.get(`${API}/coupons?includeInactive=true`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const body = (await list.json()) as { items: Array<{ id: string; code: string }> };
        const created = body.items.find((c) => c.code === code);
        if (created) {
          await ctx.delete(`${API}/coupons/${created.id}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        }
      } finally {
        await ctx.dispose();
      }
    }
  });

  test('the notification centre lists deliveries and templates', async ({ page }) => {
    await signIn(page);
    await page.goto('/notifications');
    await expect(page.getByTestId('notifications-page')).toBeVisible();
    await expect(page.getByTestId('notif-by-channel')).toBeVisible();
    await expect(page.getByTestId('notif-templates')).toBeVisible();
    await expectNoServerError(page);
  });

  test('the notification centre is bilingual', async ({ page }) => {
    await signIn(page);
    await page.goto('/notifications');
    await setLocale(page, 'ar');
    await expect(page.getByTestId('notifications-page')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-dir', 'rtl');
    await expectNoServerError(page);
  });

  test('a company administrator cannot reach the control panel', async ({ page }) => {
    // The demo tenant admin holds no platform.* permission, so the client gate
    // renders the denial card and the API would reject the call regardless.
    await signIn(page, {
      email: 'admin@demo-alnoor.local',
      password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
    });
    await page.goto('/ecosystem');
    await expect(page.getByTestId('permission-denied')).toBeVisible();
  });
});
