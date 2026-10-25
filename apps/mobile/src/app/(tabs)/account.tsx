import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
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
  const { t, theme, account, locale, setLocale, themeMode, setThemeMode, signOut, resetDemoData, dataVersion } =
    useApp();
  const router = useRouter();

  const vehicles = useAsync(
    () => (account ? repository.vehicles(account.id) : Promise.resolve([])),
    [account?.id, dataVersion],
  );
  const orders = useAsync(
    () => (account ? repository.orders(account.id) : Promise.resolve([])),
    [account?.id, dataVersion],
  );
  const wallet = useAsync(
    () => (account ? repository.wallet(account.id) : Promise.resolve([])),
    [account?.id, dataVersion],
  );

  if (!account) return null;

  const name = locale === 'ar' ? account.fullNameAr : account.fullNameEn;

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <DemoBanner />

        <Card>
          <View style={styles.profileRow}>
            <Monogram initials={account.avatarInitials} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: typography.heading, fontWeight: '700' }}>
                {name}
              </Text>
              <Body size="caption" muted>
                {account.email}
              </Body>
              <Body size="caption" muted>
                {account.phone}
              </Body>
            </View>
          </View>
        </Card>

        <SectionLabel>{t('myVehicles')}</SectionLabel>
        {vehicles.loading ? (
          <StateView kind="loading" />
        ) : (vehicles.data ?? []).length === 0 ? (
          <StateView kind="empty" message={t('noVehicles')} />
        ) : (
          (vehicles.data ?? []).map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onPress={() => router.push(`/vehicles/${vehicle.id}`)}
            />
          ))
        )}
        <Button title={t('addVehicle')} variant="secondary" onPress={() => router.push('/vehicles/new')} />

        <SectionLabel>{t('wallet')}</SectionLabel>
        <Card>
          <View style={styles.balanceRow}>
            <View>
              <Body size="caption" muted>
                {t('walletBalance')}
              </Body>
              <Text style={{ color: theme.gold, fontSize: typography.title, fontWeight: '700' }}>
                {formatMoney(account.walletMinor)}
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

        <SectionLabel>{t('recentOrders')}</SectionLabel>
        {orders.loading ? (
          <StateView kind="loading" />
        ) : (
          (orders.data ?? []).slice(0, 3).map((order) => (
            <OrderCard key={order.id} order={order} store={repository.store(order.storeId)} />
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

        <Card>
          <Body size="label" muted>
            {t('resetDemoHint')}
          </Body>
          <View style={{ marginTop: space.md }}>
            <Button title={t('resetDemo')} variant="secondary" onPress={resetDemoData} />
          </View>
        </Card>

        <Button title={t('signOut')} variant="danger" onPress={() => { void signOut(); router.replace('/login'); }} />
        <Body size="caption" muted align="center">
          ORYX Marketplace · {t('version')} 1.0.0 · {t('demoData')}
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
