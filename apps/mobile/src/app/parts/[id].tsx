import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useLiveCart } from '../../lib/live-cart';
import { useLiveFavorites } from '../../lib/live-favorites';
import { useLiveProduct, useLiveStore } from '../../lib/live-catalog';
import { catalogProductToDemo, catalogStoreToDemo } from '../../lib/api-adapters';
import { ScreenHeader } from '../../components/brand';
import { ProductCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  Heading,
  Photo,
  Rail,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { photoSmall } from '../../lib/assets';
import { radius, space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';
import { isOffline } from '../../lib/api';

/**
 * A product.
 *
 * Everything on this screen is the public catalogue's own record:
 * `GET /customer/catalog/products/:id` for the product and its images, and the
 * related rail from the API's own same-tenant selection.
 *
 * ## What is not shown
 *
 * The public projection carries no rating, no review count, no warranty and no
 * "fits these cars" list, so none of those are asserted. The specifications card
 * lists only the fields the API returned — SKU, store, unit, tax rate — and the
 * stock row reports availability as a boolean rather than a quantity the
 * catalogue deliberately withholds.
 *
 * ## Add to cart
 *
 * The button writes to the **real** cart when a session exists
 * (`POST /customer/cart/items`); as a guest it writes to the local demo cart and
 * says so.
 */
export default function ProductDetail() {
  const { t, theme, locale, direction, addToCart } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const liveCart = useLiveCart();
  const favorites = useLiveFavorites();
  const product = useLiveProduct(id);
  const store = useLiveStore(product.data?.storeId);

  if (product.loading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!product.data) {
    return (
      <Screen>
        <ScreenHeader title={t('error')} />
        <StateView kind="error" message={isOffline() ? t('offlineBody') : t('noResults')} />
        <Button title={t('retry')} onPress={product.reload} />
      </Screen>
    );
  }

  const item = product.data;
  const name = locale === 'ar' ? item.nameAr : item.nameEn;
  const isLive = liveCart.mode === 'live';
  const favourite = favorites.mode === 'live' ? favorites.isFavorite(item.id) : false;
  const related = (item.related ?? []).map(catalogProductToDemo);
  const images = (item.images ?? []).map((image) => image.url).filter((url): url is string => Boolean(url));
  const storeDemo = store.data ? catalogStoreToDemo(store.data) : null;

  const add = async () => {
    setFailure(null);
    if (isLive) {
      try {
        await liveCart.add(item.id, quantity);
      } catch {
        setFailure(t('serverError'));
        return;
      }
    } else {
      // Guest: the local demo cart. The screen says which cart this is.
      addToCart(item.id, quantity);
    }
    setAdded(true);
  };

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
        <ScreenHeader title={name} subtitle={item.store.name} />
      </View>

      <Photo
        source={photoSmall('partsStore')}
        uri={images[0] ?? item.imageUrl ?? null}
        height={240}
        width="100%"
        radiusValue={0}
      />

      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Chip label={item.store.name} />
          {item.available ? <Chip label={t('inStock')} active /> : <Chip label={t('outOfStock')} />}
        </View>

        <View style={[styles.priceRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Text style={{ color: theme.gold, fontSize: typography.title, fontWeight: '700' }}>
            {formatMoney(item.priceMinor)}
          </Text>
        </View>

        {storeDemo ? (
          <Card onPress={() => router.push(`/parts/store/${storeDemo.id}`)}>
            <View style={styles.row}>
              <Photo source={photoSmall(storeDemo.photo)} height={44} width={44} radiusValue={radius.md} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                  {locale === 'ar' ? storeDemo.nameAr : storeDemo.nameEn}
                </Text>
                <Body size="caption" muted>
                  {t('soldBy')}
                </Body>
              </View>
              {storeDemo.verified ? <Chip label={t('verified')} active /> : null}
            </View>
          </Card>
        ) : null}

        <Card>
          <Heading size="subheading">{t('description')}</Heading>
          <Body muted size="label" style={{ marginTop: space.sm }}>
            {locale === 'ar' ? item.nameAr : item.nameEn}
          </Body>
          <Divider />
          <DetailRow label={t('sku')} value={item.sku} />
          <DetailRow label={t('store')} value={item.store.name} />
          <DetailRow label={t('unit')} value={item.unit} />
          <DetailRow label={t('tax')} value={`${localizeDigits(item.taxRateBp / 100, locale)}%`} />
          <DetailRow label={t('inStock')} value={item.available ? t('yes') : t('no')} />
        </Card>

        <SectionLabel>{t('relatedProducts')}</SectionLabel>
        {related.length === 0 ? (
          <StateView kind="empty" message={t('noResults')} />
        ) : (
          <Rail>
            {related.map((relatedItem) => (
              <ProductCard key={relatedItem.id} product={relatedItem} />
            ))}
          </Rail>
        )}

        {failure ? (
          <Body size="label" style={{ color: theme.danger }}>
            {failure}
          </Body>
        ) : null}
        <Body size="caption" muted align="center">
          {isLive ? t('liveData') : t('demoNotice')}
        </Body>

        <View style={{ height: 96 }} />
      </View>

      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favourite ? t('remove') : t('favourites')}
          disabled={favorites.mode !== 'live' || favorites.busy}
          onPress={() => void favorites.toggle(item.id)}
          style={[styles.favButton, { borderColor: theme.border }]}
        >
          <Text style={{ color: favourite ? theme.gold : theme.textMuted, fontSize: 20 }}>
            {favourite ? '★' : '☆'}
          </Text>
        </Pressable>
        <View style={[styles.stepper, { borderColor: theme.border }]}>
          <Pressable accessibilityRole="button" onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={styles.step}>
            <Text style={{ color: theme.text, fontSize: 18 }}>−</Text>
          </Pressable>
          <Text style={{ color: theme.text, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>
            {localizeDigits(quantity, locale)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setQuantity((q) => Math.min(99, q + 1))}
            style={styles.step}
          >
            <Text style={{ color: theme.text, fontSize: 18 }}>+</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            testID="product-add-to-cart"
            title={added ? t('addedToCart') : t('addToCart')}
            disabled={!item.available || liveCart.busy}
            onPress={() => void add()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  priceRow: { alignItems: 'center', gap: space.sm },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
  },
  favButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    height: 48,
    paddingHorizontal: space.sm,
    gap: space.xs,
  },
  step: { paddingHorizontal: space.sm, paddingVertical: space.xs },
});
