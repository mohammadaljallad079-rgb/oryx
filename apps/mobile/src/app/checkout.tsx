import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { useLiveCart } from '../lib/live-cart';
import { useLiveSession } from '../lib/live-session';
import { addressesApi, ApiError, ordersApi, type CustomerAddress, type OrderDetail } from '../lib/api';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import {
  Body,
  Button,
  Card,
  Chip,
  Divider,
  Heading,
  ListRow,
  Screen,
  SectionLabel,
  StateView,
} from '../components/ui';
import { space, typography } from '../lib/theme';
import { formatMoney, localizeDigits } from '../lib/format';
import { isOffline } from '../lib/api';

/**
 * Checkout.
 *
 * A four-step checkout — address, payment method, review, confirmation — that
 * places a **real** order through `POST /customer/orders`.
 *
 * ## What the client does not send
 *
 * No price, no subtotal, no total and no company. The server computes every
 * figure from the catalogue inside the placement transaction, so a modified
 * request cannot change what the customer is charged. This screen shows the
 * server's cart totals and, after placement, the server's own order.
 *
 * ## Idempotency
 *
 * The key is generated once, when placement is first attempted, and reused for
 * every retry of that attempt. A checkout that times out after the request left
 * the device therefore resolves to the order already placed rather than placing
 * a second one — the failure mode a flaky mobile network produces most.
 *
 * ## Guests
 *
 * Placing an order needs an identity. A guest who reaches checkout is told to
 * sign in rather than shown a button that would fail.
 */
