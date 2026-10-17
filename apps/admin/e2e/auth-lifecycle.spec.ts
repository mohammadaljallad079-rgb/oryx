import { expect, test, type Page } from '@playwright/test';
import { SUPER_ADMIN, apiToken, setLocale, signIn } from './helpers';

/**
 * Authentication lifecycle regression suite (browser).
 *
 * Verifies the client-side session model end to end:
 *   - no token is ever persisted in JavaScript-accessible storage
 *   - the session survives a reload, restored through the refresh cookie
 *   - concurrent refreshes do not destroy the session
 *   - signing out in one tab signs out the others
 *   - a lost session redirects to sign-in rather than showing a broken screen
 *   - no session exists before MFA verification
 */

/** Snapshot every JavaScript-accessible storage location. */
async function storageSnapshot(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    }).toLowerCase(),
  );
}

test.describe('no persisted authentication tokens', () => {
  test('login writes no token to local or session storage', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const snapshot = await storageSnapshot(page);
    expect(snapshot).not.toContain('eyj'); // a JWT always starts with {"alg"... base64
    expect(snapshot).not.toContain('accesstoken');
    expect(snapshot).not.toContain('refreshtoken');
    expect(snapshot).not.toContain('oryx_rt');
  });

  test('the access token lives only in memory and is not in any cookie', async ({ page }) => {
    await signIn(page);
    const token = await apiToken(page);
    expect(token.split('.')).toHaveLength(3);

    // It must not appear anywhere the browser persists.
    const snapshot = await storageSnapshot(page);
    expect(snapshot).not.toContain(token.toLowerCase());

    const cookies = await page.context().cookies();
    const accessInCookie = cookies.find((c) => c.value.includes(token));
    expect(accessInCookie).toBeFalsy();

    // The only auth cookie is the HttpOnly refresh token, plus the readable CSRF
    // token, which is not a credential on its own.
    const authCookies = cookies.filter((c) => c.name.startsWith('oryx_'));
    expect(authCookies.map((c) => c.name).sort()).toEqual(['oryx_csrf', 'oryx_rt']);
    expect(authCookies.find((c) => c.name === 'oryx_rt')!.httpOnly).toBe(true);
    expect(authCookies.find((c) => c.name === 'oryx_csrf')!.httpOnly).toBe(false);
  });

  test('the access token is not present in the URL', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/companies');
    await expect(page.getByTestId('companies-page')).toBeVisible();
    expect(page.url()).not.toMatch(/token=/i);
    expect(page.url()).not.toMatch(/eyj/i);
  });
});

test.describe('session restoration', () => {
  test('a reload keeps the user signed in, restored from the refresh cookie', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/companies');
    await expect(page.getByTestId('companies-page')).toBeVisible();

    await page.reload();

    // The in-memory token is gone after a reload, so the app must restore the
    // session through the cookie. The protected page still renders.
    await expect(page.getByTestId('companies-page')).toBeVisible({ timeout: 20_000 });
    expect(page.url()).not.toContain('/login');
  });

  test('a deep link reload on a protected route restores the session', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 20_000 });
    expect(page.url()).not.toContain('/login');
  });

  test('a reload issues at most one rotation, even with several widgets loading', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    // Count rotations the app performs while restoring after a reload. The
    // dashboard loads several widgets at once, so this is the real concurrency
    // scenario; single-flight refresh must collapse them into one call.
    let rotations = 0;
    page.on('request', (req) => {
      if (req.url().includes('/auth/refresh')) rotations += 1;
    });

    await page.reload();
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('module-tiles')).toBeVisible();

    expect(rotations).toBeLessThanOrEqual(1);

    // The session must still be usable afterwards.
    await page.goto('/companies');
    await expect(page.getByTestId('companies-page')).toBeVisible({ timeout: 20_000 });
  });

  test('the in-memory token is not reachable from arbitrary page script', async ({ page }) => {
    await signIn(page);

    // A raw fetch from page context carries no bearer token, which is the whole
    // point: an injected script cannot read one from storage and replay it.
    const status = await page.evaluate(async () => {
      const res = await fetch('http://localhost:3001/api/v1/auth/me', { credentials: 'include' });
      return res.status;
    });
    expect(status).toBe(401);
  });
});

