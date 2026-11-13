import type { SVGProps } from 'react';

/**
 * Minimal inline icon set. Icons are drawn as stroked paths so they inherit
 * the current colour and stay legible on both the navy and light themes.
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
  gauge: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 14 8.5 9.5" />
      <circle cx="12" cy="14" r="1" />
      <path d="M3.5 18a9 9 0 1 1 17 0" />
    </Base>
  ),
  building: (p: IconProps) => (
    <Base {...p}>
      <rect x="4" y="3" width="10" height="18" rx="1.5" />
      <path d="M14 8h5.5a.5.5 0 0 1 .5.5V21" />
      <path d="M7 7h4M7 11h4M7 15h4M17 12h1M17 16h1" />
    </Base>
  ),
  mapPin: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Base>
  ),
  calculator: (p: IconProps) => (
    <Base {...p}>
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <path d="M8 7h8M8 11.5h2M12 11.5h2M16 11.5h.01M8 15.5h2M12 15.5h2M16 15.5h.01M8 19h6" />
    </Base>
  ),
  cart: (p: IconProps) => (
    <Base {...p}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </Base>
  ),
  truck: (p: IconProps) => (
    <Base {...p}>
      <path d="M2.5 6.5h10v9h-10z" />
      <path d="M12.5 10h4l3 3v2.5h-7z" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </Base>
  ),
  warehouse: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 21V9.5L12 4l9 5.5V21" />
      <path d="M8 21v-7h8v7" />
      <path d="M8 17h8" />
    </Base>
  ),
  users: (p: IconProps) => (
    <Base {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 5.5a3 3 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-1.6-4.3" />
    </Base>
  ),
  heart: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 20s-7-4.4-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6c0 5-7 9.4-7 9.4Z" />
    </Base>
  ),
  settings: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.4 10H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </Base>
  ),
  clipboardCheck: (p: IconProps) => (
    <Base {...p}>
      <path d="M9 3.5h6v3H9z" />
      <path d="M15 5h2.5A1.5 1.5 0 0 1 19 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V6.5A1.5 1.5 0 0 1 6.5 5H9" />
      <path d="M9 13.5l2 2 4-4" />
    </Base>
  ),
  wrench: (p: IconProps) => (
    <Base {...p}>
      <path d="M15.5 3.5a5 5 0 0 0-4.3 7.5L3.5 18.7a2 2 0 0 0 2.8 2.8l7.7-7.7a5 5 0 0 0 6.3-6.6l-3 3-2.8-.7-.7-2.8Z" />
    </Base>
  ),
  package: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7Z" />
      <path d="M3.5 7 12 11.4 20.5 7M12 11.4v9.8" />
    </Base>
  ),
  barChart: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="7.5" y="12" width="3" height="5" rx="0.6" />
      <rect x="12.5" y="8" width="3" height="9" rx="0.6" />
      <rect x="17" y="5" width="3" height="12" rx="0.6" />
    </Base>
  ),
  shield: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 2.8 20 6v6c0 5-3.4 8.4-8 9.6-4.6-1.2-8-4.6-8-9.6V6Z" />
      <path d="M9 12.2l2 2 4-4.2" />
    </Base>
  ),
  creditCard: (p: IconProps) => (
    <Base {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.4" />
      <path d="M2.5 10h19M6.5 15h3" />
    </Base>
  ),
  sliders: (p: IconProps) => (
    <Base {...p}>
      <path d="M5 20V13M5 9V4M12 20v-9M12 7V4M19 20v-5M19 11V4" />
      <circle cx="5" cy="11" r="1.7" />
      <circle cx="12" cy="9.5" r="1.7" />
      <circle cx="19" cy="13" r="1.7" />
    </Base>
  ),
  globe: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </Base>
  ),
  smartphone: (p: IconProps) => (
    <Base {...p}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M10.8 5.6h2.4M11 18.6h2" />
    </Base>
  ),
  flag: (p: IconProps) => (
    <Base {...p}>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.8h11l-2.2 3.4 2.2 3.4H5.5" />
    </Base>
  ),
  plug: (p: IconProps) => (
    <Base {...p}>
      <path d="M9 2.8v5M15 2.8v5" />
      <path d="M6.5 7.8h11v3.4a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 16.7V21" />
    </Base>
  ),
  lifeBuoy: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M5.6 5.6l3.8 3.8M14.6 14.6l3.8 3.8M18.4 5.6l-3.8 3.8M9.4 14.6l-3.8 3.8" />
    </Base>
  ),
  scroll: (p: IconProps) => (
    <Base {...p}>
      <path d="M5 4.5h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2Z" />
      <path d="M8.5 8.5h6M8.5 12h6M8.5 15.5h3.5" />
    </Base>
  ),
  search: (p: IconProps) => (
    <Base {...p}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.4 15.4 20 20" />
    </Base>
  ),
  plus: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  ),
  check: (p: IconProps) => (
    <Base {...p}>
      <path d="M4.5 12.5 9 17l10.5-10.5" />
    </Base>
  ),
  close: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
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
  logout: (p: IconProps) => (
    <Base {...p}>
      <path d="M15 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H15" />
      <path d="M14.5 12H21M18 9l3 3-3 3" />
    </Base>
  ),
  chevronDown: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 9.5 12 15l6-5.5" />
    </Base>
  ),
  alert: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5 21.5 20H2.5Z" />
      <path d="M12 10v4.2M12 17.2h.01" />
    </Base>
  ),
  info: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8h.01" />
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
  chevronsLeft: (p: IconProps) => (
    <Base {...p}>
      <path d="M11 17l-5-5 5-5" />
      <path d="M18 17l-5-5 5-5" />
    </Base>
  ),
  chevronsRight: (p: IconProps) => (
    <Base {...p}>
      <path d="M13 7l5 5-5 5" />
      <path d="M6 7l5 5-5 5" />
    </Base>
  ),
  calendar: (p: IconProps) => (
    <Base {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Base>
  ),
  store: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M3 6.5 4.6 3h14.8L21 6.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
      <path d="M9 20v-5h6v5" />
    </Base>
  ),
  eye: (p: IconProps) => (
    <Base {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Base>
  ),
  eyeOff: (p: IconProps) => (
    <Base {...p}>
      <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7" />
      <path d="M6.3 7.6A17 17 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </Base>
  ),
  tag: (p: IconProps) => (
    <Base {...p}>
      <path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7l9 9a1 1 0 0 1 0 1.4l-6.6 6.6a1 1 0 0 1-1.4 0Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </Base>
  ),
  bell: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Base>
  ),
  clock: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  ),
  star: (p: IconProps) => (
    <Base {...p}>
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9L3.5 9.7l5.9-.8Z" />
    </Base>
  ),
  target: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </Base>
  ),
  trend: (p: IconProps) => (
    <Base {...p}>
      <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
      <path d="M15 6.5h5.5V12" />
    </Base>
  ),
  wallet: (p: IconProps) => (
    <Base {...p}>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2v.5" />
      <rect x="3.5" y="7.5" width="17" height="11" rx="2" />
      <path d="M16 13h1.5" />
    </Base>
  ),
  folder: (p: IconProps) => (
    <Base {...p}>
      <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" />
    </Base>
  ),
  paperclip: (p: IconProps) => (
    <Base {...p}>
      <path d="M20 11.5 12.2 19.3a4.2 4.2 0 0 1-6-6l7.6-7.6a2.8 2.8 0 0 1 4 4l-7.6 7.6a1.4 1.4 0 0 1-2-2l7-7" />
    </Base>
  ),
  list: (p: IconProps) => (
    <Base {...p}>
      <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </Base>
  ),
  refresh: (p: IconProps) => (
    <Base {...p}>
      <path d="M20 11a8 8 0 1 0-.6 4" />
      <path d="M20 4.5V11h-6.5" />
    </Base>
  ),
  download: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5v11" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </Base>
  ),
  print: (p: IconProps) => (
    <Base {...p}>
      <path d="M7 9V3.5h10V9" />
      <rect x="4" y="9" width="16" height="7.5" rx="1.5" />
      <path d="M7 16.5h10V21H7z" />
    </Base>
  ),
  edit: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="m14 6 4 4" />
    </Base>
  ),
  trash: (p: IconProps) => (
    <Base {...p}>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V4h5v2.5" />
      <path d="M6.5 6.5 7.5 20h9l1-13.5" />
      <path d="M10.5 10v6M13.5 10v6" />
    </Base>
  ),
  sparkles: (p: IconProps) => (
    <Base {...p}>
      <path d="m12 3.5 1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6Z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </Base>
  ),
  archive: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 7.5h16v12H4z" />
      <path d="M3 4.5h18v3H3z" />
      <path d="M9.5 12h5" />
    </Base>
  ),
  activity: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />
    </Base>
  ),
  layers: (p: IconProps) => (
    <Base {...p}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </Base>
  ),
  chart: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Base>
  ),
  file: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 2.5h7l5 5V21.5H6z" />
      <path d="M13 2.5v5h5" />
    </Base>
  ),
  message: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 5h16v11H9l-5 4z" />
    </Base>
  ),
  checkSquare: (p: IconProps) => (
    <Base {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="m8 12 2.5 2.5L16 9" />
    </Base>
  ),
  scale: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3v18M7 21h10M12 6l7 2-3.5 6H8.5L5 8z" />
    </Base>
  ),
  play: (p: IconProps) => (
    <Base {...p}>
      <path d="M7 4.5 19 12 7 19.5z" />
    </Base>
  ),
  grid: (p: IconProps) => (
    <Base {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </Base>
  ),
  boxes: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 7.5 7.5 5 12 7.5 7.5 10z" />
      <path d="M12 16.5 16.5 14 21 16.5 16.5 19z" />
      <path d="M3 16.5 7.5 14 12 16.5 7.5 19z" />
      <path d="M7.5 10v4M16.5 7v4" />
    </Base>
  ),
  cash: (p: IconProps) => (
    <Base {...p}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4M18 10v4" />
    </Base>
  ),
} as const;

export type IconName = keyof typeof Icons;

export function Icon({ name, ...rest }: { name: string } & IconProps) {
  const Component = (Icons as Record<string, (p: IconProps) => React.ReactElement>)[name] ?? Icons.gauge;
  return <Component {...rest} />;
}
