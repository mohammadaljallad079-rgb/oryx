import * as argon2 from 'argon2';
import { MODULE_KEYS } from '@oryx/shared';
import { PrismaService } from '../src/common/prisma.service';
import { DocumentSequenceService } from '../src/common/document-sequence.service';
import { call, companyCall, createTestApp, login, type TestContext } from './test-app';

/**
 * Automatic document numbering.
 *
 * Every printed document number is the number the ERP allocated when the source
 * record was posted, so the numbering rules are a correctness property, not a
 * cosmetic one. These tests exercise the real HTTP surface and the real
 * `DocumentSequenceService`:
 *
 *  - numbers are sequential per company and per document type, and start at 1;
 *  - each document type has an independent counter;
 *  - each company has an independent counter, so tenants never share a series;
 *  - a concurrent burst of postings hands out every number exactly once;
 *  - a rolled-back transaction releases its number rather than burning it;
 *  - a created record keeps its number and the next allocation continues past it.
 */
describe('Automatic document numbering (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let sequences: DocumentSequenceService;

  const PREFIX = 'EP3NUM';
  const password = 'ep3-numbering-password-12345';

  let companyId = '';
  let otherCompanyId = '';
  let customerId = '';
  let otherCustomerId = '';
  let token = '';
  let otherToken = '';

  const email = `${PREFIX.toLowerCase()}-user@test.local`;
  const otherUserEmail = `${PREFIX.toLowerCase()}-other@test.local`;

  async function purgeFixtures() {
    const companies = await prisma.company.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const companyIds = companies.map((c) => c.id);

    await prisma.salesInvoiceLine.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } });
    await prisma.salesInvoice.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.quotation.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.documentSequence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { companyId: { in: companyIds } } } });
    await prisma.role.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }

  async function createStaff(targetCompanyId: string, staffEmail: string): Promise<string> {
    const role = await prisma.role.create({
      data: {
        companyId: targetCompanyId,
        code: `${PREFIX}_${staffEmail.split('@')[0]}`.slice(0, 60),
        nameEn: staffEmail,
        nameAr: staffEmail,
        isSystem: false,
        permissions: {
          create: [
            'erp.sales.read',
            'erp.sales.order.manage',
            'erp.sales.invoice.manage',
            'erp.accounting.read',
            'erp.dashboard.read',
          ].map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email: staffEmail, passwordHash, fullNameEn: staffEmail, fullNameAr: staffEmail, status: 'ACTIVE' },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId: targetCompanyId, roleId: role.id, isActive: true },
    });
    return login(ctx.base, staffEmail, password);
  }

  async function createCompany(code: string, nameEn: string, nameAr: string): Promise<string> {
    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const company = await prisma.company.create({
      data: { code, nameEn, nameAr, type: 'SAAS_TENANT', status: 'ACTIVE' },
    });
    await prisma.subscription.create({
      data: { companyId: company.id, planId: enterprise.id, status: 'ACTIVE', price: 0, licensedModules: [...MODULE_KEYS] },
    });
    return company.id;
  }

  /** Creates a quotation over HTTP and returns its allocated number. */
  async function createQuotation(targetCompanyId: string, authToken: string, custId: string): Promise<string> {
    const res = await companyCall<{ quoteNumber: string }>(ctx.base, targetCompanyId, '/sales/quotations', {
      method: 'POST',
      token: authToken,
      body: {
        customerId: custId,
        documentDate: '2026-03-01',
        lines: [{ description: 'Numbering probe', quantity: 1, unitPriceMinor: 1000 }],
      },
    });
    if (res.status !== 201) throw new Error(`quotation failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.quoteNumber;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    sequences = ctx.app.get(DocumentSequenceService);
    await purgeFixtures();

    companyId = await createCompany(`${PREFIX}-CO`, 'EP3 Numbering Co', 'شركة الترقيم');
    otherCompanyId = await createCompany(`${PREFIX}-OTHER`, 'EP3 Other Numbering Co', 'شركة أخرى');

    const customer = await prisma.customer.create({
      data: { companyId, code: `${PREFIX}-C1`, nameEn: 'Numbering Customer', nameAr: 'عميل الترقيم' },
    });
    customerId = customer.id;
    const otherCustomer = await prisma.customer.create({
      data: { companyId: otherCompanyId, code: `${PREFIX}-C2`, nameEn: 'Other Customer', nameAr: 'عميل آخر' },
    });
    otherCustomerId = otherCustomer.id;

    token = await createStaff(companyId, email);
    otherToken = await createStaff(otherCompanyId, otherUserEmail);
  }, 240_000);

  afterAll(async () => {
    await purgeFixtures();
    await ctx.app.close();
  }, 120_000);

  describe('the sequence itself', () => {
    it('allocates 1, 2, 3 in order and zero-pads to five digits', async () => {
      const numbers = await prisma.$transaction(async (tx) => [
        await sequences.next(tx, companyId, 'quotation'),
        await sequences.next(tx, companyId, 'quotation'),
        await sequences.next(tx, companyId, 'quotation'),
      ]);
      // The first three allocations of a fresh series.
      expect(numbers).toEqual(['QT-00001', 'QT-00002', 'QT-00003']);
    });

    it('keeps one counter per document type', async () => {
      // `salesInvoice` has never been allocated for this company, so it must
      // start at 1 even though `quotation` is already at 3.
      const [invoiceNumber, orderNumber] = await prisma.$transaction(async (tx) => [
        await sequences.next(tx, companyId, 'salesInvoice'),
        await sequences.next(tx, companyId, 'salesOrder'),
      ]);
      expect(invoiceNumber).toBe('SI-00001');
      expect(orderNumber).toBe('SO-00001');
    });

    it('keeps one counter per company, so tenants never share a series', async () => {
      const otherNumber = await prisma.$transaction((tx) => sequences.next(tx, otherCompanyId, 'quotation'));
      expect(otherNumber).toBe('QT-00001');
    });

    it('hands out every number exactly once under concurrent allocation', async () => {
      const target = otherCompanyId;
      const burst = 25;
      // Independent transactions racing on the same sequence row. The row lock
      // must serialise them: a lost update would hand two callers one number and
      // leave a gap.
      const results = await Promise.all(
        Array.from({ length: burst }, () =>
          prisma.$transaction((tx) => sequences.next(tx, target, 'salesOrder')),
        ),
      );
      const expected = Array.from({ length: burst }, (_, i) => `SO-${String(i + 1).padStart(5, '0')}`);
      expect([...results].sort()).toEqual(expected);
      expect(new Set(results).size).toBe(burst);
    });

    it('releases the number when the surrounding transaction rolls back', async () => {
      const before = await prisma.$transaction((tx) => sequences.next(tx, otherCompanyId, 'salesInvoice'));
      await expect(
        prisma.$transaction(async (tx) => {
          await sequences.next(tx, otherCompanyId, 'salesInvoice');
          throw new Error('deliberate rollback');
        }),
      ).rejects.toThrow('deliberate rollback');
      const after = await prisma.$transaction((tx) => sequences.next(tx, otherCompanyId, 'salesInvoice'));
      // The burned attempt must not have consumed a number.
      expect(before).toBe('SI-00001');
      expect(after).toBe('SI-00002');
    });
  });

  describe('over the real HTTP surface', () => {
    it('numbers a posted quotation from the same series the service allocates', async () => {
      const quoteNumber = await createQuotation(companyId, token, customerId);
      // The unit test above allocated QT-00001..3 for this company; the HTTP
      // posting must continue the series rather than restart it.
      expect(quoteNumber).toBe('QT-00004');
      const stored = await prisma.quotation.findFirstOrThrow({ where: { companyId, quoteNumber } });
      expect(stored.quoteNumber).toBe(quoteNumber);
    });

    it('continues past a stored record rather than reusing its number', async () => {
      const first = await createQuotation(companyId, token, customerId);
      const second = await createQuotation(companyId, token, customerId);
      expect(first).toBe('QT-00005');
      expect(second).toBe('QT-00006');
      // Both rows survive with distinct numbers.
      const rows = await prisma.quotation.findMany({ where: { companyId, quoteNumber: { in: [first, second] } } });
      expect(rows).toHaveLength(2);
    });

    it('gives a second tenant its own quotation series over HTTP', async () => {
      const otherQuote = await createQuotation(otherCompanyId, otherToken, otherCustomerId);
      expect(otherQuote).toBe('QT-00002');
    });

    it('exposes the allocated number in the list endpoint without gaps', async () => {
      const res = await companyCall<{ items: Array<{ quoteNumber: string }> }>(
        ctx.base,
        companyId,
        '/sales/quotations?page=1&pageSize=50',
        { token },
      );
      expect(res.status).toBe(200);
      const numbers = res.body.items.map((q) => q.quoteNumber).sort();
      // The three quotations this company created over HTTP: QT-00004..00006.
      expect(numbers).toEqual(['QT-00004', 'QT-00005', 'QT-00006']);
    });
  });

  describe('authorization', () => {
    it('refuses an unauthenticated allocation attempt', async () => {
      const res = await call(ctx.base, '/sales/quotations', {
        method: 'POST',
        body: { customerId, documentDate: '2026-03-01', lines: [{ description: 'x', quantity: 1, unitPriceMinor: 1 }] },
      });
      expect(res.status).toBe(401);
    });
  });
});
