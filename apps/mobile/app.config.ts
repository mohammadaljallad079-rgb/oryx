import type { ExpoConfig } from 'expo/config';

/**
 * ORYX Marketplace — the design-approval build.
 *
 * This application is the customer-facing marketplace: the parts shop, the
 * service and inspection directory, the SENSAGE vehicle check and the recovery
 * request flow, plus a merchant dashboard. It is the demo the owner reviews
 * before any backend work begins, so it runs entirely on local demo data.
 *
 * It is deliberately a *separate* bundle from the ORYX ERP staff application
 * (`apps/mobile-erp`) and from the customer website, so installing it cannot
 * disturb either. The package name is the identifier the owner must hold before
 * a store submission; nothing here is signing material.
 */
const config: ExpoConfig = {
  name: 'ORYX Marketplace',
  slug: 'oryx-marketplace',
  version: '1.0.4',
  orientation: 'portrait',
  scheme: 'oryx-marketplace',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: './assets/icon.png',
  locales: {
    ar: './assets/locales/ar.json',
    en: './assets/locales/en.json',
  },
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#00162b',
  },
  android: {
    package: 'com.oryx.marketplace',
    versionCode: 4,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#00162b',
    },
    edgeToEdgeEnabled: true,
    permissions: ['POST_NOTIFICATIONS', 'INTERNET'],
  },
  ios: {
    bundleIdentifier: 'com.oryx.marketplace',
    buildNumber: '4',
    supportsTablet: true,
    infoPlist: {
      // Arabic is the primary market language; English remains a fallback.
      CFBundleDevelopmentRegion: 'ar',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-notifications',
      {
        color: '#d4af37',
      },
    ],
  ],
  experiments: {
    // Typed routes are off on purpose. This is a self-contained demo build and
    // generated route types are not committed, so leaving them on would make a
    // clean checkout typecheck differently from a developer machine.
    typedRoutes: false,
    baseUrl: process.env.EXPO_BASE_PATH || undefined,
  },
  extra: {
    // Present for the eventual API wiring; the demo never reads it.
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api',
    demoBuild: true,
  },
};

export default config;
