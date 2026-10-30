import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useApp } from '../../lib/app-context';
import { useMerchantSession } from '../../lib/merchant-session';
import { Screen, StateView } from '../../components/ui';
import { typography } from '../../lib/theme';

/** A tab glyph tinted with the theme accent; the demo ships no icon set. */
function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

/**
 * The merchant shell.
 *
 * Five destinations for the store owner: the dashboard, the catalogue, orders,
 * the service side (bookings and recovery) and the store profile. The bar is the
 * same tokens as the customer shell, so the merchant side reads as the same
 * product rather than a separate tool.
 *
 * Two ways in are allowed, and they are distinct:
 *
 *   - a **live merchant session** — a staff account linked to a provider, signed
 *     in against the real API. This is the real path.
 *   - the **demo merchant** — the local, offline role the review build offers.
 *
 * Anything else is sent to the merchant sign-in rather than the customer login,
 * because a customer is not a merchant and the portal's calls would all fail.
 *
 * Expo Router registers every file in this directory as a tab, so the plan and
 * the promotions screens — which are pushed, not destinations — need an explicit
 * `href: null` or they render as stray tabs labelled with their raw route names.
 */
export default function MerchantLayout() {
  const { ready, account, theme, t } = useApp();
  const { isSignedIn, status } = useMerchantSession();

  if (!ready) {
    return (
      <Screen scroll={false}>
        <StateView kind="loading" />
      </Screen>
    );
  }

  const demoMerchant = account?.role === 'merchant';
  if (!demoMerchant && !isSignedIn) {
    // A live session that is still being restored is not a reason to bounce the
    // user out; wait for it to settle first.
    if (status === 'restoring') {
      return (
        <Screen scroll={false}>
          <StateView kind="loading" />
        </Screen>
      );
    }
    return <Redirect href="/merchant-login" />;
  }

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
        name="dashboard"
        options={{ title: t('merchantDashboard'), tabBarIcon: ({ color }) => <TabIcon glyph="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="products"
        options={{ title: t('products'), tabBarIcon: ({ color }) => <TabIcon glyph="▦" color={color} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t('myOrders'), tabBarIcon: ({ color }) => <TabIcon glyph="⛃" color={color} /> }}
      />
      <Tabs.Screen
        name="services"
        options={{ title: t('services'), tabBarIcon: ({ color }) => <TabIcon glyph="✦" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('storeProfile'), tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} /> }}
      />
      {/* Pushed screens. Expo Router registers every file in this directory as a
          tab, so each one that is not a tab needs an explicit `href: null` or it
          renders as a stray tab labelled with its raw route name. */}
      <Tabs.Screen name="plan" options={{ href: null }} />
      <Tabs.Screen name="promotions" options={{ href: null }} />
    </Tabs>
  );
}
