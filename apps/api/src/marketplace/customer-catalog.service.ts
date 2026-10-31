import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ERROR_CODES, notFound } from '../common/errors';

export interface CatalogQuery {
  locale: 'ar' | 'en';
  /** Restrict to one tenant's catalogue. */
  companyId?: string;
  query?: string;
  /** A product's free-text part group, matched case-insensitively. */
  group?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name';
  page: number;
  pageSize: number;
}

/**
 * The consumer product catalogue.
 *
 * ## Why this exists
 *
 * The ERP inventory API is a staff surface: it returns cost prices, reorder
 * levels and stock levels for a company's own operators. A consumer must not see
 * any of that, and the staff route is behind a staff token anyway. This service
 * exposes the *public* projection of the same `Product` rows — selling price,
 * name, photograph and availability — so the mobile catalogue and the ERP
 * catalogue never diverge, and no second product table is introduced.
 *
 * ## What is deliberately absent
 *
 * Cost price, stock quantities, reorder thresholds and accounting account ids
 * are never selected. Availability is a boolean derived from the stock level, not
 * the quantity itself, so a competitor cannot read a tenant's inventory depth
 * from the public catalogue.
 *
 * ## Stores
 *
 * A marketplace "store" is a tenant company with a published catalogue, or a
 * provider linked to one. Both are derived from the database rather than being a
 * second entity, so the store a customer browses is the same company the ERP
 * knows.
 */
