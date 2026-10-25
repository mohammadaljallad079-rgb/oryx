import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { photoSmall } from '../lib/assets';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Divider, Photo, Screen, StateView } from '../components/ui';
import { radius, space, typography } from '../lib/theme';
import { formatMoney, localizeDigits } from '../lib/format';

/**
 * The cart.
 *
 * Quantities and removals write straight back to the shared cart state, so the
 * badge on the header and the checkout total cannot disagree with this screen.
 * The delivery fee is the highest fee among the stores in the cart, which is what
 * a single consolidated delivery would cost.
 */
export default function Cart() {
  const { t, theme, locale, direction, cart, setCartQuantity, removeFromCart, dataVersion } = useApp();
  const router = useRouter();

  const products = useAsync(async () => repository.products(), [dataVersion]);

  const lines = cart.flatMap((line) => {
    const product = (products.data ?? []).find((p) => p.id === line.productId);
    if (!product) return [];
    return [{ line, product }];
  });

  const subtotalMinor = lines.reduce((sum, { line, product }) => sum + product.priceMinor * line.quantity, 0);
  const storeIds = [...new Set(lines.map(({ product }) => product.storeId))];
  const deliveryMinor = storeIds.reduce((max, storeId) => {
    const store = repository.store(storeId);
    return Math.max(max, store?.deliveryMinor ?? 0);
  }, 0);
  const totalMinor = subtotalMinor + (lines.length > 0 ? deliveryMinor : 0);

  if (products.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('cart')} />
        <StateView kind="loading" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <ScreenHeader title={t('cart')} subtitle={`${localizeDigits(cart.length, locale)} ${t('items')}`} />

        {lines.length === 0 ? (
          <Card>
            <StateView kind="empty" message={t('cartEmpty')} />
            <Button title={t('continueShopping')} onPress={() => router.replace('/(tabs)/parts')} />
          </Card>
        ) : (
          <>
            {lines.map(({ line, product }) => (
              <Card key={product.id}>
                <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  <Photo source={photoSmall(product.photo)} height={64} width={64} radiusValue={radius.md} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                      {locale === 'ar' ? product.nameAr : product.nameEn}
                    </Text>
                    <Body size="caption" muted>
                      {product.brand} · {formatMoney(product.priceMinor)}
                    </Body>
                  </View>
                </View>
                <View style={[styles.controlRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.stepper, { borderColor: theme.border }]}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCartQuantity(product.id, Math.max(1, line.quantity - 1))}
                      style={styles.step}
                    >
                      <Text style={{ color: theme.text, fontSize: 18 }}>−</Text>
                    </Pressable>
                    <Text style={{ color: theme.text, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>
                      {localizeDigits(line.quantity, locale)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCartQuantity(product.id, line.quantity + 1)}
                      style={styles.step}
                    >
                      <Text style={{ color: theme.text, fontSize: 18 }}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.body }}>
                    {formatMoney(product.priceMinor * line.quantity)}
                  </Text>
                </View>
                <Pressable onPress={() => removeFromCart(product.id)} style={{ marginTop: space.sm }}>
                  <Text style={{ color: theme.danger, fontSize: typography.label, fontWeight: '600' }}>
                    {t('remove')}
                  </Text>
                </Pressable>
              </Card>
            ))}

            <Card>
              <View style={styles.totalRow}>
                <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('subtotal')}</Text>
                <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}>
                  {formatMoney(subtotalMinor)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('delivery')}</Text>
                <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}>
                  {deliveryMinor === 0 ? t('freeDelivery') : formatMoney(deliveryMinor)}
                </Text>
              </View>
              <Divider />
              <View style={styles.totalRow}>
                <Text style={{ color: theme.text, fontSize: typography.subheading, fontWeight: '700' }}>
                  {t('total')}
                </Text>
                <Text style={{ color: theme.gold, fontSize: typography.subheading, fontWeight: '700' }}>
                  {formatMoney(totalMinor)}
                </Text>
              </View>
            </Card>

            <Button testID="cart-checkout" title={t('checkout')} onPress={() => router.push('/checkout')} />
            <Button title={t('continueShopping')} variant="secondary" onPress={() => router.push('/(tabs)/parts')} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  controlRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: space.md, gap: space.md },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    gap: space.xs,
  },
  step: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
});
