import { Redirect, Tabs } from 'expo-router';


import { useApp } from '../../lib/app-context';
import { Screen, StateView } from '../../components/ui';
import { UiIcon, type UiIconName } from '../../components/ui-icons';


/**
 * A tab icon.
 *
 * Thin-line vectors, per the specification: a filled gold house for the active
 * Home tab and outlines elsewhere. The glyphs this replaced were text
 * characters, which rendered differently on every device.
 */
function TabIcon({
  name,
  color,
  focused,
}: {
  name: UiIconName;
  color: string;
  focused: boolean;
}) {
  // Only the house is filled when active; the rest stay outlined so the bar
  // does not read as five solid blocks.
  return <UiIcon name={name} size={25} color={color} filled={focused && name === 'house'} />;
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
          backgroundColor: theme.bgDeep,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: 66,
          paddingTop: 6,
          paddingBottom: 6,
        },
        tabBarActiveTintColor: theme.gold,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        tabBarItemStyle: { paddingVertical: 2 },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="house" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: t('tabCategories'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="grid" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabSearch'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="search" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('tabBookings'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="calendar" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tabProfile'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="person" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
