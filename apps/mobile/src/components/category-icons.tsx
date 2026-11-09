import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The service-category icons, drawn as vectors.
 *
 * The approved reference names the five icons exactly — gear, wrench, inspection
 * document, tow truck, alloy wheel — and forbids emoji or illustrated
 * substitutes. These are the paths for those five shapes, so the icon is the
 * same on every device and scales without blurring.
 *
 * Every icon is a single `fill` colour, which the caller sets to the theme gold,
 * so they follow the palette rather than carrying their own.
 */
export type CategoryIconName =
  | 'gear'
  | 'wrench'
  | 'inspection'
  | 'towTruck'
  | 'wheel';

export function CategoryIcon({
  name,
  size = 26,
  color,
}: {
  name: CategoryIconName;
  size?: number;
  color: string;
}) {
  const common = { fill: color };
  const stroke = { stroke: color, strokeWidth: 1.6, fill: 'none' as const };

  switch (name) {
    // A cogwheel: eight teeth around a hub, with a dark centre.
    case 'gear':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            {...common}
            d="M12 1.6l1.5 2.2 2.6-.7.6 2.6 2.6.6-.7 2.6 2.2 1.5-2.2 1.5.7 2.6-2.6.6-.6 2.6-2.6-.7L12 22.4l-1.5-2.2-2.6.7-.6-2.6-2.6-.6.7-2.6L3.2 13.6l2.2-1.5-.7-2.6 2.6-.6.6-2.6 2.6.7L12 1.6z"
          />
          <Circle cx="12" cy="12" r="3.4" fill="#00162B" />
        </Svg>
      );

    // A diagonal spanner with an open jaw at the top and a ring at the bottom.
    case 'wrench':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            {...common}
            d="M15.9 2.1a5.2 5.2 0 00-4.6 7.6L3 18v3h3l8.3-8.3a5.2 5.2 0 007.6-4.6l-3 1.7-2.5-.7-.7-2.5 3.2-1.5z"
          />
          <Circle cx="6" cy="18.6" r="1.5" fill="#00162B" />
        </Svg>
      );

    // An inspection sheet with lines of text and a magnifier over it.
    case 'inspection':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...common} d="M4 2.5h11l4.5 4.5v8.2l-2-2V8h-3.5V4.5H6v15h6.3l1.9 1.9H4V2.5z" />
          <Rect x="7" y="8" width="6.5" height="1.5" rx="0.7" {...common} />
          <Rect x="7" y="11.5" width="5" height="1.5" rx="0.7" {...common} />
          <Circle cx="15.8" cy="16.2" r="3.1" {...stroke} />
          <Path {...stroke} d="M18.1 18.5l3.1 3.1" />
        </Svg>
      );

    // A flatbed tow truck: cab, bed, and two wheel arches.
    case 'towTruck':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            {...common}
            d="M2 6.5h6.2v4.2H5.1l-1.6 2.4H2V6.5zm0 8.2h2.1a2.5 2.5 0 004.9 0h2.4V6.5H8.9v4.2h3.2v4h3.4l3.1-3.9h1.9v-1.9h-2.7L15.6 11h-1.9V6.5H11v1.9h1.9v1.9H11v4.4h-.4a2.5 2.5 0 00-4.6 0H4.4v1.9H2v-1.9z"
          />
          <Circle cx="6.6" cy="17.4" r="2.2" fill="#00162B" />
          <Circle cx="6.6" cy="17.4" r="0.9" {...common} />
          <Path {...common} d="M14.2 3.2h5.6l2.2 3.3h-7.8V3.2z" />
        </Svg>
      );

    // An alloy wheel: rim, five spokes and a hub.
    case 'wheel':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            {...common}
            d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2.2a7.8 7.8 0 017.7 6.6h-4.2a3.8 3.8 0 00-2.3-2.3V4.2c-.4-.1-.8-.1-1.2 0v4.3a3.8 3.8 0 00-2.3 2.3H5.5A7.8 7.8 0 0112 4.2z"
          />
          <Circle cx="12" cy="12" r="2.6" fill="#00162B" />
          <Circle cx="12" cy="12" r="1.1" {...common} />
        </Svg>
      );
  }
}
