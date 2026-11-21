import { Injectable } from '@nestjs/common';

import {
  ORYX_DEFAULT_BRANDING,
  type CompanyBranding,
  normalizeHexColor,
  resolveBranding,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { badRequest, forbidden, notFound, ERROR_CODES } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { UpdateBrandingDto } from './branding.dto';

/**
 * Per-company visual identity.
 *
 * The platform default is ORYX's own identity. A company may override any field;
 * `resolveBranding` fills the gaps from the default, so a tenant that uploaded
 * only a logo still renders the ORYX accent rather than an empty swatch.
 *
 * Two rules are enforced here rather than in the UI, because the UI is not a
 * security boundary:
 *
 *   1. A company principal may only read and write its own branding.
 *   2. Colours are validated as strict `#rrggbb` before they are stored, because
 *      the value is later written into a `style` attribute.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The resolved identity for a company.
   *
   * A company with no row is not an error: it inherits the platform default.
   */
  async getBranding(companyId: string): Promise<CompanyBranding & { companyId: string; isDefault: boolean }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, nameEn: true, nameAr: true, branding: true },
    });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');

    const stored = company.branding;
    // The company's legal name is a better fallback than the ORYX wordmark: a
    // tenant that has never opened the branding screen should still see its own
    // name, not ORYX's.
    const base = resolveBranding(stored, {
      ...ORYX_DEFAULT_BRANDING,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
    });

    return {
      companyId: company.id,
      ...base,
      isDefault: stored === null,
    };
  }

  /**
   * Update a company's identity.
   *
   * `null` clears a field back to the inherited default; omitting a key leaves
   * it untouched. The two are different operations and the DTO preserves that
   * distinction, so a client cannot accidentally wipe a logo by not sending it.
   */
  async updateBranding(
    companyId: string,
    dto: UpdateBrandingDto,
    actor: ActorContext,
  ): Promise<CompanyBranding & { companyId: string; isDefault: boolean }> {
    this.assertCompanyAccess(companyId, actor);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, nameEn: true, nameAr: true },
    });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');

    // Validate every colour before writing anything, so a request carrying one
    // bad value does not leave a half-applied identity behind.
    const primaryColor = this.validateColor(dto.primaryColor, 'primaryColor');
    const accentColor = this.validateColor(dto.accentColor, 'accentColor');

    await this.assertAssetsExist([
      dto.logoAssetId,
      dto.logoDarkAssetId,
      dto.faviconAssetId,
    ]);

    const data = this.buildUpdate(dto, { primaryColor, accentColor });

    await this.prisma.companyBranding.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });

    // Audit by field name and, for assets, by id. Never by a raw colour or any
    // other free-text value the tenant supplied.
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'company.branding.updated',
      targetType: 'COMPANY',
      targetId: companyId,
      summary: `Updated the visual identity for ${company.nameEn}.`,
      ipAddress: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
      metadata: {
        fields: Object.keys(data),
        logoAssetId: dto.logoAssetId ?? null,
        logoDarkAssetId: dto.logoDarkAssetId ?? null,
        faviconAssetId: dto.faviconAssetId ?? null,
        colorsChanged: primaryColor !== undefined || accentColor !== undefined,
      },
    });

    return this.getBranding(companyId);
  }

  /** Remove a company's identity entirely, returning it to the platform default. */
  async resetBranding(companyId: string, actor: ActorContext): Promise<CompanyBranding & { companyId: string; isDefault: boolean }> {
    this.assertCompanyAccess(companyId, actor);
    const existing = await this.prisma.companyBranding.findUnique({ where: { companyId } });
    if (existing) {
      await this.prisma.companyBranding.delete({ where: { companyId } });
      await this.audit.record({
        actorUserId: actor.userId,
        companyId,
        action: 'company.branding.reset',
        targetType: 'COMPANY',
        targetId: companyId,
        summary: 'Reset the company visual identity to the platform default.',
        ipAddress: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        metadata: {},
      });
    }
    return this.getBranding(companyId);
  }

  // ---------------------------------------------------------------- internals

  /**
   * Only a platform principal, or a member of this exact company, may act.
   *
   * A company principal is never permitted to touch another tenant's identity:
   * that would let one tenant rebrand another on shared surfaces.
   */
  private assertCompanyAccess(companyId: string, actor: ActorContext): void {
    if (actor.kind === 'PLATFORM') return;
    if (actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
  }

  /**
   * A colour must be absent, explicitly cleared, or a strict 6-digit hex.
   *
   * `undefined` means "leave as is"; `null` means "clear"; anything else must
   * validate. Distinguishing the three is what lets the API express a partial
   * update without guessing.
   */
  private validateColor(
    value: string | null | undefined,
    field: string,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    try {
      return normalizeHexColor(value);
    } catch {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `${field} must be a 6-digit hex colour such as #d4af37.`,
      );
    }
  }

  /**
   * Every referenced asset must exist and be an image.
   *
   * The foreign key proves the asset exists; it does not prove it is an image.
   * Accepting a PDF would render a broken logo and only surface at display time,
   * far from the request that caused it.
   */
  private async assertAssetsExist(assetIds: (string | null | undefined)[]): Promise<void> {
    const ids = assetIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) return;
    const found = await this.prisma.cmsMediaAsset.findMany({
      where: { id: { in: ids } },
      select: { id: true, mimeType: true },
    });
    const foundIds = new Set(found.map((a) => a.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown media asset: ${missing.join(', ')}.`);
    }
    const notImage = found.filter((a) => !a.mimeType.startsWith('image/'));
    if (notImage.length > 0) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Branding assets must be images; received ${notImage.map((a) => a.mimeType).join(', ')}.`,
      );
    }
  }

  /** Build the Prisma update payload, honouring the set/clear/leave-as-is tri-state. */
  private buildUpdate(
    dto: UpdateBrandingDto,
    colors: { primaryColor: string | null | undefined; accentColor: string | null | undefined },
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) data[key] = value;
    };

    assign('nameEn', dto.nameEn);
    assign('nameAr', dto.nameAr);
    assign('logoAssetId', dto.logoAssetId);
    assign('logoDarkAssetId', dto.logoDarkAssetId);
    assign('faviconAssetId', dto.faviconAssetId);
    assign('primaryColor', colors.primaryColor);
    assign('accentColor', colors.accentColor);
    assign('supportEmail', dto.supportEmail);
    assign('supportPhone', dto.supportPhone);
    assign('websiteUrl', dto.websiteUrl);

    return data;
  }
}
