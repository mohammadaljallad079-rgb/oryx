import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  DetailRow,
  Divider,
  ListRow,
  ProgressBar,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatDateTime, formatMoney, localizeDigits } from '../../lib/format';

/**
 * Order tracking.
 *
 * The four-step progress bar is driven by the order status, so a `SHIPPED` order
 * shows two completed steps and a `DELIVERED` one shows all four. The line items
 * and totals come from the same record the list screen shows.
 */
const STEP_INDEX: Record<string, number> = {
  PENDING: 0,
  PREPARING: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  CANCELLED: 0,
};

export default function OrderDetail() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const order = useAsync(async () => repository.order(id), [id, dataVersion]);
  const products = useAsync(async () => repository.products(), [dataVersion]);

  if (order.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('orderDetails')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!order.data) {
    return (
      <Screen>
        <ScreenHeader title={t('orderDetails')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const record = order.data;
  const store = repository.store(record.storeId);
  const current = STEP_INDEX[record.status] ?? 0;
  const steps = [t('stepPlaced'), t('stepPreparing'), t('stepShipped'), t('stepDelivered')];

  return (
    <Screen>
      <ScreenHeader title={record.reference} subtitle={store ? (locale === 'ar' ? store.nameAr : store.nameEn) : undefined} />

      <Card>
        <View style={styles.headRow}>
          <Badge text={record.status} status={record.status} />
          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.subheading }}>
            {formatMoney(record.totalMinor)}
          </Text>
        </View>
        <View style={{ marginTop: space.md }}>
          <ProgressBar value={(current + 1) / steps.length} />
        </View>
        <View style={[styles.steps, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {steps.map((label, i) => (
            <Text
              key={label}
              style={{
                flex: 1,
                color: i <= current ? theme.gold : theme.textFaint,
                fontSize: typography.caption,
                textAlign: 'center',
              }}
            >
              {label}
            </Text>
          ))}
        </View>
      </Card>

      <Card>
        <SectionLabel>{t('estimatedArrival')}</SectionLabel>
        <Body size="label" style={{ marginTop: space.sm }}>
          {formatDateTime(record.etaAt)}
        </Body>
        <Divider />
        <DetailRow label={t('orderNumber')} value={record.reference} />
        <DetailRow label={t('placedOn')} value={formatDateTime(record.placedAt)} />
        <DetailRow label={t('paymentMethod')} value={record.paymentMethod} />
        <DetailRow label={t('deliveryAddress')} value={locale === 'ar' ? record.addressAr : record.addressEn} />
      </Card>

      <Card>
        <SectionLabel>{t('items')}</SectionLabel>
        {record.items.map((item) => {
          const product = (products.data ?? []).find((p) => p.id === item.productId);
          return (
            <ListRow
              key={item.productId}
              title={product ? (locale === 'ar' ? product.nameAr : product.nameEn) : item.productId}
              subtitle={`${localizeDigits(item.quantity, locale)} × ${formatMoney(item.unitPriceMinor)}`}
              trailing={
                <Text style={{ color: theme.text, fontWeight: '600' }}>
                  {formatMoney(item.unitPriceMinor * item.quantity)}
                </Text>
              }
            />
          );
        })}
        <Divider />
        <DetailRow label={t('subtotal')} value={formatMoney(record.subtotalMinor)} />
        <DetailRow label={t('delivery')} value={formatMoney(record.deliveryMinor)} />
        <DetailRow label={t('total')} value={formatMoney(record.totalMinor)} />
      </Card>

      <Button title={t('reorder')} variant="secondary" onPress={() => router.push('/cart')} />
      <View style={{ height: space.md }} />
      {record.status === 'PENDING' || record.status === 'PREPARING' ? (
        <Button title={t('cancelOrder')} variant="danger" onPress={() => router.back()} />
      ) : null}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  steps: { gap: space.xs, marginTop: space.sm },
});
