import { createHmac } from 'node:crypto';
import { test } from '@playwright/test';
import { COMPANY_ADMIN, SUPER_ADMIN, apiToken, setLocale, setTheme, signIn } from './helpers';

/** Generate a TOTP code for a base32 secret (RFC 6238, SHA-1, 6 digits). */
function totp(secret: string, atMs: number = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Screenshot capture for the execution report.
 *
 * Output: docs/execution-reports/screenshots/ (resolved from the repo root).
 * These are real renders of the running application in both themes and both
 * directions, at desktop, tablet and mobile widths.
 */

const OUT = '../../docs/execution-reports/screenshots';

test.describe('required screenshots', () => {
  test('dashboard - arabic dark', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'ar');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/dashboard-ar-dark.png` });
    await page.screenshot({ path: `${OUT}/dashboard-ar-dark-full.png`, fullPage: true });
  });

  test('dashboard - arabic light', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'ar');
    await setTheme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/dashboard-ar-light.png` });
  });

  test('dashboard - english dark', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/dashboard-en-dark.png` });
    await page.screenshot({ path: `${OUT}/dashboard-en-dark-full.png`, fullPage: true });
  });

  test('dashboard - english light', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/dashboard-en-light.png` });
  });

  test('dashboard - mobile dark and light', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await setLocale(page, 'en');

    await setTheme(page, 'dark');
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/dashboard-mobile-dark.png`, fullPage: true });

    await setTheme(page, 'light');
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/dashboard-mobile-light.png`, fullPage: true });
  });

  test('dashboard - tablet dark', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/dashboard-tablet-dark.png`, fullPage: true });
  });

  test('company management', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/companies');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/companies-dark.png` });

    await setTheme(page, 'light');
    await page.goto('/companies');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/companies-light.png` });
  });

  test('subscription packages', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/plans');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/plans-dark.png`, fullPage: true });
  });

  test('roles and permissions', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/roles');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/roles-dark.png`, fullPage: true });
  });

  test('mfa enrollment', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/security');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/mfa-settings-dark.png` });

    await page.getByTestId('mfa-enroll').click();
    await page.getByTestId('mfa-qr').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/mfa-enrollment-dark.png` });
  });

  test('mfa login challenge', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Enable MFA through the API (enroll AND confirm), then sign out to reach
    // the challenge step. The app never persists a token, so obtain one from a
    // real login for these calls.
    const bearer = await apiToken(page);
    const secret = await page.evaluate(
      async ({ api, token }) => {
        const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
        const res = await fetch(`${api}/auth/mfa/enroll`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf, Authorization: `Bearer ${token}` },
          body: '{}',
        });
        return ((await res.json()) as { secret: string }).secret;
      },
      { api: 'http://localhost:3001/api/v1', token: bearer },
    );

    const confirmed = await page.evaluate(
      async ({ api, code, token }) => {
        const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
        const res = await fetch(`${api}/auth/mfa/enroll/confirm`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code }),
        });
        return res.status;
      },
      { api: 'http://localhost:3001/api/v1', code: totp(secret), token: bearer },
    );
    if (confirmed !== 200) throw new Error(`MFA enrollment failed with status ${confirmed}`);

    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.waitForURL('**/login');
    await setLocale(page, 'en');

    // Use the configured test credentials rather than hard-coded values, so the
    // suite runs against any environment.
    await page.getByTestId('login-email').fill(SUPER_ADMIN.email);
    await page.getByTestId('login-password').fill(SUPER_ADMIN.password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('mfa-challenge-notice').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/mfa-login-challenge-dark.png` });

    // Complete the challenge so the account is usable, then leave it without
    // MFA so the remaining captures are unaffected.
    await page.getByTestId('mfa-code').fill(totp(secret, Date.now() + 31_000));
    await page.getByTestId('login-submit').click();
    await page.waitForURL('**/dashboard', { timeout: 25_000 });
    const cleanupToken = await apiToken(page);
    await page.evaluate(
      async ({ api, token }) => {
        const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
        const auth = `Bearer ${token}`;
        const me = await fetch(`${api}/auth/me`, { credentials: 'include', headers: { Authorization: auth } });
        const { user } = (await me.json()) as { user: { id: string } };
        await fetch(`${api}/auth/mfa/reset/${user.id}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf, Authorization: auth },
          body: '{}',
        });
      },
      { api: 'http://localhost:3001/api/v1', token: cleanupToken },
    );
  });

  test('company administrator restricted view', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/company-admin-dark.png`, fullPage: true });
  });

  test('login screen dark and light', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await setTheme(page, 'dark');
    await setLocale(page, 'en');
    await page.goto('/login');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/login-dark.png` });

    await setTheme(page, 'light');
    await page.goto('/login');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/login-light.png` });
  });

  test('planned module state', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await setTheme(page, 'dark');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/accounting');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/planned-module-dark.png`, fullPage: true });
  });
});
