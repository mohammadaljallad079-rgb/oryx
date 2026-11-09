import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The interface icons, drawn as vectors.
 *
 * The specification forbids emoji and requires "modern outlined icons". These
 * are thin-line paths, each taking its colour from the caller, so they follow
 * the theme and stay sharp at any size.
 *
 * `filled` is used only where the design calls for a solid glyph — the active
 * Home tab — and outlines everywhere else.
 */
export type UiIconName =
  | 'bell'
  | 'cart'
  | 'sliders'
  | 'house'
  | 'grid'
  | 'search'
  | 'calendar'
  | 'person'
  | 'heart'
  | 'chevron'
  | 'star'
  | 'arrowCircle';

export function UiIcon({
  name,
  size = 24,
  color,
  filled = false,
}: {
  name: UiIconName;
  size?: number;
  color: string;
  filled?: boolean;
}) {
  const line = {
    stroke: color,
    strokeWidth: 1.6,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const solid = { fill: color };

  switch (name) {
    // Notification bell.
    case 'bell':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...line} d="M6 10a6 6 0 1112 0c0 3 .8 4.6 1.6 5.6H4.4C5.2 14.6 6 13 6 10z" />
          <Path {...line} d="M10 19a2.2 2.2 0 004 0" />
        </Svg>
      );

    // Shopping cart.
    case 'cart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...line} d="M3 4h2.2l2.4 11h9.6l2.3-8H6" />
          <Circle {...line} cx="9" cy="19" r="1.5" />
          <Circle {...line} cx="17" cy="19" r="1.5" />
        </Svg>
      );

    // Three horizontal adjustment sliders with knobs — the filter control the
    // specification asks for, not a funnel.
    case 'sliders':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...line} d="M3 7h18M3 12h18M3 17h18" />
          <Circle cx="9" cy="7" r="2" fill={color} />
          <Circle cx="15" cy="12" r="2" fill={color} />
          <Circle cx="8" cy="17" r="2" fill={color} />
        </Svg>
      );

    // Home: a filled house when active, an outline otherwise.
    case 'house':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {filled ? (
            <Path {...solid} d="M12 3.2l8.4 6.9V21h-6v-6h-4.8v6h-6V10.1L12 3.2z" />
          ) : (
            <Path {...line} d="M3.6 10.4L12 3.6l8.4 6.8V20a1 1 0 01-1 1h-4.6v-5.8H9.2V21H4.6a1 1 0 01-1-1v-9.6z" />
          )}
        </Svg>
      );

    // Categories: four rounded squares in a 2x2 grid.
    case 'grid':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect {...line} x="3.5" y="3.5" width="7.5" height="7.5" rx="2.2" />
          <Rect {...line} x="13" y="3.5" width="7.5" height="7.5" rx="2.2" />
          <Rect {...line} x="3.5" y="13" width="7.5" height="7.5" rx="2.2" />
          <Rect {...line} x="13" y="13" width="7.5" height="7.5" rx="2.2" />
        </Svg>
      );

    // Search: a magnifying glass.
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle {...line} cx="10.5" cy="10.5" r="6.5" />
          <Path {...line} d="M15.4 15.4L21 21" />
        </Svg>
      );

    // Bookings: a calendar with a check.
    case 'calendar':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect {...line} x="3.5" y="5" width="17" height="15.5" rx="2.4" />
          <Path {...line} d="M3.5 9.6h17M8 3.4v3.2M16 3.4v3.2" />
          <Path {...line} d="M8.8 15.2l2.2 2.2 4-4.4" />
        </Svg>
      );

    // Profile: a person.
    case 'person':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle {...line} cx="12" cy="8.2" r="3.9" />
          <Path {...line} d="M4.8 20.4a7.4 7.4 0 0114.4 0" />
        </Svg>
      );

    // Favourite: a heart outline.
    case 'heart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            {...line}
            d="M12 20.4l-1.3-1.2C6 15 3 12.3 3 8.9 3 6.4 5 4.5 7.4 4.5c1.5 0 2.9.7 3.8 1.9l.8 1 .8-1c.9-1.2 2.3-1.9 3.8-1.9 2.4 0 4.4 1.9 4.4 4.4 0 3.4-3 6.1-7.7 10.3L12 20.4z"
          />
        </Svg>
      );

    // A directional chevron, flipped by the caller for RTL.
    case 'chevron':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...line} d="M9 5l7 7-7 7" />
        </Svg>
      );

    // A rating star.
    case 'star':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            {...solid}
            d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.3l6.1-.9L12 2.8z"
          />
        </Svg>
      );

    // A small circular arrow button for the promotional cards.
    case 'arrowCircle':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="11" fill={color} />
          <Path d="M10.2 7.4l4.6 4.6-4.6 4.6" stroke="#00162B" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
  }
}
