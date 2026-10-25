import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { OrderCard } from '../../components/cards';
import { Chip, Screen, StateView } from '../../components/ui';
import { space } from '../../lib/theme';

/**
 * Order history.
 *
 * Filtered by status from a chip row; the statuses come from the order model, so
 * a new one cannot be filtered here without being added to the type.
 */
export default function Orders() {
  const { t, account, direction, dataVersion } = useApp();
  const [status, setStatus] = useState<string>('all');

  const orders = useAsync(
    async () => (account ? repository.orders(account.id) : []),
    [account?.id, dataVersion],
  );

  const statuses = ['all', 'PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
  const visible = (orders.data ?? []).filter((order) => status === 'all' || order.status === status);

  return (
    <Screen>
      <ScreenHeader title={t('myOrders')} subtitle={`${visible.length}`} />

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

      {orders.loading ? (
        <StateView kind="loading" />
      ) : visible.length === 0 ? (
        <StateView kind="empty" message={t('noOrders')} />
      ) : (
        visible.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            store={repository.store(order.storeId)}
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
});
