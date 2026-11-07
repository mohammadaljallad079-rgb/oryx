import { Injectable } from '@nestjs/common';

import { basisPointsOfMinor } from '@oryx/shared';
import type { CouponDto, CouponValidationResponse } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { badRequest, conflict, ERROR_CODES, notFound } from '../common/errors';

/**
 * Platform discount coupons.
 *
 * A coupon is authored by a Super Admin and redeemed by a customer at checkout.
 * Two rules shape the design:
 *
 *   - the discount is computed **once**, in `computeDiscount`, so the checkout
 *     path and the validation endpoint can never disagree about what a code is
 *     worth;
 *   - a redemption is recorded by incrementing `redemptionCount`, so the count
 *     is a fact about what happened rather than a number the screen guesses.
 *
 * Money is integer minor units throughout, and percentages are basis points
 * (1500 = 15%), matching the rest of the schema.
 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: {
    id: string;
    code: string;
    descriptionEn: string | null;
    descriptionAr: string | null;
    discountType: string;
    percentOffBp: number;
    amountOffMinor: number;
    currency: string;
    maxRedemptions: number | null;
    redemptionCount: number;
    companyId: string | null;
    minOrderMinor: number;
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CouponDto {
    return {
      id: row.id,
      code: row.code,
      descriptionEn: row.descriptionEn,
      descriptionAr: row.descriptionAr,
      discountType: row.discountType as CouponDto['discountType'],
      percentOffBp: row.percentOffBp,
      amountOffMinor: row.amountOffMinor,
      currency: row.currency,
      maxRedemptions: row.maxRedemptions,
      redemptionCount: row.redemptionCount,
      companyId: row.companyId,
      minOrderMinor: row.minOrderMinor,
      isActive: row.isActive,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * The discount a coupon grants on a subtotal.
   *
   * A percentage coupon rounds down to the minor unit and is capped at the
   * subtotal, so a coupon can never produce a negative total. A fixed coupon is
   * likewise capped. This is the only place the arithmetic lives.
   */
  computeDiscount(
    coupon: { discountType: string; percentOffBp: number; amountOffMinor: number },
    subtotalMinor: number,
  ): number {
    if (subtotalMinor <= 0) return 0;
    const raw =
      coupon.discountType === 'PERCENT'
        ? basisPointsOfMinor(subtotalMinor, coupon.percentOffBp)
        : coupon.amountOffMinor;
    return Math.max(0, Math.min(raw, subtotalMinor));
  }

  /** Why a coupon is or is not usable right now, or `null` when it is usable. */
  private ineligibilityReason(
    row: {
      isActive: boolean;
      startsAt: Date | null;
      endsAt: Date | null;
      maxRedemptions: number | null;
      redemptionCount: number;
      minOrderMinor: number;
      companyId: string | null;
    },
    ctx: { companyId?: string | null; subtotalMinor: number; now?: Date },
  ): string | null {
    const now = ctx.now ?? new Date();
    if (!row.isActive) return 'INACTIVE';
    if (row.startsAt && row.startsAt > now) return 'NOT_STARTED';
    if (row.endsAt && row.endsAt < now) return 'EXPIRED';
    if (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) {
      return 'EXHAUSTED';
    }
    if (row.companyId && ctx.companyId && row.companyId !== ctx.companyId) {
      return 'WRONG_TENANT';
    }
    if (ctx.subtotalMinor < row.minOrderMinor) return 'BELOW_MINIMUM';
    return null;
  }

  async list(options: { includeInactive?: boolean; companyId?: string } = {}): Promise<CouponDto[]> {
    const rows = await this.prisma.coupon.findMany({
      where: {
        ...(options.includeInactive ? {} : { isActive: true }),
        ...(options.companyId ? { companyId: options.companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<CouponDto> {
    const row = await this.prisma.coupon.findUnique({ where: { id } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Coupon not found.');
    return this.toDto(row);
  }

  async create(input: {
    code: string;
    descriptionEn?: string;
    descriptionAr?: string;
    discountType?: 'PERCENT' | 'FIXED';
    percentOffBp?: number;
    amountOffMinor?: number;
    currency?: string;
    maxRedemptions?: number | null;
    companyId?: string | null;
    minOrderMinor?: number;
    isActive?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    createdById?: string;
  }): Promise<CouponDto> {
    const code = input.code.trim().toUpperCase();
    if (code.length < 3) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A coupon code needs at least three characters.');
    }
    const discountType = input.discountType ?? 'PERCENT';
    const percentOffBp = discountType === 'PERCENT' ? input.percentOffBp ?? 0 : 0;
    const amountOffMinor = discountType === 'FIXED' ? input.amountOffMinor ?? 0 : 0;
    if (discountType === 'PERCENT' && (percentOffBp < 0 || percentOffBp > 10000)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A percentage discount must be between 0% and 100%.');
    }
    if (discountType === 'FIXED' && amountOffMinor < 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A fixed discount cannot be negative.');
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (startsAt && endsAt && endsAt < startsAt) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The end date cannot precede the start date.');
    }

    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Coupon ${code} already exists.`);

    const row = await this.prisma.coupon.create({
      data: {
        code,
        descriptionEn: input.descriptionEn ?? null,
        descriptionAr: input.descriptionAr ?? null,
        discountType,
        percentOffBp,
        amountOffMinor,
        currency: (input.currency ?? 'BHD').toUpperCase(),
        maxRedemptions: input.maxRedemptions ?? null,
        companyId: input.companyId ?? null,
        minOrderMinor: input.minOrderMinor ?? 0,
        isActive: input.isActive ?? true,
        startsAt,
        endsAt,
        createdById: input.createdById ?? null,
      },
    });
    return this.toDto(row);
  }

  async update(
    id: string,
    input: {
      descriptionEn?: string | null;
      descriptionAr?: string | null;
      percentOffBp?: number;
      amountOffMinor?: number;
      maxRedemptions?: number | null;
      minOrderMinor?: number;
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    },
  ): Promise<CouponDto> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Coupon not found.');

    if (existing.discountType === 'PERCENT' && input.percentOffBp !== undefined) {
      if (input.percentOffBp < 0 || input.percentOffBp > 10000) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A percentage discount must be between 0% and 100%.');
      }
    }
    if (existing.discountType === 'FIXED' && input.amountOffMinor !== undefined && input.amountOffMinor < 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A fixed discount cannot be negative.');
    }

    const startsAt =
      input.startsAt !== undefined ? (input.startsAt ? new Date(input.startsAt) : null) : undefined;
    const endsAt = input.endsAt !== undefined ? (input.endsAt ? new Date(input.endsAt) : null) : undefined;
    const nextStart = startsAt !== undefined ? startsAt : existing.startsAt;
    const nextEnd = endsAt !== undefined ? endsAt : existing.endsAt;
    if (nextStart && nextEnd && nextEnd < nextStart) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The end date cannot precede the start date.');
    }

    const row = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
        ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
        ...(input.percentOffBp !== undefined ? { percentOffBp: input.percentOffBp } : {}),
        ...(input.amountOffMinor !== undefined ? { amountOffMinor: input.amountOffMinor } : {}),
        ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions } : {}),
        ...(input.minOrderMinor !== undefined ? { minOrderMinor: input.minOrderMinor } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(startsAt !== undefined ? { startsAt } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
      },
    });
    return this.toDto(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Coupon not found.');
    await this.prisma.coupon.delete({ where: { id } });
  }

  /**
   * Validate a code against a subtotal, without redeeming it.
   *
   * Returns a machine-readable reason and a bilingual message so the app can
   * explain a rejection without the operator writing client-side copy. A
   * disabled or unknown code returns `valid: false` rather than a 404: a coupon
   * probe is not an error worth a stack trace.
   */
  async validate(
    code: string,
    ctx: { companyId?: string | null; subtotalMinor: number },
  ): Promise<CouponValidationResponse> {
    const normalized = code.trim().toUpperCase();
    const row = await this.prisma.coupon.findUnique({ where: { code: normalized } });
    const messages: Record<string, { en: string; ar: string }> = {
      NOT_FOUND: { en: 'This code is not recognised.', ar: 'هذا الرمز غير معروف.' },
      INACTIVE: { en: 'This code is no longer available.', ar: 'لم يعد هذا الرمز متاحاً.' },
      NOT_STARTED: { en: 'This promotion has not started yet.', ar: 'لم تبدأ هذه الحملة بعد.' },
      EXPIRED: { en: 'This promotion has ended.', ar: 'انتهت هذه الحملة.' },
      EXHAUSTED: { en: 'This code has reached its limit.', ar: 'وصل هذا الرمز إلى حده الأقصى.' },
      WRONG_TENANT: { en: 'This code is not valid for this shop.', ar: 'هذا الرمز غير صالح لهذا المتجر.' },
      BELOW_MINIMUM: { en: 'Your order does not meet the minimum for this code.', ar: 'طلبك لا يستوفي الحد الأدنى لهذا الرمز.' },
    };
    if (!row) {
      return {
        valid: false,
        code: normalized,
        discountMinor: 0,
        reason: 'NOT_FOUND',
        messageEn: messages.NOT_FOUND.en,
        messageAr: messages.NOT_FOUND.ar,
      };
    }
    const reason = this.ineligibilityReason(row, ctx);
    if (reason) {
      const m = messages[reason] ?? messages.NOT_FOUND;
      return {
        valid: false,
        code: normalized,
        discountMinor: 0,
        reason,
        messageEn: m.en,
        messageAr: m.ar,
      };
    }
    const discountMinor = this.computeDiscount(row, ctx.subtotalMinor);
    return {
      valid: true,
      code: normalized,
      discountMinor,
      reason: null,
      messageEn: 'The code was applied.',
      messageAr: 'تم تطبيق الرمز.',
    };
  }

  /**
   * Record a redemption.
   *
   * Called by the checkout path once an order that used the coupon is placed.
   * Returns the new count. The increment is atomic at the row level, so two
   * concurrent checkouts cannot both read the same count.
   */
  async redeem(code: string): Promise<number> {
    const normalized = code.trim().toUpperCase();
    const updated = await this.prisma.coupon.update({
      where: { code: normalized },
      data: { redemptionCount: { increment: 1 } },
    });
    return updated.redemptionCount;
  }
}
