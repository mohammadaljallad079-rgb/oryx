import * as argon2 from 'argon2';
import { PrismaService } from '../src/common/prisma.service';
import { call, createTestApp, login, SEED_SUPER_ADMIN, type TestContext } from './test-app';

/**
 * Execution 10, requirement A — the merchant document interface.
 *
 * Real HTTP against the running API, the real guards and the real Prisma layer.
 *
 * The property that matters is tenant isolation: the document register a
 * merchant sees is the register of the company its provider membership resolves
 * to, never a company named in the request. A merchant with no linked company
 * sees an empty register rather than the whole platform's, and a document that
 * belongs to another tenant is a `404` on every route — read, verification and
 * file — not a leaked download.
 */
describe('Execution 10 — merchant documents (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'E10DOC';
  const password = 'e10-doc-password-12345';

  let merchantToken = '';
  let otherMerchantToken = '';
  let merchantCompanyId = '';
  let otherCompanyId = '';
  let providerId = '';
  let otherProviderId = '';

  const merchantEmail = `${PREFIX.toLowerCase()}-merchant@test.local`;
  const otherMerchantEmail = `${PREFIX.toLowerCase()}-other@test.local`;

  /** An issued document owned by the given company. */
  async function seedDocument(companyId: string, documentNumber: string) {
    return prisma.officialDocument.create({
      data: {
        companyId,
        type: 'SALES_INVOICE',
        documentNumber,
        status: 'ISSUED',
        verificationToken: `${PREFIX}-${documentNumber}-token-0123456789`,
        sourceType: 'SalesInvoice',
        sourceId: `${PREFIX}-${documentNumber}-source`,
        payload: { kind: 'SALES_INVOICE' } as never,
        issuerNameEn: 'Oryx Auto Services',
        issuerNameAr: 'أوريكس للخدمات',
        issuerCode: 'ORYX-AUTO',
        pageCount: 1,
        byteSize: 1024,
      },
    });
  }

  /** Provision an Enterprise tenant with one admin linked to one provider. */
  async function provisionMerchant(params: {
    companyCode: string;
    providerCode: string;
    providerName: string;
    email: string;
  }) {
    const superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: params.companyCode,
        nameEn: `${params.providerName} Tenant`,
        nameAr: 'شركة',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    if (created.status !== 201) {
      throw new Error(`company create failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    const companyId = created.body.company.id;

    const adminRole = await prisma.role.findFirstOrThrow({ where: { companyId, code: 'company_admin' } });
    const user = await prisma.user.create({
      data: {
        email: params.email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        fullNameEn: params.providerName,
        fullNameAr: 'مزود',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId, roleId: adminRole.id, isActive: true },
    });

    // The provider must be linked to its own tenant company, or the portal has
    // no company to scope a document read to and every list is legitimately empty.
    const provider = await prisma.marketplaceProvider.create({
      data: {
        code: params.providerCode,
        nameEn: params.providerName,
        nameAr: 'مزود',
        status: 'APPROVED',
        approvedAt: new Date(),
        providerCompanyId: companyId,
      },
    });
    await prisma.providerUser.create({
      data: { providerId: provider.id, userId: user.id, role: 'OWNER', isActive: true },
    });

    const token = await login(ctx.base, params.email, password);
    return { companyId, providerId: provider.id, token };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;

    const merchant = await provisionMerchant({
      companyCode: `${PREFIX}-MERCH`,
      providerCode: `${PREFIX}-PROV`,
      providerName: 'E10 Doc Merchant',
      email: merchantEmail,
    });
    merchantCompanyId = merchant.companyId;
    providerId = merchant.providerId;
    merchantToken = merchant.token;

    const other = await provisionMerchant({
      companyCode: `${PREFIX}-OTHER`,
      providerCode: `${PREFIX}-OPROV`,
      providerName: 'E10 Other Merchant',
      email: otherMerchantEmail,
    });
    otherCompanyId = other.companyId;
    otherProviderId = other.providerId;
    otherMerchantToken = other.token;

    await seedDocument(merchantCompanyId, `${PREFIX}-INV-001`);
    await seedDocument(merchantCompanyId, `${PREFIX}-INV-002`);
    await seedDocument(otherCompanyId, `${PREFIX}-OTHER-001`);
  }, 240_000);

  afterAll(async () => {
    const companyIds = [merchantCompanyId, otherCompanyId];
    await prisma.officialDocument.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.providerUser.deleteMany({ where: { providerId: { in: [providerId, otherProviderId] } } });
    await prisma.marketplaceProvider.deleteMany({ where: { id: { in: [providerId, otherProviderId] } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [merchantEmail, otherMerchantEmail] } } });
    await prisma.subscription.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await ctx.app.close();
  }, 240_000);

  it('lists only the caller company documents', async () => {
    const res = await call<{ items: Array<{ documentNumber: string }>; total: number }>(
      ctx.base,
      '/provider/documents',
      { token: merchantToken },
    );
    expect(res.status).toBe(200);
    const numbers = res.body.items.map((d) => d.documentNumber);
    expect(numbers).toContain(`${PREFIX}-INV-001`);
    expect(numbers).toContain(`${PREFIX}-INV-002`);
    // The other tenant's document is absent, not merely filtered client-side.
    expect(numbers).not.toContain(`${PREFIX}-OTHER-001`);
    expect(res.body.total).toBe(2);
  });

  it('searches by document number', async () => {
    const res = await call<{ items: Array<{ documentNumber: string }> }>(
      ctx.base,
      `/provider/documents?search=${PREFIX}-INV-002`,
      { token: merchantToken },
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].documentNumber).toBe(`${PREFIX}-INV-002`);
  });

  it('refuses to read another tenant document', async () => {
    const other = await prisma.officialDocument.findFirstOrThrow({
      where: { companyId: otherCompanyId, documentNumber: `${PREFIX}-OTHER-001` },
    });
    const res = await call(ctx.base, `/provider/documents/${other.id}`, { token: merchantToken });
    expect(res.status).toBe(404);
  });

  it('refuses to read another tenant document verification', async () => {
    const other = await prisma.officialDocument.findFirstOrThrow({
      where: { companyId: otherCompanyId, documentNumber: `${PREFIX}-OTHER-001` },
    });
    const res = await call(ctx.base, `/provider/documents/${other.id}/verification`, {
      token: merchantToken,
    });
    expect(res.status).toBe(404);
  });

  it('refuses to download another tenant document file', async () => {
    const other = await prisma.officialDocument.findFirstOrThrow({
      where: { companyId: otherCompanyId, documentNumber: `${PREFIX}-OTHER-001` },
    });
    const res = await call(ctx.base, `/provider/documents/${other.id}/file`, {
      token: merchantToken,
    });
    expect(res.status).toBe(404);
  });

  it('returns the public verification view for an owned document', async () => {
    const own = await prisma.officialDocument.findFirstOrThrow({
      where: { companyId: merchantCompanyId, documentNumber: `${PREFIX}-INV-001` },
    });
    const res = await call<{ verificationUrl: string; view: { documentNumber: string } | null }>(
      ctx.base,
      `/provider/documents/${own.id}/verification`,
      { token: merchantToken },
    );
    expect(res.status).toBe(200);
    expect(res.body.view?.documentNumber).toBe(`${PREFIX}-INV-001`);
    expect(res.body.verificationUrl).toContain('/verify/');
  });

  it('shows the other merchant only its own document', async () => {
    const res = await call<{ items: Array<{ documentNumber: string }>; total: number }>(
      ctx.base,
      '/provider/documents',
      { token: otherMerchantToken },
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((d) => d.documentNumber)).toEqual([`${PREFIX}-OTHER-001`]);
    expect(res.body.total).toBe(1);
  });

  it('refuses a consumer token on the merchant document route', async () => {
    const res = await call(ctx.base, '/provider/documents', { token: 'not-a-staff-token' });
    expect([401, 403]).toContain(res.status);
  });
});
