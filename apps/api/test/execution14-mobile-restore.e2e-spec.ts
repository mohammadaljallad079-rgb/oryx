import {
  cleanupFixtures,
  createTestApp,
  jarCall,
  CookieJar,
  SEED_COMPANY_ADMIN,
  type TestContext,
} from './test-app';

/**
 * Execution 14 — the mobile customer session-restore contract.
 *
 * A device presents the refresh cookie automatically: React Native's cookie jar
 * stores the `Set-Cookie` from login and replays `oryx_crt` on every request to
 * `/api/v1/customer`, whether the app asks it to or not. `CsrfGuard` therefore
 * requires the matching `x-oryx-csrf` header on the restore POST. A native client
 * has no `document.cookie` to read the readable `oryx_ccsrf` pair from, so it
 * must take the value from the login/refresh body and echo it.
 *
 * The defect this suite pins: the app never stored the body token, so every
 * cold-start restore presented the cookie without the header, was answered 403,
 * and the customer was silently dropped into offline demo mode until they signed
 * in by hand. These tests hold the server contract that makes the fix sufficient
 * — the cookie+header pair must succeed, and the cookie alone must fail.
 */
describe('Execution 14 — mobile customer session restore (e2e)', () => {
  let ctx: TestContext;

  const NATIVE = { 'x-oryx-client': 'mobile' };
  const password = 'e14-restore-password-12345';

  async function register(email: string): Promise<{ csrfToken: string; refreshToken: string; jar: CookieJar }> {
    const jar = new CookieJar();
    const res = await jarCall<{ refreshToken?: string; csrfToken?: string }>(
      ctx.base,
      '/customer/auth/register',
      {
        method: 'POST',
        headers: NATIVE,
        body: { email, password, fullName: `E14 ${email}`, preferredLocale: 'en' },
        jar,
      },
    );
    if (res.status !== 201) {
      throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { csrfToken: res.body.csrfToken ?? '', refreshToken: res.body.refreshToken ?? '', jar };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
  }, 90_000);

  afterAll(async () => {
    // These accounts are created by this suite and are not in the shared
    // fixture prefix, so remove them here rather than leaking a row per run.
    const owned = { account: { email: { startsWith: 'e14-restore-' } } };
    await ctx.prisma.customerAddress.deleteMany({ where: owned });
    await ctx.prisma.customerPrivacySetting.deleteMany({ where: owned });
    await ctx.prisma.customerNotificationPreference.deleteMany({ where: owned });
    await ctx.prisma.customerRefreshToken.deleteMany({ where: owned });
    await ctx.prisma.customerPasswordResetToken.deleteMany({ where: owned });
    await ctx.prisma.customerAccount.deleteMany({ where: { email: { startsWith: 'e14-restore-' } } });

    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  });

  it('issues the refresh cookie and the body double-submit token together', async () => {
    const email = `e14-restore-a-${Date.now()}@oryx.local`;
    const jar = new CookieJar();
    const res = await jarCall<{ refreshToken?: string; csrfToken?: string }>(
      ctx.base,
      '/customer/auth/register',
      {
        method: 'POST',
        headers: NATIVE,
        body: { email, password, fullName: 'E14 Restore A', preferredLocale: 'en' },
        jar,
      },
    );

    expect(res.status).toBe(201);
    // The native client stores both: the cookie rides the jar, the token is
    // echoed from the body because the readable cookie is unreachable in native.
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.csrfToken).toBeTruthy();
    expect(jar.get('oryx_crt')).toBeTruthy();
    expect(jar.get('oryx_ccsrf')).toBe(res.body.csrfToken);
  });

  it('restores a session when the body token is echoed as the CSRF header', async () => {
    const { csrfToken, refreshToken, jar } = await register(`e14-restore-b-${Date.now()}@oryx.local`);

    // This is exactly what the app does on cold start: the jar replays the
    // refresh cookie, the body carries the token, and the header echoes it.
    const restored = await jarCall<{ accessToken?: string; refreshToken?: string; csrfToken?: string }>(
      ctx.base,
      '/customer/auth/refresh',
      { method: 'POST', headers: NATIVE, body: { refreshToken }, jar, csrf: csrfToken },
    );

    expect(restored.status).toBe(200);
    expect(restored.body.accessToken).toBeTruthy();
    // The rotation returns a fresh refresh token, which the app re-persists.
    expect(restored.body.refreshToken).toBeTruthy();
    expect(restored.body.refreshToken).not.toBe(refreshToken);
    // The double-submit token is deliberately kept stable across a refresh, so
    // the app may echo the same value again without re-reading the cookie.
    expect(restored.body.csrfToken).toBe(csrfToken);
  });

  it('refuses the restore when the cookie is presented without the header', async () => {
    const { refreshToken, jar } = await register(`e14-restore-c-${Date.now()}@oryx.local`);

    // The defect: the jar replays the cookie but the app sent no header. The
    // guard must reject the pair — this is the 403 that dropped the customer
    // into demo mode.
    const blocked = await jarCall<{ code?: string }>(ctx.base, '/customer/auth/refresh', {
      method: 'POST',
      headers: NATIVE,
      body: { refreshToken },
      jar,
    });

    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('auth.csrf_token_invalid');
  });

  it('rotates a restored session using the freshly issued token', async () => {
    const { csrfToken, refreshToken, jar } = await register(`e14-restore-d-${Date.now()}@oryx.local`);

    const first = await jarCall<{ refreshToken: string; csrfToken: string }>(
      ctx.base,
      '/customer/auth/refresh',
      { method: 'POST', headers: NATIVE, body: { refreshToken }, jar, csrf: csrfToken },
    );
    expect(first.status).toBe(200);

    // The app re-persists the rotated pair; the next restore must use it, not
    // the original, or the replay check answers 401.
    const second = await jarCall<{ accessToken?: string }>(ctx.base, '/customer/auth/refresh', {
      method: 'POST',
      headers: NATIVE,
      body: { refreshToken: first.body.refreshToken },
      jar,
      csrf: first.body.csrfToken,
    });

    expect(second.status).toBe(200);
    expect(second.body.accessToken).toBeTruthy();
  });
});

