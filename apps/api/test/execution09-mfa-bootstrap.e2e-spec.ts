import {
  SEED_SUPER_ADMIN,
  cleanupFixtures,
  createTestApp,
  login,
  call,
  type TestContext,
} from './test-app';

/**
 * Regression: the MFA enrollment bootstrap.
 *
 * With `MFA_REQUIRE_SUPER_ADMIN=true`, an unenrolled Super Admin must still be
 * able to reach the routes that let it enroll. Before the fix the guard blocked
 * *every* route, including `mfa/enroll`, `mfa/status` and `me` — so a fresh
 * production deploy (which the runbook tells the owner to protect this way)
 * locked the owner out: login succeeded, `me` returned 403, the shell dropped
 * the session and redirected to sign-in, forever.
 *
 * The exemption is deliberately narrow: only the self-service enrollment routes
 * and the identity route the shell needs are reachable, and the rest of the
 * platform stays blocked until the second factor exists.
 */
describe('ORYX API MFA enrollment bootstrap (e2e)', () => {
  let ctx: TestContext;
  const previous = process.env.MFA_REQUIRE_SUPER_ADMIN;

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
    process.env.MFA_REQUIRE_SUPER_ADMIN = 'true';
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.MFA_REQUIRE_SUPER_ADMIN;
    else process.env.MFA_REQUIRE_SUPER_ADMIN = previous;
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  });

  it('lets an unenrolled Super Admin reach the enrollment routes', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);

    const me = await call<{ user: { isSuperAdmin: boolean } }>(ctx.base, '/auth/me', { token });
    expect(me.status).toBe(200);
    expect(me.body.user.isSuperAdmin).toBe(true);

    const status = await call<{ enabled: boolean }>(ctx.base, '/auth/mfa/status', { token });
    expect(status.status).toBe(200);
    expect(status.body.enabled).toBe(false);

    const enroll = await call<{ secret: string; otpauthUri: string }>(ctx.base, '/auth/mfa/enroll', {
      method: 'POST',
      token,
      body: {},
    });
    expect(enroll.status).toBe(200);
    expect(enroll.body.secret).toBeTruthy();
    expect(enroll.body.otpauthUri).toContain('otpauth://totp/');
  });

  it('still blocks the platform until the second factor is enrolled', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);

    const companies = await call<{ code: string }>(ctx.base, '/companies', { token });
    expect(companies.status).toBe(403);
    expect(companies.body.code).toBe('auth.mfa_required');
  });
});
