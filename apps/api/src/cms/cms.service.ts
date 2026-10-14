import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type {
  CreateApiClientDto,
  UpsertAppVersionDto,
  UpsertBannerDto,
  UpsertCmsPageDto,
  UpsertFeatureFlagDto,
} from './cms.dto';

/**
 * Website & Application Management. Execution 01 delivers persistent CMS and
 * platform configuration: pages, banners, feature flags, app version records,
 * service categories, notification templates and API client registration.
 *
 * Not implemented here (reported as planned): consumer app runtime, marketplace
 * moderation queues, inspection/maintenance configuration engines, payments.
 */
@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------- pages
  async listPages(locale?: string) {
    return this.prisma.cmsPage.findMany({
      where: locale ? { locale: locale as never } : {},
      orderBy: [{ slug: 'asc' }, { locale: 'asc' }],
    });
  }

  async upsertPage(dto: UpsertCmsPageDto, actor: ActorContext) {
    const page = await this.prisma.cmsPage.upsert({
      where: { slug_locale: { slug: dto.slug, locale: dto.locale } },
      update: {
        title: dto.title,
        excerpt: dto.excerpt ?? null,
        body: dto.body,
        status: (dto.status ?? 'DRAFT') as never,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
      },
      create: {
        slug: dto.slug,
        locale: dto.locale,
        title: dto.title,
        excerpt: dto.excerpt ?? null,
        body: dto.body,
        status: (dto.status ?? 'DRAFT') as never,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.page_upserted',
      targetType: 'CMS_PAGE',
      targetId: page.id,
      summary: `Upserted CMS page ${dto.slug} (${dto.locale})`,
    });
    return page;
  }

  async deletePage(id: string, actor: ActorContext) {
    const page = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!page) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Page not found.');
    await this.prisma.cmsPage.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.page_deleted',
      targetType: 'CMS_PAGE',
      targetId: id,
      summary: `Deleted CMS page ${page.slug} (${page.locale})`,
    });
    return { ok: true };
  }

  // ----------------------------------------------------------------- banners
  async listBanners(placement?: string) {
    return this.prisma.cmsBanner.findMany({
      where: placement ? { placement } : {},
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async upsertBanner(dto: UpsertBannerDto, actor: ActorContext) {
    const existing = await this.prisma.cmsBanner.findFirst({
      where: { placement: dto.placement, locale: dto.locale, title: dto.title },
    });
    const banner = existing
      ? await this.prisma.cmsBanner.update({
          where: { id: existing.id },
          data: {
            subtitle: dto.subtitle ?? null,
            imageUrl: dto.imageUrl ?? null,
            actionUrl: dto.actionUrl ?? null,
            sortOrder: dto.sortOrder ?? 0,
            isActive: dto.isActive ?? true,
          },
        })
      : await this.prisma.cmsBanner.create({
          data: {
            placement: dto.placement,
            locale: dto.locale,
            title: dto.title,
            subtitle: dto.subtitle ?? null,
            imageUrl: dto.imageUrl ?? null,
            actionUrl: dto.actionUrl ?? null,
            sortOrder: dto.sortOrder ?? 0,
            isActive: dto.isActive ?? true,
          },
        });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.banner_upserted',
      targetType: 'CMS_BANNER',
      targetId: banner.id,
      summary: `Upserted banner ${banner.title} for ${dto.placement}`,
    });
    return banner;
  }

  // ------------------------------------------------------------ feature flags
  async listFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async upsertFeatureFlag(dto: UpsertFeatureFlagDto, actor: ActorContext) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key: dto.key },
      update: {
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        description: dto.description ?? null,
        enabled: dto.enabled ?? false,
        audience: dto.audience ?? 'all',
        rolloutPercentage: dto.rolloutPercentage ?? 0,
      },
      create: {
        key: dto.key,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        description: dto.description ?? null,
        enabled: dto.enabled ?? false,
        audience: dto.audience ?? 'all',
        rolloutPercentage: dto.rolloutPercentage ?? 0,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.feature_flag_upserted',
      targetType: 'FEATURE_FLAG',
      targetId: flag.id,
      summary: `Feature flag ${flag.key} set to ${flag.enabled ? 'enabled' : 'disabled'}`,
    });
    return flag;
  }

  // ------------------------------------------------------------- app versions
  async listAppVersions() {
    return this.prisma.appVersion.findMany({ orderBy: [{ platform: 'asc' }, { version: 'desc' }] });
  }

  async upsertAppVersion(dto: UpsertAppVersionDto, actor: ActorContext) {
    const version = await this.prisma.appVersion.upsert({
      where: { platform_version: { platform: dto.platform, version: dto.version } },
      update: {
        buildNumber: dto.buildNumber,
        releaseNotes: dto.releaseNotes ?? null,
        minSupportedVersion: dto.minSupportedVersion,
        isActive: dto.isActive ?? false,
      },
      create: {
        platform: dto.platform,
        version: dto.version,
        buildNumber: dto.buildNumber,
        releaseNotes: dto.releaseNotes ?? null,
        minSupportedVersion: dto.minSupportedVersion,
        isActive: dto.isActive ?? false,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.app_version_upserted',
      targetType: 'APP_VERSION',
      targetId: version.id,
      summary: `App version ${dto.platform} ${dto.version} recorded`,
    });
    return version;
  }

  // ------------------------------------------------------- service categories
  async listServiceCategories() {
    return this.prisma.serviceCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  // ---------------------------------------------------- notification templates
  async listNotificationTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: [{ key: 'asc' }, { locale: 'asc' }] });
  }

  // --------------------------------------------------------------- api clients
  async listApiClients() {
    const clients = await this.prisma.apiClient.findMany({ orderBy: { createdAt: 'desc' } });
    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      clientId: c.clientId,
      scopes: c.scopes,
      isActive: c.isActive,
      rateLimitPerMinute: c.rateLimitPerMinute,
      lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    }));
  }

  async createApiClient(dto: CreateApiClientDto, actor: ActorContext) {
    const existing = await this.prisma.apiClient.findFirst({ where: { name: dto.name } });
    if (existing) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'An API client with that name already exists.');

    const clientId = `oryx_${randomBytes(8).toString('hex')}`;
    const secret = randomBytes(24).toString('base64url');
    const client = await this.prisma.apiClient.create({
      data: {
        name: dto.name,
        clientId,
        secretHash: createHash('sha256').update(secret).digest('hex'),
        scopes: dto.scopes ?? [],
        rateLimitPerMinute: dto.rateLimitPerMinute ?? 60,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'api.client_created',
      targetType: 'API_CLIENT',
      targetId: client.id,
      summary: `Created API client ${client.name} (${clientId})`,
    });
    // The secret is returned exactly once and never stored in plaintext.
    return {
      id: client.id,
      name: client.name,
      clientId,
      scopes: client.scopes,
      isActive: client.isActive,
      rateLimitPerMinute: client.rateLimitPerMinute,
      lastUsedAt: null,
      secret,
    };
  }

  async revokeApiClient(id: string, actor: ActorContext) {
    const client = await this.prisma.apiClient.findUnique({ where: { id } });
    if (!client) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'API client not found.');
    await this.prisma.apiClient.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'api.client_revoked',
      targetType: 'API_CLIENT',
      targetId: id,
      summary: `Revoked API client ${client.name}`,
    });
    return { ok: true };
  }

  // ------------------------------------------------------------ public content
  /** Public, unauthenticated content used by the website/app shells. */
  async publicContent(locale: string) {
    const [pages, banners, flags, versions, categories] = await Promise.all([
      this.prisma.cmsPage.findMany({
        where: { locale: locale as never, status: 'PUBLISHED' },
        select: { slug: true, title: true, excerpt: true, body: true },
      }),
      this.prisma.cmsBanner.findMany({
        where: { locale: locale as never, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { placement: true, title: true, subtitle: true, imageUrl: true, actionUrl: true },
      }),
      this.prisma.featureFlag.findMany({ select: { key: true, enabled: true, rolloutPercentage: true } }),
      this.prisma.appVersion.findMany({
        where: { isActive: true },
        select: { platform: true, version: true, minSupportedVersion: true },
      }),
      this.prisma.serviceCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { key: true, nameEn: true, nameAr: true, domain: true },
      }),
    ]);
    return { locale, pages, banners, flags, versions, categories };
  }
}
