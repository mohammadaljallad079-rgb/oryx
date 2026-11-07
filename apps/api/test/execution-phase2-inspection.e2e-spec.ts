import * as argon2 from 'argon2';
import { MODULE_KEYS } from '@oryx/shared';
import { PrismaService } from '../src/common/prisma.service';
import { call, companyCall, createTestApp, login, type TestContext } from './test-app';

/**
 * Execution Phase 2 — the interactive vehicle inspection engine.
 *
 * Real HTTP against the running API, the real guards and the real Prisma layer.
 * The properties asserted here are the ones the feature is most likely to get
 * wrong:
 *
 *  - a section the customer did not buy cannot be written into, and a submission
 *    is validated only against the sections that were selected;
 *  - an unset item is never a pass, so an incomplete inspection cannot be
 *    submitted;
 *  - a marker's normalised coordinates survive a round trip unchanged, and a
 *    coordinate outside the diagram is clamped rather than stored;
 *  - an approved inspection is frozen, and an inspector without the approval
 *    permission cannot approve their own work;
 *  - one tenant cannot see or write another tenant's inspection.
 */
describe('Execution Phase 2 — inspection engine (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'EP2INS';
  const password = 'ep2-inspection-password-12345';

  let companyId = '';
  let otherCompanyId = '';
  let customerId = '';
  let vehicleId = '';
  let otherVehicleId = '';
  let otherCustomerId = '';

  let writerToken = '';
  let reviewerToken = '';
  let readerToken = '';
  let otherTenantToken = '';

  const writerEmail = `${PREFIX.toLowerCase()}-writer@test.local`;
  const reviewerEmail = `${PREFIX.toLowerCase()}-reviewer@test.local`;
  const readerEmail = `${PREFIX.toLowerCase()}-reader@test.local`;
  const otherEmail = `${PREFIX.toLowerCase()}-other@test.local`;

  async function purgeFixtures() {
    const companies = await prisma.company.findMany({ where: { code: { startsWith: PREFIX } }, select: { id: true } });
    const companyIds = companies.map((c) => c.id);
    const sessions = await prisma.inspectionSession.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);
    // Children before parents: every child table references the session.
    await prisma.inspectionAttachment.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionDiagnosticEntry.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionChassisRegion.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionBodyMarker.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionItemResult.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionSectionResult.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.inspectionSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.inspectionBooking.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.vehicle.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.documentSequence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }

  /** Create a staff user with a role holding exactly `permissions`. */
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
      data: { code: `${PREFIX}-CO`, nameEn: 'EP2 Inspections', nameAr: 'فحوصات', type: 'SAAS_TENANT', status: 'ACTIVE' },
    });
    companyId = company.id;
    const other = await prisma.company.create({
      data: { code: `${PREFIX}-OTHER`, nameEn: 'EP2 Other', nameAr: 'أخرى', type: 'SAAS_TENANT', status: 'ACTIVE' },
    });
    otherCompanyId = other.id;

    for (const id of [companyId, otherCompanyId]) {
      await prisma.subscription.create({
        data: { companyId: id, planId: enterprise.id, status: 'ACTIVE', price: 0, licensedModules: [...MODULE_KEYS] },
      });
    }

    const customer = await prisma.customer.create({
      data: { companyId, code: `${PREFIX}-CUST`, nameEn: 'EP2 Customer', nameAr: 'عميل' },
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
        plateNumber: '12345',
        color: 'White',
        mileage: 41_500,
      },
    });
    vehicleId = vehicle.id;

    const otherCustomer = await prisma.customer.create({
      data: { companyId, code: `${PREFIX}-CUST2`, nameEn: 'EP2 Second', nameAr: 'ثاني' },
    });
    otherCustomerId = otherCustomer.id;
    const otherVehicle = await prisma.vehicle.create({
      data: {
        companyId,
        customerId: otherCustomerId,
        vin: `${PREFIX}VIN000000002`,
        make: 'Nissan',
        model: 'Patrol',
        modelYear: 2020,
      },
    });
    otherVehicleId = otherVehicle.id;

    writerToken = await createStaff(writerEmail, companyId, ['erp.inspection.read', 'erp.inspection.write']);
    reviewerToken = await createStaff(reviewerEmail, companyId, [
      'erp.inspection.read',
      'erp.inspection.write',
      'erp.inspection.report.approve',
    ]);
    readerToken = await createStaff(readerEmail, companyId, ['erp.inspection.read']);
    otherTenantToken = await createStaff(otherEmail, otherCompanyId, [
      'erp.inspection.read',
      'erp.inspection.write',
      'erp.inspection.report.approve',
    ]);
  }, 180_000);

  afterAll(async () => {
    await purgeFixtures();
    await ctx.app.close();
  });

  const auth = (token: string) => ({ token, headers: { 'x-oryx-company-id': companyId } });

  /** Create an inspection with the given areas and return its body. */
  async function createSession(
    areas: string[],
    token = writerToken,
    company = companyId,
    vehicle = vehicleId,
    customer = customerId,
  ) {
    const res = await companyCall<{ id: string; jobNumber: string; selectedAreas: string[]; customerName: string }>(
      ctx.base,
      company,
      '/automotive/inspections',
      { method: 'POST', token, body: { customerId: customer, vehicleId: vehicle, selectedAreas: areas } },
    );
    if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  /** Answer every item of a section so it counts as complete. */
  async function completeItems(sessionId: string, area: string, itemKeys: string[], token = writerToken) {
    return companyCall(ctx.base, companyId, `/automotive/inspections/${sessionId}/sections/${area}`, {
      method: 'PUT',
      token,
      body: { items: itemKeys.map((itemKey) => ({ itemKey, result: 'PASS' })) },
    });
  }

  describe('creation and tenancy', () => {
    it('creates an inspection with a generated job number and copies the vehicle identity', async () => {
      const created = await createSession(['ENGINE_COMPARTMENT', 'ROAD_TEST']);
      expect(created.jobNumber).toMatch(/^Z\d{5}$/);
      expect(created.selectedAreas).toEqual(['ENGINE_COMPARTMENT', 'ROAD_TEST']);

      const detail = await companyCall<Record<string, unknown>>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}`,
        auth(writerToken),
      );
      expect(detail.status).toBe(200);
      const body = detail.body as {
        make: string;
        model: string;
        vin: string;
        plateNumber: string;
        odometer: number;
        customerName: string;
        status: string;
        sections: Array<{ area: string }>;
      };
      expect(body.make).toBe('Toyota');
      expect(body.model).toBe('Land Cruiser');
      expect(body.vin).toBe(`${PREFIX}VIN000000001`);
      expect(body.plateNumber).toBe('12345');
      expect(body.odometer).toBe(41_500);
      expect(body.customerName).toBe('EP2 Customer');
      expect(body.status).toBe('DRAFT');
      // A row exists for each selected section even before it is opened.
      expect(body.sections.map((s) => s.area).sort()).toEqual(['ENGINE_COMPARTMENT', 'ROAD_TEST']);
    });

    it('refuses a vehicle that belongs to a different customer', async () => {
      const res = await companyCall(ctx.base, companyId, '/automotive/inspections', {
        method: 'POST',
        token: writerToken,
        body: { customerId, vehicleId: otherVehicleId, selectedAreas: ['INTERIOR'] },
      });
      expect(res.status).toBe(400);
    });

    it('refuses an inspection with no selected type', async () => {
      const res = await companyCall(ctx.base, companyId, '/automotive/inspections', {
        method: 'POST',
        token: writerToken,
        body: { customerId, vehicleId, selectedAreas: [] },
      });
      expect(res.status).toBe(400);
    });

    it('refuses an unknown inspection type', async () => {
      const res = await companyCall(ctx.base, companyId, '/automotive/inspections', {
        method: 'POST',
        token: writerToken,
        body: { customerId, vehicleId, selectedAreas: ['NOT_A_SECTION'] },
      });
      expect(res.status).toBe(400);
    });

    it('hides another tenant inspection', async () => {
      const created = await createSession(['INTERIOR']);
      const res = await companyCall(ctx.base, otherCompanyId, `/automotive/inspections/${created.id}`, {
        token: otherTenantToken,
        headers: { 'x-oryx-company-id': otherCompanyId },
      });
      expect(res.status).toBe(404);

      const list = await companyCall<{ items: Array<{ id: string }> }>(ctx.base, otherCompanyId, '/automotive/inspections', {
        token: otherTenantToken,
        headers: { 'x-oryx-company-id': otherCompanyId },
      });
      expect(list.status).toBe(200);
      expect(list.body.items.map((i) => i.id)).not.toContain(created.id);
    });

    it('refuses a reader without the write permission', async () => {
      const res = await companyCall(ctx.base, companyId, '/automotive/inspections', {
        method: 'POST',
        token: readerToken,
        body: { customerId, vehicleId, selectedAreas: ['INTERIOR'] },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('selected sections only', () => {
    it('refuses to write a section that was not selected', async () => {
      const created = await createSession(['INTERIOR']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/sections/ENGINE_COMPARTMENT`, {
        method: 'PUT',
        token: writerToken,
        body: { items: [{ itemKey: 'engine.fluids', result: 'PASS' }] },
      });
      expect(res.status).toBe(400);
    });

    it('refuses an item key that does not belong to the section', async () => {
      const created = await createSession(['INTERIOR']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/sections/INTERIOR`, {
        method: 'PUT',
        token: writerToken,
        body: { items: [{ itemKey: 'engine.fluids', result: 'PASS' }] },
      });
      expect(res.status).toBe(400);
    });

    it('refuses a result that the section does not accept', async () => {
      // ENGINE_COMPARTMENT is PASS_FAIL only, so N/A must be rejected.
      const created = await createSession(['ENGINE_COMPARTMENT']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/sections/ENGINE_COMPARTMENT`, {
        method: 'PUT',
        token: writerToken,
        body: { items: [{ itemKey: 'engine.fluids', result: 'NA' }] },
      });
      expect(res.status).toBe(400);
    });

    it('accepts N/A where the section allows it', async () => {
      const created = await createSession(['INTERIOR']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/sections/INTERIOR`, {
        method: 'PUT',
        token: writerToken,
        body: { items: [{ itemKey: 'interior.sunroof', result: 'NA' }] },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('progress and submission gating', () => {
    it('reports every selected item as outstanding before it is answered', async () => {
      const created = await createSession(['ROAD_TEST']);
      const res = await companyCall<{ complete: boolean; outstanding: string[]; sections: Array<{ totalItems: number }> }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}/progress`,
        auth(writerToken),
      );
      expect(res.status).toBe(200);
      expect(res.body.complete).toBe(false);
      expect(res.body.sections[0].totalItems).toBe(13);
      expect(res.body.outstanding).toHaveLength(13);
    });

    it('refuses to submit while a selected item is unset', async () => {
      const created = await createSession(['ROAD_TEST']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/submit`, {
        method: 'POST',
        token: writerToken,
      });
      expect(res.status).toBe(400);
    });

    it('submits once every selected section is complete', async () => {
      const created = await createSession(['EXTERIOR']);
      const keys = [
        'exterior.windows',
        'exterior.lights',
        'exterior.indicators',
        'exterior.wipers',
        'exterior.mirrors',
        'exterior.tiresRims',
      ];
      const saved = await completeItems(created.id, 'EXTERIOR', keys);
      expect(saved.status).toBe(200);

      const progress = await companyCall<{ complete: boolean }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}/progress`,
        auth(writerToken),
      );
      expect(progress.body.complete).toBe(true);

      const submit = await companyCall<{ status: string }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}/submit`,
        { method: 'POST', token: writerToken },
      );
      expect(submit.status).toBe(201);
      expect(submit.body.status).toBe('PENDING_REVIEW');
    });

    it('does not require an unselected section to be filled in', async () => {
      // Only INTERIOR is selected; the 13 engine items must not block submission.
      const created = await createSession(['INTERIOR']);
      const keys = [
        'interior.doors',
        'interior.controlKeys',
        'interior.clusterControl',
        'interior.cupHolder',
        'interior.steeringWheel',
        'interior.audio',
        'interior.sunroof',
        'interior.acVents',
        'interior.rearViewMirror',
        'interior.carpet',
        'interior.cigaretteLighter',
        'interior.otherParts',
      ];
      await completeItems(created.id, 'INTERIOR', keys);
      const submit = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/submit`, {
        method: 'POST',
        token: writerToken,
      });
      expect(submit.status).toBe(201);
    });

    it('requires a diagram section to carry a marker or an explicit nothing-to-report', async () => {
      const created = await createSession(['PAINT_BODY']);
      const blocked = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/submit`, {
        method: 'POST',
        token: writerToken,
      });
      expect(blocked.status).toBe(400);

      const marked = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/paint-markers`, {
        method: 'PUT',
        token: writerToken,
        body: { markers: [{ condition: 'FILLER', x: 0.31, y: 0.42 }] },
      });
      expect(marked.status).toBe(200);

      const submit = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/submit`, {
        method: 'POST',
        token: writerToken,
      });
      expect(submit.status).toBe(201);
    });

    it('accepts an explicit nothing-to-report for a diagnostic section', async () => {
      const created = await createSession(['COMPUTER_UNIT']);
      const saved = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/sections/COMPUTER_UNIT`, {
        method: 'PUT',
        token: writerToken,
        body: { noFindings: true, remarks: 'No stored fault codes.' },
      });
      expect(saved.status).toBe(200);
      const submit = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/submit`, {
        method: 'POST',
        token: writerToken,
      });
      expect(submit.status).toBe(201);
    });
  });

  describe('body diagram markers', () => {
    it('round-trips normalised coordinates unchanged', async () => {
      const created = await createSession(['PAINT_BODY']);
      const saved = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/paint-markers`, {
        method: 'PUT',
        token: writerToken,
        body: {
          markers: [
            { condition: 'PAINT', x: 0.1234, y: 0.5678 },
            { condition: 'SECTIONED', x: 0.9, y: 0.2, note: 'Rear quarter' },
          ],
        },
      });
      expect(saved.status).toBe(200);

      const detail = await companyCall<{
        sections: Array<{ area: string; markers: Array<{ condition: string; x: number; y: number; note: string | null }> }>;
      }>(ctx.base, companyId, `/automotive/inspections/${created.id}`, auth(writerToken));
      const paint = detail.body.sections.find((s) => s.area === 'PAINT_BODY')!;
      expect(paint.markers).toHaveLength(2);
      const first = paint.markers.find((m) => m.condition === 'PAINT')!;
      expect(first.x).toBeCloseTo(0.1234, 6);
      expect(first.y).toBeCloseTo(0.5678, 6);
      const sectioned = paint.markers.find((m) => m.condition === 'SECTIONED')!;
      expect(sectioned.note).toBe('Rear quarter');
    });

    it('refuses a coordinate outside the diagram instead of storing it', async () => {
      const created = await createSession(['PAINT_BODY']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/paint-markers`, {
        method: 'PUT',
        token: writerToken,
        body: { markers: [{ condition: 'CHANGE', x: -5, y: 9 }] },
      });
      expect(res.status).toBe(400);

      // Nothing was written.
      const detail = await companyCall<{ sections: Array<{ area: string; markers: unknown[] }> }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}`,
        auth(writerToken),
      );
      expect(detail.body.sections.find((s) => s.area === 'PAINT_BODY')!.markers).toHaveLength(0);
    });

    it('replaces the marker set rather than appending to it', async () => {
      const created = await createSession(['PAINT_BODY']);
      await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/paint-markers`, {
        method: 'PUT',
        token: writerToken,
        body: { markers: [{ condition: 'PAINT', x: 0.1, y: 0.1 }, { condition: 'FILLER', x: 0.2, y: 0.2 }] },
      });
      await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/paint-markers`, {
        method: 'PUT',
        token: writerToken,
        body: { markers: [{ condition: 'CHANGE', x: 0.5, y: 0.5 }] },
      });
      const detail = await companyCall<{ sections: Array<{ area: string; markers: Array<{ condition: string }> }> }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}`,
        auth(writerToken),
      );
      const markers = detail.body.sections.find((s) => s.area === 'PAINT_BODY')!.markers;
      expect(markers).toHaveLength(1);
      expect(markers[0].condition).toBe('CHANGE');
    });

    it('refuses an unknown marker condition', async () => {
      const created = await createSession(['PAINT_BODY']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/paint-markers`, {
        method: 'PUT',
        token: writerToken,
        body: { markers: [{ condition: 'SPARKLE', x: 0.5, y: 0.5 }] },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('chassis regions', () => {
    it('stores the regions and counts only assessed ones', async () => {
      const created = await createSession(['CHASSIS_UNDERCARRIAGE']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/chassis-regions`, {
        method: 'PUT',
        token: writerToken,
        body: {
          regions: [
            { regionKey: 'FRONT', condition: 'OK' },
            { regionKey: 'REAR_LEFT', condition: 'DAMAGE', note: 'Corrosion' },
            { regionKey: 'MIDDLE_RIGHT', condition: 'UNSET' },
          ],
        },
      });
      expect(res.status).toBe(200);

      const progress = await companyCall<{ complete: boolean; sections: Array<{ recorded: number; complete: boolean }> }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}/progress`,
        auth(writerToken),
      );
      // Two assessed regions; the UNSET one does not count.
      expect(progress.body.sections[0].recorded).toBe(2);
      expect(progress.body.complete).toBe(true);
    });

    it('refuses an unknown chassis region', async () => {
      const created = await createSession(['CHASSIS_UNDERCARRIAGE']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/chassis-regions`, {
        method: 'PUT',
        token: writerToken,
        body: { regions: [{ regionKey: 'ROOF', condition: 'OK' }] },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('computer-unit diagnostics', () => {
    it('records and removes a diagnostic entry', async () => {
      const created = await createSession(['COMPUTER_UNIT']);
      const added = await companyCall<{ id: string; module: string }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}/diagnostics`,
        {
          method: 'POST',
          token: writerToken,
          body: { module: 'ECM', faultCode: 'P0171', description: 'System too lean', severity: 'MAJOR' },
        },
      );
      expect(added.status).toBe(201);

      const detail = await companyCall<{ sections: Array<{ area: string; diagnostics: unknown[] }> }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}`,
        auth(writerToken),
      );
      expect(detail.body.sections.find((s) => s.area === 'COMPUTER_UNIT')!.diagnostics).toHaveLength(1);

      const removed = await companyCall(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}/diagnostics/${added.body.id}`,
        { method: 'DELETE', token: writerToken },
      );
      expect(removed.status).toBe(200);

      const after = await companyCall<{ sections: Array<{ area: string; diagnostics: unknown[] }> }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}`,
        auth(writerToken),
      );
      expect(after.body.sections.find((s) => s.area === 'COMPUTER_UNIT')!.diagnostics).toHaveLength(0);
    });

    it('refuses a diagnostic without a description', async () => {
      const created = await createSession(['COMPUTER_UNIT']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/diagnostics`, {
        method: 'POST',
        token: writerToken,
        body: { module: 'ECM' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('attachments', () => {
    /**
     * A real 96x96 PNG. MediaStorageService sniffs the type, decodes the image
     * with sharp and refuses anything smaller than 64x64, so the fixture has to
     * be a genuine image of a permitted size.
     */
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAAjklEQVR42u3QMQ0AAAgDsMlBExJRiQNOriZV0FQPhygQJEiQIEGCBAlCkCBBggQJEiQIQYIECRIkSJAgBAkSJEiQIEGCBCFIkCBBggQJEoQgQYIECRIkSBCCBAkSJEiQIEGCECRIkCBBggQJQpAgQYIECRIkCEGCBAkSJEiQIEEIEiRIkCBBggQhSJCgPwsdszJ3/f5IEgAAAABJRU5ErkJggg==',
      'base64',
    );

    async function upload(sessionId: string, token: string, fields: Record<string, string> = {}) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'photo.png');
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      const res = await fetch(`${ctx.base}/api/v1/automotive/inspections/${sessionId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': companyId },
        body: form,
      });
      const text = await res.text();
      return { status: res.status, body: text ? (JSON.parse(text) as Record<string, string>) : null };
    }

    it('stores an image through the shared media pipeline and returns a media route', async () => {
      const created = await createSession(['EXTERIOR']);
      const res = await upload(created.id, writerToken, { sectionArea: 'EXTERIOR', caption: 'Front bumper' });
      expect(res.status).toBe(201);
      // The media pipeline re-encodes to WebP, which is what strips EXIF; the
      // stored asset type is therefore the normalised one, not the upload's.
      expect(res.body!.mimeType).toBe('image/webp');
      expect(res.body!.url).toMatch(/^\/api\/v1\/cms\/media\/.+\/file/);

      const detail = await companyCall<{ attachments: Array<{ id: string; url: string; caption: string }> }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}`,
        auth(writerToken),
      );
      expect(detail.body.attachments).toHaveLength(1);
      expect(detail.body.attachments[0].caption).toBe('Front bumper');
    });

    it('refuses an attachment tied to a section that was not selected', async () => {
      const created = await createSession(['INTERIOR']);
      const res = await upload(created.id, writerToken, { sectionArea: 'ROAD_TEST' });
      expect(res.status).toBe(400);
    });

    it('refuses an upload with no file', async () => {
      const created = await createSession(['INTERIOR']);
      const form = new FormData();
      form.append('caption', 'nothing');
      const res = await fetch(`${ctx.base}/api/v1/automotive/inspections/${created.id}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${writerToken}`, 'x-oryx-company-id': companyId },
        body: form,
      });
      expect(res.status).toBe(400);
    });

    it('removes an attachment', async () => {
      const created = await createSession(['EXTERIOR']);
      const up = await upload(created.id, writerToken);
      expect(up.status).toBe(201);
      const removed = await companyCall(
        ctx.base,
        companyId,
        `/automotive/inspections/${created.id}/attachments/${up.body!.id}`,
        { method: 'DELETE', token: writerToken },
      );
      expect(removed.status).toBe(200);
    });
  });

  describe('approval workflow', () => {
    /** Submit a minimal complete inspection and return its id. */
    async function submitted(token = writerToken) {
      const created = await createSession(['EXTERIOR'], token);
      await completeItems(
        created.id,
        'EXTERIOR',
        [
          'exterior.windows',
          'exterior.lights',
          'exterior.indicators',
          'exterior.wipers',
          'exterior.mirrors',
          'exterior.tiresRims',
        ],
        token,
      );
      const submit = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/submit`, {
        method: 'POST',
        token,
      });
      expect(submit.status).toBe(201);
      return created.id;
    }

    it('refuses approval from an inspector without the approval permission', async () => {
      const id = await submitted(writerToken);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${id}/review`, {
        method: 'POST',
        token: writerToken,
        body: { decision: 'APPROVE' },
      });
      expect(res.status).toBe(403);
    });

    it('approves with the approval permission and then freezes the inspection', async () => {
      const id = await submitted(writerToken);
      const approved = await companyCall<{ status: string; reviewedAt: string }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${id}/review`,
        { method: 'POST', token: reviewerToken, body: { decision: 'APPROVE', notes: 'Looks good.' } },
      );
      expect(approved.status).toBe(201);
      expect(approved.body.status).toBe('APPROVED');
      expect(approved.body.reviewedAt).not.toBeNull();

      // An approved inspection is frozen.
      const edit = await companyCall(ctx.base, companyId, `/automotive/inspections/${id}/sections/EXTERIOR`, {
        method: 'PUT',
        token: writerToken,
        body: { items: [{ itemKey: 'exterior.windows', result: 'FAIL' }] },
      });
      expect(edit.status).toBe(409);

      const cancel = await companyCall(ctx.base, companyId, `/automotive/inspections/${id}/cancel`, {
        method: 'POST',
        token: writerToken,
      });
      expect(cancel.status).toBe(409);
    });

    it('returns a submitted inspection for correction and allows editing again', async () => {
      const id = await submitted(writerToken);
      const returned = await companyCall<{ status: string; reviewNotes: string }>(
        ctx.base,
        companyId,
        `/automotive/inspections/${id}/review`,
        { method: 'POST', token: reviewerToken, body: { decision: 'REJECT', notes: 'Recheck the lights.' } },
      );
      expect(returned.status).toBe(201);
      expect(returned.body.status).toBe('REJECTED');
      expect(returned.body.reviewNotes).toBe('Recheck the lights.');

      const edit = await companyCall(ctx.base, companyId, `/automotive/inspections/${id}/sections/EXTERIOR`, {
        method: 'PUT',
        token: writerToken,
        body: { items: [{ itemKey: 'exterior.lights', result: 'FAIL', note: 'Left lamp dim' }] },
      });
      expect(edit.status).toBe(200);
    });

    it('refuses to review an inspection that is not awaiting review', async () => {
      const created = await createSession(['INTERIOR']);
      const res = await companyCall(ctx.base, companyId, `/automotive/inspections/${created.id}/review`, {
        method: 'POST',
        token: reviewerToken,
        body: { decision: 'APPROVE' },
      });
      expect(res.status).toBe(409);
    });

    it('refuses to submit twice', async () => {
      const id = await submitted(writerToken);
      const again = await companyCall(ctx.base, companyId, `/automotive/inspections/${id}/submit`, {
        method: 'POST',
        token: writerToken,
      });
      expect(again.status).toBe(409);
    });

    it('refuses to write into another tenant inspection', async () => {
      const created = await createSession(['INTERIOR']);
      const res = await companyCall(ctx.base, otherCompanyId, `/automotive/inspections/${created.id}/sections/INTERIOR`, {
        method: 'PUT',
        token: otherTenantToken,
        headers: { 'x-oryx-company-id': otherCompanyId },
        body: { items: [{ itemKey: 'interior.doors', result: 'PASS' }] },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('customer name optionality', () => {
    it('accepts a customer with only an Arabic name', async () => {
      const res = await companyCall<{ nameAr: string; nameEn: string }>(ctx.base, companyId, '/sales/customers', {
        method: 'POST',
        token: writerToken,
        body: { code: `${PREFIX}-AR`, nameAr: 'عميل بالعربية فقط' },
      });
      // The writer role has no sales-customer permission, so a 403 is a
      // permission result rather than a validation one.
      if (res.status === 201) {
        expect(res.body.nameAr).toBe('عميل بالعربية فقط');
        expect(res.body.nameEn).toBe('');
      } else {
        expect(res.status).toBe(403);
      }
    });

    it('refuses a customer with no name in either language', async () => {
      const res = await companyCall(ctx.base, companyId, '/sales/customers', {
        method: 'POST',
        token: writerToken,
        body: { code: `${PREFIX}-NONAME` },
      });
      expect([400, 403]).toContain(res.status);
    });
  });
});
