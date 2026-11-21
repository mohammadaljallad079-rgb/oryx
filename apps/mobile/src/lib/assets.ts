/**
 * Bundled image registry.
 *
 * React Native resolves an image at bundle time, so `require` needs a literal
 * path — a computed string cannot be bundled. This module is the single place
 * that maps a stable key to a literal, so demo data and screens refer to
 * `PhotoKey` and never to a file path.
 *
 * The photography is the same set the customer website already uses, with its
 * licences recorded in `docs/audit/execution-07-media-licenses.json`. The brand
 * marks are the approved ORYX logo, not a redrawn substitute.
 */

import type { ImageSourcePropType } from 'react-native';

import type { PhotoKey } from '../demo/catalogue';

/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles an image
   only when `require` receives a literal path; a computed string cannot be
   resolved at build time. This module exists precisely to hold those literals. */

export const PHOTOS: Record<PhotoKey, ImageSourcePropType> = {
  autoService: require('../../assets/media/auto-service.jpg'),
  inspectionBay: require('../../assets/media/inspection-bay.jpg'),
  mechanicEngine: require('../../assets/media/mechanic-engine.jpg'),
  partsStore: require('../../assets/media/parts-store.jpg'),
  recoveryTow: require('../../assets/media/recovery-tow.jpg'),
  carwashPremium: require('../../assets/media/carwash-premium.jpg'),
  garageInterior: require('../../assets/media/garage-interior.jpg'),
  goldenHourHero: require('../../assets/media/golden-hour-hero.jpg'),
  heroApproved: require('../../assets/media/hero-approved.jpg'),
  splashScene: require('../../assets/media/splash-scene.jpg'),
  garageBrastad: require('../../assets/media/garage-brastad.jpg'),
  workshopArtdeco: require('../../assets/media/workshop-artdeco.jpg'),
  evCharging: require('../../assets/media/ev-charging.jpg'),
};

/** The smaller variant, for cards and rails where the full size is wasteful. */
export const PHOTOS_SMALL: Record<PhotoKey, ImageSourcePropType> = {
  autoService: require('../../assets/media/auto-service-sm.jpg'),
  inspectionBay: require('../../assets/media/inspection-bay-sm.jpg'),
  mechanicEngine: require('../../assets/media/mechanic-engine-sm.jpg'),
  partsStore: require('../../assets/media/parts-store-sm.jpg'),
  recoveryTow: require('../../assets/media/recovery-tow-sm.jpg'),
  carwashPremium: require('../../assets/media/carwash-premium-sm.jpg'),
  garageInterior: require('../../assets/media/garage-interior-sm.jpg'),
  goldenHourHero: require('../../assets/media/golden-hour-hero-sm.jpg'),
  heroApproved: require('../../assets/media/hero-approved-sm.jpg'),
  splashScene: require('../../assets/media/splash-scene-sm.jpg'),
  garageBrastad: require('../../assets/media/garage-brastad-sm.jpg'),
  workshopArtdeco: require('../../assets/media/workshop-artdeco-sm.jpg'),
  evCharging: require('../../assets/media/ev-charging-sm.jpg'),
};

/** The approved ORYX wordmark, in both colourways. */
export const LOGO = {
  onDark: require('../../assets/brand/oryx-logo-on-dark.png'),
  onLight: require('../../assets/brand/oryx-logo-on-light.png'),
} as const;

export function photo(key: PhotoKey): ImageSourcePropType {
  return PHOTOS[key] ?? PHOTOS.autoService;
}

export function photoSmall(key: PhotoKey): ImageSourcePropType {
  return PHOTOS_SMALL[key] ?? PHOTOS_SMALL.autoService;
}
