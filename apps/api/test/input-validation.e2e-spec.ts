import {
  SEED_ORYX_AUTO_ADMIN,
  call,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Input-validation hardening regression suite (Execution 06 audit).
 *
 * The audit found query parameters that reached `new Date(...)` unvalidated.
 * An `Invalid Date` then failed deep inside Prisma and surfaced as a 500 for a
 * request the caller had simply malformed. A bad request is the caller's
 * mistake, so the contract is 400 — never 500.
 *
 * These tests pin that contract on every date-filtered read path, so a future
 * DTO that drops `@IsISO8601()` fails here instead of leaking a 500.
 */
describe('input validation hardening (Execution 06)', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('a malformed date filter is a 400, not a 500', () => {
    const paths = [
      '/reports/accounting',
      '/reports/sales',
      '/reports/purchasing',
      '/reports/inventory',
      '/accounting/general-ledger',
      '/accounting/trial-balance',
      '/accounting/income-statement',
      '/accounting/balance-sheet',
    ];

    it.each(paths)('%s rejects a non-ISO from/to', async (path) => {
      const res = await call(ctx.base, `${path}?from=not-a-date&to=also-bad`, { token });
      expect(res.status).toBe(400);
    });
  });

  describe('the bookings calendar requires a real date range', () => {
    it('rejects a request with no range', async () => {
      const res = await call(ctx.base, '/bookings/calendar', { token });
      expect(res.status).toBe(400);
    });

    it('rejects a malformed range', async () => {
      const res = await call(ctx.base, '/bookings/calendar?from=oops&to=nope', { token });
      expect(res.status).toBe(400);
    });

    it('accepts a valid range', async () => {
      const res = await call(ctx.base, '/bookings/calendar?from=2026-01-01&to=2026-12-31', {
        token,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
