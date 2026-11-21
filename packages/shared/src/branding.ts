/**
 * Per-company visual identity.
 *
 * ORYX is one platform hosting many tenants, and each tenant has its own real
 * brand. The platform therefore has a *default* identity (ORYX itself) and every
 * company may override it. Resolution always falls back to the default, field by
 * field, so a company that has only uploaded a logo still inherits the ORYX
 * accent colour rather than rendering an empty swatch.
 *
 * Colours are stored as 6-digit hex strings. They are validated here, once,
 * because the value reaches a `style` attribute in the browser: an unvalidated
 * string is a CSS-injection vector, and `#d4af37; background:url(...)` is a
 * perfectly valid-looking hex string to a naive check.
 */

export interface CompanyBranding {
  /** Display name shown in the tenant's own interfaces. */
  nameEn: string;
  nameAr: string;
  /** `CmsMediaAsset` ids, or null to inherit the platform default. */
  logoAssetId: string | null;
  logoDarkAssetId: string | null;
  faviconAssetId: string | null;
  /** 6-digit hex, e.g. `#d4af37`. */
  primaryColor: string | null;
  accentColor: string | null;
  /** Contact details surfaced on the tenant's public pages. */
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
}

/**
 * The ORYX default identity, used when a company has set nothing.
 *
 * These are the approved brand values already seeded into the `branding`
 * platform setting; they are duplicated here as a typed constant so the
 * fallback does not depend on a database read that may legitimately be empty.
 */
export const ORYX_DEFAULT_BRANDING: CompanyBranding = {
  nameEn: 'ORYX',
  nameAr: 'أوريكس',
  logoAssetId: null,
  logoDarkAssetId: null,
  faviconAssetId: null,
  primaryColor: '#d4af37',
  accentColor: '#00162b',
  supportEmail: null,
  supportPhone: null,
  websiteUrl: null,
};

/** Matches exactly `#rrggbb`. Deliberately strict: no shorthand, no alpha, no names. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/**
 * Normalise a colour to lower-case `#rrggbb`, or return null when unset.
 *
 * Throws on a malformed value rather than silently dropping it: a caller that
 * sent `red` or `#fff` has a bug, and silently discarding the input would make
 * the tenant's colour appear to save and then not apply.
 */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const trimmed = value.trim();
  if (!isValidHexColor(trimmed)) {
    throw new Error(`Invalid hex colour: ${value}`);
  }
  return trimmed.toLowerCase();
}

/**
 * Whether a hex colour is readable as a background for white text.
 *
 * Uses the WCAG relative-luminance formula and the 4.5:1 contrast threshold for
 * normal text, so the UI can pick a dark or light foreground instead of
 * assuming every brand colour is dark enough for white text. A bright yellow
 * brand colour with white text is unreadable, and that is a real accessibility
 * defect rather than a matter of taste.
 */
export function contrastRatioWithWhite(hex: string): number {
  if (!isValidHexColor(hex)) throw new Error(`Invalid hex colour: ${hex}`);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // (L1 + 0.05) / (L2 + 0.05) with white = 1.0
  return 1.05 / (luminance + 0.05);
}

/** The foreground colour to use on top of `hex`, chosen for legibility. */
export function readableForegroundOn(hex: string): '#ffffff' | '#0b0b0c' {
  return contrastRatioWithWhite(hex) >= 4.5 ? '#ffffff' : '#0b0b0c';
}

/**
 * The CSS custom properties a resolved identity contributes to the shell.
 *
 * Returned as a plain record rather than a style string so a caller sets them
 * through React's `style` prop, which escapes them; building a `:root{...}`
 * string would put a tenant-supplied value back into a CSS parser.
 *
 * Only colours are exposed, and only after `isValidHexColor`, so an unset or
 * malformed value never reaches the DOM. `--brand-accent` is the tenant's
 * primary colour with a readable foreground, so a button painted with it can
 * pick its own text colour instead of assuming white.
 */
export function brandingCssVariables(
  branding: Pick<CompanyBranding, 'primaryColor' | 'accentColor'>,
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (branding.primaryColor && isValidHexColor(branding.primaryColor)) {
    vars['--brand-primary'] = branding.primaryColor;
    vars['--brand-primary-foreground'] = readableForegroundOn(branding.primaryColor);
  }
  if (branding.accentColor && isValidHexColor(branding.accentColor)) {
    vars['--brand-accent'] = branding.accentColor;
    vars['--brand-accent-foreground'] = readableForegroundOn(branding.accentColor);
  }
  return vars;
}

/**
 * The stored shape of a branding row: every field nullable, because a company
 * may set any subset and `null` means "inherit".
 */
export type StoredCompanyBranding = {
  [K in keyof CompanyBranding]: CompanyBranding[K] | null;
};

/**
 * Merge a stored branding row over the ORYX default, field by field.
 *
 * `null` means "inherit", never "render nothing", which is what makes a
 * partially configured tenant look intentional.
 */
export function resolveBranding(
  stored: Partial<StoredCompanyBranding> | null | undefined,
  fallback: CompanyBranding = ORYX_DEFAULT_BRANDING,
): CompanyBranding {
  if (!stored) return { ...fallback };
  const pick = <K extends keyof CompanyBranding>(key: K): CompanyBranding[K] =>
    stored[key] === null || stored[key] === undefined || stored[key] === ''
      ? fallback[key]
      : (stored[key] as CompanyBranding[K]);
  return {
    nameEn: pick('nameEn'),
    nameAr: pick('nameAr'),
    logoAssetId: pick('logoAssetId'),
    logoDarkAssetId: pick('logoDarkAssetId'),
    faviconAssetId: pick('faviconAssetId'),
    primaryColor: pick('primaryColor'),
    accentColor: pick('accentColor'),
    supportEmail: pick('supportEmail'),
    supportPhone: pick('supportPhone'),
    websiteUrl: pick('websiteUrl'),
  };
}
