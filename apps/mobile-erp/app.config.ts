import type { ExpoConfig } from 'expo/config';

/**
 * ORYX ERP mobile application (staff).
 *
 * A separate application from the customer app on purpose: it signs into the
 * staff plane, carries company/branch scope and shows operational and financial
 * data, so it must not share a bundle identity with the consumer app the owner
 * has already approved. `com.oryx.erp` is the identifier the owner must hold
 * before any store submission; nothing here is signing material.
 */
const config: ExpoConfig = {
  name: 'ORYX ERP',
  slug: 'oryx-erp',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'oryx-erp',
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
    package: 'com.oryx.erp',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#00162b',
    },
    edgeToEdgeEnabled: true,
    permissions: ['POST_NOTIFICATIONS', 'INTERNET'],
  },
  ios: {
    bundleIdentifier: 'com.oryx.erp',
    buildNumber: '1',
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
    typedRoutes: true,
    baseUrl: process.env.EXPO_BASE_PATH || undefined,
  },
  extra: {
    // Overridable at build time with EXPO_PUBLIC_API_BASE_URL.
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api',
  },
};

export default config;
