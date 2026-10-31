/**
 * ORYX ERP mobile design tokens.
 *
 * The same approved identity as the control plane and the customer website.
 * The dark palette mirrors `apps/customer/src/app/globals.css` and the light
 * palette uses that file's approved ivory tokens verbatim — an ivory page
 * (`#f7f4ed`), white cards, deep charcoal type (`#22201d`) and a deeper,
 * legible gold (`#7d5f10`). The gold is deliberately not the dark theme's
 * `#d4af37`: on ivory that value does not reach a usable contrast ratio.
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
  /** Text placed on a gold fill. */
  onGold: string;
  navy: string;
  gold: string;
  goldSoft: string;
  goldDeep: string;
  /** Soft gold wash for a selected row or an active segment. */
  tint: string;
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
  textFaint: '#778da1',
  onGold: '#00121f',
  navy: '#00162b',
  gold: '#d4af37',
  goldSoft: '#e8c766',
  goldDeep: '#a9861f',
  tint: 'rgba(212, 175, 55, 0.12)',
  success: '#3ecf8e',
  warning: '#f0b429',
  danger: '#f2555a',
  info: '#4aa8ff',
};

const light: Theme = {
  mode: 'light',
  // Elegant ivory page with warm neutral surfaces, matching the approved site.
  bg: '#f7f4ed',
  bgDeep: '#efeae0',
  surface: '#ffffff',
  surfaceRaised: '#fbf9f4',
  surfaceHover: '#f4f0e8',
  border: 'rgba(36, 31, 20, 0.14)',
  borderSoft: 'rgba(36, 31, 20, 0.09)',
  borderStrong: 'rgba(125, 95, 16, 0.5)',
  // Deep charcoal typography rather than a tinted navy, so text stays crisp.
  text: '#22201d',
  textMuted: '#5a544b',
  textFaint: '#6b6459',
  onGold: '#241f14',
  navy: '#00162b',
  gold: '#7d5f10',
  goldSoft: '#d9b447',
  goldDeep: '#a9821c',
  tint: 'rgba(125, 95, 16, 0.08)',
  success: '#1a7f4f',
  warning: '#8a5a06',
  danger: '#b3261e',
  info: '#1d5fa8',
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

/**
 * Soft elevation for light mode.
 *
 * A dark theme separates surfaces with a border; an ivory page needs a shadow
 * or a white card disappears into it. Kept subtle so the result stays premium
 * rather than material.
 */
export function cardShadow(mode: ThemeMode) {
  if (mode === 'light') {
    return {
      shadowColor: '#3a301e',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    };
  }
  return {};
}

/** Status colours for documents, stock and workflow states. */
export function statusColor(theme: Theme, status: string): string {
  switch (status) {
    case 'POSTED':
    case 'PAID':
    case 'COMPLETED':
    case 'APPROVED':
    case 'CONFIRMED':
    case 'SUCCEEDED':
    case 'ACTIVE':
    case 'ISSUED':
      return theme.success;
    case 'DRAFT':
    case 'PENDING':
    case 'PARTIAL':
    case 'IN_PROGRESS':
    case 'SUBMITTED':
    case 'HELD':
    case 'NEW':
      return theme.warning;
    case 'CANCELLED':
    case 'REVERSED':
    case 'REJECTED':
    case 'VOID':
    case 'FAILED':
    case 'OVERDUE':
    case 'INACTIVE':
      return theme.danger;
    default:
      return theme.textMuted;
  }
}
