import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { COMPANY_ADMIN, SUPER_ADMIN, setLocale, setTheme, signIn } from './helpers';

/**
 * MFA and session-transport UI acceptance tests.
 *
 * These run against the real API in a real browser, so HttpOnly enforcement and
 * cookie clearing are verified the way a browser applies them.
 *
 * The MFA suite mutates the seeded Super Admin account, so it always disables
 * MFA again afterwards; the helper below is the only place that touches it.
 */

const API = 'http://localhost:3001/api/v1';

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

/** Read the cookies the browser holds for the admin origin. */
async function cookies(page: Page) {
  return page.context().cookies();
}

/**
 * Drive MFA enrollment through the API from the page context.
 * Returns the active secret, or null when MFA was already enabled.
 */
async function enrollMfa(page: Page): Promise<string | null> {
  return page.evaluate(async (api) => {
    const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
    const auth = `Bearer ${window.localStorage.getItem('oryx.accessToken') ?? ''}`;
    const status = await fetch(`${api}/auth/mfa/status`, { credentials: 'include', headers: { Authorization: auth } });
    if (((await status.json()) as { enabled: boolean }).enabled) return null;

    const start = await fetch(`${api}/auth/mfa/enroll`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf, Authorization: auth },
      body: '{}',
    });
    const { secret } = (await start.json()) as { secret: string };
    return secret;
  }, API);
}

/**
 * Confirm enrollment with a generated code.
 *
 * Returns the issued recovery codes so a later step can authenticate without
 * consuming another TOTP step (which replay protection would reject).
 */
async function confirmMfa(page: Page, secret: string): Promise<{ status: number; recoveryCodes: string[] }> {
  return page.evaluate(
    async ({ api, code }) => {
      const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
      const auth = `Bearer ${window.localStorage.getItem('oryx.accessToken') ?? ''}`;
      const res = await fetch(`${api}/auth/mfa/enroll/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf, Authorization: auth },
        body: JSON.stringify({ code }),
      });
      const body =
        res.status === 200 ? ((await res.json()) as { recoveryCodes: string[] }) : { recoveryCodes: [] };
      return { status: res.status, recoveryCodes: body.recoveryCodes ?? [] };
    },
    { api: API, code: totp(secret) },
  );
}

/**
 * Sign in, reset any existing MFA, then enroll afresh.
 * Returns the active secret and one recovery code for the cleanup login.
 */
async function signInWithMfa(page: Page): Promise<{ secret: string; recoveryCode: string }> {
  await signIn(page);
  await page.evaluate(async (api) => {
    const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
    const auth = `Bearer ${window.localStorage.getItem('oryx.accessToken') ?? ''}`;
    const me = await fetch(`${api}/auth/me`, { credentials: 'include', headers: { Authorization: auth } });
    const { user } = (await me.json()) as { user: { id: string } };
    await fetch(`${api}/auth/mfa/reset/${user.id}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf, Authorization: auth },
      body: '{}',
    });
  }, API);

  // The reset revoked every session. Clear the stale client state before
  // signing in again, otherwise the login form is replaced by a redirect.
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.goto('/login');
  await signIn(page);
  const secret = await enrollMfa(page);
  expect(secret).toBeTruthy();
  const confirmed = await confirmMfa(page, secret!);
  expect(confirmed.status).toBe(200);
  expect(confirmed.recoveryCodes.length).toBe(10);
  return { secret: secret!, recoveryCode: confirmed.recoveryCodes[0] };
}

/**
 * Leave the shared account without MFA.
 *
 * Uses the platform administrative reset, which is the supported path for a
 * locked-out account and does not consume a TOTP step.
 */
