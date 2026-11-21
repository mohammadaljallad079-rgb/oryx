import { SEED_ORYX_AUTO_ADMIN, SEED_SUPER_ADMIN, cleanupFixtures, createTestApp, call, type TestContext } from './test-app';

/**
 * Native-client (mobile ERP) session contract.
 *
 * A device has no cookie jar, so the staff plane returns the refresh token in
 * the response body **only** when the request identifies itself with
 * `x-oryx-client: mobile`. The browser path must keep hiding it, or the
 * HttpOnly-cookie guarantee the whole staff session model rests on is gone.
 *
 * This suite pins both halves of that contract:
 *   - the native path receives a usable, rotating refresh token in the body
 *   - the browser path never receives one
 *   - a body-carried token rotates without any cookie
 *   - the header is the only switch: no client can opt in by accident
 */
describe('ORYX API native client session (e2e)', () => {
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

  it('returns a refresh token in the body for a native client', async () => {
    const res = await call<{ accessToken?: string; refreshToken?: string; csrfToken?: string }>(
      ctx.base,
      '/auth/login',
      {
        method: 'POST',
        body: { email: SEED_ORYX_AUTO_ADMIN.email, password: SEED_ORYX_AUTO_ADMIN.password },
        headers: NATIVE,
      },
    );

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // The CSRF token is still issued: the web export of the app echoes it.
    expect(res.body.csrfToken).toBeTruthy();
  });

  it('never returns a refresh token to a browser client', async () => {
    const res = await call<{ accessToken?: string; refreshToken?: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_ORYX_AUTO_ADMIN.email, password: SEED_ORYX_AUTO_ADMIN.password },
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    // The whole point of the HttpOnly cookie: a script must never see this.
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('ignores an unrecognised client marker', async () => {
    const res = await call<{ refreshToken?: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_ORYX_AUTO_ADMIN.email, password: SEED_ORYX_AUTO_ADMIN.password },
      headers: { 'x-oryx-client': 'browser' },
    });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('rotates a body-carried refresh token with no cookie present', async () => {
    const login = await call<{ refreshToken: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_ORYX_AUTO_ADMIN.email, password: SEED_ORYX_AUTO_ADMIN.password },
      headers: NATIVE,
    });
    expect(login.status).toBe(200);

    // Deliberately no jar: this is the native request shape.
    const rotated = await call<{ accessToken?: string; refreshToken?: string }>(ctx.base, '/auth/refresh', {
      method: 'POST',
      body: { refreshToken: login.body.refreshToken },
      headers: NATIVE,
    });

    expect(rotated.status).toBe(200);
    expect(rotated.body.accessToken).toBeTruthy();
    expect(rotated.body.refreshToken).toBeTruthy();
    // Rotation must mint a new token, not echo the presented one.
    expect(rotated.body.refreshToken).not.toBe(login.body.refreshToken);

    const me = await call<{ user?: { email?: string } }>(ctx.base, '/auth/me', {
      token: rotated.body.accessToken,
    });
    expect(me.status).toBe(200);
    expect(me.body.user?.email).toBe(SEED_ORYX_AUTO_ADMIN.email);
  });

  it('exposes company and branch scope to a native client', async () => {
    const login = await call<{ accessToken: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_ORYX_AUTO_ADMIN.email, password: SEED_ORYX_AUTO_ADMIN.password },
      headers: NATIVE,
    });

    const context = await call<{ companies?: unknown[]; branches?: unknown[]; licensedModules?: string[] }>(
      ctx.base,
      '/auth/context',
      { token: login.body.accessToken },
    );

    expect(context.status).toBe(200);
    expect(Array.isArray(context.body.companies)).toBe(true);
    expect((context.body.companies ?? []).length).toBeGreaterThan(0);
    expect(Array.isArray(context.body.licensedModules)).toBe(true);
  });

  it('refuses a refresh with no token at all', async () => {
    const res = await call(ctx.base, '/auth/refresh', {
      method: 'POST',
      body: {},
      headers: NATIVE,
    });

    expect(res.status).toBe(401);
  });

  it('still hides the refresh token from the platform login path', async () => {
    const res = await call<{ refreshToken?: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
    });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
  });
});
