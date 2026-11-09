import * as argon2 from 'argon2';
import { MODULE_KEYS } from '@oryx/shared';
import { PrismaService } from '../src/common/prisma.service';
import { call, companyCall, createTestApp, login, type TestContext } from './test-app';

/**
 * Document attachments for sales invoices and financial receipts.
 *
 * Real HTTP, real disk. The properties asserted are the ones an attachment
 * feature is most likely to get wrong: it accepts only PDF/JPG/PNG, it links a
 * file only to a record that exists inside the caller's tenant, it never lets
 * one tenant read or delete another's file, and the stored bytes stream back
 * with a safe content type.
 */
describe('Document attachments (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'ATTACH';
  const password = 'attach-test-password-12345';

  let companyId = '';
  let otherCompanyId = '';
  let customerId = '';
  let invoiceId = '';
  let paymentId = '';
  let token = '';
  let otherToken = '';

  const createdAttachmentIds: string[] = [];

  function multipart(file: { name: string; data: Buffer; type: string }) {
    const boundary = '----oryxAttachBoundary' + Math.random().toString(36).slice(2);
    const parts: Buffer[] = [];
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
      ),
    );
    parts.push(file.data);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
  }

  async function upload(
    targetCompanyId: string,
    authToken: string,
    entityType: string,
    entityId: string,
    file: { name: string; data: Buffer; type: string },
  ) {
    const { body, contentType } = multipart(file);
    const res = await fetch(
      `${ctx.base}/api/v1/attachments/${entityType}/${entityId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'x-oryx-company-id': targetCompanyId,
          'Content-Type': contentType,
        },
        body,
      },
    );
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, res };
  }

  async function download(
    targetCompanyId: string,
    authToken: string,
    entityType: string,
    entityId: string,
    attachmentId: string,
  ) {
    return fetch(
      `${ctx.base}/api/v1/attachments/${entityType}/${entityId}/${attachmentId}/download`,
      {
        headers: { Authorization: `Bearer ${authToken}`, 'x-oryx-company-id': targetCompanyId },
      },
    );
  }

  async function createStaff(email: string, targetCompanyId: string, permissions: string[]): Promise<string> {
    const role = await prisma.role.create({
      data: {
        companyId: targetCompanyId,
        code: `${PREFIX}_${email.split('@')[0]}`.slice(0, 60),
        nameEn: email,
        nameAr: email,
        isSystem: false,
        permissions: { create: permissions.map((permissionCode) => ({ permissionCode })) },
      },
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email, passwordHash, fullNameEn: email, fullNameAr: email, status: 'ACTIVE' },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId: targetCompanyId, roleId: role.id, isActive: true },
    });
    return login(ctx.base, email, password);
  }

  async function purgeFixtures() {
    const companies = await prisma.company.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const companyIds = companies.map((c) => c.id);
    await prisma.entityAttachment.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.salesInvoiceLine.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } });
    await prisma.salesInvoice.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.payment.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { companyId: { in: companyIds } } } });
    await prisma.role.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    await purgeFixtures();

    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const company = await prisma.company.create({
      data: { code: `${PREFIX}-CO`, nameEn: 'Attach Co', nameAr: 'شركة المرفقات', type: 'SAAS_TENANT', status: 'ACTIVE' },
    });
    companyId = company.id;
    const other = await prisma.company.create({
      data: { code: `${PREFIX}-OTHER`, nameEn: 'Attach Other', nameAr: 'أخرى', type: 'SAAS_TENANT', status: 'ACTIVE' },
    });
    otherCompanyId = other.id;
    for (const id of [companyId, otherCompanyId]) {
      await prisma.subscription.create({
        data: { companyId: id, planId: enterprise.id, status: 'ACTIVE', price: 0, licensedModules: [...MODULE_KEYS] },
      });
    }

    const customer = await prisma.customer.create({
      data: { companyId, code: `${PREFIX}-CUST`, nameEn: 'Attach Customer', nameAr: 'عميل', email: 'c@example.local' },
    });
    customerId = customer.id;

    const invoice = await prisma.salesInvoice.create({
      data: {
        companyId,
        invoiceNumber: `${PREFIX}-INV-1`,
        customerId,
        status: 'POSTED',
        subtotalMinor: 100_000,
        discountMinor: 0,
        taxMinor: 10_000,
        totalMinor: 110_000,
        amountPaidMinor: 0,
        currency: 'BHD',
        createdById: 'system',
        lines: {
          create: [
            {
              description: 'Service',
              quantity: 1,
              unitPriceMinor: 100_000,
              discountPercentBp: 0,
              taxPercentBp: 1000,
              lineSubtotalMinor: 100_000,
              discountMinor: 0,
              taxMinor: 10_000,
              lineTotalMinor: 110_000,
              sortOrder: 0,
            },
          ],
        },
      },
    });
    invoiceId = invoice.id;

    const payment = await prisma.payment.create({
      data: {
        companyId,
        direction: 'RECEIPT',
        partyType: 'CUSTOMER',
        customerId,
        paymentNumber: `${PREFIX}-PMT-1`,
        method: 'CASH',
        amountMinor: 5_000,
        currency: 'BHD',
        paidAt: new Date(),
        createdById: 'system',
      },
    });
    paymentId = payment.id;

    const perms = [
      'erp.sales.read',
      'erp.sales.invoice.manage',
      'erp.accounting.read',
      'erp.accounting.payment.manage',
    ];
    token = await createStaff(`${PREFIX.toLowerCase()}-user@test.local`, companyId, perms);
    otherToken = await createStaff(`${PREFIX.toLowerCase()}-other@test.local`, otherCompanyId, perms);
  });

  afterAll(async () => {
    await purgeFixtures();
    await ctx.app.close();
  });

  const pdf = { name: 'delivery-note.pdf', data: Buffer.from('%PDF-1.4\n%%EOF\n'), type: 'application/pdf' };
  const png = { name: 'photo.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), type: 'image/png' };
  const jpg = { name: 'scan.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), type: 'image/jpeg' };

  it('attaches a PDF, a PNG and a JPG to a sales invoice', async () => {
    for (const file of [pdf, png, jpg]) {
      const res = await upload(companyId, token, 'SALES_INVOICE', invoiceId, file);
      expect(res.status === 201 ? '' : JSON.stringify(res.body)).toBe('');
      expect(res.body.fileName).toBe(file.name);
      expect(res.body.entityType).toBe('SALES_INVOICE');
      expect(res.body.entityId).toBe(invoiceId);
      createdAttachmentIds.push(res.body.id);
    }
    const list = await companyCall<Array<{ id: string }>>(ctx.base, companyId, `/attachments/SALES_INVOICE/${invoiceId}`, {
      token,
    });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(3);
  });

  it('attaches a file to a payment receipt', async () => {
    const res = await upload(companyId, token, 'PAYMENT', paymentId, pdf);
    expect(res.status).toBe(201);
    expect(res.body.entityType).toBe('PAYMENT');
    createdAttachmentIds.push(res.body.id);
  });

  it('streams a stored attachment back with a safe content type', async () => {
    const res = await download(companyId, token, 'SALES_INVOICE', invoiceId, createdAttachmentIds[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rejects a disallowed file type', async () => {
    const res = await upload(companyId, token, 'SALES_INVOICE', invoiceId, {
      name: 'payload.exe',
      data: Buffer.from('MZ'),
      type: 'application/x-msdownload',
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Only PDF, JPG, PNG');
  });

  it('rejects an unsupported entity type', async () => {
    const res = await upload(companyId, token, 'CUSTOMER', customerId, pdf);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Unsupported attachment entity type');
  });

  it('refuses a document that belongs to another tenant', async () => {
    const res = await upload(otherCompanyId, otherToken, 'SALES_INVOICE', invoiceId, pdf);
    expect(res.status).toBe(404);
  });

  it('refuses to read or download another tenant’s attachment', async () => {
    const listed = await companyCall<unknown>(ctx.base, otherCompanyId, `/attachments/SALES_INVOICE/${invoiceId}`, {
      token: otherToken,
    });
    expect(listed.status).toBe(404);
    const fetched = await download(
      otherCompanyId,
      otherToken,
      'SALES_INVOICE',
      invoiceId,
      createdAttachmentIds[0],
    );
    expect(fetched.status).toBe(404);
  });

  it('removes an attachment and drops it from the listing', async () => {
    const removed = await companyCall<{ deleted: boolean }>(
      ctx.base,
      companyId,
      `/attachments/SALES_INVOICE/${invoiceId}/${createdAttachmentIds[0]}`,
      { method: 'DELETE', token },
    );
    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(true);

    const list = await companyCall<Array<{ id: string }>>(ctx.base, companyId, `/attachments/SALES_INVOICE/${invoiceId}`, {
      token,
    });
    expect(list.body.map((a) => a.id)).not.toContain(createdAttachmentIds[0]);
  });
});
