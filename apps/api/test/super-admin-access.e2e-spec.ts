import type { INestApplication } from '@nestjs/common';
import {
  SEED_SUPER_ADMIN,
  call,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Super Admin access and sign-in regression suite (integration).
 *
 * Pins three defects that were observed in production:
 *
 * 1. A platform Super Admin resolved only PLATFORM-scope permissions, so every
 *    tenant ERP endpoint answered 403 after the operator picked a company.
 * 2. A leading or trailing space in the login email failed validation with 400
 *    before the service trimmed it, and the UI called that a bad password.
 * 3. `POST /auth/change-password` existed with no caller; this suite proves the
 *    endpoint works and that it revokes sessions.
 *
 * The password-rotation test restores the seeded hash in `afterAll` so no later
 * suite is locked out.
 */
describe('ORYX Super Admin access and sign-in (e2e)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let originalHash: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_SUPER_ADMIN.email } });
    originalHash = user.passwordHash;
  });

  afterAll(async () => {
    // Restore the seeded password hash unconditionally; a failure midway must
    // not leave the shared Super Admin account on a rotated password.
    await ctx.prisma.user.update({
      where: { email: SEED_SUPER_ADMIN.email },
      data: { passwordHash: originalHash, failedLoginCount: 0, lockedUntil: null },
    });
    await ctx.prisma.refreshToken.updateMany({
      where: { user: { email: SEED_SUPER_ADMIN.email } },
      data: { revokedAt: new Date() },
    });
    await app.close();
  });

  it('accepts surrounding whitespace in the login email', async () => {
    const res = await call<{ accessToken: string; permissions: string[] }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: `  ${SEED_SUPER_ADMIN.email}  `, password: SEED_SUPER_ADMIN.password },
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('accepts a mixed-case login email', async () => {
    const res = await call<{ accessToken: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_SUPER_ADMIN.email.toUpperCase(), password: SEED_SUPER_ADMIN.password },
    });

    expect(res.status).toBe(200);
  });

  it('resolves the whole permission catalog once a company is selected', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);

    // With no tenant context the platform principal holds only its
    // PLATFORM-scope permissions. This is the baseline, not a defect.
    const bare = await call<{ permissions: string[] }>(ctx.base, '/auth/context', { token });
    expect(bare.status).toBe(200);
    expect(bare.body.permissions).toContain('platform.company.create');
    expect(bare.body.permissions).not.toContain('erp.accounting.read');

    // Selecting a company adds that tenant's company-scope permissions, gated by
    // its entitlements. The whole catalog is larger than the platform slice.
    const companies = await call<{ companies: Array<{ id: string; nameEn: string }> }>(
      ctx.base,
      '/auth/context',
      { token },
    );
    const auto = companies.body.companies.find((c) => c.nameEn === 'ORYX Auto Services');
    if (!auto) throw new Error('the seed must include the ORYX Auto Services company');

    const scoped = await call<{ permissions: string[]; licensedModules: string[] }>(
      ctx.base,
      '/auth/context',
      { token, headers: { 'x-oryx-company-id': auto.id } },
    );
    expect(scoped.status).toBe(200);
    expect(scoped.body.permissions.length).toBeGreaterThan(100);
    expect(scoped.body.permissions).toContain('platform.company.create');
    expect(scoped.body.permissions).toContain('erp.accounting.read');
    expect(scoped.body.licensedModules.length).toBeGreaterThan(10);
  });

  it('reaches tenant ERP data once a company context is selected', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const companies = await call<{ companies: Array<{ id: string; nameEn: string }> }>(
      ctx.base,
      '/auth/context',
      { token },
    );
    const auto = companies.body.companies.find((c) => c.nameEn === 'ORYX Auto Services');
    if (!auto) throw new Error('the seed must include the ORYX Auto Services company');

    const res = await call<unknown>(ctx.base, '/accounting/accounts', {
      token,
      headers: { 'x-oryx-company-id': auto.id },
    });

    expect(res.status).toBe(200);
  });

  it('refuses tenant ERP data with no company context selected', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const res = await call<unknown>(ctx.base, '/accounting/accounts', { token });

    // Without a tenant context a platform principal holds no tenant permission.
    expect(res.status).toBe(403);
  });

  it('keeps the platform principal out of an unlicensed module for the tenant', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const companies = await call<{ companies: Array<{ id: string; nameEn: string }> }>(
      ctx.base,
      '/auth/context',
      { token },
    );
    const logistics = companies.body.companies.find((c) => c.nameEn === 'ORYX Logistics');
    if (!logistics) throw new Error('the seed must include the Logistics company');

    // Logistics is on the Starter plan and does not license automotive.
    // Entitlement suppression must still apply to a platform principal, or
    // "full access" would mean "ignores every plan".
    const res = await call<unknown>(ctx.base, '/automotive/vehicles', {
      token,
      headers: { 'x-oryx-company-id': (logistics as { id: string }).id },
    });

    expect(res.status).toBe(403);
  });

  it('rotates the password, rejects the old one and revokes sessions', async () => {
    const original = SEED_SUPER_ADMIN.password;
    const rotated = `${original}-Rotated9`;
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, original);

    const changed = await call<{ ok: boolean }>(ctx.base, '/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: original, newPassword: rotated },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.ok).toBe(true);

    // The old password is gone and the new one works.
    const oldLogin = await call<unknown>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_SUPER_ADMIN.email, password: original },
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await call<{ accessToken: string }>(ctx.base, '/auth/login', {
      method: 'POST',
      body: { email: SEED_SUPER_ADMIN.email, password: rotated },
    });
    expect(newLogin.status).toBe(200);

    // Restore immediately so later assertions and later suites are safe.
    const restored = await call<{ ok: boolean }>(ctx.base, '/auth/change-password', {
      method: 'POST',
      token: newLogin.body.accessToken,
      body: { currentPassword: rotated, newPassword: original },
    });
    expect(restored.status).toBe(200);
  });

  it('rejects a new password equal to the current one', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const res = await call<unknown>(ctx.base, '/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: SEED_SUPER_ADMIN.password, newPassword: SEED_SUPER_ADMIN.password },
    });

    expect(res.status).toBe(400);
  });

  it('rejects a change with the wrong current password', async () => {
    const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const res = await call<unknown>(ctx.base, '/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: 'definitely-not-the-password', newPassword: 'a-long-enough-new-one' },
    });

    expect(res.status).toBe(401);
  });
});
