import { Injectable } from '@nestjs/common';

import {
  BAHRAIN_SERVICE_AREAS,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  type ServiceAreaDefinition,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';

/**
 * Platform-level configuration.
 *
 * Two things live here:
 *   1. the service-area catalogue, which is seeded from `@oryx/shared` and then
 *      owned by the database so an administrator can rename or deactivate an
 *      area without a deploy;
 *   2. typed platform settings over the `PlatformSetting` key/value table.
 *
 * A setting is read through a typed accessor rather than by querying the table,
 * so a missing row yields the documented default instead of `undefined` leaking
 * into a comparison.
 */

export const PLATFORM_SETTING_KEYS = {
  marketCountry: 'market.country_code',
  marketCurrency: 'market.currency',
  marketTimezone: 'market.timezone',
  defaultVatRateBp: 'finance.default_vat_rate_bp',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

const SETTING_DEFAULTS: Record<PlatformSettingKey, unknown> = {
  [PLATFORM_SETTING_KEYS.marketCountry]: DEFAULT_COUNTRY_CODE,
  [PLATFORM_SETTING_KEYS.marketCurrency]: DEFAULT_CURRENCY,
  [PLATFORM_SETTING_KEYS.marketTimezone]: DEFAULT_TIMEZONE,
  /**
   * Zero is the correct default. ORYX does not assert a Bahraini VAT rate; the
   * owner sets the operative rate. Inventing one would be a compliance claim the
   * platform cannot support.
   */
  [PLATFORM_SETTING_KEYS.defaultVatRateBp]: 0,
};

export interface ServiceAreaRecord {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  countryCode: string;
  isActive: boolean;
  sortOrder: number;
}

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert the launch-market areas if the catalogue is empty.
   *
   * Idempotent by `code`, so it is safe to run on every boot and never
   * overwrites an area an administrator has since renamed or deactivated.
   * Returns the number of areas created.
   */
  async ensureServiceAreas(): Promise<number> {
    const existing = await this.prisma.serviceArea.count();
    if (existing > 0) return 0;
    return this.seedServiceAreas();
  }

  /** Force-insert any missing launch-market area without touching existing rows. */
  async seedServiceAreas(
    areas: readonly ServiceAreaDefinition[] = BAHRAIN_SERVICE_AREAS,
  ): Promise<number> {
    let created = 0;
    for (const [index, area] of areas.entries()) {
      const row = await this.prisma.serviceArea.findUnique({ where: { code: area.code } });
      if (row) continue;
      await this.prisma.serviceArea.create({
        data: {
          code: area.code,
          nameEn: area.nameEn,
          nameAr: area.nameAr,
          countryCode: DEFAULT_COUNTRY_CODE,
          sortOrder: index,
        },
      });
      created += 1;
    }
    return created;
  }

  async listServiceAreas(options: { includeInactive?: boolean } = {}): Promise<ServiceAreaRecord[]> {
    const rows = await this.prisma.serviceArea.findMany({
      where: options.includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      countryCode: r.countryCode,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    }));
  }

  async createServiceArea(input: {
    code: string;
    nameEn: string;
    nameAr: string;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<ServiceAreaRecord> {
    const row = await this.prisma.serviceArea.create({
      data: {
        code: input.code.toUpperCase(),
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        countryCode: DEFAULT_COUNTRY_CODE,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return {
      id: row.id,
      code: row.code,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      countryCode: row.countryCode,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }

  /** Returns `null` when the area does not exist, so the caller can 404 it. */
  async updateServiceArea(
    id: string,
    input: { nameEn?: string; nameAr?: string; isActive?: boolean; sortOrder?: number },
  ): Promise<ServiceAreaRecord | null> {
    const existing = await this.prisma.serviceArea.findUnique({ where: { id } });
    if (!existing) return null;
    const row = await this.prisma.serviceArea.update({
      where: { id },
      data: {
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return {
      id: row.id,
      code: row.code,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      countryCode: row.countryCode,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }

  async getSetting<T = unknown>(key: PlatformSettingKey): Promise<T> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (!row) return SETTING_DEFAULTS[key] as T;
    return row.value as T;
  }

  async setSetting(key: PlatformSettingKey, value: unknown): Promise<void> {
    await this.prisma.platformSetting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }

  /** Every typed setting with its effective value, for an admin screen. */
  async effectiveSettings(): Promise<Record<PlatformSettingKey, unknown>> {
    const entries = await Promise.all(
      (Object.values(PLATFORM_SETTING_KEYS) as PlatformSettingKey[]).map(
        async (key) => [key, await this.getSetting(key)] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<PlatformSettingKey, unknown>;
  }
}
