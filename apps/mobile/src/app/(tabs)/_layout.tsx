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
 * Five destinations, in the order the approved mockup sets out: home, categories,
 * search, bookings and the profile. The reference's bottom bar is a plain navy
 * strip with a gold active item and no gold on the inactive ones, which is what
 * this renders.
 *
 * Everything else — a product detail, the cart, checkout, recovery, orders — is
 * pushed onto the stack, so each of those routes lives outside this group. Expo
 * Router turns *every* file under a tab group into a tab, so a route that belongs
 * on the stack must not be here at all; `tabs.test.ts` enforces that.
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
          borderTopWidth: 1,
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
        name="categories"
        options={{
          title: t('tabCategories'),
          tabBarIcon: ({ color }) => <TabIcon glyph="▦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabSearch'),
          tabBarIcon: ({ color }) => <TabIcon glyph="⌕" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('tabBookings'),
          tabBarIcon: ({ color }) => <TabIcon glyph="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabProfile'),
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
    </Tabs>
  );
}
