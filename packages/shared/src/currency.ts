/**
 * ORYX currency metadata.
 *
 * Bahrain (the launch market) uses the Bahraini Dinar, which is subdivided into
 * **1000 fils**, not 100. Treating BHD as a 2-decimal currency silently misreads
 * every amount by a factor of ten, so the scale is data, not a constant: every
 * monetary helper in Execution 04 takes it from here.
 *
 * Money remains integer minor units everywhere (see `money.ts`). The scale only
 * decides how many minor units make one major unit.
 */

export interface CurrencyDefinition {
  code: string;
  /** Minor units per major unit. 1000 for BHD/KWD/OMR, 100 for most others. */
  scale: number;
  symbolEn: string;
  symbolAr: string;
}

export const CURRENCIES: readonly CurrencyDefinition[] = [
  { code: 'BHD', scale: 3, symbolEn: 'BD', symbolAr: 'د.ب' },
  { code: 'KWD', scale: 3, symbolEn: 'KD', symbolAr: 'د.ك' },
  { code: 'OMR', scale: 3, symbolEn: 'OMR', symbolAr: 'ر.ع' },
  { code: 'SAR', scale: 2, symbolEn: 'SAR', symbolAr: 'ر.س' },
  { code: 'AED', scale: 2, symbolEn: 'AED', symbolAr: 'د.إ' },
  { code: 'QAR', scale: 2, symbolEn: 'QAR', symbolAr: 'ر.ق' },
  { code: 'USD', scale: 2, symbolEn: '$', symbolAr: '$' },
  { code: 'EUR', scale: 2, symbolEn: '€', symbolAr: '€' },
  { code: 'GBP', scale: 2, symbolEn: '£', symbolAr: '£' },
];

const BY_CODE: ReadonlyMap<string, CurrencyDefinition> = new Map(
  CURRENCIES.map((c) => [c.code.toUpperCase(), c]),
);

/** The currency ORYX prices its Bahrain automotive services in. */
export const DEFAULT_CURRENCY = 'BHD';
export const DEFAULT_CURRENCY_SCALE = 3;

/**
 * Decimal places for a currency code.
 *
 * An unknown code falls back to 2 rather than throwing: a currency added to a
 * tenant record before this list is updated should render as a normal
 * two-decimal amount instead of breaking an invoice.
 */
export function currencyScale(code: string | null | undefined): number {
  if (!code) return DEFAULT_CURRENCY_SCALE;
  return BY_CODE.get(code.toUpperCase())?.scale ?? 2;
}

export function currencyDefinition(code: string): CurrencyDefinition | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function isKnownCurrency(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

export function currencySymbol(code: string, locale: 'ar' | 'en' = 'en'): string {
  const def = BY_CODE.get(code.toUpperCase());
  if (!def) return code.toUpperCase();
  return locale === 'ar' ? def.symbolAr : def.symbolEn;
}
