import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useLiveOrders } from '../../lib/live-orders';
import { ApiError, type OrderDetail as OrderDetailType } from '../../lib/api';
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
 * Two modes, as the history screen has:
 *
 *   - **Live** — the record is `GET /customer/orders/:id`. The progress bar is
 *     driven by the API's own status, the line items and totals are the API's,
 *     and the cancel button is only offered when the server reports the order as
 *     cancellable. Cancelling calls the API and reports the server's decision;
 *     it never flips the status locally.
 *   - **Demo** — no session, so the demo record and the demo status map are used.
 *
 * A cancellation the server refuses (too late, already cancelled) is shown as a
 * failure with the server's own message, because that is what happened.
 */
const STEP_INDEX: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 0,
  PREPARING: 1,
  READY: 2,
  OUT_FOR_DELIVERY: 2,
  SHIPPED: 2,
  DELIVERED: 3,
  COMPLETED: 3,
  CANCELLED: 0,
};

export default function OrderDetail() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const live = useLiveOrders();
  const isLive = live.mode === 'live';

  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const liveOrder = useAsync<OrderDetailType | null>(
    async () => (isLive ? live.detail(id) : null),
    [id, isLive, dataVersion],
  );
  const demoOrder = useAsync(async () => (isLive ? null : repository.order(id)), [id, isLive, dataVersion]);
  const products = useAsync(async () => repository.products(), [dataVersion]);

  const loading = liveOrder.loading || demoOrder.loading;

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title={t('orderDetails')} />
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (isLive) {
    const record = liveOrder.data;
    if (!record) {
      return (
        <Screen>
          <ScreenHeader title={t('orderDetails')} />
          <StateView kind="error" message={t('loadFailed')} />
        </Screen>
      );
    }
    const current = STEP_INDEX[record.status] ?? 0;
    const steps = [t('stepPlaced'), t('stepPreparing'), t('stepShipped'), t('stepDelivered')];
    const rowDirection = direction === 'rtl' ? 'row-reverse' : 'row';

    const onCancel = async () => {
      setCancelling(true);
      setCancelError(null);
      const result = await live.cancel(record.id, 'Cancelled by customer');
      if (result.ok) {
        liveOrder.reload();
      } else {
        const err = result.error;
        setCancelError(
          err instanceof ApiError && err.kind === 'offline'
            ? t('offlineBody')
            : (err?.message ?? t('cancelFailed')),
        );
      }
      setCancelling(false);
    };

    return (
      <Screen>
        <ScreenHeader title={record.reference} />

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
          <View style={[styles.steps, { flexDirection: rowDirection }]}>
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
          <SectionLabel>{t('orderTracking')}</SectionLabel>
          <DetailRow label={t('orderNumber')} value={record.reference} />
          <DetailRow label={t('placedOn')} value={formatDateTime(record.placedAt)} />
          <DetailRow label={t('paymentMethod')} value={record.paymentMethod} />
          {record.address ? (
            <DetailRow
              label={t('deliveryAddress')}
              value={`${record.address.line1}${record.address.line2 ? `, ${record.address.line2}` : ''}${record.address.city ? `, ${record.address.city}` : ''}`}
            />
          ) : null}
          {record.cancellationReason ? (
            <DetailRow label={t('cancelOrder')} value={record.cancellationReason} />
          ) : null}
        </Card>

        <Card>
          <SectionLabel>{t('items')}</SectionLabel>
          {record.lines.map((line) => (
            <ListRow
              key={line.id}
              title={locale === 'ar' ? line.nameAr : line.nameEn}
              subtitle={`${localizeDigits(line.quantity, locale)} × ${formatMoney(line.unitPriceMinor)}`}
              trailing={
                <Text style={{ color: theme.text, fontWeight: '600' }}>{formatMoney(line.lineTotalMinor)}</Text>
              }
            />
          ))}
          <Divider />
          <DetailRow label={t('subtotal')} value={formatMoney(record.subtotalMinor)} />
          <DetailRow label={t('tax')} value={formatMoney(record.taxMinor)} />
          <DetailRow label={t('delivery')} value={formatMoney(record.deliveryMinor)} />
          <DetailRow label={t('total')} value={formatMoney(record.totalMinor)} />
        </Card>

        {record.events.length > 0 ? (
          <Card>
            <SectionLabel>{t('orderTracking')}</SectionLabel>
            {record.events.map((event, i) => (
              <ListRow
                key={`${event.status}-${i}`}
                title={event.status}
                subtitle={event.note ?? undefined}
                trailing={
                  <Text style={{ color: theme.textMuted, fontSize: typography.caption }}>
                    {formatDateTime(event.createdAt)}
                  </Text>
                }
              />
            ))}
          </Card>
        ) : null}

        {cancelError ? (
          <Card>
            <Body size="label" style={{ color: theme.danger }}>
              {cancelError}
            </Body>
          </Card>
        ) : null}

        <Button title={t('reorder')} variant="secondary" onPress={() => router.push('/cart')} />
        {/* The server decides what is cancellable; the button follows it. */}
        {record.cancellable ? (
          <View style={{ height: space.md }}>
            <Button
              testID="order-cancel"
              title={t('cancelOrder')}
              variant="danger"
              disabled={cancelling}
              onPress={() => void onCancel()}
            />
          </View>
        ) : null}
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

  // ------------------------------------------------------------- demo mode
  const record = demoOrder.data;
  if (!record) {
    return (
      <Screen>
        <ScreenHeader title={t('orderDetails')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const store = repository.store(record.storeId);
  const current = STEP_INDEX[record.status] ?? 0;
  const steps = [t('stepPlaced'), t('stepPreparing'), t('stepShipped'), t('stepDelivered')];

  return (
    <Screen>
      <ScreenHeader
        title={record.reference}
        subtitle={store ? (locale === 'ar' ? store.nameAr : store.nameEn) : undefined}
      />

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
