import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../../lib/app-context';
import { photo } from '../../../lib/assets';
import { repository } from '../../../lib/repository';
import { useAsync } from '../../../lib/use-async';
import { ScreenHeader } from '../../../components/brand';
import { ProductCard } from '../../../components/cards';
import {
  Body,
  Card,
  Chip,
  DetailRow,
  Divider,
  Photo,
  RatingPill,
  Screen,
  SectionLabel,
  StateView,
} from '../../../components/ui';
import { space, typography } from '../../../lib/theme';
import { formatMoney, localizeDigits } from '../../../lib/format';

/**
 * A storefront.
 *
 * The store header, its published terms and its whole catalogue. A customer who
 * arrives here from a product card or the directory can see everything the store
 * sells without going back.
 */
export default function StoreDetail() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [sort, setSort] = useState<'relevance' | 'price_asc' | 'price_desc'>('relevance');

  const store = useAsync(async () => repository.store(id), [id, dataVersion]);
  const products = useAsync(async () => repository.products({ storeId: id, sort }), [id, sort, dataVersion]);
  const reviews = useAsync(async () => repository.reviews(id), [id, dataVersion]);

  if (store.loading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!store.data) {
    return (
      <Screen>
        <ScreenHeader title={t('error')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const shop = store.data;
  const name = locale === 'ar' ? shop.nameAr : shop.nameEn;

  return (
    <Screen padded={false}>
      <Photo source={photo(shop.photo)} height={200} width="100%" radiusValue={0} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <ScreenHeader title={name} />

        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <RatingPill rating={shop.rating} count={shop.reviewCount} />
          {shop.verified ? <Chip label={t('verified')} active /> : null}
          <Chip label={localizeDigits(shop.since, locale)} />
        </View>

        <Card>
          <DetailRow
            label={t('delivery')}
            value={shop.deliveryMinor === 0 ? t('freeDelivery') : formatMoney(shop.deliveryMinor)}
          />
          <DetailRow label={t('subtotal')} value={`${t('from')} ${formatMoney(shop.minimumOrderMinor)}`} />
          <Divider />
          <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {shop.tags.map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        </Card>

        <SectionLabel>{t('products')}</SectionLabel>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Chip label={t('sortRelevance')} active={sort === 'relevance'} onPress={() => setSort('relevance')} />
          <Chip label={t('sortPriceAsc')} active={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
          <Chip label={t('sortPriceDesc')} active={sort === 'price_desc'} onPress={() => setSort('price_desc')} />
        </View>

        {products.loading ? (
          <StateView kind="loading" />
        ) : (products.data ?? []).length === 0 ? (
          <StateView kind="empty" message={t('noResults')} />
        ) : (
          <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {(products.data ?? []).map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                width={160}
                onPress={() => router.push(`/parts/${product.id}`)}
              />
            ))}
          </View>
        )}

        <SectionLabel>{t('reviews')}</SectionLabel>
        {(reviews.data ?? []).length === 0 ? (
          <Body muted size="label">
            {t('noReviews')}
          </Body>
        ) : (
          (reviews.data ?? []).map((review) => (
            <Card key={review.id}>
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
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  grid: { flexWrap: 'wrap', gap: space.md },
});
