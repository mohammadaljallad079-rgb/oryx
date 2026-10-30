import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useMerchantSession } from '../../lib/merchant-session';
import { ApiError, providerApi, type ProviderEarnings, type ProviderRequest } from '../../lib/api';
import { AppHeader, DemoBanner } from '../../components/brand';
import { OrderCard, RecoveryCard } from '../../components/cards';
import {
  Badge,
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
 * Two modes, never mixed. A **live merchant session** reads the real provider
 * portal: the earnings summary from `/provider/earnings` and the queue from
 * `/provider/requests`, both resolved from the signed-in staff account's
 * membership. The **demo merchant** keeps the local, offline review experience,
 * and every figure there is derived from the store's own orders so the tiles,
 * the chart and the list cannot disagree. The demo revenue tile says it is demo
 * data; the live one does not.
 */
export default function MerchantDashboard() {
  const { t, locale, account, direction, dataVersion } = useApp();
  const { isSignedIn } = useMerchantSession();
  const router = useRouter();
  const storeId = account?.storeId ?? 'store-01';

  const store = useAsync(async () => repository.merchantStore(storeId), [storeId, dataVersion]);
  const stats = useAsync(async () => repository.merchantStats(storeId), [storeId, dataVersion]);
  const revenue = useAsync(async () => repository.merchantRevenue(storeId), [storeId, dataVersion]);
  const mix = useAsync(async () => repository.merchantCategoryMix(storeId), [storeId, dataVersion]);
  const recovery = useAsync(async () => repository.merchantRecoveryRequests(storeId), [storeId, dataVersion]);

  // ---- live provider state --------------------------------------------------
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const [earn, reqs] = await Promise.all([
        providerApi.earnings(),
        providerApi.requests({ pageSize: 50 }),
      ]);
      setEarnings(earn);
      setRequests(reqs.items);
    } catch (err) {
      setLiveError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setLiveLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isSignedIn) {
      setEarnings(null);
      setRequests([]);
      return;
    }
    void loadLive();
  }, [isSignedIn, loadLive]);

  // Live figures come from the portal; demo figures from the local store.
  const newRequests = requests.filter((r) => r.status === 'NEW').length;
  const inProgress = requests.filter((r) => r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS').length;
  const pendingNetMinor = (earnings?.pending.grossMinor ?? 0) - (earnings?.pending.commissionMinor ?? 0);

  const orders = stats.data?.orders ?? [];
  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const completed = orders.filter((o) => o.status === 'DELIVERED').length;
  const revenueMinor = stats.data?.revenueMinor ?? 0;

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        {!isSignedIn ? <DemoBanner /> : null}

        <View>
          <Heading size="title">
            {store.data ? (locale === 'ar' ? store.data.nameAr : store.data.nameEn) : t('merchantDashboard')}
          </Heading>
          <Body size="label" muted style={{ marginTop: space.xs }}>
            {t('merchantDashboard')}
          </Body>
        </View>

        {isSignedIn ? (
          liveError ? (
            <Body size="caption" align="center">
              {liveError}
            </Body>
          ) : liveLoading && !earnings ? (
            <StateView kind="loading" />
          ) : (
            <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <View style={styles.tile}>
                <MetricTile
                  label={t('revenue')}
                  value={compactMoney(pendingNetMinor)}
                  caption={t('pendingEarnings')}
                  accent
                />
              </View>
              <View style={styles.tile}>
                <MetricTile
                  label={t('serviceRequests')}
                  value={localizeDigits(requests.length, locale)}
                  caption={t('last30Days')}
                />
              </View>
              <View style={styles.tile}>
                <MetricTile label={t('newRequests')} value={localizeDigits(newRequests, locale)} />
              </View>
              <View style={styles.tile}>
                <MetricTile label={t('inProgressRequests')} value={localizeDigits(inProgress, locale)} />
              </View>
            </View>
          )
        ) : stats.loading ? (
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

        {isSignedIn ? (
          <Card>
            <View style={styles.headRow}>
              <SectionLabel>{t('earnings')}</SectionLabel>
            </View>
            <View style={{ marginTop: space.sm }}>
              <View style={styles.headRow}>
                <Body size="label">{t('pendingEarnings')}</Body>
                <Body size="caption">{formatMoney(pendingNetMinor)}</Body>
              </View>
              <View style={styles.headRow}>
                <Body size="label">{t('awaitingPayment')}</Body>
                <Body size="caption">{formatMoney(earnings?.awaitingPayment.netMinor ?? 0)}</Body>
              </View>
              <View style={styles.headRow}>
                <Body size="label">{t('paidToDate')}</Body>
                <Body size="caption">{formatMoney(earnings?.paidToDate.netMinor ?? 0)}</Body>
              </View>
            </View>
          </Card>
        ) : (
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
        )}

        {!isSignedIn ? (
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
        ) : null}

        <View style={styles.headRow}>
          <SectionLabel>{isSignedIn ? t('serviceRequests') : t('newOrders')}</SectionLabel>
          <Button
            title={t('seeAll')}
            variant="ghost"
            onPress={() => router.push(isSignedIn ? '/merchant/services' : '/merchant/orders')}
          />
        </View>
        {isSignedIn
          ? requests.slice(0, 3).map((request) => (
              <Card key={request.id}>
                <View style={styles.headRow}>
                  <Body size="label">{request.requestNumber}</Body>
                  <Badge text={request.status} status={request.status} />
                </View>
                {request.description ? (
                  <Body size="caption" muted style={{ marginTop: space.xs }}>
                    {request.description}
                  </Body>
                ) : null}
              </Card>
            ))
          : orders.slice(0, 3).map((order) => (
              <OrderCard key={order.id} order={order} store={repository.store(order.storeId)} />
            ))}

        {!isSignedIn ? (
          <>
            <View style={styles.headRow}>
              <SectionLabel>{t('recoveryRequests')}</SectionLabel>
              <Button title={t('seeAll')} variant="ghost" onPress={() => router.push('/merchant/services')} />
            </View>
            {(recovery.data ?? []).slice(0, 2).map((job) => (
              <RecoveryCard key={job.id} job={job} />
            ))}
          </>
        ) : null}

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
          {localizeDigits(2026, locale)} · ORYX Marketplace{isSignedIn ? '' : ` · ${t('demoData')}`}
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
