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
  /** Primary accent. In light theme this is the *text* gold: dark enough to
   * read on an ivory surface. Metallic fills use `goldFill*`. */
  gold: string;
  /** Darker gold for hover on a light surface. */
  goldHover: string;
  /** Lighter gold for gradients/hover. */
  goldSoft: string;
  /** Deeper gold for pressed states. */
  goldDeep: string;
  /** Start of the metallic fill gradient (buttons, marks). */
  goldFillFrom: string;
  /** End of the metallic fill gradient. */
  goldFillTo: string;
  /** Metallic fill on hover. */
  goldFillHoverFrom: string;
  /** Metallic fill on hover. */
  goldFillHoverTo: string;
  /** Ink used on a metallic gold fill (buttons, marks, step numbers). */
  onGold: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Overlay gradient applied on top of module tile images. */
  tileOverlay: string;
  /** Overlay applied to a category card that sits over artwork. */
  cardScrim: string;
  /** Shadow used by cards. */
  shadow: string;
  /** Shadow used by the auth panel. */
  shadowPanel: string;
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
  goldHover: '#e8c766',
  goldSoft: '#e8c766',
  goldDeep: '#a9861f',
  goldFillFrom: '#e8c766',
  goldFillTo: '#d4af37',
  goldFillHoverFrom: '#d4af37',
  goldFillHoverTo: '#a9861f',
  // The original `--navy` ink, so the approved dark theme stays pixel-identical.
  onGold: '#00162b',
  success: '#3ecf8e',
  warning: '#f0b429',
  danger: '#f2555a',
  info: '#4aa8ff',
  tileOverlay:
    'linear-gradient(180deg, rgba(0,12,24,0.15) 0%, rgba(0,15,30,0.72) 55%, rgba(0,18,34,0.94) 100%)',
  cardScrim:
    'linear-gradient(180deg, rgba(0,12,24,0.15) 0%, rgba(0,15,30,0.72) 55%, rgba(0,18,34,0.94) 100%)',
  shadow: '0 18px 40px -24px rgba(0, 0, 0, 0.85)',
  shadowPanel: '0 24px 60px rgba(0, 0, 0, 0.32)',
};

/**
 * Light theme: an elegant ivory field, white and warm-neutral surfaces, deep
 * charcoal type and a restrained metallic gold.
 *
 * The `gold` value is the accent *text* colour and is deliberately darker than
 * `goldSoft`/`goldFill*`, which are fills carrying dark ink. Every pair this
 * theme renders is asserted in `test/tokens.test.ts`, so a future edit cannot
 * silently regress contrast.
 */
export const LIGHT_THEME: ThemeTokens = {
  background: '#f7f4ed',
  surface: '#ffffff',
  surfaceRaised: '#fbf9f4',
  border: 'rgba(36, 31, 20, 0.14)',
  borderStrong: 'rgba(133, 102, 18, 0.5)',
  text: '#22201d',
  textMuted: '#5a544b',
  textInverse: '#241f14',
  navy: '#00162b',
  gold: '#856612',
  goldHover: '#6f5510',
  goldSoft: '#d9b447',
  goldDeep: '#a9821c',
  goldFillFrom: '#e0c168',
  goldFillTo: '#c9a227',
  goldFillHoverFrom: '#d4af37',
  goldFillHoverTo: '#b8912a',
  onGold: '#241f14',
  success: '#1a7f4f',
  warning: '#8a5a06',
  danger: '#b3261e',
  info: '#1d5fa8',
  tileOverlay:
    'linear-gradient(180deg, rgba(0,12,24,0.10) 0%, rgba(0,22,43,0.62) 55%, rgba(0,22,43,0.90) 100%)',
  cardScrim:
    'linear-gradient(180deg, rgba(247,244,237,0.55) 0%, rgba(247,244,237,0.82) 55%, rgba(247,244,237,0.94) 100%)',
  shadow: '0 16px 36px -26px rgba(58, 48, 30, 0.28)',
  shadowPanel: '0 24px 60px -28px rgba(58, 48, 30, 0.35)',
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