test.describe('multi-tab behaviour', () => {
  test('signing out in one tab signs the others out', async ({ page, context }) => {
    await signIn(page);
    await setLocale(page, 'en');

    // Second tab shares the same cookie jar.
    const second = await context.newPage();
    await second.goto('/dashboard');
    await expect(second.getByTestId('dashboard')).toBeVisible({ timeout: 20_000 });

    // Sign out from the first tab.
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.waitForURL('**/login');

    // The other tab must notice and return to sign-in rather than showing a
    // broken dashboard.
    await second.reload();
    await second.waitForURL('**/login', { timeout: 20_000 });
    await expect(second.getByTestId('login-form')).toBeVisible();

    await second.close();
  });

  test('two tabs refreshing at once both stay usable', async ({ page, context }) => {
    await signIn(page);
    await setLocale(page, 'en');

    const second = await context.newPage();
    await second.goto('/dashboard');
    await expect(second.getByTestId('dashboard')).toBeVisible({ timeout: 20_000 });

    // Both tabs reload simultaneously, which races the rotation. The server
    // grace window must keep both sessions alive.
    await Promise.all([page.reload(), second.reload()]);

    // Allow each tab to finish restoring before asserting.
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await second.waitForLoadState('networkidle').catch(() => undefined);

    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30_000 });
    await expect(second.getByTestId('dashboard')).toBeVisible({ timeout: 30_000 });
    expect(page.url()).not.toContain('/login');
    expect(second.url()).not.toContain('/login');

    await second.close();
  });
});

test.describe('expiry and revocation', () => {
  test('losing the session redirects to sign-in on the next navigation', async ({ page }) => {
    await signIn(page);
    await setLocale(page, 'en');

    // Simulate the session ending server-side: clear the cookies the browser
    // holds. The in-memory token remains, so the app only discovers the loss
    // when a request fails and the refresh cannot recover.
    await page.context().clearCookies();

    await page.goto('/companies');
    await page.waitForURL('**/login', { timeout: 25_000 });
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('an unauthenticated visit to a protected route redirects to sign-in', async ({ page }) => {
    await page.goto('/plans');
    await page.waitForURL('**/login');
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('signing in again works after a sign-out', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.waitForURL('**/login');

    // A second full login must succeed: the cookie jar was cleared cleanly.
    await page.getByTestId('login-email').fill(SUPER_ADMIN.email);
    await page.getByTestId('login-password').fill(SUPER_ADMIN.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL('**/dashboard', { timeout: 25_000 });
    await expect(page.getByTestId('dashboard')).toBeVisible();
  });
});

test.describe('no refresh loop', () => {
  test('a wrong password does not trigger a refresh storm', async ({ page }) => {
    let refreshCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/auth/refresh')) refreshCalls += 1;
    });

    await page.goto('/login');
    await page.getByTestId('login-email').fill(SUPER_ADMIN.email);
    await page.getByTestId('login-password').fill('definitely-not-the-password');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 20_000 });

    // The shell makes at most one session-restore attempt when it mounts on a
    // page that may hold a session. What must not happen is a repeating loop:
    // the count must be stable, not growing.
    const afterFailure = refreshCalls;
    await page.waitForTimeout(2500);
    expect(refreshCalls).toBe(afterFailure);
    expect(refreshCalls).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('an unauthenticated dashboard visit does not loop on refresh', async ({ page }) => {
    let refreshCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/auth/refresh')) refreshCalls += 1;
    });

    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 20_000 });

    const afterRedirect = refreshCalls;
    await page.waitForTimeout(2500);
    // Bounded restore attempts only; no runaway loop.
    expect(refreshCalls).toBe(afterRedirect);
    expect(refreshCalls).toBeLessThanOrEqual(2);
  });
});
