import type { ExpoConfig } from 'expo/config';

/**
 * ORYX customer mobile application.
 *
 * The bundle identifier and package name are the ones the owner must own before
 * any store submission; they are declared here so `expo prebuild` produces
 * verifiable Android and iOS projects. No signing material is committed.
 */
const config: ExpoConfig = {
  name: 'ORYX',
  slug: 'oryx-customer',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'oryx',
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
    package: 'com.oryx.customer',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#00162b',
    },
    edgeToEdgeEnabled: true,
    permissions: ['POST_NOTIFICATIONS', 'INTERNET'],
  },
  ios: {
    bundleIdentifier: 'com.oryx.customer',
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
  },
  extra: {
    // Overridable at build time with EXPO_PUBLIC_API_BASE_URL.
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api',
  },
};

export default config;
