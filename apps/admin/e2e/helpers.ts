import { expect, type Page } from '@playwright/test';

export const SUPER_ADMIN = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

export const COMPANY_ADMIN = {
  email: 'admin@demo-alnoor.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

/**
 * Administrator of the ORYX-AUTO internal company, which is on the Enterprise
 * plan and therefore licenses every module including automotive.
 */
export const ENTERPRISE_ADMIN = {
  email: 'admin@oryx-auto.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};

const API = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';

/**
 * Obtain a bearer token for API assertions from inside the page.
 *
 * The application never persists a token, so tests cannot read one from
 * storage. Instead the helper performs a real login (or MFA challenge
 * completion when the account requires it) and returns the access token for the
 * lifetime of the call.
 *
 * `credentials` defaults to the Super Admin.
 */
export async function apiToken(
  page: Page,
  credentials = SUPER_ADMIN,
  totpSecret?: string,
): Promise<string> {
  return page.evaluate(
    async ({ api, email, password, secret }) => {
      // Prefer rotating the existing session: it needs no credentials, so it
      // does not consume the login rate limit and cannot disturb an MFA state.
      const csrfFromCookie = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
      const rotate = await fetch(`${api}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfFromCookie ? { 'x-oryx-csrf': csrfFromCookie } : {}),
        },
        body: JSON.stringify({}),
      });
      if (rotate.ok) {
        const rotated = (await rotate.json()) as { accessToken?: string };
        if (rotated.accessToken) return rotated.accessToken;
      }

      const login = await fetch(`${api}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await login.json()) as {
        accessToken?: string;
        mfaRequired?: boolean;
        challengeToken?: string;
      };
      if (body.accessToken) return body.accessToken;
      if (!body.mfaRequired || !secret) {
        throw new Error(
          `Could not obtain an access token (login status ${login.status}). ` +
            'If MFA is enabled on this account, pass its TOTP secret.',
        );
      }
      // Complete the second factor for the test account.
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
      const counter = new Uint8Array(8);
      const step = BigInt(Math.floor(Date.now() / 1000 / 30));
      for (let i = 7; i >= 0; i -= 1) {
        counter[i] = Number(step & 0xffn);
      }
      // Reuse the page's WebCrypto for HMAC-SHA1 (no Node APIs in the browser).
      const key = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(bytes),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign'],
      );
      const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
      const offset = mac[mac.length - 1] & 0x0f;
      const binary =
        ((mac[offset] & 0x7f) << 24) |
        ((mac[offset + 1] & 0xff) << 16) |
        ((mac[offset + 2] & 0xff) << 8) |
        (mac[offset + 3] & 0xff);
      const code = String(binary % 1_000_000).padStart(6, '0');

      const csrf = decodeURIComponent(document.cookie.match(/oryx_csrf=([^;]*)/)?.[1] ?? '');
      const verify = await fetch(`${api}/auth/mfa/verify-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-oryx-csrf': csrf },
        body: JSON.stringify({ challengeToken: body.challengeToken, code }),
      });
      const verified = (await verify.json()) as { accessToken?: string };
      if (!verified.accessToken) throw new Error('MFA verification did not return a token.');
      return verified.accessToken;
    },
    { api: API, email: credentials.email, password: credentials.password, secret: totpSecret },
  );
}

/** Signs in through the real login form and waits for the dashboard. */
export async function signIn(page: Page, credentials = SUPER_ADMIN): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(credentials.email);
  await page.getByTestId('login-password').fill(credentials.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await expect(page.getByTestId('dashboard')).toBeVisible();
}

/** Switches the theme and waits for the attribute to settle. */
export async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((value) => {
    window.localStorage.setItem('oryx.theme', value);
  }, theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Switches locale/direction and waits for the attribute to settle. */
export async function setLocale(page: Page, locale: 'ar' | 'en'): Promise<void> {
  await page.evaluate((value) => {
    window.localStorage.setItem('oryx.locale', value);
  }, locale);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-dir', locale === 'ar' ? 'rtl' : 'ltr');
}

export async function expectNoServerError(page: Page): Promise<void> {
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Application error');
  expect(body).not.toContain('Internal Server Error');
}
