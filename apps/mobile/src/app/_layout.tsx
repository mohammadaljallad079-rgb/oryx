import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from '../lib/app-context';
import { LiveCartProvider } from '../lib/live-cart';
import { LiveFavoritesProvider } from '../lib/live-favorites';
import { LiveSessionProvider } from '../lib/live-session';
import { LiveBookingsProvider } from '../lib/live-bookings';
import { LiveOrdersProvider } from '../lib/live-orders';
import { LiveRequestsProvider } from '../lib/live-requests';
import { MerchantSessionProvider } from '../lib/merchant-session';
import { LaunchScreen } from '../components/launch';

/**
 * Root layout.
 *
 * The theme is read inside `RootNavigator` because `AppProvider` owns it; the
 * navigator therefore re-renders when the user switches theme, and the header
 * and screen background follow without a restart.
 *
 * Every screen below the two shells is declared here with `headerShown: false`.
 * They render their own `ScreenHeader`, which carries a back control, so a
 * second platform header would be a duplicate.
 *
 * Until the stored session has been read the app shows `LaunchScreen` rather
 * than an empty themed page. Android 12 and later draw a photographic splash
 * only on older releases, so this is what carries the brand through start-up on
 * a current device.
 */
function RootNavigator() {
  const { theme, ready } = useApp();

  if (!ready) {
    return (
      <>
        <StatusBar style="light" />
        <LaunchScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bg },
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="merchant" />
        <Stack.Screen name="merchant-login" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        {/* The live session wraps everything that talks to the API, because the
            cart, favourites and bookings all need the access token it installs.
            It sits outside the navigator so a single restore happens per launch
            rather than once per screen. */}
        <LiveSessionProvider>
          <LiveCartProvider>
            <LiveFavoritesProvider>
              <LiveBookingsProvider>
                <LiveOrdersProvider>
                  <LiveRequestsProvider>
                    <MerchantSessionProvider>
                      <RootNavigator />
                    </MerchantSessionProvider>
                  </LiveRequestsProvider>
                </LiveOrdersProvider>
              </LiveBookingsProvider>
            </LiveFavoritesProvider>
          </LiveCartProvider>
        </LiveSessionProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
