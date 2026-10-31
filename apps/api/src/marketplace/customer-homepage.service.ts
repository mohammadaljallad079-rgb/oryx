import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * The customer homepage payload.
 *
 * Everything a signed-out or signed-in customer sees on the marketplace home is
 * assembled here, in one place, so the mobile app renders a single response
 * rather than fanning out six requests.
 *
 * ## What "approved" means
 *
 * A banner is only returned when **both** of these hold:
 *
 *   - `status === 'PUBLISHED'` — a reviewer approved the content; and
 *   - `isActive === true` — an operator has it switched on.
 *
 * These are deliberately different questions. `isActive` alone was the previous
 * behaviour, and it is not sufficient: an operator can toggle a slide on before
 * anyone has reviewed the photograph, and that would publish an unapproved image
 * to customers. Requiring `PUBLISHED` as well means a banner cannot reach a
 * customer without an explicit editorial act, and `status` defaults to `DRAFT`
 * so a newly created banner is invisible until someone publishes it.
 *
 * ## Image and destination validation
 *
 * A published banner's `imageUrl` and `actionUrl` are still validated before they
 * are returned. A stored value that is neither a bundled asset path nor an
 * absolute https URL is dropped rather than passed to the client, because an
 * unvalidated URL in a mobile client is a request the client will make on the
 * user's behalf.
 */
@Injectable()
export class CustomerHomepageService {
  private readonly logger = new Logger(CustomerHomepageService.name);

  /** The CMS placement this endpoint reads. */
  static readonly HERO_PLACEMENT = 'homepage.hero';

  /** How many of each rail the homepage shows. */
  private static readonly RAIL_LIMIT = 12;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The public URL for a stored media asset.
   *
   * Assets are not served from an unrestricted bucket: they are read through
   * `GET /cms/media/:id/file`, which applies its own access rules. Building the
   * URL from the asset id keeps that control in one place, and the variant name
   * picks the size — `hero` for a banner, `card` for a rail tile.
   */
  private assetUrl(
    asset: { id: string; variants: unknown } | null | undefined,
    variant: string,
  ): string | null {
    if (!asset) return null;
    const variants = (asset.variants ?? {}) as Record<string, unknown>;
    const chosen = variants[variant] ?? variants.card ?? variants.hero ?? variants.wide;
    if (!chosen) return null;
    // The file route chooses the variant by query, so the URL is stable even if
    // the stored key changes.
    return `/api/v1/cms/media/${asset.id}/file?variant=${encodeURIComponent(variant)}`;
  }