async function disableMfa(page: Page): Promise<void> {
  await page.evaluate(async (api) => {
    const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
    const auth = `Bearer ${window.localStorage.getItem('oryx.accessToken') ?? ''}`;
    const me = await fetch(`${api}/auth/me`, { credentials: 'include', headers: { Authorization: auth } });
    const { user } = (await me.json()) as { user: { id: string } };
    await fetch(`${api}/auth/mfa/reset/${user.id}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf, Authorization: auth },
      body: '{}',
    });
  }, API);
}

test.describe('session transport', () => {
  test('the refresh token is never exposed to JavaScript', async ({ page }) => {
    await signIn(page);

    const all = await cookies(page);
    const refresh = all.find((c) => c.name === 'oryx_rt');
    expect(refresh, 'refresh cookie must exist').toBeTruthy();
    expect(refresh!.httpOnly).toBe(true);

    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain('oryx_rt');
    expect(visible).toContain('oryx_csrf');

    const storage = await page.evaluate(() => ({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    }));
    const serialised = JSON.stringify(storage).toLowerCase();
    expect(serialised).not.toContain('oryx_rt');
    expect(serialised).not.toContain('refreshtoken');
  });

  test('signing out clears the session and returns to the login screen', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.waitForURL('**/login', { timeout: 20_000 });

    const all = await cookies(page);
    const refresh = all.find((c) => c.name === 'oryx_rt');
    expect(!refresh || refresh.value === '').toBe(true);

    await page.goto('/companies');
    await page.waitForURL('**/login');
  });
});

test.describe('mfa settings screen', () => {
  test('shows the MFA status and offers enrollment', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/security');
    await expect(page.getByTestId('security-page')).toBeVisible();
    await expect(page.getByTestId('mfa-card')).toBeVisible();
    await expect(page.getByTestId('mfa-enroll')).toBeVisible();
  });

  test('opens the enrollment dialog with a QR code and a manual key', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/security');
    await page.getByTestId('mfa-enroll').click();

    await expect(page.getByTestId('mfa-qr')).toBeVisible({ timeout: 20_000 });
    const src = await page.getByTestId('mfa-qr').getAttribute('src');
    expect(src?.startsWith('data:image/png;base64,')).toBe(true);
    await expect(page.getByTestId('mfa-secret')).toBeVisible();
    await expect(page.getByTestId('mfa-enroll-code')).toBeVisible();
  });

  test('rejects an invalid enrollment code', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/security');
    await page.getByTestId('mfa-enroll').click();
    await expect(page.getByTestId('mfa-qr')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('mfa-enroll-code').fill('000000');
    await page.getByTestId('mfa-confirm-enroll').click();
    await expect(page.getByTestId('mfa-enroll-error')).toBeVisible({ timeout: 20_000 });
  });

  test('renders in both themes and both directions', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/security');
    await expect(page.getByTestId('security-page')).toBeVisible();

    await setTheme(page, 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('mfa-card')).toBeVisible();

    await setTheme(page, 'dark');
    await setLocale(page, 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('mfa-card')).toBeVisible();
  });
});

test.describe('platform-only MFA administration', () => {
  test('the administrative reset is offered to the Super Admin', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/security');
    await expect(page.getByTestId('mfa-admin-reset')).toBeVisible();
    await expect(page.getByTestId('mfa-open-reset')).toBeVisible();
  });

  test('a company administrator cannot see the administrative reset', async ({ page }) => {
    await signIn(page, COMPANY_ADMIN);
    await setLocale(page, 'en');
    await page.goto('/security');
    await expect(page.getByTestId('security-page')).toBeVisible();
    await expect(page.getByTestId('mfa-admin-reset')).toHaveCount(0);
  });
});

test.describe('mfa login challenge', () => {
  test('password alone does not create a session when MFA is enabled', async ({ page }) => {
    const { recoveryCode } = await signInWithMfa(page);

    try {
      await page.getByTestId('user-menu').click();
      await page.getByTestId('logout').click();
      await page.waitForURL('**/login');
      await setLocale(page, 'en');

      await page.getByTestId('login-email').fill(SUPER_ADMIN.email);
      await page.getByTestId('login-password').fill(SUPER_ADMIN.password);
      await page.getByTestId('login-submit').click();

      // The second-factor step appears and the URL stays on /login.
      await expect(page.getByTestId('mfa-challenge-notice')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('mfa-code')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);

      // No session cookie may exist before the second factor is verified.
      const all = await cookies(page);
      expect(all.find((c) => c.name === 'oryx_rt' && c.value.length > 0)).toBeFalsy();
    } finally {
      // Complete the challenge with a recovery code, then leave the shared
      // account without MFA so other suites are unaffected.
      await page.getByTestId('mfa-code').fill(recoveryCode);
      await page.getByTestId('login-submit').click();
      await page.waitForURL('**/dashboard', { timeout: 25_000 });
      await disableMfa(page);
    }
  });

  test('an invalid challenge code keeps the user on the login screen', async ({ page }) => {
    const { recoveryCode } = await signInWithMfa(page);

    try {
      await page.getByTestId('user-menu').click();
      await page.getByTestId('logout').click();
      await page.waitForURL('**/login');
      await setLocale(page, 'en');

      await page.getByTestId('login-email').fill(SUPER_ADMIN.email);
      await page.getByTestId('login-password').fill(SUPER_ADMIN.password);
      await page.getByTestId('login-submit').click();
      await expect(page.getByTestId('mfa-code')).toBeVisible({ timeout: 20_000 });

      await page.getByTestId('mfa-code').fill('000000');
      await page.getByTestId('login-submit').click();
      await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await page.getByTestId('mfa-code').fill(recoveryCode);
      await page.getByTestId('login-submit').click();
      await page.waitForURL('**/dashboard', { timeout: 25_000 });
      await disableMfa(page);
    }
  });
});
