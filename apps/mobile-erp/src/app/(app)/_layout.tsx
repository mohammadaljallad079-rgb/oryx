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
 *
 * Expo Router registers every file under this directory as a tab, so each route
 * that is only pushed onto the stack (a record list, the invoice builder, the
 * transfer builder) is declared with `href: null`. Without that the tab bar
 * shows raw route names as extra entries.
 */
export default function AppLayout() {
  const { ready, user, theme, t } = useApp();

  if (!ready) {
    return (
      <Screen scroll={false}>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!user) return <Redirect href="/(auth)/login" />;

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
          title: t('dashboard'),
          headerTitle: t('appName'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◆" color={color} />,
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: t('browse'),
          tabBarIcon: ({ color }) => <TabIcon glyph="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="invoice"
        options={{
          title: t('newInvoice'),
          tabBarIcon: ({ color }) => <TabIcon glyph="▦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="transfer"
        options={{
          title: t('transfer'),
          tabBarIcon: ({ color }) => <TabIcon glyph="⇄" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />

      {/* Reached from the records hub, so it must not become a tab. */}
      <Tabs.Screen name="browse/[resource]" options={{ href: null }} />
    </Tabs>
  );
}
