import {
  APPROVED_INSPECTION_SERVICES,
  INSPECTION_SECTION_SPECS,
  INSPECTION_TYPES,
} from '@oryx/shared';
import { call, cleanupFixtures, createTestApp, type TestContext } from './test-app';

/**
 * Storefront sections (e2e).
 *
 * The public website sells four sections, and two of them read a catalogue that
 * had no public projection before this suite existed: the technical inspection
 * services the control panel approves, and the split between the general
 * product catalogue and the spare-parts catalogue.
 *
 * The inspection engine is a different taxonomy — seven bookable services, four
 * report types — so these assertions also pin that the website reads the
 * services and never the report sections.
 */
describe('Storefront sections (e2e)', () => {
  let ctx: TestContext;
  let companyId: string;
  const created: string[] = [];
  /** Approved rows the tenant already had, restored afterwards. */
  let previous: Awaited<ReturnType<TestContext['prisma']['inspectionService']['findMany']>> = [];

  const publicCall = <T = unknown>(path: string) => call<T>(ctx.base, path);

  interface InspectionServiceItem {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    description: string | null;
    priceMinor: number;
    taxPercentBp: number;
    durationMinutes: number;
    image: string;
  }

  interface InspectionServicePage {
    currency: string;
    currencyScale: number;
    total: number;
    items: InspectionServiceItem[];
  }

  /** Configure one approved service the way the control panel does. */
  const configure = async (code: string, priceMinor: number, isActive = true) => {
    const row = await ctx.prisma.inspectionService.create({
      data: {
        companyId,
        code,
        nameEn: `Configured ${code}`,
        nameAr: `مُهيّأ ${code}`,
        description: 'Configured by the storefront sections suite.',
        priceMinor,
        taxPercentBp: 1000,
        durationMinutes: 45,
        isActive,
      },
    });
    created.push(row.id);
    return row;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
    const context = await publicCall<{ companyId: string }>('/storefront/context');
    companyId = context.body.companyId;
    // Start from a tenant with no configured approved service at all, so the
    // assertions describe the projection rather than whatever the seed left.
    // The tenant's own rows are put back afterwards: this suite must not destroy
    // prices an operator configured in a development database.
    const codes = APPROVED_INSPECTION_SERVICES.map((service) => service.code);
    previous = await ctx.prisma.inspectionService.findMany({ where: { companyId, code: { in: codes } } });
    await ctx.prisma.inspectionService.deleteMany({ where: { companyId, code: { in: codes } } });
  });

  afterAll(async () => {
    if (created.length) {
      await ctx.prisma.inspectionService.deleteMany({ where: { id: { in: created } } });
    }
    await ctx.prisma.inspectionService.deleteMany({
      where: { companyId, code: { in: APPROVED_INSPECTION_SERVICES.map((s) => s.code) } },
    });
    for (const row of previous) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
      await ctx.prisma.inspectionService.create({ data: rest });
    }
    await ctx.app.close();
  });

  it('serves the approved inspection services without a session', async () => {
    const page = await publicCall<InspectionServicePage>('/storefront/inspection-services');
    expect(page.status).toBe(200);
    expect(page.body.currency.length).toBeGreaterThan(0);
    expect(page.body.total).toBe(page.body.items.length);
  });

  it('returns exactly the seven approved services, in the approved order', async () => {
    const page = await publicCall<InspectionServicePage>('/storefront/inspection-services');
    expect(APPROVED_INSPECTION_SERVICES).toHaveLength(7);
    expect(page.body.items.map((item) => item.code)).toEqual(
      APPROVED_INSPECTION_SERVICES.map((service) => service.code),
    );
  });

  it('names an unconfigured service from the approved catalogue, without a price', async () => {
    const page = await publicCall<InspectionServicePage>('/storefront/inspection-services');
    for (const item of page.body.items) {
      const spec = INSPECTION_SECTION_SPECS.find((section) => section.labelEn === item.nameEn);
      expect(spec).toBeDefined();
      expect(item.nameAr).toBe(spec?.labelAr);
      // No row is configured, so there is no approved price to publish.
      expect(item.priceMinor).toBe(0);
      expect(item.image.startsWith('/')).toBe(true);
    }
  });

  it('keeps the report taxonomy out of the service catalogue', async () => {
    const page = await publicCall<InspectionServicePage>('/storefront/inspection-services');
    // Four report types, seven bookable services: the website must expose the
    // seven and carry none of the report-only fields.
    expect(INSPECTION_TYPES).toHaveLength(4);
    expect(page.body.items).toHaveLength(7);
    const approved = APPROVED_INSPECTION_SERVICES.map((service) => service.code);
    for (const item of page.body.items) {
      expect(approved).toContain(item.code);
      expect(item).not.toHaveProperty('sections');
      expect(item).not.toHaveProperty('page');
    }
  });

  it('publishes the operator price, tax and duration for a configured service', async () => {
    const row = await configure('INS-EXTERIOR', 12345);

    const page = await publicCall<InspectionServicePage>('/storefront/inspection-services');
    const shown = page.body.items.find((item) => item.code === 'INS-EXTERIOR');
    expect(shown?.id).toBe(row.id);
    expect(shown?.nameEn).toBe('Configured INS-EXTERIOR');
    expect(shown?.priceMinor).toBe(12345);
    expect(shown?.taxPercentBp).toBe(1000);
    expect(shown?.durationMinutes).toBe(45);
    expect(page.body.items).toHaveLength(7);
  });

  it('drops a service the operator deactivated', async () => {
    const row = await configure('INS-PAINT', 9000, false);

    const page = await publicCall<InspectionServicePage>('/storefront/inspection-services');
    expect(page.body.items.some((item) => item.id === row.id)).toBe(false);
    expect(page.body.items.some((item) => item.code === 'INS-PAINT')).toBe(false);
    expect(page.body.items).toHaveLength(6);
  });

  it('ignores a service code that is not one of the seven approved', async () => {
    const row = await ctx.prisma.inspectionService.create({
      data: {
        companyId,
        code: 'NOT-APPROVED',
        nameEn: 'Not an approved service',
        nameAr: 'خدمة غير معتمدة',
        priceMinor: 5000,
      },
    });
    created.push(row.id);

    const page = await publicCall<InspectionServicePage>('/storefront/inspection-services');
    expect(page.body.items.some((item) => item.id === row.id)).toBe(false);
    expect(page.body.items).toHaveLength(6);
  });

  it('partitions the product catalogue into products and spare parts', async () => {
    const all = await publicCall<{ items: Array<{ id: string }>; total: number }>(
      '/customer/catalog/products?pageSize=50',
    );
    const products = await publicCall<{ items: Array<{ id: string }>; total: number }>(
      '/customer/catalog/products?pageSize=50&spareParts=exclude',
    );
    const parts = await publicCall<{ items: Array<{ id: string }>; total: number }>(
      '/customer/catalog/products?pageSize=50&spareParts=only',
    );

    expect(all.status).toBe(200);
    expect(products.status).toBe(200);
    expect(parts.status).toBe(200);
    // Nothing is lost and nothing is counted twice.
    expect(products.body.total + parts.body.total).toBe(all.body.total);
    const overlap = products.body.items.filter((item) =>
      parts.body.items.some((part) => part.id === item.id),
    );
    expect(overlap).toEqual([]);
  });

  it('treats an unknown spareParts value as no filter at all', async () => {
    const all = await publicCall<{ total: number }>('/customer/catalog/products?pageSize=1');
    const unknown = await publicCall<{ total: number }>(
      '/customer/catalog/products?pageSize=1&spareParts=sometimes',
    );
    expect(unknown.body.total).toBe(all.body.total);
  });
});
