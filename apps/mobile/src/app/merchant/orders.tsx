import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
import { OrderCard } from '../../components/cards';
import { Body, Button, Card, Chip, Divider, ListRow, Notice, Screen, SectionLabel, StateView } from '../../components/ui';
import { Text } from 'react-native';
import { space } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';
import type { OrderStatus } from '../../demo/catalogue';

/**
 * The merchant order queue.
 *
 * Orders grouped by status, with the status transition available inline. The
 * transition is what a real back office does, so the demo shows it rather than
 * hiding it behind an edit form.
 */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'PREPARING',
  PREPARING: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};

export default function MerchantOrders() {
  const { t, theme, locale, account, direction, dataVersion } = useApp();
  const storeId = account?.storeId ?? 'store-01';
  const [filter, setFilter] = useState('all');
  const [advanced, setAdvanced] = useState<Record<string, OrderStatus>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const stats = useAsync(async () => repository.merchantStats(storeId), [storeId, dataVersion]);
  const orders = (stats.data?.orders ?? []).map((order) => {
    const next = advanced[order.id];
    return next ? { ...order, status: next } : order;
  });
  const byStatus = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});
  const visible = orders.filter((o) => filter === 'all' || o.status === filter);

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
              label={key === 'all' ? t('categoriesAll') : `${key} ${byStatus[key] ? `(${localizeDigits(byStatus[key], locale)})` : ''}`}
              active={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </View>

        <Card>
          <ListRow
            title={t('totalSales')}
            trailing={<Text style={{ color: theme.gold, fontWeight: '700' }}>{formatMoney(stats.data?.revenueMinor ?? 0)}</Text>}
          />
          <Divider />
          <ListRow
            title={t('pendingOrders')}
            trailing={<Text style={{ color: theme.text }}>{localizeDigits(byStatus.PENDING ?? 0, locale)}</Text>}
          />
          <ListRow
            title={t('completedOrders')}
            trailing={<Text style={{ color: theme.text }}>{localizeDigits(byStatus.DELIVERED ?? 0, locale)}</Text>}
          />
        </Card>

        {stats.loading ? (
          <StateView kind="loading" />
        ) : visible.length === 0 ? (
          <StateView kind="empty" message={t('noOrders')} />
        ) : (
          visible.map((order) => {
            const next = NEXT[order.status];
            return (
              <View key={order.id}>
                <OrderCard order={order} store={repository.store(order.storeId)} />
                {next ? (
                  <View style={{ marginTop: -space.sm, marginBottom: space.md }}>
                    <Button
                      testID={`merchant-advance-${order.id}`}
                      title={`${t('updateStatus')} → ${next}`}
                      variant="secondary"
                      onPress={() => {
                        setAdvanced((prev) => ({ ...prev, [order.id]: next }));
                        setNotice(`${t('saved')} · ${next}`);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        <Notice text={notice} />
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
