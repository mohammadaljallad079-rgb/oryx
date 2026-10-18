import type { SVGProps } from 'react';

/**
 * Inline icon set for the customer site.
 *
 * Same drawing language as the admin set — 24×24 stroked paths that inherit the
 * current colour, so they stay legible on both the navy and light themes. Kept
 * as a separate copy rather than a shared import because the customer app does
 * not depend on the admin workspace.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  shield: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 2.8 20 6v6c0 5-3.4 8.4-8 9.6-4.6-1.2-8-4.6-8-9.6V6Z" />
      <path d="M9 12.2l2 2 4-4.2" />
    </Base>
  ),
  calendar: (p: IconProps) => (
    <Base {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Base>
  ),
  car: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 14.5l1.6-4.4A2.5 2.5 0 0 1 7 8.5h10a2.5 2.5 0 0 1 2.4 1.6L21 14.5v4h-2.5v-1.5h-13V18.5H3Z" />
      <path d="M4 14.5h16" />
      <circle cx="7.5" cy="14.5" r="1.2" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </Base>
  ),
  wallet: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <rect x="3" y="7.5" width="18" height="11.5" rx="2.2" />
      <path d="M16 13.2h2.2" />
    </Base>
  ),
  check: (p: IconProps) => (
    <Base {...p}>
      <path d="M4.5 12.5 9 17l10.5-10.5" />
    </Base>
  ),
  star: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.7l5.9-.8Z" />
    </Base>
  ),
  lock: (p: IconProps) => (
    <Base {...p}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14v2.6" />
    </Base>
  ),
  headset: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <path d="M4 14.5h2.4a.8.8 0 0 1 .8.8v3.4a.8.8 0 0 1-.8.8H5.5A1.5 1.5 0 0 1 4 18Z" />
      <path d="M20 14.5h-2.4a.8.8 0 0 0-.8.8v3.4a.8.8 0 0 0 .8.8h.9a1.5 1.5 0 0 0 1.5-1.5Z" />
    </Base>
  ),
  arrow: (p: IconProps) => (
    <Base {...p}>
      <path d="M5 12h13" />
      <path d="M13 7l5 5-5 5" />
    </Base>
  ),
  chevron: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 9.5 12 15l6-5.5" />
    </Base>
  ),
  clock: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  ),
  bell: (p: IconProps) => (
    <Base {...p}>
      <path d="M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15Z" />
      <path d="M10 21h4" />
    </Base>
  ),
  file: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 3.5h7.5L18 8v12.5H6Z" />
      <path d="M13.5 3.5V8H18" />
    </Base>
  ),
  user: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Base>
  ),
  plus: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  ),
  search: (p: IconProps) => (
    <Base {...p}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.4 15.4 20 20" />
    </Base>
  ),
  logout: (p: IconProps) => (
    <Base {...p}>
      <path d="M15 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H15" />
      <path d="M14.5 12H21M18 9l3 3-3 3" />
    </Base>
  ),
  settings: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.4 10H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </Base>
  ),
  wrench: (p: IconProps) => (
    <Base {...p}>
      <path d="M15.5 3.5a5 5 0 0 0-4.3 7.5L3.5 18.7a2 2 0 0 0 2.8 2.8l7.7-7.7a5 5 0 0 0 6.3-6.6l-3 3-2.8-.7-.7-2.8Z" />
    </Base>
  ),
  clipboard: (p: IconProps) => (
    <Base {...p}>
      <path d="M9 3.5h6v3H9z" />
      <path d="M15 5h2.5A1.5 1.5 0 0 1 19 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V6.5A1.5 1.5 0 0 1 6.5 5H9" />
      <path d="M9 13.5l2 2 4-4" />
    </Base>
  ),
  sun: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </Base>
  ),
  moon: (p: IconProps) => (
    <Base {...p}>
      <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />
    </Base>
  ),
  menu: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  ),
  close: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  ),
  alert: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5 21.5 20H2.5Z" />
      <path d="M12 10v4.2M12 17.2h.01" />
    </Base>
  ),
} as const;

export type IconName = keyof typeof Icons;

export function Icon({ name, ...rest }: { name: string } & IconProps) {
  const Component = (Icons as Record<string, (p: IconProps) => React.ReactElement>)[name] ?? Icons.shield;
  return <Component {...rest} />;
}
