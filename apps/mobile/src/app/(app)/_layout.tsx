import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useApp } from '../../lib/app-context';
import { Screen, StateView } from '../../components/ui';

/**
 * Tab icon.
 *
 * The approved ORYX identity has no bundled icon set and the official logo is not
 * in the repository, so the tabs use a plain glyph rather than inventing brand
 * marks. Replace with the licensed icon set when it is supplied.
 */
function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

/**
 * Authenticated shell.
 *
 * The guard is a redirect rather than a hidden screen: the API rejects an
 * unauthenticated call regardless, so this only avoids rendering a broken tab
 * while the keychain is empty.
 */
export default function AppLayout() {
  const { ready, profile, theme, t } = useApp();

  if (!ready) return <Screen scroll={false}><StateView kind="loading" /></Screen>;
  if (!profile) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.gold,
        tabBarInactiveTintColor: theme.textFaint,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          headerTitle: t('appName'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◆" color={color} />,
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: t('garage'),
          tabBarIcon: ({ color }) => <TabIcon glyph="▤" color={color} />,
        }}
      />
      {/*
        Expo Router registers every file under this directory as a tab, so each
        route that is only pushed onto the stack (the booking wizard, the garage
        and provider detail screens, invoices, notifications) has to be declared
        with `href: null`. Without it the tab bar renders ten entries and the
        labels show raw route names. The name is the flattened file path, which
        is why the bookings index is `bookings/index`, not `bookings`.
      */}
      <Tabs.Screen
        name="bookings/index"
        options={{
          title: t('bookings'),
          tabBarIcon: ({ color }) => <TabIcon glyph="▦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t('services'),
          tabBarIcon: ({ color }) => <TabIcon glyph="✦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />

      <Tabs.Screen name="bookings/new" options={{ href: null }} />
      <Tabs.Screen name="garage/[id]" options={{ href: null }} />
      <Tabs.Screen name="providers/[id]" options={{ href: null }} />
      <Tabs.Screen name="invoices" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}
