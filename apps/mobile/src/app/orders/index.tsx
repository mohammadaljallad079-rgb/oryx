import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { useLiveOrders } from '../../lib/live-orders';
import { useLiveSession } from '../../lib/live-session';
import { orderToDemo } from '../../lib/api-adapters';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { OrderCard } from '../../components/cards';
import { Body, Button, Card, Chip, Screen, StateView } from '../../components/ui';
import { space } from '../../lib/theme';
import { isOffline } from '../../lib/api';

/**
 * Order history.
 *
 * Two modes, and the screen says which one it is showing:
 *
 *   - **Live** — a session exists, so the list is the server's. It is the real
 *     order history for the signed-in account, and the API scopes it by the
 *     bearer token so one customer cannot see another's.
 *   - **Demo** — no session, so the list is the local demo history and the
 *     footer says "Demo data".
 *
 * Filtering is by status from a chip row. The statuses are the API's own
 * `CustomerOrderStatus` values, so a filter cannot be offered that the server
 * would never produce.
 */
export default function Orders() {
  const { t, account, direction, dataVersion } = useApp();
  const session = useLiveSession();
  const live = useLiveOrders();
  const [status, setStatus] = useState<string>('all');

  const isLive = live.mode === 'live';

  const demoOrders = useAsync(
    async () => (account ? repository.orders(account.id) : []),
    [account?.id, dataVersion],
  );

  const statuses = [
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
  const liveVisible = live.items.filter((order) => status === 'all' || order.status === status);
  const demoVisible = (demoOrders.data ?? []).filter((order) => status === 'all' || order.status === status);
  const visibleCount = isLive ? liveVisible.length : demoVisible.length;

  // A live list that failed to load shows the failure and a retry — not an
  // empty history. Reporting "no orders" when the request failed would tell the
  // customer their orders are gone.
  if (isLive && live.error && live.items.length === 0) {
    return (
      <Screen>
        <ScreenHeader title={t('myOrders')} />
        <Card>
          <StateView kind="error" message={isOffline() ? t('offlineBody') : t('loadFailed')} />
          <Button title={t('retry')} onPress={() => void live.refresh()} />
        </Card>
      </Screen>
    );
  }

  if (isLive && live.loading && live.items.length === 0) {
    return (
      <Screen>
        <ScreenHeader title={t('myOrders')} />
        <StateView kind="loading" />
      </Screen>
    );
  }

  // A guest has no server order history. Offering sign-in is honest.
  if (!session.isLive && !account) {
    return (
      <Screen>
        <ScreenHeader title={t('myOrders')} />
        <Card>
          <Body muted size="label">
            {t('guestBrowsing')}
          </Body>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('myOrders')} subtitle={`${visibleCount}`} />

      <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
        {statuses.map((key) => (
          <Chip
            key={key}
            testID={`orders-filter-${key}`}
            label={key === 'all' ? t('categoriesAll') : key}
            active={status === key}
            onPress={() => setStatus(key)}
          />
        ))}
      </View>

      {visibleCount === 0 ? (
        <StateView kind="empty" message={t('noOrders')} />
      ) : isLive ? (
        liveVisible.map((order) => <OrderCard key={order.id} order={orderToDemo(order)} />)
      ) : (
        demoVisible.map((order) => (
          <OrderCard key={order.id} order={order} store={repository.store(order.storeId)} />
        ))
      )}

      <Body size="caption" muted align="center">
        {isLive ? t('liveData') : t('demoData')}
      </Body>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
});
