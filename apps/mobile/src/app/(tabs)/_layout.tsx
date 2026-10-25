import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useApp } from '../../lib/app-context';
import { Screen, StateView } from '../../components/ui';
import { typography } from '../../lib/theme';

/**
 * Tab icon.
 *
 * The approved identity ships no icon set, so the bar uses a plain glyph tinted
 * with the theme accent rather than an invented brand mark. The glyph is a
 * property of the tab, not a decoration, so it stays legible in both themes.
 */
function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

/**
 * The customer shell.
 *
 * Five destinations, as the brief sets out: home, parts, services, SENSAGE and
 * the account. Recovery, cart, orders and the rest are pushed onto the stack, so
 * each of them is declared with `href: null` — Expo Router otherwise renders
 * every file under this directory as an extra tab.
 */
export default function TabsLayout() {
  const { ready, account, theme, t } = useApp();

  if (!ready) {
    return (
      <Screen scroll={false}>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!account) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.gold,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarLabelStyle: { fontSize: typography.caption, fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          tabBarIcon: ({ color }) => <TabIcon glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="parts"
        options={{
          title: t('parts'),
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
        name="sensage"
        options={{
          title: t('sensage'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
    </Tabs>
  );
}
