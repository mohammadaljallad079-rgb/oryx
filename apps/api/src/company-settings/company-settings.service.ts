import { Injectable } from '@nestjs/common';
import {
  COMPANY_SETTING_DEFAULTS,
  COMPANY_SETTING_SECTIONS,
  DOCUMENT_NUMBERING_TYPES,
  withDefaults,
  type CompanySettingSection,
  type CompanySettingsMap,
  type CompanySettingsResponse,
  type CompanyPaymentMethodSetting,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { ErpContextService } from '../common/erp-context.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { badRequest, ERROR_CODES } from '../common/errors';

/**
 * Per-company settings.
 *
 * Isolation is enforced here, not in the UI: every read and write resolves the
 * company from the principal's own scope and filters by `companyId`. A caller
 * cannot name another tenant's company id, because the id is never taken from
 * the request body — it comes from `resolveCompanyScope`.
 */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
  ) {}

  /** Every section for the principal's active company, defaults merged in. */
  async getSettings(
    principal: RequestPrincipal,
    requestedCompanyId?: string,
  ): Promise<CompanySettingsResponse> {
    const { companyId } = await this.context.resolveCompanyScope(principal, requestedCompanyId);
    const rows = await this.prisma.companySetting.findMany({ where: { companyId } });
    const bySection = new Map(rows.map((r) => [r.section, r.value]));
    const sections = {} as CompanySettingsMap;
    for (const section of COMPANY_SETTING_SECTIONS) {
      // The per-section generic collapses to the union at the loop; the map is
      // built section-by-section so the assignment is sound by construction.
      (sections as unknown as Record<string, unknown>)[section] = withDefaults(
        section,
        bySection.get(section),
      );
    }
    return { companyId, sections };
  }

  async getSection(
    principal: RequestPrincipal,
    section: CompanySettingSection,
    requestedCompanyId?: string,
  ): Promise<CompanySettingsMap[CompanySettingSection]> {
    const { companyId } = await this.context.resolveCompanyScope(principal, requestedCompanyId);
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_section: { companyId, section } },
    });
    return withDefaults(section, row?.value);
  }

  /**
   * Upsert one section. A partial payload is merged over the stored value, so a
   * screen that edits two fields never blanks the rest of the section.
   */
  async updateSection(
    principal: RequestPrincipal,
    section: CompanySettingSection,
    patch: Record<string, unknown>,
    actorUserId: string,
    requestedCompanyId?: string,
  ): Promise<CompanySettingsMap[CompanySettingSection]> {
    const { companyId } = await this.context.resolveCompanyScope(principal, requestedCompanyId);
    const existing = await this.prisma.companySetting.findUnique({
      where: { companyId_section: { companyId, section } },
    });
    const incoming = section === 'numbering' ? sanitiseNumbering(patch)
      : section === 'sales' ? sanitiseSalesSettings(patch) : patch;
    const merged = { ...withDefaults(section, existing?.value), ...incoming };
    await this.prisma.companySetting.upsert({
      where: { companyId_section: { companyId, section } },
      update: { value: merged as never, updatedById: actorUserId },
      create: {
        companyId,
        section,
        value: merged as never,
        updatedById: actorUserId,
      },
    });
    return merged as CompanySettingsMap[CompanySettingSection];
  }

  /** The effective VAT rate for a company, falling back to the catalogue default. */
  async effectiveTaxRateBp(companyId: string): Promise<number> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_section: { companyId, section: 'tax' } },
    });
    const tax = withDefaults('tax', row?.value);
    return tax.vatEnabled ? tax.defaultRateBp : 0;
  }

  /** The company a request will act on, for audit attribution. */
  scope(principal: RequestPrincipal, requestedCompanyId?: string) {
    return this.context.resolveCompanyScope(principal, requestedCompanyId);
  }

  defaults(): typeof COMPANY_SETTING_DEFAULTS {
    return COMPANY_SETTING_DEFAULTS;
  }
}

/**
 * Keep only well-formed numbering rules from a patch.
 *
 * The section is an open map keyed by document type, so an arbitrary body could
 * otherwise store a negative padding, a zero next-number or a key that is not a
 * document type. Only catalogue keys are kept, the prefix is capped at a short
 * token (a printed number is one letter plus digits, not a sentence) and the
 * numeric fields are clamped to sane bounds. A rule that arrives empty is
 * dropped so the type falls back to its catalogue default rather than printing
 * a blank number.
 */
function sanitiseNumbering(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    if (!KNOWN_NUMBERING_KEYS.has(key)) continue;
    if (!raw || typeof raw !== 'object') continue;
    const rule = raw as Record<string, unknown>;
    const prefix = String(rule.prefix ?? '').trim().slice(0, 4);
    if (!prefix) continue;
    const padding = clampInt(rule.padding, 1, 12);
    const nextNumber = clampInt(rule.nextNumber, 1, Number.MAX_SAFE_INTEGER);
    out[key] = { prefix, padding, nextNumber };
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

const KNOWN_NUMBERING_KEYS = new Set(DOCUMENT_NUMBERING_TYPES.map((t) => t.key));

const PAYMENT_ACCOUNTING_METHODS = new Set([
  'CASH', 'CARD', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'OTHER', 'CREDIT',
]);

/** Store payment methods as a validated, company-scoped catalogue, never raw JSON. */
function sanitiseSalesSettings(patch: Record<string, unknown>): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(patch, 'paymentMethods')) return patch;
  const input = patch.paymentMethods;
  if (!Array.isArray(input) || input.length > 40) {
    throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Payment methods must be a list of up to 40 entries.');
  }
  const seen = new Set<string>();
  const paymentMethods: CompanyPaymentMethodSetting[] = input.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid payment method.');
    }
    const item = raw as Record<string, unknown>;
    const code = String(item.code ?? '').trim().toUpperCase();
    const nameEn = String(item.nameEn ?? '').trim();
    const nameAr = String(item.nameAr ?? '').trim();
    const accountingMethod = String(item.accountingMethod ?? '').trim();
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code) || seen.has(code)
      || !nameEn || nameEn.length > 80 || !nameAr || nameAr.length > 80
      || !PAYMENT_ACCOUNTING_METHODS.has(accountingMethod)
      || typeof item.isActive !== 'boolean'
      || typeof item.useInInvoices !== 'boolean'
      || typeof item.useInPos !== 'boolean'
      || (accountingMethod === 'CREDIT' && item.useInPos)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid or duplicate payment method configuration.');
    }
    seen.add(code);
    return {
      code, nameEn, nameAr,
      accountingMethod: accountingMethod as CompanyPaymentMethodSetting['accountingMethod'],
      isActive: item.isActive,
      useInInvoices: item.useInInvoices,
      useInPos: item.useInPos,
    };
  });
  if (!paymentMethods.some(method => method.isActive && method.useInInvoices)
    || !paymentMethods.some(method => method.isActive && method.useInPos)) {
    throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'At least one active payment method is required for invoices and POS.');
  }
  return { ...patch, paymentMethods };
}
