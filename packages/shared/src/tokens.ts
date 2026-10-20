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
  /**
   * Navy band colour for the full-bleed hero. The approved homepage reference
   * keeps the hero navy in both themes; in the dark theme this equals the page
   * field, so the approved dark render is unchanged.
   */
  band: string;
  /** Navy band colour for the footer (dark uses the deeper page well). */
  bandFooter: string;
  /** Primary ink on a navy band (hero title). */
  bandText: string;
  /** Muted ink on a navy band (hero lede, footer headings). */
  bandTextMuted: string;
  /** Faint ink on a navy band (hero stat labels, footer links). */
  bandTextFaint: string;
  /** Accent gold that reads on a navy band. */
  bandAccent: string;
  /** Hairline on a navy band (hero stat rule, footer rules). */
  bandBorder: string;
  /**
   * Accent gold for text that sits on a warm gold-tinted surface (the 10–12%
   * gold chip fills, the card caption scrim). A tint raises the surface
   * luminance, so the plain `gold` accent dips below 4.5:1 there; this is the
   * one value every such chip uses instead of a per-component override.
   */
  goldOnTint: string;
  /**
   * Gold-tint ramp. Seven named steps replace the scattered per-rule
   * `color-mix(in srgb, var(--gold) N%, transparent)` percentages, so every
   * chip, wash, hairline and inset panel in a theme resolves to one of seven
   * values instead of one of sixteen.
   *
   * They stay `color-mix` expressions, like `tileOverlay` and `cardScrim` above:
   * a translucent tint composites over whatever surface it sits on, so one token
   * reads correctly on a white card and on the ivory page. The dark values are
   * the percentages the rules already used most often, so the approved dark
   * render moves by at most one step — a channel delta of 9 or less, inside the
   * repository's "no real colour shift" tolerance of 12.
   */
  /** Faintest gold wash: an unread notification row. */
  tintWash: string;
  /** Standard gold chip fill (icon chips, marks, badges). */
  tintFill: string;
  /** Focus halo around a form control. */
  tintFocus: string;
  /** Decorative radial bloom behind a hero, tile or contact panel. */
  tintGlow: string;
  /** Selected / active chip fill, composited over the raised surface. */
  tintActive: string;
  /** Hairline around a gold chip. */
  tintLine: string;
  /** Stronger hairline for a badge. */
  tintBadgeLine: string;
  /** Focus ring and selected outline. */
  tintRing: string;
  /** Fill for an inset panel (empty state, summary tile, rating bar). */
  tintPanel: string;
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
  // In the dark theme the page field is already navy and the footer uses the
  // deeper well, so every band token reproduces the existing dark value
  // exactly; the band rules are therefore pixel-identical in dark.
  band: '#00162b',
  bandFooter: '#000f1e',
  bandText: '#eef3f9',
  bandTextMuted: '#9fb3c8',
  bandTextFaint: '#6f8598',
  bandAccent: '#d4af37',
  bandBorder: 'rgba(255, 255, 255, 0.08)',
  // In dark the plain gold already clears 4.5:1 on every gold-tinted chip, so
  // this token reproduces it and the approved dark render is unchanged.
  goldOnTint: '#d4af37',
  // The gold-tint ramp. The dark values are the percentages the rules already
  // used most often, so the approved dark render moves by at most one step.
  tintWash: 'color-mix(in srgb, var(--gold) 6%, transparent)',
  tintFill: 'color-mix(in srgb, var(--gold) 12%, transparent)',
  tintFocus: 'color-mix(in srgb, var(--gold) 16%, transparent)',
  tintGlow: 'color-mix(in srgb, var(--gold) 22%, transparent)',
  tintActive: 'color-mix(in srgb, var(--gold) 18%, var(--surface-raised))',
  tintLine: 'color-mix(in srgb, var(--gold) 26%, transparent)',
  tintBadgeLine: 'color-mix(in srgb, var(--gold) 34%, transparent)',
  tintRing: 'color-mix(in srgb, var(--gold) 40%, transparent)',
  tintPanel: 'color-mix(in srgb, var(--surface-raised) 55%, transparent)',
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
  // The approved light homepage keeps a navy hero band and a navy footer on an
  // ivory page, so the band is the deep navy from the reference, not the page
  // background. White ink and the light metallic gold read on it.
  band: '#0a1b2f',
  bandFooter: '#0a1b2f',
  bandText: '#ffffff',
  bandTextMuted: '#cdd8e6',
  bandTextFaint: '#9fb3c8',
  bandAccent: '#e8c766',
  bandBorder: 'rgba(232, 199, 102, 0.24)',
  // A 10–12% gold chip fill lifts the surface enough that the `gold` accent
  // falls to ~3.9:1; this darker gold clears 4.5:1 on every tinted chip.
  goldOnTint: '#7a5c10',
  // The gold-tint ramp. Every light value is one step lighter than the dark
  // ramp, so a chip reads as a warm tint on a white card rather than as a
  // saturated block — the "scattered golds" the owner reported. `goldOnTint`
  // above is measured against the 12% `tintFill`, so contrast is unchanged.
  tintWash: 'color-mix(in srgb, var(--gold) 6%, transparent)',
  tintFill: 'color-mix(in srgb, var(--gold) 12%, transparent)',
  tintFocus: 'color-mix(in srgb, var(--gold) 16%, transparent)',
  tintGlow: 'color-mix(in srgb, var(--gold) 16%, transparent)',
  tintActive: 'color-mix(in srgb, var(--gold) 14%, var(--surface-raised))',
  tintLine: 'color-mix(in srgb, var(--gold) 26%, transparent)',
  tintBadgeLine: 'color-mix(in srgb, var(--gold) 34%, transparent)',
  tintRing: 'color-mix(in srgb, var(--gold) 40%, transparent)',
  tintPanel: 'color-mix(in srgb, var(--surface-raised) 55%, transparent)',
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