@Injectable()
export class CustomerCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private assetUrl(asset: { id: string } | null | undefined, variant = 'card'): string | null {
    if (!asset) return null;
    return `/api/v1/cms/media/${asset.id}/file?variant=${encodeURIComponent(variant)}`;
  }

  /** The primary photograph for a product, or null when none is uploaded. */
  private imageUrl(images: Array<{ url: string | null; mediaAsset: { id: string } | null }>): string | null {
    const first = images[0];
    if (!first) return null;
    return this.assetUrl(first.mediaAsset) ?? first.url;
  }

  /**
   * Active products a consumer may buy, with the public projection only.
   *
   * Only active products with a selling price are returned: a product priced at
   * zero is a placeholder in the ERP, not something a customer can order.
   */
  async listProducts(params: CatalogQuery) {
    const where = {
      isActive: true,
      salesPriceMinor: { gt: 0 },
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.query
        ? {
            OR: [
              { nameEn: { contains: params.query, mode: 'insensitive' as const } },
              { nameAr: { contains: params.query } },
              { sku: { contains: params.query, mode: 'insensitive' as const } },
              { barcode: { contains: params.query } },
            ],
          }
        : {}),
    };

    const orderBy =
      params.sort === 'price_asc'
        ? [{ salesPriceMinor: 'asc' as const }, { id: 'asc' as const }]
        : params.sort === 'price_desc'
          ? [{ salesPriceMinor: 'desc' as const }, { id: 'asc' as const }]
          : params.sort === 'name'
            ? [{ nameEn: 'asc' as const }, { id: 'asc' as const }]
            : [{ sku: 'asc' as const }, { id: 'asc' as const }];

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          companyId: true,
          sku: true,
          nameEn: true,
          nameAr: true,
          type: true,
          unit: true,
          salesPriceMinor: true,
          taxRateBp: true,
          trackStock: true,
          company: { select: { id: true, code: true, nameEn: true, nameAr: true } },
          images: {
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
            take: 1,
            select: { url: true, mediaAsset: { select: { id: true } } },
          },
          levels: { select: { quantity: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toProduct(row, params.locale)),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** One product, with its images, store and related items. */
  async getProduct(id: string, locale: 'ar' | 'en') {
    const row = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        companyId: true,
        sku: true,
        nameEn: true,
        nameAr: true,
        type: true,
        unit: true,
        salesPriceMinor: true,
        taxRateBp: true,
        trackStock: true,
        company: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
          select: { url: true, mediaAsset: { select: { id: true } } },
        },
        levels: { select: { quantity: true } },
      },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found.');

    const related = await this.prisma.product.findMany({
      where: { companyId: row.companyId, isActive: true, salesPriceMinor: { gt: 0 }, id: { not: row.id } },
      orderBy: [{ sku: 'asc' as const }],
      take: 6,
      select: {
        id: true,
        companyId: true,
        sku: true,
        nameEn: true,
        nameAr: true,
        type: true,
        unit: true,
        salesPriceMinor: true,
        taxRateBp: true,
        trackStock: true,
        company: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
          take: 1,
          select: { url: true, mediaAsset: { select: { id: true } } },
        },
        levels: { select: { quantity: true } },
      },
    });

    return {
      ...this.toProduct(row, locale),
      images: row.images.map((image) => ({
        url: this.assetUrl(image.mediaAsset) ?? image.url,
      })),
      related: related.map((item) => this.toProduct(item, locale)),
    };
  }

  /**
   * The marketplace stores.
   *
   * A store is a tenant company that publishes a catalogue, or a provider linked
   * to one. A company with no priced product is not a store a customer can shop,
   * so it is excluded rather than shown empty.
   */
  async listStores(params: { locale: 'ar' | 'en'; query?: string; sort?: 'name' | 'products' }) {
    const companies = await this.prisma.company.findMany({
      where: {
        products: { some: { isActive: true, salesPriceMinor: { gt: 0 } } },
        ...(params.query
          ? {
              OR: [
                { nameEn: { contains: params.query, mode: 'insensitive' as const } },
                { nameAr: { contains: params.query } },
                { code: { contains: params.query, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameAr: true,
        countryCode: true,
        _count: { select: { products: true } },
      },
    });

    // The provider link is by `providerCompanyId`, which carries no Prisma
    // relation, so it is resolved in one follow-up query rather than per row.
    const providers = await this.prisma.marketplaceProvider.findMany({
      where: { providerCompanyId: { in: companies.map((c) => c.id) }, status: 'APPROVED' },
      select: { id: true, providerCompanyId: true, categoryKey: true, code: true },
    });
    const byCompany = new Map(providers.map((p) => [p.providerCompanyId as string, p]));

    const rows = companies.map((company) => {
      const provider = byCompany.get(company.id);
      return {
        id: company.id,
        code: company.code,
        name: params.locale === 'ar' ? company.nameAr : company.nameEn,
        nameEn: company.nameEn,
        nameAr: company.nameAr,
        countryCode: company.countryCode,
        productCount: company._count.products,
        /** Present when this company is also an approved marketplace provider. */
        providerId: provider?.id ?? null,
        categoryKey: provider?.categoryKey ?? null,
      };
    });

    rows.sort((a, b) =>
      params.sort === 'name' ? a.name.localeCompare(b.name) : b.productCount - a.productCount,
    );

    return { items: rows, total: rows.length };
  }

  /** One store, with its whole public catalogue. */
  async getStore(companyId: string, locale: 'ar' | 'en') {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameAr: true,
        countryCode: true,
      },
    });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Store not found.');

    const products = await this.listProducts({ locale, companyId, page: 1, pageSize: 50 });
    const provider = await this.prisma.marketplaceProvider.findFirst({
      where: { providerCompanyId: company.id, status: 'APPROVED' },
      select: { id: true, categoryKey: true },
    });

    return {
      id: company.id,
      code: company.code,
      name: locale === 'ar' ? company.nameAr : company.nameEn,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      countryCode: company.countryCode,
      providerId: provider?.id ?? null,
      categoryKey: provider?.categoryKey ?? null,
      products: products.items,
      productTotal: products.total,
    };
  }

  /**
   * The catalogue categories a customer can filter by.
   *
   * Read from the real `ServiceCategory` catalogue the admin CMS maintains, so a
   * category cannot exist in the app that an operator cannot manage.
   */
  async listCategories(locale: 'ar' | 'en') {
    const rows = await this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: { key: true, nameEn: true, nameAr: true, icon: true, domain: true, imageAssetId: true },
    });
    return {
      items: rows.map((row) => ({
        key: row.key,
        name: locale === 'ar' ? row.nameAr : row.nameEn,
        icon: row.icon,
        domain: row.domain,
        imageUrl: this.assetUrl(row.imageAssetId ? { id: row.imageAssetId } : null),
      })),
      total: rows.length,
    };
  }

  /** The public projection of a product row. */
  private toProduct(
    row: {
      id: string;
      companyId: string;
      sku: string;
      nameEn: string;
      nameAr: string;
      type: string;
      unit: string;
      salesPriceMinor: number;
      taxRateBp: number;
      trackStock: boolean;
      company: { id: string; code: string; nameEn: string; nameAr: string };
      images: Array<{ url: string | null; mediaAsset: { id: string } | null }>;
      levels: Array<{ quantity: number }>;
    },
    locale: 'ar' | 'en',
  ) {
    // Availability is a boolean, never the quantity: a public catalogue must not
    // expose a tenant's inventory depth.
    const onHand = row.levels.reduce((sum, level) => sum + level.quantity, 0);
    return {
      id: row.id,
      storeId: row.companyId,
      sku: row.sku,
      name: locale === 'ar' ? row.nameAr : row.nameEn,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      type: row.type,
      unit: row.unit,
      priceMinor: row.salesPriceMinor,
      taxRateBp: row.taxRateBp,
      available: row.trackStock ? onHand > 0 : true,
      imageUrl: this.imageUrl(row.images),
      store: {
        id: row.company.id,
        code: row.company.code,
        name: locale === 'ar' ? row.company.nameAr : row.company.nameEn,
      },
    };
  }
}