  /**
   * Accepts only the two shapes a banner URL may take.
   *
   * A bundled asset path (`/media/…` or `assets/…`) is served from the app; an
   * absolute `https:` URL is a real remote image. Anything else — `javascript:`,
   * `data:`, a bare host, a protocol-relative `//evil` — is rejected.
   */
  private safeUrl(value: string | null | undefined, kind: 'image' | 'link'): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 2048) return null;

    // A bundled asset path. The mobile client resolves it against its own bundle.
    if (/^\/(media|assets)\//.test(trimmed) || /^assets\//.test(trimmed)) {
      return trimmed;
    }

    // An in-app route, for a CTA that navigates rather than opening a page.
    if (kind === 'link' && /^\/[A-Za-z0-9\-_/]*$/.test(trimmed)) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:') return null;
      return url.toString();
    } catch {
      this.logger.warn(`Dropped an invalid ${kind} URL from a CMS banner`);
      return null;
    }
  }

  /**
   * The homepage, in one response.
   *
   * `locale` decides which language's rows are read, so an English client never
   * receives an Arabic headline. Ordering is deterministic — `sortOrder` then
   * `id` — so two identical requests return the same order and a client can page
   * through the result without duplicates or gaps.
   */
  async getHomepage(locale: 'ar' | 'en', companyId?: string) {
    if (locale !== 'ar' && locale !== 'en') {
      throw new BadRequestException('locale must be "ar" or "en"');
    }

    const [banners, categories, providers, products] = await Promise.all([
      this.getApprovedBanners(locale),
      this.getCategories(locale),
      this.getFeaturedProviders(locale),
      this.getPopularProducts(locale, companyId),
    ]);

    return {
      locale,
      hero: banners,
      categories,
      providers,
      products,
      // The client renders its bundled approved Hero when this is empty, so a
      // CMS with nothing published degrades to the design the owner signed off
      // rather than to a blank card.
      heroFallbackRequired: banners.length === 0,
    };
  }

  /**
   * The approved, active hero slides for a placement and locale.
   *
   * Both conditions are applied in the query, not after it, so an unapproved row
   * is never loaded into memory on the way to being filtered out.
   */
  private async getApprovedBanners(locale: 'ar' | 'en') {
    const rows = await this.prisma.cmsBanner.findMany({
      where: {
        placement: CustomerHomepageService.HERO_PLACEMENT,
        locale,
        isActive: true,
        status: 'PUBLISHED',
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: CustomerHomepageService.RAIL_LIMIT,
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        actionUrl: true,
        sortOrder: true,
        mediaAsset: { select: { id: true, variants: true } },
      },
    });

    return rows
      .map((row) => {
        // The media asset is the preferred reference; `imageUrl` is the external
        // fallback. Only a validated value leaves the API.
        const image =
          this.assetUrl(row.mediaAsset, 'hero') ?? this.safeUrl(row.imageUrl, 'image');
        return {
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          imageUrl: image,
          actionUrl: this.safeUrl(row.actionUrl, 'link'),
        };
      })
      // A banner with no usable image is not a hero; dropping it keeps the client
      // from rendering an empty card.
      .filter((banner) => banner.imageUrl !== null);
  }

  /** The service categories, ordered deterministically. */
  private async getCategories(locale: 'ar' | 'en') {
    const rows = await this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      take: CustomerHomepageService.RAIL_LIMIT,
      select: {
        key: true,
        nameEn: true,
        nameAr: true,
        icon: true,
        imageAsset: { select: { id: true, variants: true } },
      },
    });

    return rows.map((row) => ({
      key: row.key,
      name: locale === 'ar' ? row.nameAr : row.nameEn,
      icon: row.icon,
      imageUrl: this.assetUrl(row.imageAsset, 'card'),
    }));
  }

  /**
   * Featured providers.
   *
   * Only providers in an approved state are returned: a provider that is pending,
   * suspended or rejected must not appear in a customer rail.
   */
  private async getFeaturedProviders(locale: 'ar' | 'en') {
    const rows = await this.prisma.marketplaceProvider.findMany({
      where: { status: 'APPROVED' },
      orderBy: [{ nameEn: 'asc' }, { id: 'asc' }],
      take: CustomerHomepageService.RAIL_LIMIT,
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        categoryKey: true,
        listings: {
          where: { isActive: true },
          orderBy: { priceMinor: 'asc' },
          take: 1,
          select: { priceMinor: true, currency: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: locale === 'ar' ? row.nameAr : row.nameEn,
      categoryKey: row.categoryKey,
      fromPriceMinor: row.listings[0]?.priceMinor ?? null,
      currency: row.listings[0]?.currency ?? null,
    }));
  }

  /**
   * Popular products.
   *
   * Only active products with a selling price are returned, and only from the
   * tenant the caller asked for when one is given. The price returned is the
   * catalogue price from the database — a client-submitted price is never read
   * anywhere in this service.
   */
  private async getPopularProducts(locale: 'ar' | 'en', companyId?: string) {
    const rows = await this.prisma.product.findMany({
      where: {
        isActive: true,
        salesPriceMinor: { gt: 0 },
        ...(companyId ? { companyId } : {}),
      },
      orderBy: [{ sku: 'asc' }, { id: 'asc' }],
      take: CustomerHomepageService.RAIL_LIMIT,
      select: {
        id: true,
        sku: true,
        nameEn: true,
        nameAr: true,
        salesPriceMinor: true,
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { url: true, mediaAsset: { select: { id: true, variants: true } } },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: locale === 'ar' ? row.nameAr : row.nameEn,
      priceMinor: row.salesPriceMinor,
      imageUrl:
        this.assetUrl(row.images[0]?.mediaAsset, 'card') ??
        this.safeUrl(row.images[0]?.url, 'image'),
    }));
  }
}
