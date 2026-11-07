/**
 * ORYX Bahrain market configuration.
 *
 * The launch market is Bahrain, so the defaults here are Bahrain defaults: the
 * Bahraini Dinar, the `Asia/Bahrain` zone and the national mobile numbering
 * plan. Everything is data, and every consumer reads it from here rather than
 * hard-coding a literal, so a second market is a change to this file and not a
 * search across the codebase.
 *
 * Nothing in this module invents a tax rate, a payment credential or a
 * regulatory approval. A financial setting is a *default the owner may change*,
 * not a claim about Bahraini law.
 */

import { DEFAULT_CURRENCY } from './currency';

/** ISO 3166-1 alpha-2 code of the launch market. */
export const DEFAULT_COUNTRY_CODE = 'BH';

/**
 * IANA zone of the launch market.
 *
 * Bahrain observes Arabia Standard Time (UTC+3) all year and has no daylight
 * saving transition, which is why a fixed offset is never used in arithmetic:
 * the zone name is carried on the record and resolved by the runtime.
 */
export const DEFAULT_TIMEZONE = 'Asia/Bahrain';

/**
 * Bahrain mobile numbering plan.
 *
 * A local mobile number is eight digits and begins `3` (the country's mobile
 * prefix), optionally with the national trunk `+973`. Landlines begin `1` and
 * are deliberately rejected here: a consumer account is contacted about a
 * booking by mobile, so accepting a landline would create a record the platform
 * cannot use.
 *
 * The accepted forms are:
 *   - `3XXXXXXX`        eight digits, mobile prefix
 *   - `+9733XXXXXXX`    E.164
 *   - `9733XXXXXXX`     E.164 without the plus
 *   - `009733XXXXXXX`   international access code
 *
 * Spaces, dashes and parentheses are permitted as separators and are ignored.
 */
export const BH_MOBILE_LOCAL_PATTERN = /^3\d{7}$/;

/** Country calling code for Bahrain, without the plus. */
export const BH_CALLING_CODE = '973';

export interface PhoneNormalisationResult {
  /** E.164 form (`+9733XXXXXXX`) when the input was accepted. */
  e164: string | null;
  /** Local eight-digit form when the input was accepted. */
  local: string | null;
  valid: boolean;
  /** Machine-readable reason, present only when `valid` is false. */
  reason?: 'empty' | 'not_a_number' | 'wrong_length' | 'wrong_prefix' | 'wrong_country';
}

const SEPARATORS = /[\s\-().]/g;

/**
 * Strip separators and a recognised Bahrain country prefix.
 *
 * Returns the national digits, or `null` when no digit sequence can be
 * recovered. The prefix is removed only when it is explicitly international
 * (`+973…`, `00973…`) or when an eleven-digit value begins `973`; an eight-digit
 * local number is returned unchanged.
 */
export function toNationalDigits(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let value = input.replace(SEPARATORS, '');
  let international = false;
  if (value.startsWith('+')) {
    value = value.slice(1);
    international = true;
  } else if (value.startsWith('00')) {
    value = value.slice(2);
    international = true;
  }
  if (!/^\d+$/.test(value)) return null;
  if (international || (value.startsWith(BH_CALLING_CODE) && value.length === 11)) {
    return value.slice(BH_CALLING_CODE.length);
  }
  return value;
}

/**
 * Validate and normalise a Bahrain mobile number.
 *
 * Deliberately returns a result object rather than a boolean: the API needs to
 * store the canonical E.164 form, and a form needs to say *why* a value was
 * rejected. A boolean would force both callers to re-implement the parsing.
 *
 * The country prefix is only stripped when it is *explicitly* present — a
 * leading `+`, a leading `00`, or an eleven-digit value that begins `973`. A
 * nine-digit national number is therefore a length error, not a foreign number,
 * which is the distinction the user needs to correct their input.
 */
