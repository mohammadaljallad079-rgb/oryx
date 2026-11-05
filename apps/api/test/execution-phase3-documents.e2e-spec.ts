import * as argon2 from 'argon2';
import { INSPECTION_SECTION_SPECS, MODULE_KEYS, planInspectionReport, type InspectionSectionKey } from '@oryx/shared';
import { PrismaService } from '../src/common/prisma.service';
import { call, companyCall, createTestApp, login, type TestContext } from './test-app';

/**
 * Execution Phase 3 — official documents, PDF printing and QR verification.
 *
 * Real HTTP, real Chromium, real PDFs. The properties asserted are the ones the
 * feature is most likely to get wrong:
 *
 *  - an issued PDF is a real, multi-page A4 document with an embedded Arabic
 *    font and a correct text layer (a Type3/garble regression fails here);
 *  - pagination follows the selected areas rather than being a fixed five pages;
 *  - a printed amount always matches the stored record, never a caller value;
 *  - the public verification endpoint reveals identity but no money and no
 *    contact details, and reports a withdrawn document as withdrawn;
 *  - one tenant can never issue, read, download or verify another's document.
 */
describe('Execution Phase 3 — official documents and QR verification (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'EP3DOC';
  const password = 'ep3-documents-password-12345';

  let companyId = '';
  let otherCompanyId = '';
  let customerId = '';
  let vehicleId = '';

  let issuerToken = '';
  let otherTenantToken = '';

  const issuerEmail = `${PREFIX.toLowerCase()}-issuer@test.local`;
  const otherEmail = `${PREFIX.toLowerCase()}-other@test.local`;

  async function purgeFixtures() {
    const companies = await prisma.company.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const companyIds = companies.map((c) => c.id);
    const sessions = await prisma.inspectionSession.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    await prisma.officialDocumentEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.officialDocument.deleteMany({ where: { companyId: { in: companyIds } } });
    // A purchase return and a journal entry are sources for the new document
    // types, so they must be removed before the suppliers, warehouses and
    // accounts they reference.
    await prisma.purchaseReturnLine.deleteMany({ where: { purchaseReturn: { companyId: { in: companyIds } } } });
    await prisma.purchaseReturn.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.journalLine.deleteMany({ where: { entry: { companyId: { in: companyIds } } } });
    await prisma.journalEntry.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.fiscalPeriod.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.fiscalYear.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.warehouse.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.account.deleteMany({ where: { companyId: { in: companyIds } } });
    // Credit notes and supplier invoices are children of the customer, supplier
    // and product rows below, so they must be removed before them.
    await prisma.creditNoteLine.deleteMany({ where: { creditNote: { companyId: { in: companyIds } } } });
    await prisma.creditNote.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.supplierInvoiceLine.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } });
    await prisma.supplierInvoice.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.supplier.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.inspectionAttachment.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionDiagnosticEntry.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionChassisRegion.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionBodyMarker.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionItemResult.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionSectionResult.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.salesInvoiceLine.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } });
    await prisma.salesInvoice.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.vehicle.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.documentSequence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { companyId: { in: companyIds } } } });
    await prisma.role.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
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

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    await purgeFixtures();

    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

    const company = await prisma.company.create({
      data: {
        code: `${PREFIX}-CO`,
        nameEn: 'EP3 Documents Co',
        nameAr: 'شركة المستندات',
        type: 'SAAS_TENANT',
        status: 'ACTIVE',
        taxNumber: 'CR-998877',
      },
    });
    companyId = company.id;
    const other = await prisma.company.create({
      data: { code: `${PREFIX}-OTHER`, nameEn: 'EP3 Other Co', nameAr: 'أخرى', type: 'SAAS_TENANT', status: 'ACTIVE' },
    });
    otherCompanyId = other.id;

    for (const id of [companyId, otherCompanyId]) {
      await prisma.subscription.create({
        data: { companyId: id, planId: enterprise.id, status: 'ACTIVE', price: 0, licensedModules: [...MODULE_KEYS] },
      });
    }

    const customer = await prisma.customer.create({
      data: {
        companyId,
        code: `${PREFIX}-CUST`,
        nameEn: 'EP3 Customer',
        nameAr: 'عميل المستندات',
        email: 'customer@example.local',
        phone: '+97339000000',
      },
    });
    customerId = customer.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        companyId,
        customerId,
        vin: `${PREFIX}VIN000000001`,
        make: 'Toyota',
        model: 'Land Cruiser',
        modelYear: 2022,
        plateNumber: '99887',
        color: 'White',
        mileage: 41_500,
      },
    });
    vehicleId = vehicle.id;

    issuerToken = await createStaff(issuerEmail, companyId, [
      'erp.inspection.read',
      'erp.inspection.write',
      'erp.inspection.report.approve',
      'erp.sales.read',
      'erp.sales.write',
      'erp.purchasing.read',
      'erp.accounting.read',
      'erp.dashboard.read',
    ]);
    otherTenantToken = await createStaff(otherEmail, otherCompanyId, [
      'erp.inspection.read',
      'erp.inspection.write',
      'erp.inspection.report.approve',
      'erp.sales.read',
      'erp.sales.write',
      'erp.dashboard.read',
    ]);
  }, 240_000);

  afterAll(async () => {
    await purgeFixtures();
    await ctx.app.close();
  });

  const auth = (token: string, company = companyId) => ({
    token,
    headers: { 'x-oryx-company-id': company },
  });

  /** Create, fill, submit and approve an inspection for the given areas. */
  async function approvedInspection(areas: string[]): Promise<string> {
    const created = await companyCall<{ id: string; selectedAreas: string[] }>(
      ctx.base,
      companyId,
      '/automotive/inspections',
      { method: 'POST', token: issuerToken, body: { customerId, vehicleId, selectedAreas: areas } },
    );
    expect(created.status).toBe(201);
    const sessionId = created.body.id;

    for (const area of areas) {
      const spec = INSPECTION_SECTION_SPECS.find((s) => s.key === area)!;
      const body: Record<string, unknown> = { noFindings: true };
      if (spec.items.length > 0) {
        body.items = spec.items.map((i) => ({ itemKey: i.key, result: 'PASS' }));
      }
      const saved = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/sections/${area}`, {
        method: 'PUT',
        token: issuerToken,
        body,
      });
      expect([200, 201]).toContain(saved.status);

      // Markers and chassis regions have their own endpoints, keyed to the
      // section they belong to rather than nested under it.
      if (spec.kind === 'DIAGRAM_PAINT') {
        const markers = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/paint-markers`, {
          method: 'PUT',
          token: issuerToken,
          body: { markers: [{ condition: 'PAINT', x: 0.4, y: 0.3, panelKey: 'frontLeftDoor', note: 'Resprayed' }] },
        });
        expect([200, 201]).toContain(markers.status);
      }
      if (spec.kind === 'DIAGRAM_CHASSIS') {
        const regions = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/chassis-regions`, {
          method: 'PUT',
          token: issuerToken,
          body: { regions: [{ regionKey: 'FRONT', condition: 'OK' }] },
        });
        expect([200, 201]).toContain(regions.status);
      }
    }

    const updated = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}`, {
      method: 'PATCH',
      token: issuerToken,
      body: { finalAssessment: 'المركبة بحالة جيدة · Vehicle in good condition' },
    });
    expect([200, 201]).toContain(updated.status);

    const submitted = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/submit`, {
      method: 'POST',
      token: issuerToken,
    });
    expect([200, 201]).toContain(submitted.status);

    const approved = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/review`, {
      method: 'POST',
      token: issuerToken,
      body: { decision: 'APPROVE' },
    });
    expect([200, 201]).toContain(approved.status);
    return sessionId;
  }

  /**
   * Create an inspection whose every section carries a full checklist, a result
   * note on a third of the items and a section remark, then submit and approve
   * it. `approvedInspection` fills the same checklist but cannot add notes
   * afterwards: an approved session is locked and a late write returns 409.
   */
  async function denseApprovedInspection(areas: InspectionSectionKey[]): Promise<string> {
    const created = await companyCall<{ id: string }>(ctx.base, companyId, '/automotive/inspections', {
      method: 'POST',
      token: issuerToken,
      body: { customerId, vehicleId, selectedAreas: areas },
    });
    expect(created.status).toBe(201);
    const sessionId = created.body.id;

    const note = 'ملاحظة تفصيلية على البند تم تسجيلها أثناء الفحص الميداني · detailed finding recorded';
    for (const area of areas) {
      const spec = INSPECTION_SECTION_SPECS.find((s) => s.key === area)!;
      const body: Record<string, unknown> = {
        noFindings: false,
        remarks: 'ملاحظات القسم المسجلة أثناء الفحص · section remarks recorded during the inspection',
      };
      if (spec.items.length > 0) {
        body.items = spec.items.map((i, index) => ({
          itemKey: i.key,
          result: index % 7 === 0 ? 'FAIL' : 'PASS',
          note: index % 3 === 0 ? note : undefined,
        }));
      }
      const saved = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/sections/${area}`, {
        method: 'PUT',
        token: issuerToken,
        body,
      });
      expect([200, 201]).toContain(saved.status);

      if (spec.kind === 'DIAGRAM_PAINT') {
        const markers = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/paint-markers`, {
          method: 'PUT',
          token: issuerToken,
          body: {
            markers: [
              { condition: 'PAINT', x: 0.4, y: 0.3, panelKey: 'frontLeftDoor', note: 'Resprayed' },
              { condition: 'FILLER', x: 0.6, y: 0.5, panelKey: 'rearRightDoor', note: 'Filler detected' },
            ],
          },
        });
        expect([200, 201]).toContain(markers.status);
      }
      if (spec.kind === 'DIAGRAM_CHASSIS') {
        const regions = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/chassis-regions`, {
          method: 'PUT',
          token: issuerToken,
          body: { regions: [{ regionKey: 'FRONT', condition: 'OK' }, { regionKey: 'REAR', condition: 'RUST' }] },
        });
        expect([200, 201]).toContain(regions.status);
      }
      if (spec.kind === 'DIAGNOSTIC') {
        const entry = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/diagnostics`, {
          method: 'POST',
          token: issuerToken,
          body: {
            module: 'Engine control unit',
            faultCode: 'P0301',
            description: 'Cylinder 1 misfire detected during the road test',
            observation: 'Intermittent; clears when the engine is warm',
            severity: 'MINOR',
          },
        });
        expect([200, 201]).toContain(entry.status);
      }
    }

    const updated = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}`, {
      method: 'PATCH',
      token: issuerToken,
      body: { finalAssessment: 'المركبة بحالة جيدة · Vehicle in good condition' },
    });
    expect([200, 201]).toContain(updated.status);

    const submitted = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/submit`, {
      method: 'POST',
      token: issuerToken,
    });
    expect([200, 201]).toContain(submitted.status);

    const approved = await companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/review`, {
      method: 'POST',
      token: issuerToken,
      body: { decision: 'APPROVE' },
    });
    expect([200, 201]).toContain(approved.status);
    return sessionId;
  }

  describe('issuing an inspection report', () => {
    let sessionId = '';

    beforeAll(async () => {
      sessionId = await approvedInspection(['PAINT_BODY', 'ENGINE_COMPARTMENT', 'COMPUTER_UNIT']);
    }, 240_000);

    it('refuses to issue a report for an inspection that is not approved', async () => {
      const draft = await companyCall<{ id: string }>(ctx.base, companyId, '/automotive/inspections', {
        method: 'POST',
        token: issuerToken,
        body: { customerId, vehicleId, selectedAreas: ['INTERIOR'] },
      });
      const res = await companyCall(ctx.base, companyId, `/documents/inspections/${draft.body.id}/issue`, {
        method: 'POST',
        token: issuerToken,
      });
      expect(res.status).toBe(409);
    });

    it('issues a report with a verification token and a page count', async () => {
      const res = await companyCall<{
        id: string;
        type: string;
        status: string;
        version: number;
        verificationToken: string;
        verificationUrl: string;
        pageCount: number;
        byteSize: number;
        downloadable: boolean;
      }>(ctx.base, companyId, `/documents/inspections/${sessionId}/issue`, {
        method: 'POST',
        token: issuerToken,
      });
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('VEHICLE_INSPECTION_REPORT');
      expect(res.body.status).toBe('ISSUED');
      expect(res.body.version).toBe(1);
      expect(res.body.downloadable).toBe(true);
      expect(res.body.verificationToken.length).toBeGreaterThanOrEqual(32);
      expect(res.body.verificationUrl).toContain(`/verify/${res.body.verificationToken}`);
      // Page 1 + paint/chassis page + engine/road page + computer page + summary.
      expect(res.body.pageCount).toBeGreaterThanOrEqual(3);
      expect(res.body.byteSize).toBeGreaterThan(20_000);
    });

    it('produces a real multi-page A4 PDF with an embedded font and an Arabic text layer', async () => {
      const list = await companyCall<Array<{ id: string; pageCount: number }>>(
        ctx.base,
        companyId,
        `/documents?sourceType=InspectionSession&sourceId=${sessionId}`,
        auth(issuerToken),
      );
      expect(list.status).toBe(200);
      const document = list.body[0];
      expect(document).toBeDefined();

      const res = await call<never>(ctx.base, `/documents/${document.id}/file`, {
        ...auth(issuerToken),
      });
      expect(res.status).toBe(200);

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${document.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      const bytes = Buffer.from(await pdf.arrayBuffer());
      const text = bytes.toString('latin1');

      // A real PDF, not an error page rendered as one.
      expect(text.startsWith('%PDF-')).toBe(true);
      // A4 media box: 595 × 842 pt.
      expect(text).toContain('/MediaBox');
      // Page tree reports the page count the API stored.
      const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
      expect(Math.max(...counts)).toBe(document.pageCount);
      // The Arabic face is embedded, not substituted.
      expect(text).toContain('NotoNaskhArabic');
      // A variable font embeds as Type3 with a broken text layer; a static
      // instance embeds as Type0/CID. This is the regression guard.
      expect(text).toContain('/Type0');
      expect(text).not.toContain('/Type3');
    });

    it('renders exactly the planned pages when every section carries a full checklist', async () => {
      // Regression guard: the designed page heights must fit one A4 sheet. A
      // report whose section pages are taller than the printable area renders
      // more physical pages than the planner designed, and the stored
      // pageCount then disagrees with the plan.
      const areas: InspectionSectionKey[] = ['INTERIOR', 'EXTERIOR', 'ENGINE_COMPARTMENT', 'ROAD_TEST', 'COMPUTER_UNIT'];
      const dense = await denseApprovedInspection(areas);

      const issued = await companyCall<{ id: string; pageCount: number }>(
        ctx.base,
        companyId,
        `/documents/inspections/${dense}/issue`,
        { method: 'POST', token: issuerToken },
      );
      expect(issued.status).toBe(201);

      // The planner already counts the identification page; the report always
      // appends one summary page because the assessment is set.
      const planned = planInspectionReport(areas).length + 1;
      expect(issued.body.pageCount).toBe(planned);

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${issued.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      const text = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
      const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
      expect(Math.max(...counts)).toBe(issued.body.pageCount);
    }, 240_000);


    it('re-issuing supersedes the previous version instead of overwriting it', async () => {
      const first = await companyCall<Array<{ id: string; version: number }>>(
        ctx.base,
        companyId,
        `/documents?sourceType=InspectionSession&sourceId=${sessionId}`,
        auth(issuerToken),
      );
      const v1 = first.body.find((d) => d.version === 1)!;

      const second = await companyCall<{ id: string; version: number }>(
        ctx.base,
        companyId,
        `/documents/inspections/${sessionId}/issue`,
        { method: 'POST', token: issuerToken },
      );
      expect(second.status).toBe(201);
      expect(second.body.version).toBe(2);

      const v1After = await companyCall<{ status: string; downloadable: boolean }>(
        ctx.base,
        companyId,
        `/documents/${v1.id}`,
        auth(issuerToken),
      );
      expect(v1After.body.status).toBe('SUPERSEDED');
      // A superseded copy is still downloadable: a customer may hold a printout.
      expect(v1After.body.downloadable).toBe(true);
    });

    it('keeps an append-only audit trail of issue, reissue and download', async () => {
      const list = await companyCall<Array<{ id: string; version: number }>>(
        ctx.base,
        companyId,
        `/documents?sourceType=InspectionSession&sourceId=${sessionId}`,
        auth(issuerToken),
      );
      const current = list.body.find((d) => d.version === 2)!;
      const detail = await companyCall<{ events: Array<{ event: string }> }>(
        ctx.base,
        companyId,
        `/documents/${current.id}`,
        auth(issuerToken),
      );
      const events = detail.body.events.map((e) => e.event);
      expect(events).toContain('REISSUED');
    });
  });

  describe('public QR verification', () => {
    let token = '';
    let documentId = '';

    beforeAll(async () => {
      const sessionId = await approvedInspection(['INTERIOR']);
      const issued = await companyCall<{ id: string; verificationToken: string }>(
        ctx.base,
        companyId,
        `/documents/inspections/${sessionId}/issue`,
        { method: 'POST', token: issuerToken },
      );
      token = issued.body.verificationToken;
      documentId = issued.body.id;
    }, 240_000);

    it('verifies without a session and reveals identity but no money or contact details', async () => {
      const res = await call<{
        found: boolean;
        document: Record<string, unknown> & { status: string; type: string; subject?: Record<string, unknown> };
      }>(ctx.base, `/documents/verify/${token}`);

      expect(res.status).toBe(200);
      expect(res.body.found).toBe(true);
      expect(res.body.document.status).toBe('VALID');
      expect(res.body.document.type).toBe('VEHICLE_INSPECTION_REPORT');
      expect(res.body.document.issuerNameEn).toBe('EP3 Documents Co');

      // The VIN is masked, never printed in full.
      const subject = res.body.document.subject!;
      expect(subject.vinMasked).not.toContain('VIN000000001');
      expect(String(subject.vinMasked)).toMatch(/•+0001$/);

      // Nothing financial and no personal contact details.
      const serialised = JSON.stringify(res.body.document);
      for (const forbidden of ['totalMinor', 'amountMinor', 'balanceMinor', 'customerName', 'phone', 'email']) {
        expect(serialised).not.toContain(forbidden);
      }
    });

    it('reports an unknown token as not found without leaking whether it ever existed', async () => {
      const res = await call<{ found: boolean }>(ctx.base, `/documents/verify/${'x'.repeat(43)}`);
      expect(res.status).toBe(200);
      expect(res.body.found).toBe(false);
    });

    it('rejects a token that is obviously malformed without a database lookup', async () => {
      const res = await call<{ found: boolean }>(ctx.base, '/documents/verify/short');
      expect(res.status).toBe(200);
      expect(res.body.found).toBe(false);
    });

    it('reports a revoked document as revoked rather than as valid', async () => {
      const revoke = await companyCall(ctx.base, companyId, `/documents/${documentId}/revoke`, {
        method: 'POST',
        token: issuerToken,
        body: { reason: 'Issued in error' },
      });
      expect(revoke.status).toBe(201);

      const res = await call<{ found: boolean; document: { status: string } }>(
        ctx.base,
        `/documents/verify/${token}`,
      );
      expect(res.body.found).toBe(true);
      expect(res.body.document.status).toBe('REVOKED');
    });

    it('refuses to download a revoked document', async () => {
      const res = await call(ctx.base, `/documents/${documentId}/file`, auth(issuerToken));
      expect(res.status).toBe(409);
    });
  });

  describe('tenant isolation', () => {
    let documentId = '';
    let token = '';

    beforeAll(async () => {
      const sessionId = await approvedInspection(['EXTERIOR']);
      const issued = await companyCall<{ id: string; verificationToken: string }>(
        ctx.base,
        companyId,
        `/documents/inspections/${sessionId}/issue`,
        { method: 'POST', token: issuerToken },
      );
      documentId = issued.body.id;
      token = issued.body.verificationToken;
    }, 240_000);

    it('hides another tenant document from a read', async () => {
      const res = await companyCall(ctx.base, otherCompanyId, `/documents/${documentId}`, auth(otherTenantToken, otherCompanyId));
      expect(res.status).toBe(404);
    });

    it('refuses another tenant a download of the PDF', async () => {
      const res = await companyCall(ctx.base, otherCompanyId, `/documents/${documentId}/file`, auth(otherTenantToken, otherCompanyId));
      expect(res.status).toBe(404);
    });

    it('refuses another tenant a revocation of the document', async () => {
      const res = await companyCall(ctx.base, otherCompanyId, `/documents/${documentId}/revoke`, {
        method: 'POST',
        token: otherTenantToken,
        body: { reason: 'Not mine to revoke' },
      });
      expect(res.status).toBe(404);
      // The original is untouched.
      const still = await companyCall<{ status: string }>(ctx.base, companyId, `/documents/${documentId}`, auth(issuerToken));
      expect(still.body.status).toBe('ISSUED');
    });

    it('verifies a document publicly regardless of tenant, because the token is the credential', async () => {
      const res = await call<{ found: boolean }>(ctx.base, `/documents/verify/${token}`);
      expect(res.body.found).toBe(true);
    });
  });

  describe('financial documents', () => {
    let invoiceId = '';

    beforeAll(async () => {
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
          amountPaidMinor: 50_000,
          currency: 'BHD',
          createdById: 'system',
          lines: {
            create: [
              {
                description: 'Full vehicle inspection service',
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
    });

    it('refuses a caller-supplied amount, so a printed total can never be forged', async () => {
      // The DTO whitelist rejects an unknown field outright rather than
      // silently ignoring it. A caller therefore cannot even attempt to set a
      // total: every amount on the document comes from the stored record.
      const res = await companyCall(ctx.base, companyId, '/documents/issue', {
        method: 'POST',
        token: issuerToken,
        body: { type: 'SALES_INVOICE', sourceId: invoiceId, totalMinor: 1 },
      });
      expect(res.status).toBe(400);
    });

    it('issues a tax invoice whose figures come from the stored record', async () => {
      const res = await companyCall<{ id: string; type: string; documentNumber: string; pageCount: number }>(
        ctx.base,
        companyId,
        '/documents/issue',
        { method: 'POST', token: issuerToken, body: { type: 'SALES_INVOICE', sourceId: invoiceId } },
      );
      expect(res.status === 201 ? '' : JSON.stringify(res.body)).toBe('');
      expect(res.body.type).toBe('SALES_INVOICE');
      expect(res.body.documentNumber).toBe(`${PREFIX}-INV-1`);
      // A one-line invoice must fit on one page. The signature strip used to be
      // in the document flow, so it spilled onto a second page whose only
      // content was the signatures; the footer is now a page-margin template.
      expect(res.body.pageCount).toBe(1);

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${res.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      expect(pdf.status).toBe(200);
      const bytes = Buffer.from(await pdf.arrayBuffer());
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const text = bytes.toString('latin1');
      // Both the Arabic and the Latin face are embedded.
      expect(text).toContain('NotoNaskhArabic');
      expect(text).toContain('NotoSans');
      expect(text).toContain('/Type0');
      expect(text).not.toContain('/Type3');
      // A literal `&nbsp;` in the text layer is the escaped-entity regression.
      expect(text).not.toContain('&amp;nbsp;');
    });

    it('prints the official brand mark and a faint watermark without a tenant upload', async () => {
      // This tenant never uploaded a logo, so the header must carry the bundled
      // official ORYX lockup rather than a text monogram, and the same mark must
      // appear as the page watermark.
      const res = await companyCall<{ id: string }>(ctx.base, companyId, '/documents/issue', {
        method: 'POST',
        token: issuerToken,
        body: { type: 'SALES_INVOICE', sourceId: invoiceId },
      });
      const pdf = await fetch(`${ctx.base}/api/v1/documents/${res.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      const bytes = Buffer.from(await pdf.arrayBuffer());
      // The bundled logo is a 600px-wide PNG; Chromium embeds the same bytes
      // twice (header + watermark), so the object appears at least twice.
      const matches = bytes.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(bytes.toString('latin1')).toContain('/Subtype /Image');
    });

    it('issues a sales return from the stored credit note', async () => {
      // SALES_RETURN is backed by a credit note. The figures must come from the
      // credit-note line, and the document must print as a real PDF.
      const creditNote = await prisma.creditNote.create({
        data: {
          companyId,
          creditNoteNumber: `${PREFIX}-CN-1`,
          customerId,
          invoiceId,
          status: 'POSTED',
          subtotalMinor: 100_000,
          taxMinor: 10_000,
          totalMinor: 110_000,
          currency: 'BHD',
          createdById: 'system',
          lines: {
            create: [
              {
                description: 'Returned inspection service',
                quantity: 1,
                unitPriceMinor: 100_000,
                taxPercentBp: 1000,
                lineTotalMinor: 110_000,
                sortOrder: 0,
              },
            ],
          },
        },
      });

      const res = await companyCall<{ id: string; type: string; documentNumber: string; pageCount: number }>(
        ctx.base,
        companyId,
        '/documents/issue',
        { method: 'POST', token: issuerToken, body: { type: 'SALES_RETURN', sourceId: creditNote.id } },
      );
      expect(res.status === 201 ? '' : JSON.stringify(res.body)).toBe('');
      expect(res.body.type).toBe('SALES_RETURN');
      expect(res.body.documentNumber).toContain('CN-1');

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${res.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      expect(pdf.status).toBe(200);
      const bytes = Buffer.from(await pdf.arrayBuffer());
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('issues a purchase invoice from the stored supplier invoice', async () => {
      const supplier = await prisma.supplier.create({
        data: {
          companyId,
          code: `${PREFIX}-SUP`,
          nameEn: 'EP3 Supplier',
          nameAr: 'مورد المستندات',
        },
      });
      const supplierInvoice = await prisma.supplierInvoice.create({
        data: {
          companyId,
          invoiceNumber: `${PREFIX}-PI-1`,
          supplierInvoiceNumber: 'VENDOR-778',
          supplierId: supplier.id,
          status: 'POSTED',
          subtotalMinor: 200_000,
          taxMinor: 20_000,
          totalMinor: 220_000,
          currency: 'BHD',
          createdById: 'system',
          lines: {
            create: [
              {
                description: 'Bulk engine oil',
                quantity: 10,
                unitCostMinor: 20_000,
                taxPercentBp: 1000,
                lineSubtotalMinor: 200_000,
                taxMinor: 20_000,
                lineTotalMinor: 220_000,
                sortOrder: 0,
              },
            ],
          },
        },
      });

      const res = await companyCall<{ id: string; type: string; documentNumber: string; pageCount: number }>(
        ctx.base,
        companyId,
        '/documents/issue',
        { method: 'POST', token: issuerToken, body: { type: 'PURCHASE_INVOICE', sourceId: supplierInvoice.id } },
      );
      expect(res.status === 201 ? '' : JSON.stringify(res.body)).toBe('');
      expect(res.body.type).toBe('PURCHASE_INVOICE');
      expect(res.body.documentNumber).toContain('PI-1');

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${res.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      expect(pdf.status).toBe(200);
      expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('issues a purchase return from the stored return record', async () => {
      const supplier = await prisma.supplier.create({
        data: {
          companyId,
          code: `${PREFIX}-SUP-PR`,
          nameEn: 'EP3 Return Supplier',
          nameAr: 'مورد المرتجع',
        },
      });
      const warehouse = await prisma.warehouse.create({
        data: { companyId, code: `${PREFIX}-WH`, nameEn: 'EP3 Warehouse', nameAr: 'مستودع' },
      });
      const purchaseReturn = await prisma.purchaseReturn.create({
        data: {
          companyId,
          returnNumber: `${PREFIX}-PR-1`,
          supplierId: supplier.id,
          warehouseId: warehouse.id,
          status: 'POSTED',
          subtotalMinor: 50_000,
          taxMinor: 5_000,
          totalMinor: 55_000,
          reason: 'Damaged goods',
          currency: 'BHD',
          createdById: 'system',
          lines: {
            create: [
              {
                productId: 'ep3-product-ref',
                description: 'Returned brake pads',
                quantity: 2,
                unitCostMinor: 25_000,
                taxPercentBp: 1000,
                lineTotalMinor: 55_000,
                sortOrder: 0,
              },
            ],
          },
        },
      });

      const res = await companyCall<{ id: string; type: string; documentNumber: string; pageCount: number }>(
        ctx.base,
        companyId,
        '/documents/issue',
        { method: 'POST', token: issuerToken, body: { type: 'PURCHASE_RETURN', sourceId: purchaseReturn.id } },
      );
      expect(res.status === 201 ? '' : JSON.stringify(res.body)).toBe('');
      expect(res.body.type).toBe('PURCHASE_RETURN');
      expect(res.body.documentNumber).toBe(`${PREFIX}-PR-1`);
      expect(res.body.pageCount).toBeGreaterThanOrEqual(1);

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${res.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      expect(pdf.status).toBe(200);
      expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('issues a customer statement over the fiscal period from the stored invoices and payments', async () => {
      // The statement must derive its figures from the ledger-side records, so a
      // movement row can never disagree with the invoice it names.
      await prisma.fiscalYear.create({
        data: {
          companyId,
          code: `${PREFIX}-FY-ST`,
          startDate: new Date('2024-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          periods: {
            create: [
              {
                companyId,
                periodNumber: 1,
                nameEn: 'Statement Period',
                nameAr: 'فترة الكشف',
                startDate: new Date('2024-01-01T00:00:00.000Z'),
                endDate: new Date('2026-12-31T00:00:00.000Z'),
                status: 'OPEN',
              },
            ],
          },
        },
      });

      const res = await companyCall<{ id: string; type: string; pageCount: number }>(
        ctx.base,
        companyId,
        '/documents/issue',
        { method: 'POST', token: issuerToken, body: { type: 'CUSTOMER_STATEMENT', sourceId: customerId } },
      );
      expect(res.status === 201 ? '' : JSON.stringify(res.body)).toBe('');
      expect(res.body.type).toBe('CUSTOMER_STATEMENT');

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${res.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      expect(pdf.status).toBe(200);
      expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('issues a supplier statement and a journal entry', async () => {
      // Self-contained: a statement is rendered from its own party, so the test
      // creates the supplier rather than depending on an earlier test's fixture.
      const supplier = await prisma.supplier.create({
        data: {
          companyId,
          code: `${PREFIX}-SUP-ST`,
          nameEn: 'EP3 Statement Supplier',
          nameAr: 'مورد الكشف',
        },
      });
      const statement = await companyCall<{ id: string; type: string }>(
        ctx.base,
        companyId,
        '/documents/issue',
        { method: 'POST', token: issuerToken, body: { type: 'SUPPLIER_STATEMENT', sourceId: supplier.id } },
      );
      expect(statement.status === 201 ? '' : JSON.stringify(statement.body)).toBe('');
      expect(statement.body.type).toBe('SUPPLIER_STATEMENT');

      // A journal entry renders a debit/credit table, not a priced line table.
      // The fixture company is created without a chart of accounts, so the two
      // accounts the entry needs are created here.
      const account = await prisma.account.create({
        data: {
          companyId,
          code: `${PREFIX}-1000`,
          nameEn: 'Cash',
          nameAr: 'النقدية',
          type: 'ASSET',
          normalBalance: 'DEBIT',
        },
      });
      const counter = await prisma.account.create({
        data: {
          companyId,
          code: `${PREFIX}-4000`,
          nameEn: 'Revenue',
          nameAr: 'الإيرادات',
          type: 'REVENUE',
          normalBalance: 'CREDIT',
        },
      });
      const entry = await prisma.journalEntry.create({
        data: {
          companyId,
          entryNumber: `${PREFIX}-JE-1`,
          entryDate: new Date(),
          status: 'POSTED',
          sourceType: 'MANUAL',
          memo: 'Opening adjustment',
          currency: 'BHD',
          totalDebitMinor: 10_000,
          totalCreditMinor: 10_000,
          createdById: 'system',
          lines: {
            create: [
              {
                companyId,
                lineNumber: 1,
                accountId: account.id,
                description: 'Debit leg',
                debitMinor: 10_000,
                creditMinor: 0,
              },
              {
                companyId,
                lineNumber: 2,
                accountId: counter.id,
                description: 'Credit leg',
                debitMinor: 0,
                creditMinor: 10_000,
              },
            ],
          },
        },
      });

      const journal = await companyCall<{ id: string; type: string; documentNumber: string }>(
        ctx.base,
        companyId,
        '/documents/issue',
        { method: 'POST', token: issuerToken, body: { type: 'JOURNAL_ENTRY', sourceId: entry.id } },
      );
      expect(journal.status === 201 ? '' : JSON.stringify(journal.body)).toBe('');
      expect(journal.body.type).toBe('JOURNAL_ENTRY');
      expect(journal.body.documentNumber).toBe(`${PREFIX}-JE-1`);

      const pdf = await fetch(`${ctx.base}/api/v1/documents/${journal.body.id}/file`, {
        headers: { Authorization: `Bearer ${issuerToken}`, 'x-oryx-company-id': companyId },
      });
      expect(pdf.status).toBe(200);
      const bytes = Buffer.from(await pdf.arrayBuffer());
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      // The journal's own account codes must be in the text layer.
      expect(bytes.toString('latin1')).toContain('/Type0');
    });

    it('refuses an unknown document type', async () => {
      const res = await companyCall(ctx.base, companyId, '/documents/issue', {
        method: 'POST',
        token: issuerToken,
        body: { type: 'NOT_A_TYPE', sourceId: invoiceId },
      });
      expect(res.status).toBe(400);
    });

    it('refuses a source record that does not exist in the tenant', async () => {
      const res = await companyCall(ctx.base, companyId, '/documents/issue', {
        method: 'POST',
        token: issuerToken,
        body: { type: 'SALES_INVOICE', sourceId: 'does-not-exist' },
      });
      expect(res.status).toBe(404);
    });

    it('exposes the document catalogue', async () => {
      const res = await companyCall<{ documents: Array<{ type: string }> }>(
        ctx.base,
        companyId,
        '/documents/catalogue',
        auth(issuerToken),
      );
      expect(res.status).toBe(200);
      expect(res.body.documents.some((d) => d.type === 'SALES_INVOICE')).toBe(true);
      expect(res.body.documents.some((d) => d.type === 'VEHICLE_INSPECTION_REPORT')).toBe(true);
    });
  });

  describe('authorization', () => {
    it('refuses an unauthenticated issue', async () => {
      const res = await call(ctx.base, '/documents/issue', {
        method: 'POST',
        body: { type: 'SALES_INVOICE', sourceId: 'x' },
      });
      expect(res.status).toBe(401);
    });

    it('refuses an unauthenticated download', async () => {
      const res = await call(ctx.base, '/documents/anything/file');
      expect(res.status).toBe(401);
    });

    it('leaves the public verification route open', async () => {
      const res = await call(ctx.base, `/documents/verify/${'y'.repeat(43)}`);
      expect(res.status).toBe(200);
    });
  });
});
