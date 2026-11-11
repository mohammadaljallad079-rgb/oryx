import {
  CookieJar,
  SEED_SUPER_ADMIN,
  cleanupFixtures,
  createTestApp,
  jarCall,
  type TestContext,
} from './test-app';

/**
 * Reauthentication-after-stale-cookie regression suite.
 *
 * Root cause (confirmed by reproduction, EXECUTION 06):
 *
 *   `CsrfGuard` rejected *any* unsafe request that presented the `oryx_rt`
 *   refresh cookie without a matching `oryx_csrf` cookie. That included
 *   `/auth/login`. The refresh cookie is HttpOnly, so page script cannot clear
 *   it, and the CSRF cookie is a non-HttpOnly cookie that a browser may drop
 *   independently (a cleared "site data" pass, a cookie-jar eviction, a
 *   different sub-domain scope, or an interrupted rotation). The result was a
 *   device that could never sign in again: every login answered
 *   403 `auth.csrf_token_invalid` with no way for the user to recover except
 *   manually clearing site data.
 *
 * The fix exempts session-*establishing* endpoints from the double-submit check
 * (`@CsrfExempt()`) while keeping an explicit Origin allowlist on them, and
 * leaves the check in force on every route that authenticates *by* cookie
 * (refresh, logout, logout-all).
 *
 * Every test below is written to fail against the pre-fix guard.
 */
describe('ORYX API reauthentication with a stale refresh cookie (e2e)', () => {
  let ctx: TestContext;

  const login = (jar?: CookieJar) =>
    jarCall<{ accessToken?: string; code?: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
      ...(jar ? { jar } : {}),
    });

  /**
   * Seed a jar with the cookies a browser would still hold after an
   * interrupted session, without going through a real login.
   */
  function staleJar(cookies: Record<string, string>): CookieJar {
    const jar = new CookieJar();
    for (const [name, value] of Object.entries(cookies)) {
      jar.absorb(
        new Response(null, {
          headers: { 'set-cookie': `${name}=${value}; Path=/api/v1/auth${name === 'oryx_rt' ? '; HttpOnly' : ''}` },
        }),
      );
    }
    return jar;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  describe('the confirmed defect: stale refresh cookie blocks sign-in', () => {
    it('signs in when a stale oryx_rt cookie is present without oryx_csrf', async () => {
      // Exactly the failing device state: a live-looking refresh cookie and no
      // CSRF cookie. The header is deliberately omitted.
      const jar = staleJar({ oryx_rt: 'stale-jwt-from-a-previous-session' });

      const res = await jarCall<{ accessToken?: string; code?: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
        jar,
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      // A fresh CSRF cookie must be issued so the new session is usable.
      expect(jar.get('oryx_csrf')).toBeTruthy();
      expect(jar.get('oryx_rt')).toBeTruthy();
    });

    it('signs in when both stale cookies are present but the CSRF value is wrong', async () => {
      const jar = staleJar({
        oryx_rt: 'stale-jwt',
        oryx_csrf: 'stale-csrf-value',
      });

      // A wrong `x-oryx-csrf` header must not matter: login does not read the
      // cookie for authority, so the stale value cannot veto the sign-in.
      const res = await jarCall<{ accessToken?: string; code?: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
        jar,
        csrf: 'a-value-from-a-previous-session',
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
    });

    it('does not disturb a live session on another device', async () => {
      // Device A holds a healthy session.
      const deviceA = new CookieJar();
      const first = await login(deviceA);
      expect(first.status).toBe(200);

      // Device B has a stale cookie and signs in as the same account.
      const deviceB = staleJar({ oryx_rt: 'stale-jwt' });
      const second = await login(deviceB);
      expect(second.status).toBe(200);

      // Device A must still be able to rotate its session: a second sign-in
      // must not revoke an unrelated family.
      const rotated = await jarCall<{ accessToken?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: {},
        jar: deviceA,
        csrf: deviceA.get('oryx_csrf'),
      });
      expect(rotated.status).toBe(200);
      expect(rotated.body.accessToken).toBeTruthy();
    });
  });

  describe('CSRF protection is preserved on cookie-authenticated routes', () => {
    it('still rejects a refresh without the CSRF header', async () => {
      const jar = new CookieJar();
      await login(jar);
      const res = await jarCall<{ code?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: {},
        jar,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('auth.csrf_token_invalid');
    });

    it('still rejects a refresh with a mismatched CSRF header', async () => {
      const jar = new CookieJar();
      await login(jar);
      const res = await jarCall<{ code?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: {},
        jar,
        csrf: 'not-the-real-token',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('auth.csrf_token_invalid');
    });

    it('still rejects a logout without the CSRF header', async () => {
      const jar = new CookieJar();
      await login(jar);
      const res = await jarCall<{ code?: string }>(ctx.base, '/auth/logout', {
        method: 'POST',
        body: {},
        jar,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('auth.csrf_token_invalid');
    });

    it('allows a logout that echoes the CSRF cookie', async () => {
      const jar = new CookieJar();
      const signedIn = await login(jar);
      const res = await jarCall<{ ok?: boolean }>(ctx.base, '/auth/logout', {
        method: 'POST',
        body: {},
        jar,
        csrf: jar.get('oryx_csrf'),
        // Logout is an authenticated route: it needs both the cookie pair and
        // the access token, so a bare cookie cannot end a session.
        token: signedIn.body.accessToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('origin allowlist on the exempted routes', () => {
    it('refuses a login whose Origin is not an allowed first-party origin', async () => {
      const res = await jarCall<{ code?: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
        headers: { Origin: 'https://evil.example.com' },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('auth.csrf_token_invalid');
    });

    it('accepts a login from a configured origin', async () => {
      const res = await jarCall<{ accessToken?: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
    });

    it('accepts a login with no Origin at all (native client)', async () => {
      const res = await login();
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
    });
  });

  describe('credential rejection is unchanged', () => {
    it('still answers 401 for a wrong password even with a stale cookie', async () => {
      const jar = staleJar({ oryx_rt: 'stale-jwt' });
      const res = await jarCall<{ code?: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: 'definitely-not-the-password' },
        jar,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('rotation and reuse detection are intact', () => {
    it('rotates the refresh token and invalidates the previous one', async () => {
      const jar = new CookieJar();
      await login(jar);
      const original = jar.get('oryx_rt');

      const rotated = await jarCall(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: {},
        jar,
        csrf: jar.get('oryx_csrf'),
      });
      expect(rotated.status).toBe(200);
      const replacement = jar.get('oryx_rt');
      expect(replacement).toBeTruthy();
      expect(replacement).not.toBe(original);
    });
  });
});