export default function Checkout() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const live = useLiveCart();
  const session = useLiveSession();
  const router = useRouter();

  const isLive = live.mode === 'live';

  const [step, setStep] = useState(0);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState('CASH');
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<OrderDetail | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Generated once per checkout attempt and reused across retries, so a retried
  // placement resolves to the order that was already created.
  const idempotencyKey = useRef<string | null>(null);

  const addresses = useAsync(async () => {
    if (!session.isLive) return [] as CustomerAddress[];
    return addressesApi.list();
  }, [session.isLive, dataVersion]);

  // Pre-select the customer's default address so the common case is one tap.
  const selectedAddress = useMemo(() => {
    const list = addresses.data ?? [];
    return list.find((a) => a.id === addressId) ?? list.find((a) => a.isDefault) ?? list[0] ?? null;
  }, [addresses.data, addressId]);

  // Every figure on this screen is the server's, never a local multiplication.
  const subtotalMinor = live.totalMinor;
  const totalMinor = subtotalMinor;

  const steps = [t('deliveryAddress'), t('paymentMethod'), t('orderSummary'), t('orderPlaced')];
  const methods = [
    { key: 'CASH', label: t('payCash') },
    { key: 'CARD_TERMINAL', label: t('payCard') },
    { key: 'BANK_TRANSFER', label: t('payTransfer') },
  ];

  const placeOrder = async () => {
    if (placing) return;
    if (!idempotencyKey.current) {
      idempotencyKey.current = `co-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    setPlacing(true);
    setFailure(null);
    try {
      const order = await ordersApi.place({
        addressId: selectedAddress?.id,
        paymentMethod: payment,
        idempotencyKey: idempotencyKey.current,
      });
      setPlaced(order);
      // The server emptied the cart inside the placement transaction; this
      // refreshes the local view so the badge follows immediately.
      await live.refresh();
      setStep(3);
    } catch (err) {
      const apiError = err as ApiError;
      setFailure(
        apiError instanceof ApiError && apiError.kind === 'offline' ? t('offlineBody') : t('orderFailed'),
      );
    } finally {
      setPlacing(false);
    }
  };

  // A guest cannot place an order. Saying so is honest; a button that fails is not.
  if (!session.isLive && step < 3) {
    return (
      <Screen>
        <ScreenHeader title={t('checkout')} subtitle={t('signInRequired')} />
        <Card>
          <Heading size="heading">{t('signInRequired')}</Heading>
          <Body muted size="label" style={{ marginTop: space.sm }}>
            {t('checkoutSignInBody')}
          </Body>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Button title={t('signIn')} onPress={() => router.push('/login')} />
            <Button title={t('signUp')} variant="secondary" onPress={() => router.push('/register')} />
          </View>
        </Card>
      </Screen>
    );
  }

  // A live cart that failed to load must not be presented as empty.
  if (isLive && live.error && live.items.length === 0 && step < 3) {
    return (
      <Screen>
        <ScreenHeader title={t('checkout')} />
        <Card>
          <StateView kind="error" message={isOffline() ? t('offlineBody') : t('loadFailed')} />
          <Button title={t('retry')} onPress={() => void live.refresh()} />
        </Card>
      </Screen>
    );
  }

  const rowDirection = direction === 'rtl' ? 'row-reverse' : 'row';

  return (
    <Screen>
      <ScreenHeader title={t('checkout')} subtitle={steps[step]} />

      <View style={[styles.steps, { flexDirection: rowDirection }]}>
        {steps.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: space.xs }}>
            <View style={[styles.stepBar, { backgroundColor: i <= step ? theme.gold : theme.surfaceRaised }]} />
            <Text
              style={{
                color: i <= step ? theme.gold : theme.textFaint,
                fontSize: typography.caption,
                textAlign: direction === 'rtl' ? 'right' : 'left',
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {step === 0 ? (
        <Card>
          <SectionLabel>{t('deliveryAddress')}</SectionLabel>
          {addresses.loading ? (
            <StateView kind="loading" />
          ) : (addresses.data ?? []).length === 0 ? (
            <>
              <Body muted size="label" style={{ marginTop: space.sm }}>
                {t('noAddresses')}
              </Body>
              <View style={{ marginTop: space.md }}>
                <Button title={t('addAddress')} variant="secondary" onPress={() => router.push('/addresses')} />
              </View>
            </>
          ) : (
            (addresses.data ?? []).map((address) => (
              <ListRow
                key={address.id}
                testID={`checkout-address-${address.id}`}
                title={address.label ?? address.city}
                subtitle={`${address.addressLine1}${address.addressLine2 ? `, ${address.addressLine2}` : ''}, ${address.city}`}
                trailing={
                  address.id === selectedAddress?.id ? (
                    <Chip label={address.isDefault ? t('defaultAddress') : t('selected')} active />
                  ) : undefined
                }
                onPress={() => setAddressId(address.id)}
              />
            ))
          )}
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <SectionLabel>{t('paymentMethod')}</SectionLabel>
          <View style={[styles.row, { flexDirection: rowDirection }]}>
            {methods.map((method) => (
              <Chip
                key={method.key}
                testID={`checkout-pay-${method.key}`}
                label={method.label}
                active={payment === method.key}
                onPress={() => setPayment(method.key)}
              />
            ))}
          </View>
          <Body size="caption" muted style={{ marginTop: space.md }}>
            {t('paymentNotice')}
          </Body>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <SectionLabel>{t('orderSummary')}</SectionLabel>
          {live.items.map((item) => (
            <ListRow
              key={item.id}
              title={locale === 'ar' ? item.nameAr : item.nameEn}
              subtitle={`${localizeDigits(item.quantity, locale)} × ${formatMoney(item.unitPriceMinor)}`}
              trailing={
                <Text style={{ color: theme.text, fontWeight: '600' }}>{formatMoney(item.lineTotalMinor)}</Text>
              }
            />
          ))}
          <Divider />
          <ListRow
            title={t('subtotal')}
            trailing={<Text style={{ color: theme.text }}>{formatMoney(subtotalMinor)}</Text>}
          />
          <ListRow
            title={t('total')}
            trailing={<Text style={{ color: theme.gold, fontWeight: '700' }}>{formatMoney(totalMinor)}</Text>}
          />
          {selectedAddress ? (
            <Body size="caption" muted style={{ marginTop: space.sm }}>
              {t('deliverTo')}: {selectedAddress.addressLine1}, {selectedAddress.city}
            </Body>
          ) : null}
        </Card>
      ) : null}

      {step === 3 && placed ? (
        <Card>
          <Heading size="heading">{t('orderPlaced')}</Heading>
          <Body size="label" style={{ marginTop: space.sm }}>
            {placed.reference}
          </Body>
          <Body muted size="label" style={{ marginTop: space.xs }}>
            {t('orderPlacedBody')}
          </Body>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Button title={t('trackOrder')} onPress={() => router.replace(`/orders/${placed.id}`)} />
            <Button
              title={t('continueShopping')}
              variant="secondary"
              onPress={() => router.replace('/(tabs)/home')}
            />
          </View>
        </Card>
      ) : null}

      {failure && step === 2 ? (
        <Card>
          <Body size="label" style={{ color: theme.danger }}>
            {failure}
          </Body>
        </Card>
      ) : null}

      {step < 3 ? (
        <View style={{ gap: space.sm }}>
          <Button
            testID="checkout-next"
            title={step === 2 ? t('placeOrder') : t('continue')}
            disabled={placing || live.items.length === 0 || (step === 0 && !selectedAddress)}
            onPress={() => {
              if (step === 2) void placeOrder();
              else setStep(step + 1);
            }}
          />
          {step > 0 ? (
            <Button title={t('back')} variant="secondary" disabled={placing} onPress={() => setStep(step - 1)} />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: space.sm, marginBottom: space.md },
  stepBar: { height: 4, borderRadius: 2 },
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
