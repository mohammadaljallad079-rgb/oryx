import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useReloadOnFocus } from '../../lib/use-reload-on-focus';
import { useLiveSession } from '../../lib/live-session';
import { useLiveOrders } from '../../lib/live-orders';
import { vehiclesApi, type CustomerVehicle } from '../../lib/api';
import { customerVehicleToDemo, orderToDemo } from '../../lib/api-adapters';
import { AppHeader, DemoBanner, Monogram } from '../../components/brand';
import { OrderCard, VehicleCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  Heading,
  ListRow,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';

/**
 * The account hub.
 *
 * Everything the customer owns in one place: their profile, their cars, their
 * recent activity and the two settings that change the whole app — the language
 * and the theme. The settings are here rather than in a separate screen because
 * the brief asks for both to be reachable in the demo, and a nested settings
 * screen is one tap too far for a reviewer.
 */
export default function Account() {
  const { t, theme, account, locale, setLocale, themeMode, setThemeMode, switchRole, signOut, resetDemoData, dataVersion } =
    useApp();
  const session = useLiveSession();
  const liveOrders = useLiveOrders();
  const router = useRouter();
  const isLive = session.isLive;

  // The garage and the activity come from the API inside a live session and from
  // the local demo otherwise. The two are never blended, so a demo record cannot
  // appear beside a real one.
  const demoVehicles = useAsync(
    () => (account && !isLive ? repository.vehicles(account.id) : Promise.resolve([])),
    [account?.id, dataVersion, isLive],
  );
  const liveVehicles = useAsync(
    () => (isLive ? vehiclesApi.list() : Promise.resolve([] as CustomerVehicle[])),
    [isLive, dataVersion],
  );
  const demoOrders = useAsync(
    () => (account && !isLive ? repository.orders(account.id) : Promise.resolve([])),
    [account?.id, dataVersion, isLive],
  );
  const wallet = useAsync(
    () => (account && !isLive ? repository.wallet(account.id) : Promise.resolve([])),
    [account?.id, dataVersion, isLive],
  );

  // A vehicle registered from the push-on "add vehicle" screen, or an order
  // placed at checkout, changes server state this mounted tab cannot observe.
  useReloadOnFocus(() => {
    liveVehicles.reload();
    void liveOrders.refresh();
  }, isLive);

  // A guest with no demo account has nothing to show here; the sign-in screen is
  // the honest destination.
  if (!account && !isLive) return null;

  const vehicles = isLive
    ? (liveVehicles.data ?? []).map(customerVehicleToDemo)
    : (demoVehicles.data ?? []);
  const vehiclesLoading = isLive ? liveVehicles.loading : demoVehicles.loading;
  const orders = isLive ? liveOrders.items.map(orderToDemo) : (demoOrders.data ?? []);
  const ordersLoading = isLive ? liveOrders.loading : demoOrders.loading;

  const name = isLive
    ? session.account?.fullName ?? ''
    : locale === 'ar'
      ? account?.fullNameAr ?? ''
      : account?.fullNameEn ?? '';
  const email = isLive ? session.account?.email ?? '' : account?.email ?? '';
  const initials = isLive
    ? (session.account?.fullName ?? 'OR')
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : account?.avatarInitials ?? 'OR';

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        {isLive ? null : <DemoBanner />}

        <Card>
          <View style={styles.profileRow}>
            <Monogram initials={initials} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: typography.heading, fontWeight: '700' }}>
                {name}
              </Text>
              <Body size="caption" muted>
                {email}
              </Body>
              {isLive ? null : (
                <Body size="caption" muted>
                  {account?.phone}
                </Body>
              )}
            </View>
          </View>
        </Card>

        <SectionLabel>{t('myVehicles')}</SectionLabel>
        {vehiclesLoading ? (
          <StateView kind="loading" />
        ) : vehicles.length === 0 ? (
          <StateView kind="empty" message={t('noVehicles')} />
        ) : (
          vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onPress={() => router.push(`/vehicles/${vehicle.id}`)}
            />
          ))
        )}
        <Button title={t('addVehicle')} variant="secondary" onPress={() => router.push('/vehicles/new')} />

        {/* The wallet is a demo ledger. There is no customer wallet in the
            platform, so in a live session this block is not shown rather than
            presenting a local balance as a real one. */}
        {isLive ? null : (
          <>
            <SectionLabel>{t('wallet')}</SectionLabel>
            <Card>
              <View style={styles.balanceRow}>
                <View>
                  <Body size="caption" muted>
                    {t('walletBalance')}
                  </Body>
                  <Text style={{ color: theme.gold, fontSize: typography.title, fontWeight: '700' }}>
                    {formatMoney(account?.walletMinor ?? 0)}
                  </Text>
                </View>
                <Button
                  title={t('walletTopUp')}
                  variant="secondary"
                  onPress={() => router.push('/wallet')}
                  style={{ minWidth: 120 }}
                />
              </View>
              <View style={{ marginTop: space.md }}>
                {(wallet.data ?? []).slice(0, 3).map((entry) => (
                  <ListRow
                    key={entry.id}
                    title={locale === 'ar' ? entry.titleAr : entry.titleEn}
                    subtitle={localizeDigits(entry.createdAt.slice(0, 10), locale)}
                    trailing={
                      <Text
                        style={{
                          color: entry.amountMinor >= 0 ? theme.success : theme.textMuted,
                          fontWeight: '700',
                          fontSize: typography.label,
                        }}
                      >
                        {entry.amountMinor >= 0 ? '+' : ''}
                        {formatMoney(entry.amountMinor)}
                      </Text>
                    }
                  />
                ))}
              </View>
              <Pressable onPress={() => router.push('/wallet')} style={{ marginTop: space.sm }}>
                <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                  {t('walletHistory')}
                </Text>
              </Pressable>
            </Card>
          </>
        )}

        <SectionLabel>{t('recentOrders')}</SectionLabel>
        {ordersLoading ? (
          <StateView kind="loading" />
        ) : orders.length === 0 ? (
          <StateView kind="empty" message={t('noOrders')} />
        ) : (
          orders.slice(0, 3).map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              store={isLive ? undefined : repository.store(order.storeId)}
            />
          ))
        )}
        <Button title={t('myOrders')} variant="secondary" onPress={() => router.push('/orders')} />

        <SectionLabel>{t('settings')}</SectionLabel>
        <Card>
          <Heading size="subheading">{t('language')}</Heading>
          <View style={[styles.chipRow]}>
            <Chip
              testID="settings-lang-ar"
              label={t('arabic')}
              active={locale === 'ar'}
              onPress={() => setLocale('ar')}
            />
            <Chip
              testID="settings-lang-en"
              label={t('english')}
              active={locale === 'en'}
              onPress={() => setLocale('en')}
            />
          </View>

          <Heading size="subheading" style={{ marginTop: space.md }}>
            {t('theme')}
          </Heading>
          <View style={[styles.chipRow]}>
            <Chip
              testID="settings-theme-dark"
              label={t('dark')}
              active={themeMode === 'dark'}
              onPress={() => setThemeMode('dark')}
            />
            <Chip
              testID="settings-theme-light"
              label={t('light')}
              active={themeMode === 'light'}
              onPress={() => setThemeMode('light')}
            />
          </View>
        </Card>

        <Card>
          <ListRow title={t('favourites')} onPress={() => router.push('/favourites')} />
          <ListRow title={t('myBookings')} onPress={() => router.push('/bookings')} />
          <ListRow title={t('myRecoveryRequests')} onPress={() => router.push('/recovery')} />
          <ListRow title={t('notifications')} onPress={() => router.push('/notifications')} />
          <ListRow title={t('addresses')} onPress={() => router.push('/addresses')} />
          <ListRow title={t('support')} subtitle={t('supportHint')} onPress={() => router.push('/support')} />
        </Card>

        {isLive ? null : (
          <>
            <Card>
              <Body size="label" muted>
                {t('resetDemoHint')}
              </Body>
              <View style={{ marginTop: space.md }}>
                <Button title={t('resetDemo')} variant="secondary" onPress={resetDemoData} />
              </View>
            </Card>

            <Button
              testID="switch-to-merchant"
              title={t('switchToMerchant')}
              variant="secondary"
              onPress={() => {
                switchRole();
                router.replace('/merchant/dashboard');
              }}
            />
          </>
        )}
        <Button
          title={t('signOut')}
          variant="danger"
          onPress={() => {
            if (isLive) {
              void session.signOut();
            } else {
              void signOut();
            }
            router.replace('/login');
          }}
        />
        <Body size="caption" muted align="center">
          ORYX Marketplace · {t('version')} 1.0.0 · {isLive ? t('liveData') : t('demoData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
});
