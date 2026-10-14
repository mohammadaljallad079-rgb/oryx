/**
 * ORYX design tokens.
 *
 * The palette is derived from the owner-approved dashboard reference
 * (docs/assets/ORYX Auto Services Dashboard.png): a deep navy field
 * (#00162b family) with restrained gold accents and layered navy panels.
 *
 * These tokens are the single source of truth shared by the admin app CSS
 * variables and any programmatic consumer (charts, PDF exports, tests).
 */

export interface ThemeTokens {
  /** Page background behind all panels. */
  background: string;
  /** Elevated panel / card surface. */
  surface: string;
  /** Slightly raised surface for nested blocks. */
  surfaceRaised: string;
  /** Hairline border colour. */
  border: string;
  /** Stronger border used on hover/selected states. */
  borderStrong: string;
  /** Primary body text. */
  text: string;
  /** Secondary/muted text. */
  textMuted: string;
  /** Inverted text used on gold fills. */
  textInverse: string;
  /** Brand navy used for headings in light theme. */
  navy: string;
  /** Primary accent. */
  gold: string;
  /** Lighter gold for gradients/hover. */
  goldSoft: string;
  /** Deeper gold for pressed states. */
  goldDeep: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Overlay gradient applied on top of module tile images. */
  tileOverlay: string;
  /** Shadow used by cards. */
  shadow: string;
}

export const DARK_THEME: ThemeTokens = {
  background: '#00162b',
  surface: '#021f3a',
  surfaceRaised: '#072a4a',
  border: 'rgba(212, 175, 55, 0.18)',
  borderStrong: 'rgba(212, 175, 55, 0.55)',
  text: '#eef3f9',
  textMuted: '#9fb3c8',
  textInverse: '#00121f',
  navy: '#00162b',
  gold: '#d4af37',
  goldSoft: '#e8c766',
  goldDeep: '#a9861f',
  success: '#3ecf8e',
  warning: '#f0b429',
  danger: '#f2555a',
  info: '#4aa8ff',
  tileOverlay:
    'linear-gradient(180deg, rgba(0,12,24,0.15) 0%, rgba(0,15,30,0.72) 55%, rgba(0,18,34,0.94) 100%)',
  shadow: '0 18px 40px -24px rgba(0, 0, 0, 0.85)',
};

export const LIGHT_THEME: ThemeTokens = {
  background: '#f5f6f8',
  surface: '#ffffff',
  surfaceRaised: '#f0f2f6',
  border: 'rgba(0, 22, 43, 0.12)',
  borderStrong: 'rgba(169, 134, 31, 0.55)',
  text: '#0d2338',
  textMuted: '#5b6b7d',
  textInverse: '#ffffff',
  navy: '#00162b',
  gold: '#b8912a',
  goldSoft: '#d4af37',
  goldDeep: '#8f6f18',
  success: '#1f9d63',
  warning: '#b7791f',
  danger: '#c53030',
  info: '#2b6cb0',
  tileOverlay:
    'linear-gradient(180deg, rgba(0,12,24,0.10) 0%, rgba(0,22,43,0.62) 55%, rgba(0,22,43,0.90) 100%)',
  shadow: '0 16px 36px -26px rgba(0, 22, 43, 0.45)',
};

export const THEMES: Record<'dark' | 'light', ThemeTokens> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};

export const BRAND = {
  nameEn: 'ORYX',
  nameAr: 'أوريكس',
  taglineEn: 'Enterprise Resource Platform',
  taglineAr: 'منصة موارد المؤسسات',
} as const;

export const SUPPORTED_LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';
export const LOCALE_DIRECTION: Record<Locale, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr' };

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