/**
 * The merchant (staff) plane restores through the same cookie+header pair, so
 * the same defect would strand a merchant in the demo catalogue. The staff cookie
 * is scoped to `/api/v1/auth` and shares the device cookie jar with the customer
 * one, which is why the app keeps two independent double-submit tokens.
 */
describe('Execution 14 — mobile merchant session restore (e2e)', () => {
  let ctx: TestContext;

  const NATIVE = { 'x-oryx-client': 'mobile' };

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  });

  async function staffLogin(): Promise<{ csrfToken: string; refreshToken: string; jar: CookieJar }> {
    const jar = new CookieJar();
    const res = await jarCall<{ refreshToken?: string; csrfToken?: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      headers: NATIVE,
      body: { email: SEED_COMPANY_ADMIN.email, password: SEED_COMPANY_ADMIN.password },
      jar,
    });
    if (res.status !== 200) {
      throw new Error(`staff login failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { csrfToken: res.body.csrfToken ?? '', refreshToken: res.body.refreshToken ?? '', jar };
  }

  it('issues the staff refresh cookie and the body double-submit token together', async () => {
    const { csrfToken, refreshToken, jar } = await staffLogin();
    expect(refreshToken).toBeTruthy();
    expect(csrfToken).toBeTruthy();
    expect(jar.get('oryx_rt')).toBeTruthy();
    expect(jar.get('oryx_csrf')).toBe(csrfToken);
  });

  it('restores the staff session when the body token is echoed as the header', async () => {
    const { csrfToken, refreshToken, jar } = await staffLogin();

    const restored = await jarCall<{ accessToken?: string; refreshToken?: string }>(
      ctx.base,
      '/auth/refresh',
      { method: 'POST', headers: NATIVE, body: { refreshToken }, jar, csrf: csrfToken },
    );

    expect(restored.status).toBe(200);
    expect(restored.body.accessToken).toBeTruthy();
    expect(restored.body.refreshToken).toBeTruthy();
  });

  it('refuses the staff restore when the cookie is presented without the header', async () => {
    const { refreshToken, jar } = await staffLogin();

    const blocked = await jarCall<{ code?: string }>(ctx.base, '/auth/refresh', {
      method: 'POST',
      headers: NATIVE,
      body: { refreshToken },
      jar,
    });

    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('auth.csrf_token_invalid');
  });
});
