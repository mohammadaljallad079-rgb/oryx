import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@oryx/database';
import {
  PART_CATEGORIES,
  SERVICE_CATEGORIES,
  currencyScale,
  lineAmountMinor,
  partCategory,
  serviceCategory,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { TenantCompanyService } from '../common/tenant-company.service';
import { ERROR_CODES, badRequest, conflict, notFound } from '../common/errors';
import { computeDocumentTotals } from '../common/document-totals';

/** Only this many products are ever scanned to build the filter facets. */
const FACET_SAMPLE_LIMIT = 2000;

export interface StorefrontProduct {
  id: string;
  sku: string;
  partNumber: string | null;
  nameEn: string;
  nameAr: string;
  brand: string | null;
  categoryKey: string | null;
  condition: 'NEW' | 'REFURBISHED';
  priceMinor: number;
  compareAtPriceMinor: number | null;
  currency: string;
  currencyScale: number;
  taxRateBp: number;
  image: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  warrantyEn: string | null;
  warrantyAr: string | null;
  engineType: string | null;
  unit: string;
  isFeatured: boolean;
  inStock: boolean;
  onHand: number;
  fits: Array<{ make: string; model: string; yearFrom: number; yearTo: number | null }>;
}

@Injectable()
export class StorefrontService {
  private readonly logger = new Logger(StorefrontService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenants: TenantCompanyService,
  ) {}

  // ------------------------------------------------------------ presentation

  /** The catalogue is only ever read from published rows. */
  private publishedWhere(companyId: string): Prisma.ProductWhereInput {
    return {
      companyId,
      isActive: true,
      isPublished: true,
      partCategoryKey: { not: null },
    };
  }

  /**
   * Public company context.
   *
   * The storefront is one storefront for ORYX Auto Services, so the tenant is
   * resolved the same way a consumer booking resolves it rather than from a
   * header. The company's own currency and scale drive every price shown.
   */
  async context() {
    const companyId = await this.tenants.resolveForCustomer(null);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, nameEn: true, nameAr: true, currency: true, countryCode: true },
    });
    return {
      companyId: company.id,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      currency: company.currency,
      currencyScale: currencyScale(company.currency),
      countryCode: company.countryCode,
    };
  }

  /** Resolve the storefront tenant without exposing it to the caller. */
  private async companyId(): Promise<string> {
    return this.tenants.resolveForCustomer(null);
  }

  /** Category metadata joined with the live product count per aisle. */
  async categories() {
    const companyId = await this.companyId();
    const grouped = await this.prisma.product.groupBy({
      by: ['partCategoryKey'],
      where: this.publishedWhere(companyId),
      _count: { _all: true },
    });
    const counts = new Map(
      grouped.map((row) => [row.partCategoryKey ?? 'other', row._count._all]),
    );
    return PART_CATEGORIES.map((category) => ({
      key: category.key,
      nameEn: category.nameEn,
      nameAr: category.nameAr,
      image: category.image,
      productCount: counts.get(category.key) ?? 0,
    }));
  }

  /**
   * Build a Prisma `where` from the storefront filters.
   *
   * Vehicle filters are applied through the fitment relation, not a text match:
   * a part is only shown as compatible when a `PartCompatibility` row says so.
   */
  private buildWhere(companyId: string, query: StorefrontQuery): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = this.publishedWhere(companyId);

    if (query.category?.length) where.partCategoryKey = { in: query.category };
    if (query.brand?.length) where.brand = { in: query.brand };
    if (query.condition?.length) where.partCondition = { in: query.condition };
    if (query.engineType) where.engineType = query.engineType;
    if (query.featured) where.isFeatured = true;
    if (query.onOffer) where.compareAtPriceMinor = { not: null };

    if (query.priceMinMinor !== undefined || query.priceMaxMinor !== undefined) {
      where.salesPriceMinor = {
        ...(query.priceMinMinor !== undefined ? { gte: query.priceMinMinor } : {}),
        ...(query.priceMaxMinor !== undefined ? { lte: query.priceMaxMinor } : {}),
      };
    }

    if (query.partNumber) {
      where.OR = [
        { sku: { contains: query.partNumber, mode: 'insensitive' } },
        { partReferences: { some: { partNumber: { contains: query.partNumber, mode: 'insensitive' } } } },
      ];
    }

    const fitment: Prisma.PartCompatibilityWhereInput = {};
    if (query.make?.length) fitment.make = { in: query.make };
    if (query.model?.length) fitment.model = { in: query.model };
    if (query.year !== undefined) {
      fitment.yearFrom = { lte: query.year };
      fitment.OR = [{ yearTo: null }, { yearTo: { gte: query.year } }];
    }
    if (Object.keys(fitment).length > 0) {
      where.partCompatibilities = { some: fitment };
    }

    if (query.search) {
      const term = query.search;
      const searchOr: Prisma.ProductWhereInput[] = [
        { nameEn: { contains: term, mode: 'insensitive' } },
        { nameAr: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { partReferences: { some: { partNumber: { contains: term, mode: 'insensitive' } } } },
        { partCompatibilities: { some: { make: { contains: term, mode: 'insensitive' } } } },
        { partCompatibilities: { some: { model: { contains: term, mode: 'insensitive' } } } },
      ];
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: searchOr }];
    }

    return where;
  }

  private orderBy(sort: StorefrontQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ salesPriceMinor: 'asc' }, { nameEn: 'asc' }];
      case 'price_desc':
        return [{ salesPriceMinor: 'desc' }, { nameEn: 'asc' }];
      case 'newest':
        return [{ createdAt: 'desc' }];
      case 'name_asc':
        return [{ nameEn: 'asc' }];
      default:
        // Relevance keeps the featured and discounted items first, then newest.
        return [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
    }
  }

  /**
   * The storefront listing.
   *
   * Availability is a post-filter rather than a database filter: stock lives in
   * `StockLevel` and a product may be held in several warehouses, so summing it
   * in SQL and then filtering keeps the page honest without a denormalised
   * column that could drift.
   */
  async listProducts(query: StorefrontQuery) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, query.pageSize ?? 12));

    const where = this.buildWhere(companyId, query);
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: this.orderBy(query.sort),
        include: {
          partReferences: { select: { partNumber: true, brand: true } },
          partCompatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } },
        },
      }),
    ]);

    let products = await this.decorate(rows, companyId, currency);
    if (query.inStock !== undefined) {
      products = products.filter((p) => (query.inStock ? p.inStock : !p.inStock));
    }

    // When availability is filtered in memory, paginate after the filter so the
    // page count reflects what the visitor can actually buy.
    const filteredTotal = query.inStock === undefined ? total : products.length;
    const start = query.inStock === undefined ? (page - 1) * pageSize : 0;
    const pageItems = query.inStock === undefined ? products.slice(start, start + pageSize) : products;

    return {
      items: pageItems,
      total: filteredTotal,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(filteredTotal / pageSize)),
      currency: currency.code,
      currencyScale: currency.scale,
    };
  }

  /**
   * Filter facets computed from the catalogue, never from a hard-coded list.
   *
   * A make, model, brand or aisle that has no published product is simply not
   * offered, so a filter can never return an empty result set by itself.
   */
  async facets() {
    const companyId = await this.companyId();
    const where = this.publishedWhere(companyId);

    const [brands, categories, fitment, prices, conditionRows, engineTypes] = await Promise.all([
      this.prisma.product.groupBy({
        by: ['brand'],
        where: { ...where, brand: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.product.groupBy({
        by: ['partCategoryKey'],
        where,
        _count: { _all: true },
      }),
      this.prisma.partCompatibility.findMany({
        where: { companyId, product: where },
        select: { make: true, model: true, yearFrom: true, yearTo: true },
      }),
      this.prisma.product.aggregate({
        where,
        _min: { salesPriceMinor: true },
        _max: { salesPriceMinor: true },
      }),
      this.prisma.product.groupBy({ by: ['partCondition'], where, _count: { _all: true } }),
      this.prisma.product.groupBy({
        by: ['engineType'],
        where: { ...where, engineType: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const makes = new Map<string, Map<string, { min: number; max: number }>>();
    for (const row of fitment) {
      const models = makes.get(row.make) ?? new Map<string, { min: number; max: number }>();
      const current = models.get(row.model);
      const yearFrom = Math.min(current?.min ?? row.yearFrom, row.yearFrom);
      const yearTo = Math.max(current?.max ?? row.yearTo ?? row.yearFrom, row.yearTo ?? row.yearFrom);
      models.set(row.model, { min: yearFrom, max: yearTo });
      makes.set(row.make, models);
    }

    return {
      brands: brands
        .filter((b) => b.brand)
        .map((b) => ({ value: b.brand as string, count: b._count._all }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      categories: PART_CATEGORIES.map((category) => ({
        key: category.key,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        count: categories.find((c) => c.partCategoryKey === category.key)?._count._all ?? 0,
      })),
      vehicles: [...makes.entries()]
        .map(([make, models]) => ({
          make,
          models: [...models.entries()]
            .map(([model, years]) => ({ model, yearFrom: years.min, yearTo: years.max }))
            .sort((a, b) => a.model.localeCompare(b.model)),
        }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      price: {
        minMinor: prices._min.salesPriceMinor ?? 0,
        maxMinor: prices._max.salesPriceMinor ?? 0,
      },
      conditions: conditionRows.map((c) => ({ value: c.partCondition, count: c._count._all })),
      engineTypes: engineTypes
        .filter((e) => e.engineType)
        .map((e) => ({ value: e.engineType as string, count: e._count._all })),
    };
  }

  /** A single published product with its gallery and fitment. */
  async product(idOrSku: string) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    const row = await this.prisma.product.findFirst({
      where: {
        companyId,
        isActive: true,
        isPublished: true,
        OR: [{ id: idOrSku }, { sku: idOrSku }],
      },
      include: {
        partReferences: true,
        partCompatibilities: true,
      },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found.');
    const [decorated] = await this.decorate([row], companyId, currency);
    return decorated;
  }

  /** Related products from the same aisle, excluding the product itself. */
  async relatedProducts(id: string, limit = 4) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      select: { partCategoryKey: true, brand: true },
    });
    if (!product) return [];
    const rows = await this.prisma.product.findMany({
      where: {
        ...this.publishedWhere(companyId),
        id: { not: id },
        ...(product.partCategoryKey ? { partCategoryKey: product.partCategoryKey } : {}),
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        partReferences: { select: { partNumber: true, brand: true } },
        partCompatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } },
      },
    });
    return this.decorate(rows, companyId, currency);
  }

  /**
   * Autocomplete over the real catalogue.
   *
   * Suggestions are existing records — product names, SKUs, brands and the makes
   * and models that have fitment rows — so a suggestion always leads somewhere.
   */
  async suggest(term: string, limit = 8) {
    const companyId = await this.companyId();
    const where = this.publishedWhere(companyId);
    const [products, fitment] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          ...where,
          OR: [
            { nameEn: { contains: term, mode: 'insensitive' } },
            { nameAr: { contains: term, mode: 'insensitive' } },
            { sku: { contains: term, mode: 'insensitive' } },
            { brand: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, sku: true, nameEn: true, nameAr: true, brand: true },
        take: limit,
      }),
      this.prisma.partCompatibility.findMany({
        where: { companyId, product: where },
        select: { make: true, model: true },
        distinct: ['make', 'model'],
        take: 40,
      }),
    ]);

    const suggestions: Array<{
      kind: 'product' | 'make' | 'model';
      label: string;
      sublabel?: string;
      href: string;
    }> = products.map((p) => ({
      kind: 'product',
      label: p.nameEn,
      sublabel: `${p.brand ?? ''} ${p.sku}`.trim(),
      href: `/store/${p.sku}`,
    }));

    const lower = term.toLowerCase();
    for (const row of fitment) {
      if (row.make.toLowerCase().includes(lower)) {
        suggestions.push({
          kind: 'make',
          label: row.make,
          sublabel: row.model,
          href: `/store?make=${encodeURIComponent(row.make)}`,
        });
      }
    }
    for (const row of fitment) {
      if (row.model.toLowerCase().includes(lower)) {
        suggestions.push({
          kind: 'model',
          label: row.model,
          sublabel: row.make,
          href: `/store?make=${encodeURIComponent(row.make)}&model=${encodeURIComponent(row.model)}`,
        });
      }
    }

    return suggestions.slice(0, limit);
  }

  /** Products currently on offer, newest offer first. */
  async offers(limit = 8) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    const rows = await this.prisma.product.findMany({
      where: { ...this.publishedWhere(companyId), compareAtPriceMinor: { not: null } },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        partReferences: { select: { partNumber: true, brand: true } },
        partCompatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } },
      },
    });
    return this.decorate(rows, companyId, currency);
  }

  /** Featured products for the homepage shop window. */
  async featured(limit = 8) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    const rows = await this.prisma.product.findMany({
      where: { ...this.publishedWhere(companyId), isFeatured: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        partReferences: { select: { partNumber: true, brand: true } },
        partCompatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } },
      },
    });
    return this.decorate(rows, companyId, currency);
  }

  // ----------------------------------------------------------------- branches

  /**
   * Published branches with the services each one offers.
   *
   * Working hours come from the shared booking engine's `WorkingHours` rows so
   * the directory and the booking wizard can never disagree about opening times.
   */
  async branches() {
    const companyId = await this.companyId();
    const rows = await this.prisma.branch.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
      include: {
        workingHours: { where: { resourceId: null }, orderBy: { dayOfWeek: 'asc' } },
        bookingResources: { where: { isActive: true }, select: { id: true } },
      },
    });

    return rows.map((branch) => ({
      id: branch.id,
      code: branch.code,
      nameEn: branch.nameEn,
      nameAr: branch.nameAr,
      city: branch.city,
      countryCode: branch.countryCode,
      addressLine: branch.addressLine,
      phone: branch.phone,
      email: branch.email,
      whatsapp: branch.whatsapp,
      timezone: branch.timezone,
      image: branch.imageUrl,
      descriptionEn: branch.descriptionEn,
      descriptionAr: branch.descriptionAr,
      services: branch.servicesOffered,
      isPublished: branch.isPublished,
      hasCoordinates: branch.latitude !== null && branch.longitude !== null,
      latitude: branch.latitude === null ? null : Number(branch.latitude),
      longitude: branch.longitude === null ? null : Number(branch.longitude),
      bookable: branch.bookingResources.length > 0,
      workingHours: branch.workingHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        opensMinute: h.opensMinute,
        closesMinute: h.closesMinute,
        isClosed: h.isClosed,
      })),
    }));
  }

  /** Services offered, with the branches that can deliver each one. */
  async services() {
    const branches = await this.branches();
    return SERVICE_CATEGORIES.map((service) => ({
      key: service.key,
      nameEn: service.nameEn,
      nameAr: service.nameAr,
      descriptionEn: service.descriptionEn,
      descriptionAr: service.descriptionAr,
      image: service.image,
      durationMinutes: service.defaultDurationMinutes,
      priceMinor: service.defaultPriceMinor,
      turnaroundEn: service.turnaroundEn,
      turnaroundAr: service.turnaroundAr,
      branchIds: branches
        .filter((b) => b.services.length === 0 || b.services.includes(service.key))
        .map((b) => b.id),
    }));
  }

  // -------------------------------------------------------------- availability

  /**
   * Available appointment times for one branch and day.
   *
   * The storefront never generates its own slots: it delegates to
   * `BookingService.availableSlots` so opening hours, exceptions, buffers and
   * existing bookings are all respected. Only real, free times are returned.
   */
  async availability(input: {
    branchId?: string | null;
    date: string;
    durationMinutes: number;
    bookings: BookingAvailabilityPort;
  }) {
    const companyId = await this.companyId();
    const parsed = new Date(input.date);
    if (Number.isNaN(parsed.getTime())) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A valid date is required.');
    }
    const dayStart = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
    );
    const slots = await input.bookings.availableSlots({
      companyId,
      branchId: input.branchId ?? null,
      dayStart,
      durationMinutes: input.durationMinutes,
      stepMinutes: 30,
      minimumNoticeMinutes: 120,
      maxSlots: 48,
    });
    return { date: input.date, slots };
  }

  /**
   * Free-slot counts for a run of days, so the booking wizard can mark which
   * dates are actually bookable instead of offering a day with no openings.
   *
   * The engine is the same `availableSlots` used for a single day; this only
   * fans it out and keeps the count. Days are walked from today so the caller
   * does not have to reconcile timezones.
   */
  async availabilityDays(input: {
    branchId?: string | null;
    days: number;
    durationMinutes: number;
    bookings: BookingAvailabilityPort;
  }) {
    const companyId = await this.companyId();
    const today = new Date();
    const results: Array<{ date: string; slots: number }> = [];
    for (let offset = 0; offset < input.days; offset += 1) {
      const day = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset),
      );
      const date = day.toISOString().slice(0, 10);
      const slots = await input.bookings.availableSlots({
        companyId,
        branchId: input.branchId ?? null,
        dayStart: day,
        durationMinutes: input.durationMinutes,
        stepMinutes: 30,
        minimumNoticeMinutes: 120,
        maxSlots: 48,
      });
      results.push({ date, slots: slots.length });
    }
    return { days: results };
  }

  // --------------------------------------------------------------- public orders

  /**
   * Price a basket server-side.
   *
   * The client sends only product ids and quantities; every price, tax rate and
   * total is computed here from the published catalogue, so a tampered request
   * cannot change what an order costs.
   */
  async quote(lines: Array<{ productId: string; quantity: number }>) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    if (lines.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Your cart is empty.');
    }
    if (lines.length > 40) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'An order cannot exceed 40 lines.');
    }

    const products = await this.prisma.product.findMany({
      where: {
        ...this.publishedWhere(companyId),
        id: { in: lines.map((l) => l.productId) },
      },
      include: { partCompatibilities: { select: { make: true, model: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const onHand = await this.onHandByProduct(companyId, products.map((p) => p.id));

    const priced = lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) {
        throw badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          'One of the items in your cart is no longer available.',
        );
      }
      const available = onHand.get(product.id) ?? 0;
      if (available < line.quantity) {
        throw conflict(
          ERROR_CODES.INSUFFICIENT_STOCK,
          `Only ${available} of ${product.nameEn} are in stock.`,
        );
      }
      return {
        productId: product.id,
        sku: product.sku,
        nameEn: product.nameEn,
        nameAr: product.nameAr,
        quantity: line.quantity,
        unitPriceMinor: product.salesPriceMinor,
        compareAtPriceMinor: product.compareAtPriceMinor,
        taxPercentBp: product.taxRateBp,
        image: this.imageFor(product),
      };
    });

    const totals = computeDocumentTotals(
      priced.map((line) => ({
        quantity: line.quantity * 10_000,
        unitPriceMinor: line.unitPriceMinor,
        taxPercentBp: line.taxPercentBp,
      })),
    );

    const items = priced.map((line, index) => ({
      ...line,
      lineSubtotalMinor: totals.lines[index].lineSubtotalMinor,
      discountMinor: totals.lines[index].discountMinor,
      taxMinor: totals.lines[index].taxMinor,
      lineTotalMinor: totals.lines[index].lineTotalMinor,
    }));

    return {
      items,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      currency: currency.code,
      currencyScale: currency.scale,
    };
  }

  /**
   * Create a web order for a signed-in customer.
   *
   * The order is recorded with the server-side price snapshot. Stock is *not*
   * decremented here: the goods are only issued when an operator posts the
   * invoice, which is the same path a counter sale takes, so the storefront
   * cannot silently consume inventory that a warehouse count disagrees with.
   */
  async createOrder(input: {
    accountId: string;
    lines: Array<{ productId: string; quantity: number }>;
    fulfilment: 'COLLECTION' | 'DELIVERY';
    branchId?: string | null;
    address?: Record<string, unknown> | null;
    contactName: string;
    contactPhone: string;
    contactEmail?: string | null;
    notes?: string | null;
  }) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    const quote = await this.quote(input.lines);

    const account = await this.prisma.customerAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true, email: true, fullName: true, phone: true },
    });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer account not found.');

    if (input.fulfilment === 'DELIVERY' && !input.address) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A delivery address is required.');
    }
    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, companyId },
        select: { id: true },
      });
      if (!branch) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unknown branch.');
    }

    // The tenant customer row lets the ERP reference this order like any other
    // sale; it is created on first use, exactly as the garage does.
    const customer = await this.ensureTenantCustomer(companyId, account);

    const orderNumber = await this.nextOrderNumber(companyId);

    const order = await this.prisma.webOrder.create({
      data: {
        companyId,
        branchId: input.branchId ?? null,
        orderNumber,
        customerAccountId: account.id,
        customerId: customer.id,
        fulfilment: input.fulfilment,
        deliveryAddress: (input.address ?? undefined) as Prisma.InputJsonValue | undefined,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail ?? account.email,
        notes: input.notes ?? null,
        subtotalMinor: quote.subtotalMinor,
        discountMinor: quote.discountMinor,
        taxMinor: quote.taxMinor,
        shippingMinor: 0,
        totalMinor: quote.totalMinor,
        currency: currency.code,
        currencyScale: currency.scale,
        status: 'PENDING',
        lines: {
          create: quote.items.map((item, index) => ({
            productId: item.productId,
            sku: item.sku,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
            taxPercentBp: item.taxPercentBp,
            lineTotalMinor: item.lineTotalMinor,
            sortOrder: index,
          })),
        },
      },
      include: { lines: true },
    });

    await this.audit.record({
      action: 'web_order.created',
      companyId,
      targetType: 'WEB_ORDER',
      targetId: order.id,
      summary: `Web order ${orderNumber} placed for ${quote.totalMinor} ${currency.code}.`,
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      fulfilment: order.fulfilment,
      totalMinor: order.totalMinor,
      currency: order.currency,
      currencyScale: order.currencyScale,
      createdAt: order.createdAt,
      lines: order.lines.map((line) => ({
        sku: line.sku,
        nameEn: line.nameEn,
        nameAr: line.nameAr,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    };
  }

  /** A customer's own orders, newest first. */
  async listOrders(accountId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const [total, rows] = await Promise.all([
      this.prisma.webOrder.count({ where: { customerAccountId: accountId } }),
      this.prisma.webOrder.findMany({
        where: { customerAccountId: accountId },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        include: { lines: true },
      }),
    ]);
    return {
      items: rows.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        fulfilment: order.fulfilment,
        totalMinor: order.totalMinor,
        currency: order.currency,
        currencyScale: order.currencyScale,
        createdAt: order.createdAt,
        itemCount: order.lines.length,
        lines: order.lines.map((line) => ({
          sku: line.sku,
          nameEn: line.nameEn,
          nameAr: line.nameAr,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          lineTotalMinor: line.lineTotalMinor,
        })),
      })),
      total,
      page: safePage,
      pageSize: safeSize,
      pageCount: Math.max(1, Math.ceil(total / safeSize)),
    };
  }

  async getOrder(accountId: string, orderId: string) {
    const order = await this.prisma.webOrder.findFirst({
      where: { id: orderId, customerAccountId: accountId },
      include: { lines: true },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    return order;
  }

  // ----------------------------------------------------------------- wishlist

  async wishlist(accountId: string) {
    const companyId = await this.companyId();
    const currency = await this.currencyFor(companyId);
    const rows = await this.prisma.customerWishlistItem.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            partReferences: { select: { partNumber: true, brand: true } },
            partCompatibilities: { select: { make: true, model: true, yearFrom: true, yearTo: true } },
          },
        },
      },
    });
    const live = rows
      .filter((row) => row.product.isPublished && row.product.isActive)
      .map((row) => row.product);
    return this.decorate(live, companyId, currency);
  }

  async wishlistIds(accountId: string) {
    const rows = await this.prisma.customerWishlistItem.findMany({
      where: { accountId },
      select: { productId: true },
    });
    return rows.map((row) => row.productId);
  }

  async toggleWishlist(accountId: string, productId: string) {
    const companyId = await this.companyId();
    const product = await this.prisma.product.findFirst({
      where: { ...this.publishedWhere(companyId), id: productId },
      select: { id: true },
    });
    if (!product) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found.');

    const existing = await this.prisma.customerWishlistItem.findUnique({
      where: { accountId_productId: { accountId, productId } },
    });
    if (existing) {
      await this.prisma.customerWishlistItem.delete({ where: { id: existing.id } });
      return { saved: false };
    }
    await this.prisma.customerWishlistItem.create({ data: { accountId, productId } });
    return { saved: true };
  }

  // ------------------------------------------------------------ contact form

  async createContactMessage(input: {
    fullName: string;
    email: string;
    phone?: string;
    subject?: string;
    message: string;
    branchId?: string;
    locale?: 'ar' | 'en';
  }) {
    const companyId = await this.companyId();
    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, companyId },
        select: { id: true },
      });
      if (!branch) input.branchId = undefined;
    }
    const created = await this.prisma.contactMessage.create({
      data: {
        companyId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone ?? null,
        subject: input.subject ?? null,
        message: input.message,
        branchId: input.branchId ?? null,
        locale: input.locale ?? 'ar',
      },
    });
    await this.audit.record({
      action: 'contact_message.received',
      companyId,
      targetType: 'CONTACT_MESSAGE',
      targetId: created.id,
      summary: `Contact message from ${input.email}.`,
    });
    return { id: created.id, received: true };
  }

  // ------------------------------------------------------------- appointments

  /**
   * Record a public appointment.
   *
   * The slot is created by the shared booking engine so opening hours and the
   * double-booking guarantee both apply. The guest contact details are stored on
   * the slot, and a signed-in customer is additionally linked to their account
   * and (optionally) their vehicle.
   */
  async createAppointment(input: {
    accountId?: string | null;
    customerName: string;
    phone: string;
    email?: string | null;
    vehicleId?: string | null;
    vehicleMake?: string | null;
    vehicleModel?: string | null;
    vehicleYear?: number | null;
    plateNumber?: string | null;
    serviceRef: string;
    branchId?: string | null;
    startsAt: string;
    durationMinutes?: number;
    notes?: string | null;
    bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE';
    bookings: BookingPort;
  }) {
    const companyId = await this.companyId();
    if (!serviceCategory(input.serviceRef)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unknown service.');
    }
    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, companyId },
        select: { id: true },
      });
      if (!branch) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unknown branch.');
    }

    let vehicleId: string | null = null;
    if (input.accountId && input.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, customerAccountId: input.accountId },
        select: { id: true },
      });
      if (!vehicle) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'That vehicle is not in your garage.');
      }
      vehicleId = vehicle.id;
    }

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A valid appointment time is required.');
    }

    const durationMinutes =
      input.durationMinutes ?? serviceCategory(input.serviceRef)?.defaultDurationMinutes ?? 60;

    const { resourceId } = await input.bookings.assertSlotBookable({
      companyId,
      branchId: input.branchId ?? null,
      serviceRef: input.serviceRef,
      startsAt,
      durationMinutes,
    });

    const detail = [
      input.vehicleMake || input.vehicleModel
        ? `${input.vehicleMake ?? ''} ${input.vehicleModel ?? ''}`.trim()
        : null,
      input.vehicleYear ? String(input.vehicleYear) : null,
      input.plateNumber ? `Plate ${input.plateNumber}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const slot = await input.bookings.createBooking({
      companyId,
      branchId: input.branchId ?? null,
      resourceId,
      bookingType: input.bookingType,
      serviceRef: input.serviceRef,
      startsAt,
      durationMinutes,
      customerAccountId: input.accountId ?? null,
      vehicleId,
      notes: [detail, input.notes].filter(Boolean).join('\n') || null,
      guestName: input.customerName,
      guestPhone: input.phone,
      guestEmail: input.email ?? null,
      hold: false,
    });

    return {
      id: slot.id,
      reference: slot.reference,
      status: slot.status,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      durationMinutes: slot.durationMinutes,
      serviceRef: slot.serviceRef,
      branchId: slot.branchId,
    };
  }

  /** Appointments belonging to a signed-in customer. */
  async listAppointments(accountId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const [total, rows] = await Promise.all([
      this.prisma.bookingSlot.count({ where: { customerAccountId: accountId } }),
      this.prisma.bookingSlot.findMany({
        where: { customerAccountId: accountId },
        orderBy: { startsAt: 'desc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        include: {
          branch: { select: { nameEn: true, nameAr: true, phone: true, addressLine: true } },
          vehicle: { select: { make: true, model: true, modelYear: true, plateNumber: true } },
        },
      }),
    ]);
    return {
      items: rows.map((slot) => ({
        id: slot.id,
        reference: slot.reference,
        status: slot.status,
        bookingType: slot.bookingType,
        serviceRef: slot.serviceRef,
        service: slot.serviceRef ? serviceCategory(slot.serviceRef) ?? null : null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        durationMinutes: slot.durationMinutes,
        notes: slot.notes,
        branch: slot.branch,
        vehicle: slot.vehicle,
      })),
      total,
      page: safePage,
      pageSize: safeSize,
      pageCount: Math.max(1, Math.ceil(total / safeSize)),
    };
  }

  // -------------------------------------------------------------------- utils

  /** On-hand quantity per product, summed across the company's warehouses. */
  private async onHandByProduct(companyId: string, productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.stockLevel.groupBy({
      by: ['productId'],
      where: { companyId, productId: { in: productIds } },
      _sum: { quantity: true },
    });
    // Quantities are scaled by 10^4; the storefront sells whole units.
    return new Map(rows.map((row) => [row.productId, Math.floor((row._sum.quantity ?? 0) / 10_000)]));
  }

  private async currencyFor(companyId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { currency: true },
    });
    return { code: company.currency, scale: currencyScale(company.currency) };
  }

  /** Attach live availability to a set of product rows. */
  private async decorate<T extends ProductRow>(
    rows: T[],
    companyId: string,
    currency: { code: string; scale: number },
  ): Promise<StorefrontProduct[]> {
    const onHand = await this.onHandByProduct(companyId, rows.map((row) => row.id));
    return rows.map((row) => this.toProduct({ ...row, _onHand: onHand.get(row.id) ?? 0 }, currency));
  }

  private imageFor(product: {
    imageUrl: string | null;
    partCategoryKey: string | null;
  }): string {
    if (product.imageUrl) return product.imageUrl;
    const category = product.partCategoryKey ? partCategory(product.partCategoryKey) : undefined;
    return category?.image ?? '/media/cat-other.jpg';
  }

  private toProduct(
    row: ProductRow,
    currency: { code: string; scale: number },
  ): StorefrontProduct {
    const onHand = row._onHand ?? 0;
    return {
      id: row.id,
      sku: row.sku,
      partNumber: row.partReferences[0]?.partNumber ?? null,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      brand: row.brand,
      categoryKey: row.partCategoryKey,
      condition: row.partCondition,
      priceMinor: row.salesPriceMinor,
      compareAtPriceMinor: row.compareAtPriceMinor,
      currency: currency.code,
      currencyScale: currency.scale,
      taxRateBp: row.taxRateBp,
      image: this.imageFor(row),
      descriptionEn: row.descriptionEn,
      descriptionAr: row.descriptionAr,
      warrantyEn: row.warrantyEn,
      warrantyAr: row.warrantyAr,
      engineType: row.engineType,
      unit: row.unit,
      isFeatured: row.isFeatured,
      inStock: onHand > 0,
      onHand,
      fits: row.partCompatibilities.map((c) => ({
        make: c.make,
        model: c.model,
        yearFrom: c.yearFrom,
        yearTo: c.yearTo,
      })),
    };
  }

  /** Monotonic order number per company, retried on collision. */
  private async nextOrderNumber(companyId: string): Promise<string> {
    const count = await this.prisma.webOrder.count({ where: { companyId } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `WEB-${String(count + 1 + attempt).padStart(5, '0')}`;
      const clash = await this.prisma.webOrder.findFirst({
        where: { companyId, orderNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `WEB-${Date.now()}`;
  }

  /** The tenant customer row an order is filed against. */
  private async ensureTenantCustomer(
    companyId: string,
    account: { id: string; email: string; fullName: string; phone: string | null },
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: { companyId, email: account.email },
    });
    if (existing) return existing;
    const count = await this.prisma.customer.count({ where: { companyId } });
    return this.prisma.customer.create({
      data: {
        companyId,
        code: `WEB-${String(count + 1).padStart(6, '0')}`,
        nameEn: account.fullName,
        nameAr: account.fullName,
        email: account.email,
        phone: account.phone,
        isActive: true,
      },
    });
  }
}

/** The subset of the booking engine the storefront depends on. */
export interface BookingAvailabilityPort {
  availableSlots(input: {
    companyId: string;
    branchId?: string | null;
    dayStart: Date;
    durationMinutes: number;
    stepMinutes?: number;
    minimumNoticeMinutes?: number;
    maxSlots?: number;
  }): Promise<unknown[]>;
}

export interface BookingPort extends BookingAvailabilityPort {
  assertSlotBookable(input: {
    companyId: string;
    branchId?: string | null;
    resourceId?: string | null;
    serviceRef?: string | null;
    startsAt: Date;
    durationMinutes: number;
  }): Promise<{ resourceId: string | null }>;
  createBooking(input: {
    companyId: string;
    branchId?: string | null;
    resourceId?: string | null;
    bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE';
    serviceRef?: string | null;
    startsAt: Date;
    durationMinutes: number;
    customerAccountId?: string | null;
    vehicleId?: string | null;
    notes?: string | null;
    guestName?: string | null;
    guestPhone?: string | null;
    guestEmail?: string | null;
    hold?: boolean;
  }): Promise<{
    id: string;
    reference: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    durationMinutes: number;
    serviceRef: string | null;
    branchId: string | null;
  }>;
}

/** The columns and relations `toProduct` reads from a catalogue row. */
export interface ProductRow {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  brand: string | null;
  partCategoryKey: string | null;
  partCondition: 'NEW' | 'REFURBISHED';
  salesPriceMinor: number;
  compareAtPriceMinor: number | null;
  taxRateBp: number;
  imageUrl: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  warrantyEn: string | null;
  warrantyAr: string | null;
  engineType: string | null;
  unit: string;
  isFeatured: boolean;
  partReferences: Array<{ partNumber: string }>;
  partCompatibilities: Array<{
    make: string;
    model: string;
    yearFrom: number;
    yearTo: number | null;
  }>;
  _onHand?: number;
}

export interface StorefrontQuery {
  search?: string;
  category?: string[];
  brand?: string[];
  make?: string[];
  model?: string[];
  year?: number;
  engineType?: string;
  partNumber?: string;
  priceMinMinor?: number;
  priceMaxMinor?: number;
  inStock?: boolean;
  condition?: Array<'NEW' | 'REFURBISHED'>;
  featured?: boolean;
  onOffer?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'name_asc';
  page?: number;
  pageSize?: number;
}
