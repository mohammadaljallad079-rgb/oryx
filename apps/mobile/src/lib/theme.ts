/**
 * ORYX mobile design tokens.
 *
 * The same approved identity as the control plane and the customer website:
 * deep navy (#00162b family), layered navy panels, restrained gold accents and
 * hairline borders. Values mirror `apps/customer/src/app/globals.css` so the
 * three surfaces stay visually consistent.
 */

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceRaised: string;
  surfaceHover: string;
  border: string;
  borderSoft: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  navy: string;
  gold: string;
  goldSoft: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

const dark: Theme = {
  mode: 'dark',
  bg: '#00162b',
  bgDeep: '#000f1e',
  surface: '#021f3a',
  surfaceRaised: '#072a4a',
  surfaceHover: '#0b3459',
  border: 'rgba(212, 175, 55, 0.18)',
  borderSoft: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(212, 175, 55, 0.55)',
  text: '#eef3f9',
  textMuted: '#9fb3c8',
  textFaint: '#6f8598',
  navy: '#00162b',
  gold: '#d4af37',
  goldSoft: '#e8c766',
  success: '#3ecf8e',
  warning: '#f0b429',
  danger: '#f2555a',
  info: '#4aa8ff',
};

const light: Theme = {
  mode: 'light',
  bg: '#f5f6f8',
  bgDeep: '#eceef2',
  surface: '#ffffff',
  surfaceRaised: '#f0f2f6',
  surfaceHover: '#e8ecf2',
  border: 'rgba(0, 22, 43, 0.12)',
  borderSoft: 'rgba(0, 22, 43, 0.08)',
  borderStrong: 'rgba(169, 134, 31, 0.55)',
  text: '#0d2338',
  textMuted: '#5b6b7d',
  textFaint: '#8794a3',
  navy: '#00162b',
  gold: '#b8912a',
  goldSoft: '#d4af37',
  success: '#1f9d63',
  warning: '#b7791f',
  danger: '#c53030',
  info: '#2b6cb0',
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
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: 24,
  heading: 19,
  body: 15,
  label: 13,
  caption: 11,
} as const;

/** Status colours for bookings, payments and requests. */
export function statusColor(theme: Theme, status: string): string {
  switch (status) {
    case 'CONFIRMED':
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'APPROVED':
    case 'PAID':
      return theme.success;
    case 'HELD':
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'NEW':
    case 'ASSIGNED':
    case 'REQUIRES_ACTION':
      return theme.warning;
    case 'CANCELLED':
    case 'NO_SHOW':
    case 'FAILED':
    case 'REJECTED':
    case 'DISPUTED':
      return theme.danger;
    default:
      return theme.textMuted;
  }
}
