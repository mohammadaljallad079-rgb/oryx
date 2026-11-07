import { SEED_ORYX_AUTO_ADMIN, call, createTestApp, login, type TestContext } from './test-app';

/**
 * Execution 16 — a malformed request is a 400, never a 500.
 *
 * A fuzz sweep of every GET route found two ways a caller could force a 500:
 *
 *   1. An unvalidated enum-ish `?status=` string reached a Prisma filter
 *      (`Invalid value for argument 'status'. Expected CompanyStatus.`), and a
 *      non-UUID `?companyId=` reached a UUID column (P2023). Both are the
 *      caller's mistake; `PrismaExceptionFilter` now maps them to a 400.
 *   2. `resolveCompanyId` in the RBAC controller threw a plain `Error`, which
 *      Nest reports as a 500 for what is a scoping mistake.
 *
 * This suite pins the contract on representative routes from each bug class so
 * a regression is caught here rather than by a fuzz run.
 */
describe('Execution 16 — malformed input never yields a 5xx (e2e)', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const expectClientError = async (path: string) => {
    const res = await call(ctx.base, path, { token });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  };

  describe('an unknown status filter is rejected, not crashed on', () => {
    const paths = [
      '/companies',
      '/subscriptions',
      '/sales/invoices',
      '/purchasing/orders',
      '/hr/employees',
      '/crm/leads',
      '/operations/work-orders',
      '/automotive/vehicles',
      '/payments/intents',
    ];

    it.each(paths)('%s returns a 4xx for ?status=%%20', async (path) => {
      await expectClientError(`${path}?status=%20`);
    });
  });

  describe('a non-UUID identifier is rejected, not crashed on', () => {
    const paths = [
      '/permissions/delegable',
      '/permissions/role-templates',
      '/sales/invoices',
      '/purchasing/orders',
    ];

    it.each(paths)('%s returns a 4xx for a non-UUID companyId', async (path) => {
      await expectClientError(`${path}?companyId=not-a-uuid`);
    });
  });

  describe('a numeric filter is validated', () => {
    it('a non-numeric page is rejected', async () => {
      await expectClientError('/companies?page=abc');
    });

    it('a negative pageSize is rejected', async () => {
      await expectClientError('/companies?pageSize=-5');
    });
  });
});
