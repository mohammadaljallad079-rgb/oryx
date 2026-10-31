import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { useLiveCart } from '../lib/live-cart';
import { photoSmall } from '../lib/assets';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Divider, Photo, Screen, StateView } from '../components/ui';
import { radius, space, typography } from '../lib/theme';
import { formatMoney, localizeDigits } from '../lib/format';
import { isOffline } from '../lib/api';

/**
 * The cart.
 *
 * Two modes, and the screen says which one it is showing:
 *
 *   - **Live** — a session exists, so the cart is the server's. Quantities,
 *     removals and every total come from the API. The figure on screen is the
 *     server's number, never a local multiplication, because a device must not
 *     decide what something costs.
 *   - **Demo** — no session, so the cart is the local demo cart and the footer
 *     says "Demo data".
 *
 * The approved card design is unchanged: same photo, same stepper, same total
 * block. Only the source of the data differs.
 */
export default function Cart() {
  const { t, theme, locale, direction, cart, setCartQuantity, removeFromCart, dataVersion } = useApp();
  const live = useLiveCart();
  const router = useRouter();

  const isLive = live.mode === 'live';
  // The demo catalogue is only read outside a live session; a live cart's lines
  // carry their own product data from the server.
  const products = useAsync(
    async () => (isLive ? [] : repository.products()),
    [dataVersion, isLive],
  );

  const demoLines = cart.flatMap((line) => {
    const product = (products.data ?? []).find((p) => p.id === line.productId);
    if (!product) return [];
    return [{ line, product }];
  });

  const demoSubtotal = demoLines.reduce(
    (sum, { line, product }) => sum + product.priceMinor * line.quantity,
    0,
  );
  const storeIds = [...new Set(demoLines.map(({ product }) => product.storeId))];
  const demoDelivery = storeIds.reduce((max, storeId) => {
    const store = repository.store(storeId);
    return Math.max(max, store?.deliveryMinor ?? 0);
  }, 0);

  // In live mode every figure is the server's; in demo mode the demo cart's own.
  const itemCount = isLive ? live.items.length : cart.length;
  const subtotalMinor = isLive ? live.totalMinor : demoSubtotal;
  const deliveryMinor = isLive ? 0 : demoLines.length > 0 ? demoDelivery : 0;
  const totalMinor = subtotalMinor + deliveryMinor;
  const isEmpty = isLive ? live.items.length === 0 : demoLines.length === 0;
  const rowDirection = direction === 'rtl' ? 'row-reverse' : 'row';

  const header = (
    <ScreenHeader
      title={t('cart')}
      subtitle={`${localizeDigits(itemCount, locale)} ${t('items')}`}
    />
  );

  // A live cart that failed to load shows the failure and a retry — not an empty
  // cart. Reporting "empty" when the request failed is a lie the user acts on:
  // they would re-add items they already have.
  if (isLive && live.error && live.items.length === 0) {
    return (
      <Screen padded={false}>
        <View style={{ padding: space.lg, gap: space.md }}>
          {header}
          <Card>
            <StateView kind="error" message={isOffline() ? t('offlineBody') : t('loadFailed')} />
            <Button title={t('retry')} onPress={() => void live.refresh()} />
          </Card>
        </View>
      </Screen>
    );
  }

  if (isLive && live.loading && live.items.length === 0) {
    return (
      <Screen padded={false}>
        <View style={{ padding: space.lg, gap: space.md }}>
          {header}
          <StateView kind="loading" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, gap: space.md }}>
        {header}

        {isEmpty ? (
          <Card>
            <StateView kind="empty" message={t('cartEmpty')} />
            <Button title={t('continueShopping')} onPress={() => router.replace('/(tabs)/parts')} />
          </Card>
        ) : (
          <>
            {isLive
              ? live.items.map((item) => (
                  <Card key={item.id}>
                    <View style={[styles.row, { flexDirection: rowDirection }]}>
                      <Photo
                        source={photoSmall('partsStore')}
                        height={64}
                        width={64}
                        radiusValue={radius.md}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                          {locale === 'ar' ? item.nameAr : item.nameEn}
                        </Text>
                        <Body size="caption" muted>
                          {item.sku} · {formatMoney(item.unitPriceMinor)}
                        </Body>
                      </View>
                    </View>
                    <View style={[styles.controlRow, { flexDirection: rowDirection }]}>
                      <View style={[styles.stepper, { borderColor: theme.border }]}>
                        <Pressable
                          accessibilityRole="button"
                          // Disabled while a write is in flight, so a double tap
                          // cannot become two increments.
                          disabled={live.busy}
                          onPress={() =>
                            item.quantity <= 1
                              ? void live.remove(item.productId)
                              : void live.setQuantity(item.productId, item.quantity - 1)
                          }
                          style={styles.step}
                        >
                          <Text style={{ color: live.busy ? theme.textFaint : theme.text, fontSize: 18 }}>
                            −
                          </Text>
                        </Pressable>
                        <Text style={{ color: theme.text, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>
                          {localizeDigits(item.quantity, locale)}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          disabled={live.busy}
                          onPress={() => void live.setQuantity(item.productId, item.quantity + 1)}
                          style={styles.step}
                        >
                          <Text style={{ color: live.busy ? theme.textFaint : theme.text, fontSize: 18 }}>
                            +
                          </Text>
                        </Pressable>
                      </View>
                      {/* The line total is the server's own figure. */}
                      <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.body }}>
                        {formatMoney(item.lineTotalMinor)}
                      </Text>
                    </View>
                    <Pressable
                      disabled={live.busy}
                      onPress={() => void live.remove(item.productId)}
                      style={{ marginTop: space.sm }}
                    >
                      <Text style={{ color: theme.danger, fontSize: typography.label, fontWeight: '600' }}>
                        {t('remove')}
                      </Text>
                    </Pressable>
                  </Card>
                ))
              : demoLines.map(({ line, product }) => (
                  <Card key={product.id}>
                    <View style={[styles.row, { flexDirection: rowDirection }]}>
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
                    <View style={[styles.controlRow, { flexDirection: rowDirection }]}>
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
              {/* Delivery is only modelled for the demo cart. The live catalogue
                  has no per-store delivery fee, so no row is shown rather than a
                  zero that would read as free delivery. */}
              {isLive ? null : (
                <View style={styles.totalRow}>
                  <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('delivery')}</Text>
                  <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}>
                    {deliveryMinor === 0 ? t('freeDelivery') : formatMoney(deliveryMinor)}
                  </Text>
                </View>
              )}
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

            <Button
              testID="cart-checkout"
              title={t('checkout')}
              disabled={isLive && live.busy}
              onPress={() => router.push('/checkout')}
            />
            <Button title={t('continueShopping')} variant="secondary" onPress={() => router.push('/(tabs)/parts')} />
          </>
        )}

        <Body size="caption" muted align="center">
          {isLive ? t('liveData') : t('demoData')}
        </Body>
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
