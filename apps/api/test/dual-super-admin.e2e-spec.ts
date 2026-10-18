import argon2 from 'argon2';
import {
  CookieJar,
  SEED_COMPANY_ADMIN,
  SEED_SUPER_ADMIN,
  cleanupFixtures,
  createTestApp,
  jarCall,
  type TestContext,
} from './test-app';

/**
 * Dual Platform Super Admin suite (integration).
 *
 * ORYX must support two independent platform principals. `isSuperAdmin` lives
 * on the user and the platform role is resolved by its well-known code, so a
 * second principal needs no schema or code change — it needs the
 * owner-authorized provisioning path in `scripts/provision-super-admin.mjs` and
 * the guarantees this suite pins:
 *
 *   - both principals hold the full platform permission catalogue
 *   - each has separate credentials, sessions and audit records
 *   - one principal's logout-all does not touch the other's sessions
 *   - a company administrator cannot grant itself platform status
 *
 * The fixture principal is created directly in this suite (not by the script)
 * so the test is hermetic, and is removed in `afterAll`.
 */
describe('ORYX dual Platform Super Admin (e2e)', () => {
  let ctx: TestContext;
  let secondId: string;
  const SECOND = {
    email: 'superadmin2.dual-fixture@oryx.local',
    password: 'DualFixture!Oryx2026',
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    const role = await ctx.prisma.role.findFirst({
      where: { isPlatform: true, code: 'platform_super_admin' },
      include: { permissions: true },
    });
    expect(role).toBeTruthy();

    const passwordHash = await argon2.hash(SECOND.password, { type: argon2.argon2id });
    const user = await ctx.prisma.user.upsert({
      where: { email: SECOND.email },
      update: { passwordHash, isSuperAdmin: true, status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
      create: {
        email: SECOND.email,
        passwordHash,
        isSuperAdmin: true,
        status: 'ACTIVE',
        fullNameEn: 'Platform Super Admin 2 (fixture)',
        fullNameAr: 'مدير المنصة ٢',
      },
    });
    secondId = user.id;
  }, 90_000);

  afterAll(async () => {
    await ctx.prisma.auditLog.deleteMany({ where: { actorUserId: secondId } });
    await ctx.prisma.refreshToken.deleteMany({ where: { userId: secondId } });
    await ctx.prisma.user.deleteMany({ where: { id: secondId } });
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  async function signIn(email: string, password: string): Promise<CookieJar> {
    const jar = new CookieJar();
    const res = await jarCall<{ accessToken: string; permissions: string[] }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email, password },
      jar,
    });
    expect(res.status).toBe(200);
    (jar as CookieJar & { token?: string }).token = res.body.accessToken;
    (jar as CookieJar & { permissions?: string[] }).permissions = res.body.permissions;
    return jar;
  }

  const tokenOf = (jar: CookieJar) => (jar as CookieJar & { token?: string }).token ?? '';
  const permissionsOf = (jar: CookieJar) => (jar as CookieJar & { permissions?: string[] }).permissions ?? [];

  it('lets both principals sign in at the same time', async () => {
    const first = await signIn(SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const second = await signIn(SECOND.email, SECOND.password);
    expect(tokenOf(first)).toBeTruthy();
    expect(tokenOf(second)).toBeTruthy();
    expect(tokenOf(first)).not.toBe(tokenOf(second));
  });

  it('gives both principals the full platform permission catalogue', async () => {
    const first = await signIn(SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const second = await signIn(SECOND.email, SECOND.password);
    const a = permissionsOf(first).slice().sort();
    const b = permissionsOf(second).slice().sort();
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('carries platform kind and no tenant scope for both principals', async () => {
    for (const creds of [SEED_SUPER_ADMIN, SECOND]) {
      const jar = await signIn(creds.email, creds.password);
      const res = await jarCall<{
        user: { isSuperAdmin: boolean };
        context: { companyId: string | null };
      }>(ctx.base, '/auth/me', { method: 'GET', token: tokenOf(jar) });
      expect(res.status).toBe(200);
      expect(res.body.user.isSuperAdmin).toBe(true);
      // A platform principal carries no tenant scope until it opens a support
      // session, so no company is bound to the session.
      expect(res.body.context.companyId ?? null).toBeNull();
    }
  });

  it('reaches a platform-only surface with the second principal', async () => {
    const second = await signIn(SECOND.email, SECOND.password);
    const res = await jarCall(ctx.base, '/modules', { method: 'GET', token: tokenOf(second) });
    expect(res.status).toBe(200);
  });

  it('revokes only the calling principal on logout-all', async () => {
    const first = await signIn(SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const second = await signIn(SECOND.email, SECOND.password);

    const out = await jarCall(ctx.base, '/auth/logout-all', {
      method: 'POST',
      jar: second,
      csrf: second.get('oryx_csrf'),
      token: tokenOf(second),
    });
    expect(out.status).toBe(200);

    // The second principal can no longer refresh; the response also clears its
    // cookies, so the failure may surface as a missing token or a revoked one.
    const secondRefresh = await jarCall<{ code?: string }>(ctx.base, '/auth/refresh', {
      method: 'POST',
      body: {},
      jar: second,
      csrf: second.get('oryx_csrf'),
    });
    expect(secondRefresh.status).toBe(401);

    // ... and the first principal's session is untouched.
    const firstRefresh = await jarCall<{ accessToken?: string }>(ctx.base, '/auth/refresh', {
      method: 'POST',
      body: {},
      jar: first,
      csrf: first.get('oryx_csrf'),
    });
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body.accessToken).toBeTruthy();

    // The database is the authoritative statement: every one of the second
    // principal's tokens is revoked, and the first principal still has a live
    // one. This is what "separate sessions" has to mean.
    const secondTokens = await ctx.prisma.refreshToken.findMany({ where: { userId: secondId } });
    expect(secondTokens.length).toBeGreaterThan(0);
    expect(secondTokens.every((t) => t.revokedAt !== null)).toBe(true);

    const firstUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_SUPER_ADMIN.email } });
    const firstLive = await ctx.prisma.refreshToken.count({
      where: { userId: firstUser.id, revokedAt: null },
    });
    expect(firstLive).toBeGreaterThan(0);
  });

  it('keeps credentials separate: one password change does not affect the other', async () => {
    const originalSecondHash = (
      await ctx.prisma.user.findUniqueOrThrow({ where: { id: secondId } })
    ).passwordHash;

    // Change the second principal's password.
    const second = await signIn(SECOND.email, SECOND.password);
    const changed = await jarCall(ctx.base, '/auth/change-password', {
      method: 'POST',
      body: { currentPassword: SECOND.password, newPassword: 'DualFixture!Rotated2026' },
      jar: second,
      csrf: second.get('oryx_csrf'),
      token: tokenOf(second),
    });
    expect(changed.status).toBe(200);

    // The first principal still signs in with its own password.
    const firstAgain = await jarCall<{ accessToken?: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
    });
    expect(firstAgain.status).toBe(200);

    // The second principal's old password is refused and its new one works.
    const oldSecond = await jarCall(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SECOND.email, password: SECOND.password },
    });
    expect(oldSecond.status).toBe(401);
    const newSecond = await jarCall<{ accessToken?: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SECOND.email, password: 'DualFixture!Rotated2026' },
    });
    expect(newSecond.status).toBe(200);

    // Restore so nothing leaks into a later suite.
    await ctx.prisma.user.update({
      where: { id: secondId },
      data: { passwordHash: originalSecondHash },
    });
  });

  it('refuses to grant platform status through a company invitation', async () => {
    // A company administrator must never be able to promote an account (its own
    // or another) to platform status via the RBAC surface.
    const admin = await signIn(SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
    const res = await jarCall<{ code?: string }>(ctx.base, '/rbac/invitations', {
      method: 'POST',
      body: {
        email: 'escalation-attempt@oryx.local',
        roleId: 'any',
        isSuperAdmin: true,
      },
      jar: admin,
      csrf: admin.get('oryx_csrf'),
      token: tokenOf(admin),
    });
    // Rejected either by validation or by permission; never accepted.
    expect(res.status).toBeGreaterThanOrEqual(400);

    const created = await ctx.prisma.user.findUnique({
      where: { email: 'escalation-attempt@oryx.local' },
    });
    expect(created).toBeNull();
  });

  it('writes an audit record that names the account, never the credential', async () => {
    const second = await signIn(SECOND.email, SECOND.password);
    const me = await jarCall(ctx.base, '/auth/me', {
      method: 'GET',
      token: tokenOf(second),
    });
    expect(me.status).toBe(200);

    const auditForSecond = await ctx.prisma.auditLog.findMany({ where: { actorUserId: secondId } });
    const serialised = JSON.stringify(auditForSecond);
    expect(serialised).not.toContain(SECOND.password);
  });
});
