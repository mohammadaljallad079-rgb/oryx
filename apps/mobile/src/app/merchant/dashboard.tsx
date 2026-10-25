import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader, DemoBanner } from '../../components/brand';
import { OrderCard, RecoveryCard } from '../../components/cards';
import {
  BarChart,
  Body,
  Button,
  Card,
  Chip,
  Heading,
  MetricTile,
  ProgressBar,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space } from '../../lib/theme';
import { compactMoney, formatMoney, localizeDigits } from '../../lib/format';

/**
 * The merchant dashboard.
 *
 * Revenue, orders by status and the live queue. Every figure is derived from the
 * store's own orders, so the tiles, the chart and the list cannot disagree. The
 * "revenue" is a demo figure and the tile says so.
 */
export default function MerchantDashboard() {
  const { t, locale, account, direction, dataVersion } = useApp();
  const router = useRouter();
  const storeId = account?.storeId ?? 'store-01';

  const store = useAsync(async () => repository.merchantStore(storeId), [storeId, dataVersion]);
  const stats = useAsync(async () => repository.merchantStats(storeId), [storeId, dataVersion]);
  const revenue = useAsync(async () => repository.merchantRevenue(storeId), [storeId, dataVersion]);
  const mix = useAsync(async () => repository.merchantCategoryMix(storeId), [storeId, dataVersion]);
  const recovery = useAsync(async () => repository.merchantRecoveryRequests(storeId), [storeId, dataVersion]);

  const orders = stats.data?.orders ?? [];
  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const completed = orders.filter((o) => o.status === 'DELIVERED').length;
  const revenueMinor = stats.data?.revenueMinor ?? 0;

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <DemoBanner />

        <View>
          <Heading size="title">
            {store.data ? (locale === 'ar' ? store.data.nameAr : store.data.nameEn) : t('merchantDashboard')}
          </Heading>
          <Body size="label" muted style={{ marginTop: space.xs }}>
            {t('merchantDashboard')}
          </Body>
        </View>

        {stats.loading ? (
          <StateView kind="loading" />
        ) : (
          <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            <View style={styles.tile}>
              <MetricTile label={t('revenue')} value={compactMoney(revenueMinor)} caption={t('demoData')} accent />
            </View>
            <View style={styles.tile}>
              <MetricTile label={t('totalSales')} value={localizeDigits(orders.length, locale)} caption={t('last30Days')} />
            </View>
            <View style={styles.tile}>
              <MetricTile label={t('pendingOrders')} value={localizeDigits(pending, locale)} />
            </View>
            <View style={styles.tile}>
              <MetricTile label={t('completedOrders')} value={localizeDigits(completed, locale)} />
            </View>
          </View>
        )}

        <Card>
          <View style={styles.headRow}>
            <SectionLabel>{t('revenue')}</SectionLabel>
            <Chip label={t('last30Days')} />
          </View>
          <View style={{ marginTop: space.md }}>
            <BarChart values={revenue.data ?? []} />
          </View>
          <View style={styles.chartFoot}>
            <Body size="caption" muted>
              {t('revenueMonth')}: {formatMoney(revenueMinor)}
            </Body>
            <Body size="caption" muted>
              {t('revenueToday')}: {formatMoney(revenueMinor / 30)}
            </Body>
          </View>
        </Card>

        <Card>
          <SectionLabel>{t('statistics')}</SectionLabel>
          {(mix.data ?? []).map((row) => {
            const total = (mix.data ?? []).reduce((sum, r) => sum + r.count, 0) || 1;
            return (
              <View key={row.key} style={{ marginTop: space.md }}>
                <View style={styles.headRow}>
                  <Body size="label">{row.key}</Body>
                  <Body size="caption" muted>
                    {localizeDigits(row.count, locale)}
                  </Body>
                </View>
                <View style={{ marginTop: space.xs }}>
                  <ProgressBar value={row.count / total} />
                </View>
              </View>
            );
          })}
        </Card>

        <View style={styles.headRow}>
          <SectionLabel>{t('newOrders')}</SectionLabel>
          <Button title={t('seeAll')} variant="ghost" onPress={() => router.push('/merchant/orders')} />
        </View>
        {orders.slice(0, 3).map((order) => (
          <OrderCard key={order.id} order={order} store={repository.store(order.storeId)} />
        ))}

        <View style={styles.headRow}>
          <SectionLabel>{t('recoveryRequests')}</SectionLabel>
          <Button title={t('seeAll')} variant="ghost" onPress={() => router.push('/merchant/services')} />
        </View>
        {(recovery.data ?? []).slice(0, 2).map((job) => (
          <RecoveryCard key={job.id} job={job} />
        ))}

        <Card>
          <SectionLabel>{t('erpTools')}</SectionLabel>
          <Body size="caption" muted style={{ marginTop: space.sm }}>
            {t('erpLocked')}
          </Body>
          <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {['salesTool', 'inventoryTool', 'purchasingTool', 'accountingTool', 'hrTool', 'reportsTool'].map((key) => (
              <Chip key={key} label={t(key as never)} />
            ))}
          </View>
        </Card>

        <Body size="caption" muted align="center">
          {localizeDigits(2026, locale)} · ORYX Marketplace · {t('demoData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: space.md },
  tile: { flexGrow: 1, flexBasis: '45%' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
});
