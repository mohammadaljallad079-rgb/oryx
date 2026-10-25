import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from '../lib/app-context';

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
 */
function RootNavigator() {
  const { theme } = useApp();
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
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
