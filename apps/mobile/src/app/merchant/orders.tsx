import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useMerchantSession } from '../../lib/merchant-session';
import { AppHeader } from '../../components/brand';
import { OrderCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  Divider,
  ListRow,
  Notice,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';
import { ApiError, providerApi, type OrderSummary, type OrderStatus } from '../../lib/api';
import { orderToDemo } from '../../lib/api-adapters';

/**
 * The merchant order queue.
 *
 * Two modes, never mixed. A **live merchant session** reads the real consumer
 * orders placed against the provider's own company through `/provider/orders`,
 * and advances them through the server's own status machine with
 * `POST /provider/orders/:id/status`. The **demo merchant** keeps the local,
 * offline review experience.
 *
 * ## Tenant isolation
 *
 * The API resolves the company from the signed-in staff account's provider
 * membership, never from the request, so a merchant sees only its own orders.
 * The client sends no company id — there is nothing here to edit into a
 * cross-tenant read.
 *
 * ## Status transitions
 *
 * The next step is offered from the same graph the server enforces
 * (`PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED →
 * COMPLETED`). A step the server refuses is shown as a failure with the server's
 * own message; the card's status never changes locally on a failed call.
 */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
  DELIVERED: 'COMPLETED',
};

const STATUSES: Array<OrderStatus | 'all'> = [
  'all',
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
];

export default function MerchantOrders() {
  const { t, theme, locale, account, direction, dataVersion } = useApp();
  const { isSignedIn } = useMerchantSession();
  const storeId = account?.storeId ?? 'store-01';
  const [filter, setFilter] = useState<string>('all');

  // ---- demo state (unchanged offline experience) ----------------------------
  const stats = useAsync(async () => repository.merchantStats(storeId), [storeId, dataVersion]);

  // ---- live provider state --------------------------------------------------
  const [orders, setOrders] = useState<Array<OrderSummary & { customerAccountId: string }>>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const page = await providerApi.orders({ pageSize: 50 });
      setOrders(page.items);
    } catch (err) {
      setLiveError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setLiveLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isSignedIn) void loadLive();
  }, [isSignedIn, loadLive]);

  const advance = async (order: OrderSummary, next: OrderStatus) => {
    setBusyId(order.id);
    setNotice(null);
    try {
      await providerApi.setOrderStatus(order.id, next);
      setNotice(`${t('saved')} · ${order.reference} → ${next}`);
      // Re-read from the server: the transition's result is the authority, not
      // a locally patched status.
      await loadLive();
    } catch (err) {
      const apiError = err as ApiError;
      setNotice(apiError instanceof ApiError ? apiError.message : t('serverError'));
    } finally {
      setBusyId(null);
    }
  };

  // ------------------------------------------------------------- live mode
  if (isSignedIn) {
    const byStatus = orders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1;
      return acc;
    }, {});
    const visible = orders.filter((o) => filter === 'all' || o.status === filter);
    const revenueMinor = orders
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + o.totalMinor, 0);

    return (
      <Screen padded={false}>
        <AppHeader />
        <View style={{ padding: space.lg, gap: space.md }}>
          <SectionLabel>{t('manageOrders')}</SectionLabel>

          <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {STATUSES.map((key) => (
              <Chip
                key={key}
                testID={`merchant-orders-${key}`}
                label={
                  key === 'all'
                    ? t('categoriesAll')
                    : `${key} ${byStatus[key] ? `(${localizeDigits(byStatus[key], locale)})` : ''}`
                }
                active={filter === key}
                onPress={() => setFilter(key)}
              />
            ))}
          </View>

          <Card>
            <ListRow
              title={t('totalSales')}
              trailing={
                <Text style={{ color: theme.gold, fontWeight: '700' }}>{formatMoney(revenueMinor)}</Text>
              }
            />
            <Divider />
            <ListRow
              title={t('pendingOrders')}
              trailing={<Text style={{ color: theme.text }}>{localizeDigits(byStatus.PENDING ?? 0, locale)}</Text>}
            />
            <ListRow
              title={t('completedOrders')}
              trailing={<Text style={{ color: theme.text }}>{localizeDigits(byStatus.COMPLETED ?? 0, locale)}</Text>}
            />
          </Card>

          {liveLoading && orders.length === 0 ? (
            <StateView kind="loading" />
          ) : liveError ? (
            <Card>
              <StateView kind="error" message={liveError} />
              <Button title={t('retry')} onPress={() => void loadLive()} />
            </Card>
          ) : visible.length === 0 ? (
            <StateView kind="empty" message={t('noOrders')} />
          ) : (
            visible.map((order) => {
              const next = NEXT[order.status];
              return (
                <View key={order.id}>
                  <OrderCard order={orderToDemo(order)} />
                  {next ? (
                    <View style={{ marginTop: -space.sm, marginBottom: space.md }}>
                      <Button
                        testID={`merchant-advance-${order.id}`}
                        title={`${t('updateStatus')} → ${next}`}
                        variant="secondary"
                        disabled={busyId === order.id}
                        onPress={() => void advance(order, next)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
          <Notice text={notice} />
          <Body size="caption" muted align="center">
            {t('liveData')}
          </Body>
          <View style={{ height: space.xl }} />
        </View>
      </Screen>
    );
  }

  // ------------------------------------------------------------- demo mode
  const demoOrders = stats.data?.orders ?? [];
  const demoByStatus = demoOrders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});
  const demoVisible = demoOrders.filter((o) => filter === 'all' || o.status === filter);

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <SectionLabel>{t('manageOrders')}</SectionLabel>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {['all', 'PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((key) => (
            <Chip
              key={key}
              testID={`merchant-orders-${key}`}
              label={
                key === 'all'
                  ? t('categoriesAll')
                  : `${key} ${demoByStatus[key] ? `(${localizeDigits(demoByStatus[key], locale)})` : ''}`
              }
              active={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </View>

        <Card>
          <ListRow
            title={t('totalSales')}
            trailing={
              <Text style={{ color: theme.gold, fontWeight: '700' }}>
                {formatMoney(stats.data?.revenueMinor ?? 0)}
              </Text>
            }
          />
          <Divider />
          <ListRow
            title={t('pendingOrders')}
            trailing={<Text style={{ color: theme.text }}>{localizeDigits(demoByStatus.PENDING ?? 0, locale)}</Text>}
          />
          <ListRow
            title={t('completedOrders')}
            trailing={
              <Text style={{ color: theme.text }}>{localizeDigits(demoByStatus.DELIVERED ?? 0, locale)}</Text>
            }
          />
        </Card>

        {stats.loading ? (
          <StateView kind="loading" />
        ) : demoVisible.length === 0 ? (
          <StateView kind="empty" message={t('noOrders')} />
        ) : (
          demoVisible.map((order) => (
            <OrderCard key={order.id} order={order} store={repository.store(order.storeId)} />
          ))
        )}
        <Body size="caption" muted align="center">
          {t('demoNotice')}
        </Body>
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm },
});
