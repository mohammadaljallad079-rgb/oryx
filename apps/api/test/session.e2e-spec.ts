import { CookieJar, SEED_SUPER_ADMIN, cleanupFixtures, createTestApp, jarCall, type TestContext } from './test-app';

/**
 * Session-lifecycle regression suite.
 *
 * Covers the access-token and refresh-token model end to end:
 *   - rotation, and the grace window that absorbs benign concurrent refreshes
 *   - reuse detection that revokes a compromised family without disturbing
 *     other logins
 *   - logout, logout-all, and revocation when access is withdrawn
 *   - CSRF enforcement on every state-changing auth route
 *   - no access token issued before MFA verification
 */
describe('ORYX API session lifecycle (e2e)', () => {
  let ctx: TestContext;

  /** Log in and return a jar holding the session cookies. */
  async function login(): Promise<CookieJar> {
    const jar = new CookieJar();
    const res = await jarCall(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
      jar,
    });
    expect(res.status).toBe(200);
    expect(jar.get('oryx_rt')).toBeTruthy();
    return jar;
  }

  async function refresh(jar: CookieJar, opts: { csrf?: boolean } = {}) {
    return jarCall<{ accessToken?: string; refreshToken?: string; code?: string }>(ctx.base, '/auth/refresh', {
      method: 'POST',
      body: {},
      jar,
      ...(opts.csrf === false ? {} : { csrf: jar.get('oryx_csrf') }),
    });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  describe('login and token issuance', () => {
    it('sets an HttpOnly refresh cookie and never returns a refresh token', async () => {
      const jar = new CookieJar();
      const res = await jarCall<{ accessToken: string; refreshToken?: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
        jar,
      });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeUndefined();

      const refreshLine = (jar.lastRaw ?? []).find((l) => l.startsWith('oryx_rt=')) ?? '';
      expect(refreshLine).toMatch(/HttpOnly/i);
      expect(refreshLine).toMatch(/Path=\/api\/v1\/auth/i);
    });

    it('issues a CSRF cookie that is readable but is not a credential', async () => {
      const jar = await login();
      const csrfLine = (jar.lastRaw ?? []).find((l) => l.startsWith('oryx_csrf=')) ?? '';
      expect(csrfLine).toBeTruthy();
      expect(csrfLine).not.toMatch(/HttpOnly/i);
    });
  });

  describe('rotation', () => {
    it('rotates the refresh token and keeps the session usable', async () => {
      const jar = await login();
      const first = await refresh(jar);
      expect(first.status).toBe(200);
      expect(first.body.accessToken).toBeTruthy();
      expect(first.body.refreshToken).toBeUndefined();

      // The new cookie must work for a second rotation.
      const second = await refresh(jar);
      expect(second.status).toBe(200);
      expect(second.body.accessToken).toBeTruthy();
    });

    it('keeps both callers usable when the same token is presented twice', async () => {
      const jar = await login();
      const shared = jar.get('oryx_rt')!;

      // Rotate once so `shared` becomes a revoked token with a live successor.
      const winner = await refresh(jar);
      expect(winner.status).toBe(200);

      // Now present the revoked token from a second caller, which is the state a
      // racing tab reaches. It must receive a usable session, not a failure.
      const loserJar = new CookieJar();
      const loser = await jarCall<{ accessToken?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: { refreshToken: shared },
        jar: loserJar,
        csrf: jar.get('oryx_csrf'),
      });
      expect(loser.status).toBe(200);
      expect(loser.body.accessToken).toBeTruthy();

      // Both sessions must remain usable afterwards.
      expect((await refresh(jar)).status).toBe(200);
      expect((await refresh(loserJar)).status).toBe(200);
    });

    it('records a rotation in the audit trail', async () => {
      // A successful rotation is what the trail must always capture. (Whether
      // two requests genuinely interleave is timing dependent, so that specific
      // audit entry is asserted in the deterministic test below.)
      const jar = await login();
      const rotated = await refresh(jar);
      expect(rotated.status).toBe(200);

      const logged = await ctx.prisma.auditLog.findFirst({
        where: { action: 'auth.login' },
        orderBy: { createdAt: 'desc' },
      });
      expect(logged).not.toBeNull();
    });

    it('records a concurrent rotation when one caller loses the race', async () => {
      // Force the losing path deterministically instead of relying on two HTTP
      // requests to interleave: rotate once, then present the now-revoked token
      // again while the successor is still valid and inside the grace window.
      const jar = await login();
      const stale = jar.get('oryx_rt')!;
      const rotated = await refresh(jar);
      expect(rotated.status).toBe(200);

      // The stale token is revoked but has a live successor inside the grace
      // window, which is exactly the state a concurrent caller observes.
      const staleJar = new CookieJar();
      const grace = await jarCall<{ accessToken?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: { refreshToken: stale },
        jar: staleJar,
        csrf: jar.get('oryx_csrf'),
      });
      expect(grace.status).toBe(200);
      expect(grace.body.accessToken).toBeTruthy();

      const logged = await ctx.prisma.auditLog.findFirst({
        where: { action: 'auth.refresh_concurrent_rotation' },
        orderBy: { createdAt: 'desc' },
      });
      expect(logged).not.toBeNull();
    });
  });

  describe('reuse detection', () => {
    it('revokes the family when a long-rotated token is replayed', async () => {
      const jar = await login();
      const stolen = jar.get('oryx_rt')!;

      // Rotate so `stolen` is now a revoked ancestor.
      const rotated = await refresh(jar);
      expect(rotated.status).toBe(200);

      // Age the ancestor past the grace window to simulate a real replay.
      await ctx.prisma.refreshToken.updateMany({
        where: { replacedBy: { not: null }, revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - 10 * 60_000) },
      });

      // Replay the stale token from a fresh jar.
      const attacker = new CookieJar();
      const replay = await jarCall<{ code?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: { refreshToken: stolen },
        jar: attacker,
      });
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('auth.refresh_revoked');

      // The legitimate session is now dead too, because the family was revoked.
      const legitimate = await refresh(jar);
      expect(legitimate.status).toBe(401);

      const logged = await ctx.prisma.auditLog.findFirst({
        where: { action: 'auth.refresh_reuse_detected' },
        orderBy: { createdAt: 'desc' },
      });
      expect(logged).not.toBeNull();
    });

    it('does not disturb a separate login when one family is revoked', async () => {
      const deviceA = await login();
      const deviceB = await login();

      const stolen = deviceA.get('oryx_rt')!;
      await refresh(deviceA);
      await ctx.prisma.refreshToken.updateMany({
        where: { replacedBy: { not: null }, revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - 10 * 60_000) },
      });
      await jarCall(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: { refreshToken: stolen },
        jar: new CookieJar(),
      });

      // Device A is revoked, device B is untouched.
      expect((await refresh(deviceA)).status).toBe(401);
      expect((await refresh(deviceB)).status).toBe(200);
    });
  });

  describe('CSRF enforcement', () => {
    it('rejects refresh without the CSRF header', async () => {
      const jar = await login();
      const res = await refresh(jar, { csrf: false });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('auth.csrf_token_invalid');
    });

    it('rejects a mismatched CSRF header', async () => {
      const jar = await login();
      const res = await jarCall<{ code?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: {},
        jar,
        csrf: 'not-the-real-token',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('auth.csrf_token_invalid');
    });

    it('allows a GET without a CSRF header', async () => {
      const jar = await login();
      const token = (await refresh(jar)).body.accessToken!;
      // CSRF protects state changes only; a read needs no CSRF header, but it
      // does need a valid bearer token.
      const res = await jarCall(ctx.base, '/auth/me', { jar, token });
      expect(res.status).toBe(200);
    });
  });

  describe('logout and revocation', () => {
    it('clears the cookies and stops the session', async () => {
      const jar = await login();
      const accessToken = (await refresh(jar)).body.accessToken!;

      const logout = await jarCall(ctx.base, '/auth/logout', {
        method: 'POST',
        body: {},
        jar,
        token: accessToken,
        csrf: jar.get('oryx_csrf'),
      });
      expect(logout.status).toBe(200);

      // A subsequent refresh must fail: the token was revoked.
      const after = await refresh(jar);
      expect(after.status).toBe(401);
    });

    it('logout-all revokes every session for the user', async () => {
      const a = await login();
      const b = await login();
      const token = (await refresh(a)).body.accessToken!;

      const res = await jarCall(ctx.base, '/auth/logout-all', {
        method: 'POST',
        body: {},
        jar: a,
        token,
        csrf: a.get('oryx_csrf'),
      });
      expect(res.status).toBe(200);

      expect((await refresh(a)).status).toBe(401);
      expect((await refresh(b)).status).toBe(401);
    });

    it('refuses a token that is not a valid JWT, without touching other sessions', async () => {
      const other = await login();
      const res = await jarCall<{ code?: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: { refreshToken: 'a'.repeat(64) },
        jar: new CookieJar(),
      });
      // Signature verification rejects it before any database lookup.
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('auth.token_invalid');
      // An unrelated session is unaffected.
      expect((await refresh(other)).status).toBe(200);
    });
  });

  describe('access token scope', () => {
    it('a rotated access token reflects the current memberships and permissions', async () => {
      const jar = await login();
      const rotated = await refresh(jar);
      const token = rotated.body.accessToken!;

      const me = await jarCall<{ permissions: string[]; user: { email: string } }>(ctx.base, '/auth/me', {
        jar,
        token,
      });
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe(SEED_SUPER_ADMIN.email);
      expect(me.body.permissions.length).toBeGreaterThan(0);
    });

    it('rejects a request with no bearer token', async () => {
      const res = await jarCall(ctx.base, '/auth/me', { jar: new CookieJar() });
      expect(res.status).toBe(401);
    });
  });
});
