import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Chip, Divider, Heading, ListRow, Screen, SectionLabel } from '../components/ui';
import { space, typography } from '../lib/theme';
import { formatMoney } from '../lib/format';

/**
 * Checkout.
 *
 * A four-step demo checkout: address, payment method, a review of the order and
 * a confirmation. Nothing is charged — the demo says so on the button — but the
 * totals are computed from the real cart, so the arithmetic is honest.
 */
export default function Checkout() {
  const { t, theme, locale, direction, cart, clearCart, dataVersion } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState('CASH');

  const products = useAsync(async () => repository.products(), [dataVersion]);
  const addresses = useAsync(
    async () => (account() ? repository.addresses(account() as string) : []),
    [dataVersion],
  );

  const lines = cart.flatMap((line) => {
    const product = (products.data ?? []).find((p) => p.id === line.productId);
    return product ? [{ line, product }] : [];
  });
  const subtotalMinor = lines.reduce((sum, { line, product }) => sum + product.priceMinor * line.quantity, 0);
  const deliveryMinor = [...new Set(lines.map(({ product }) => product.storeId))].reduce(
    (max, storeId) => Math.max(max, repository.store(storeId)?.deliveryMinor ?? 0),
    0,
  );
  const totalMinor = subtotalMinor + (lines.length ? deliveryMinor : 0);

  const steps = [t('deliveryAddress'), t('paymentMethod'), t('orderSummary'), t('orderPlaced')];
  const methods = [
    { key: 'CASH', label: t('payCash') },
    { key: 'BENEFITPAY', label: t('payBenefitPay') },
    { key: 'CARD', label: t('payCard') },
    { key: 'WALLET', label: t('payWallet') },
  ];

  return (
    <Screen>
      <ScreenHeader title={t('checkout')} subtitle={steps[step]} />

      <View style={[styles.steps, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
        {steps.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: space.xs }}>
            <View
              style={[
                styles.stepBar,
                { backgroundColor: i <= step ? theme.gold : theme.surfaceRaised },
              ]}
            />
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
          {addresses.loading ? null : (addresses.data ?? []).length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('addresses')}
            </Body>
          ) : (
            (addresses.data ?? []).map((address) => (
              <ListRow
                key={address.id}
                testID={`checkout-address-${address.id}`}
                title={locale === 'ar' ? address.labelAr : address.labelEn}
                subtitle={locale === 'ar' ? address.lineAr : address.lineEn}
                trailing={address.isDefault ? <Chip label={t('defaultAddress')} active /> : undefined}
                onPress={() => setAddressId(address.id)}
              />
            ))
          )}
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <SectionLabel>{t('paymentMethod')}</SectionLabel>
          <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
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
            {t('demoNotice')}
          </Body>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <SectionLabel>{t('orderSummary')}</SectionLabel>
          {lines.map(({ line, product }) => (
            <ListRow
              key={product.id}
              title={locale === 'ar' ? product.nameAr : product.nameEn}
              subtitle={`${line.quantity} × ${formatMoney(product.priceMinor)}`}
              trailing={
                <Text style={{ color: theme.text, fontWeight: '600' }}>
                  {formatMoney(product.priceMinor * line.quantity)}
                </Text>
              }
            />
          ))}
          <Divider />
          <ListRow title={t('subtotal')} trailing={<Text style={{ color: theme.text }}>{formatMoney(subtotalMinor)}</Text>} />
          <ListRow
            title={t('delivery')}
            trailing={<Text style={{ color: theme.text }}>{formatMoney(deliveryMinor)}</Text>}
          />
          <ListRow
            title={t('total')}
            trailing={<Text style={{ color: theme.gold, fontWeight: '700' }}>{formatMoney(totalMinor)}</Text>}
          />
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <Heading size="heading">{t('orderPlaced')}</Heading>
          <Body muted size="label" style={{ marginTop: space.sm }}>
            {t('demoNotice')}
          </Body>
          <View style={{ marginTop: space.md }}>
            <Button title={t('trackOrder')} onPress={() => router.replace('/orders')} />
          </View>
        </Card>
      ) : null}

      {step < 3 ? (
        <View style={{ gap: space.sm }}>
          <Button
            testID="checkout-next"
            title={step === 2 ? t('placeOrder') : t('continue')}
            disabled={lines.length === 0 || (step === 0 && !addressId)}
            onPress={() => {
              if (step === 2) clearCart();
              setStep(step + 1);
            }}
          />
          {step > 0 ? <Button title={t('back')} variant="secondary" onPress={() => setStep(step - 1)} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

/** The signed-in customer id, read from the same demo store the app context uses. */
function account(): string | null {
  return null;
}

const styles = StyleSheet.create({
  steps: { gap: space.sm, marginBottom: space.md },
  stepBar: { height: 4, borderRadius: 2 },
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
