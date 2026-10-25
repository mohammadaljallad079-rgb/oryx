/**
 * ORYX Marketplace design tokens.
 *
 * The approved identity: deep navy (#00162b family), layered navy panels,
 * restrained metallic gold accents and hairline borders. Values mirror
 * `apps/customer/src/app/globals.css` and `apps/admin` so the website, the
 * control plane and the phone stay one product.
 *
 * Both themes derive from this file alone. A screen never hard-codes a colour:
 * it reads a token, so a theme change cannot leave a component behind and the
 * light theme cannot drift away from the approved dark one.
 */

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceRaised: string;
  surfaceHover: string;
  /** Translucent film laid over photography so text stays legible on it. */
  scrim: string;
  border: string;
  borderSoft: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Ink that is legible on top of `gold`. */
  onGold: string;
  navy: string;
  gold: string;
  goldSoft: string;
  goldDeep: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Elevation shadow colour; weaker in dark mode where contrast carries depth. */
  shadow: string;
}

const dark: Theme = {
  mode: 'dark',
  bg: '#00162b',
  bgDeep: '#000f1e',
  surface: '#021f3a',
  surfaceRaised: '#072a4a',
  surfaceHover: '#0b3459',
  scrim: 'rgba(0, 15, 30, 0.55)',
  border: 'rgba(212, 175, 55, 0.18)',
  borderSoft: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(212, 175, 55, 0.55)',
  text: '#eef3f9',
  textMuted: '#9fb3c8',
  textFaint: '#6f8598',
  onGold: '#00162b',
  navy: '#00162b',
  gold: '#d4af37',
  goldSoft: '#e8c766',
  goldDeep: '#a9861f',
  success: '#3ecf8e',
  warning: '#f0b429',
  danger: '#f2555a',
  info: '#4aa8ff',
  shadow: 'rgba(0, 0, 0, 0.45)',
};

/**
 * The light theme. The accent is `#7d5f10`, not the dark theme's `#d4af37`:
 * the brighter gold measures 4.48:1 on the deepest ivory and fails WCAG AA,
 * while this value clears it. Same finding as the customer website Phase E
 * correction, so both surfaces share one accent value.
 */
const light: Theme = {
  mode: 'light',
  bg: '#f7f4ed',
  bgDeep: '#efeae0',
  surface: '#ffffff',
  surfaceRaised: '#faf8f4',
  surfaceHover: '#f1ece1',
  scrim: 'rgba(0, 15, 30, 0.42)',
  border: 'rgba(0, 22, 43, 0.12)',
  borderSoft: 'rgba(0, 22, 43, 0.08)',
  borderStrong: 'rgba(125, 95, 16, 0.55)',
  text: '#22201d',
  textMuted: '#5b564d',
  textFaint: '#8a8479',
  onGold: '#221c07',
  navy: '#00162b',
  gold: '#7d5f10',
  goldSoft: '#b8912a',
  goldDeep: '#5c4509',
  success: '#1f7a4d',
  warning: '#8a5a09',
  danger: '#a5232b',
  info: '#1f5d94',
  shadow: 'rgba(0, 22, 43, 0.12)',
};

export const themes: Record<ThemeMode, Theme> = { dark, light };

/** 8-point spacing scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  display: 30,
  title: 24,
  heading: 19,
  subheading: 16,
  body: 15,
  label: 13,
  caption: 11,
} as const;

/** The navy ramp behind the splash, the hero and the merchant header. */
export const gradients = {
  navy: ['#00162b', '#032a4d', '#00111f'] as const,
  navySoft: ['#021f3a', '#00162b'] as const,
  gold: ['#e8c766', '#d4af37', '#a9861f'] as const,
};

/** Elevation presets; the shadow colour follows the theme. */
export function elevation(theme: Theme, level: 0 | 1 | 2 | 3) {
  const config = {
    0: { radius: 0, opacity: 0, offset: 0 },
    1: { radius: 6, opacity: 0.35, offset: 2 },
    2: { radius: 14, opacity: 0.45, offset: 5 },
    3: { radius: 24, opacity: 0.55, offset: 9 },
  }[level];
  return {
    shadowColor: theme.shadow,
    shadowOpacity: config.opacity,
    shadowRadius: config.radius,
    shadowOffset: { width: 0, height: config.offset },
    elevation: level * 3,
  };
}

/** Status colours for bookings, orders, recovery jobs and payments. */
export function statusColor(theme: Theme, status: string): string {
  switch (status) {
    case 'CONFIRMED':
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'APPROVED':
    case 'PAID':
    case 'DELIVERED':
    case 'ACTIVE':
    case 'ARRIVED':
      return theme.success;
    case 'HELD':
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'NEW':
    case 'ASSIGNED':
    case 'REQUIRES_ACTION':
    case 'PREPARING':
    case 'SHIPPED':
    case 'SEARCHING':
    case 'ACCEPTED':
    case 'ANALYSING':
    case 'EN_ROUTE':
      return theme.warning;
    case 'CANCELLED':
    case 'NO_SHOW':
    case 'FAILED':
    case 'REJECTED':
    case 'DISPUTED':
    case 'OUT_OF_STOCK':
      return theme.danger;
    default:
      return theme.textMuted;
  }
}