export function normaliseBahrainPhone(input: string | null | undefined): PhoneNormalisationResult {
  if (input === null || input === undefined || input.trim() === '') {
    return { e164: null, local: null, valid: false, reason: 'empty' };
  }

  let digits = input.replace(SEPARATORS, '');
  let international = false;
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
    international = true;
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }

  if (!/^\d+$/.test(digits)) {
    return { e164: null, local: null, valid: false, reason: 'not_a_number' };
  }

  if (international) {
    if (!digits.startsWith(BH_CALLING_CODE)) {
      return { e164: null, local: null, valid: false, reason: 'wrong_country' };
    }
    digits = digits.slice(BH_CALLING_CODE.length);
  } else if (digits.startsWith(BH_CALLING_CODE) && digits.length === 11) {
    digits = digits.slice(BH_CALLING_CODE.length);
  }

  if (digits.length !== 8) {
    return { e164: null, local: null, valid: false, reason: 'wrong_length' };
  }
  if (!BH_MOBILE_LOCAL_PATTERN.test(digits)) {
    return { e164: null, local: null, valid: false, reason: 'wrong_prefix' };
  }
  return { e164: `+${BH_CALLING_CODE}${digits}`, local: digits, valid: true };
}

export function isValidBahrainPhone(input: string | null | undefined): boolean {
  return normaliseBahrainPhone(input).valid;
}

/** E.164 form of a valid Bahrain number, or `null`. */
export function toE164BahrainPhone(input: string | null | undefined): string | null {
  return normaliseBahrainPhone(input).e164;
}

/**
 * Financial defaults for the launch market.
 *
 * `vatRateBp` is **zero and is meant to be zero**. ORYX does not assert a
 * Bahraini VAT rate; the owner sets the operative rate through company settings
 * and this value is only the starting point for a new tenant. It is stored in
 * basis points like every other percentage in the platform.
 */
export const BAHRAIN_FINANCIAL_DEFAULTS = {
  currency: DEFAULT_CURRENCY,
  currencyScale: 3,
  vatRateBp: 0,
  /** Rounding is half-up at the minor-unit boundary; see `money.ts`. */
  pricesIncludeVat: false,
} as const;

/**
 * Service areas of the launch market.
 *
 * These are the twelve administrative areas Bahrain is divided into. They are a
 * *starting catalogue*, seeded so a new deployment is usable, and are stored in
 * the database so an administrator can rename, deactivate or extend them
 * without a code change. The codes are stable identifiers; the names are the
 * display values.
 */
export interface ServiceAreaDefinition {
  code: string;
  nameEn: string;
  nameAr: string;
}

export const BAHRAIN_SERVICE_AREAS: readonly ServiceAreaDefinition[] = [
  { code: 'BH-CAP', nameEn: 'Capital', nameAr: 'العاصمة' },
  { code: 'BH-MUH', nameEn: 'Muharraq', nameAr: 'المحرق' },
  { code: 'BH-NOR', nameEn: 'Northern', nameAr: 'الشمالية' },
  { code: 'BH-SOU', nameEn: 'Southern', nameAr: 'الجنوبية' },
  { code: 'BH-CEN', nameEn: 'Central', nameAr: 'الوسطى' },
  { code: 'BH-HID', nameEn: 'Hidd', nameAr: 'الحد' },
  { code: 'BH-RIF', nameEn: 'Riffa', nameAr: 'الرفاع' },
  { code: 'BH-ISA', nameEn: 'Isa Town', nameAr: 'مدينة عيسى' },
  { code: 'BH-HAM', nameEn: 'Hamad Town', nameAr: 'مدينة حمد' },
  { code: 'BH-SIT', nameEn: 'Sitra', nameAr: 'سترة' },
  { code: 'BH-BUD', nameEn: 'Budaiya', nameAr: 'البديع' },
  { code: 'BH-JID', nameEn: 'Jidhafs', nameAr: 'جدحفص' },
];
