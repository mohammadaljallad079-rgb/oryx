import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo, photoSmall } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
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
  RatingPill,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { discountPercent, formatMoney, localizeDigits } from '../../lib/format';

/**
 * A product.
 *
 * The add-to-cart control is the reason this screen exists, so it is pinned in a
 * bar at the bottom rather than buried after the specifications. The quantity
 * selector and the favourite toggle are both real state.
 */
export default function ProductDetail() {
  const { t, theme, locale, direction, addToCart, isFavourite, toggleFavourite, dataVersion } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const product = useAsync(async () => repository.product(id), [id, dataVersion]);
  const store = useAsync(
    async () => (product.data ? repository.store(product.data.storeId) : undefined),
    [product.data?.storeId, dataVersion],
  );
  const related = useAsync(async () => repository.relatedProducts(id), [id, dataVersion]);
  const reviews = useAsync(async () => repository.reviews(id), [id, dataVersion]);

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
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const item = product.data;
  const name = locale === 'ar' ? item.nameAr : item.nameEn;
  const off = discountPercent(item.priceMinor, item.compareAtMinor);
  const favourite = isFavourite(`product:${item.id}`);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
        <ScreenHeader title={name} subtitle={item.brand} />
      </View>
      <Photo source={photo(item.photo)} height={240} width="100%" radiusValue={0} />

      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <RatingPill rating={item.rating} count={item.reviewCount} />
          <Chip label={item.brand} />
          {item.stock > 0 ? <Chip label={t('inStock')} active /> : <Chip label={t('outOfStock')} />}
          {item.stock > 0 && item.stock <= 5 ? <Chip label={t('lowStock')} /> : null}
        </View>

        <View style={[styles.priceRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Text style={{ color: theme.gold, fontSize: typography.title, fontWeight: '700' }}>
            {formatMoney(item.priceMinor)}
          </Text>
          {off ? (
            <>
              <Text style={[styles.strike, { color: theme.textFaint }]}>
                {formatMoney(item.compareAtMinor ?? 0)}
              </Text>
              <View style={[styles.offPill, { backgroundColor: theme.gold }]}>
                <Text style={{ color: theme.onGold, fontSize: typography.caption, fontWeight: '700' }}>
                  {localizeDigits(off, locale)}% {t('off')}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {store.data ? (
          <Card onPress={() => router.push(`/parts/store/${store.data?.id}`)}>
            <View style={styles.row}>
              <Photo source={photoSmall(store.data.photo)} height={44} width={44} radiusValue={radius.md} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                  {locale === 'ar' ? store.data.nameAr : store.data.nameEn}
                </Text>
                <Body size="caption" muted>
                  {store.data.deliveryMinor === 0 ? t('freeDelivery') : formatMoney(store.data.deliveryMinor)} ·{' '}
                  {t('soldBy')}
                </Body>
              </View>
              {store.data.verified ? <Chip label={t('verified')} active /> : null}
            </View>
          </Card>
        ) : null}

        <Card>
          <Heading size="subheading">{t('description')}</Heading>
          <Body muted size="label" style={{ marginTop: space.sm }}>
            {locale === 'ar'
              ? `${item.nameAr} — ${item.groupAr} من ${item.brand}. مطابق للأصناف المدرجة أدناه.`
              : `${item.nameEn} — ${item.groupEn} by ${item.brand}, listed to fit the models below.`}
          </Body>
          <Divider />
          <DetailRow label={t('brand')} value={item.brand} />
          <DetailRow label={t('sku')} value={item.sku} />
          <DetailRow label={t('warranty')} value={`${localizeDigits(item.warrantyMonths, locale)} ${t('months')}`} />
          <DetailRow label={t('partGroup')} value={locale === 'ar' ? item.groupAr : item.groupEn} />
          <DetailRow label={t('inStock')} value={localizeDigits(item.stock, locale)} />
        </Card>

        <Card>
          <SectionLabel>{t('fitsTheseCars')}</SectionLabel>
          <View
            style={[
              styles.row,
              { marginTop: space.sm, flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' },
            ]}
          >
            {item.fits.map((make) => (
              <Chip key={make} label={make} />
            ))}
          </View>
        </Card>

        <Card>
          <SectionLabel>{t('reviews')}</SectionLabel>
          {(reviews.data ?? []).length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('noReviews')}
            </Body>
          ) : (
            (reviews.data ?? []).map((review) => (
              <View key={review.id} style={{ marginTop: space.md }}>
                <View style={styles.row}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label }}>
                    {locale === 'ar' ? review.authorAr : review.authorEn}
                  </Text>
                  <Text style={{ color: theme.gold, fontSize: typography.caption }}>
                    {'★'.repeat(Math.max(1, Math.round(review.rating)))}
                  </Text>
                </View>
                <Body size="caption" muted style={{ marginTop: 2 }}>
                  {locale === 'ar' ? review.bodyAr : review.bodyEn}
                </Body>
              </View>
            ))
          )}
          <View style={{ marginTop: space.md }}>
            <Button title={t('writeReview')} variant="secondary" onPress={() => router.push('/support')} />
          </View>
        </Card>

        <SectionLabel>{t('relatedProducts')}</SectionLabel>
        <Rail>
          {(related.data ?? []).map((relatedItem) => (
            <ProductCard key={relatedItem.id} product={relatedItem} />
          ))}
        </Rail>

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
          onPress={() => toggleFavourite(`product:${item.id}`)}
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
            onPress={() => setQuantity((q) => Math.min(item.stock || 99, q + 1))}
            style={styles.step}
          >
            <Text style={{ color: theme.text, fontSize: 18 }}>+</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            testID="product-add-to-cart"
            title={added ? t('addedToCart') : t('addToCart')}
            disabled={item.stock <= 0}
            onPress={() => {
              addToCart(item.id, quantity);
              setAdded(true);
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  priceRow: { alignItems: 'center', gap: space.sm },
  strike: { textDecorationLine: 'line-through', fontSize: typography.label },
  offPill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
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
