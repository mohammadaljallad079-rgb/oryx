import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../../lib/app-context';
import { useLiveStore } from '../../../lib/live-catalog';
import { catalogProductToDemo, catalogStoreToDemo } from '../../../lib/api-adapters';
import { photo } from '../../../lib/assets';
import { ScreenHeader } from '../../../components/brand';
import { ProductCard } from '../../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Photo,
  Screen,
  SectionLabel,
  StateView,
} from '../../../components/ui';
import { space } from '../../../lib/theme';
import { localizeDigits } from '../../../lib/format';
import { isOffline } from '../../../lib/api';

/**
 * A storefront.
 *
 * The store header and its whole published catalogue, both from the real
 * consumer catalogue: `GET /customer/catalog/stores/:id` returns the store and
 * the products it publishes.
 *
 * The public projection carries no rating, no review count, no delivery fee, no
 * minimum order and no founding year, so the header states only what the API
 * returned — the number of published products — instead of asserting terms the
 * marketplace does not hold.
 */
export default function StoreDetail() {
  const { t, locale, direction } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [sort, setSort] = useState<'relevance' | 'price_asc' | 'price_desc'>('relevance');

  const store = useLiveStore(id);

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
        <StateView kind="error" message={isOffline() ? t('offlineBody') : t('noResults')} />
        <Button title={t('retry')} onPress={store.reload} />
      </Screen>
    );
  }

  const shop = store.data;
  const demoShop = catalogStoreToDemo(shop);
  const name = locale === 'ar' ? shop.nameAr : shop.nameEn;

  const sorted = [...shop.products].sort((a, b) => {
    if (sort === 'price_asc') return a.priceMinor - b.priceMinor;
    if (sort === 'price_desc') return b.priceMinor - a.priceMinor;
    return 0;
  });
  const products = sorted.map(catalogProductToDemo);

  return (
    <Screen padded={false}>
      <Photo source={photo(demoShop.photo)} height={200} width="100%" radiusValue={0} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <ScreenHeader title={name} />

        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {demoShop.verified ? <Chip label={t('verified')} active /> : null}
          <Chip label={`${localizeDigits(shop.productTotal, locale)} ${t('parts')}`} />
        </View>

        <Card>
          <DetailRow label={t('store')} value={shop.code} />
          {shop.countryCode ? <DetailRow label={t('city')} value={shop.countryCode} /> : null}
        </Card>

        <SectionLabel>{t('products')}</SectionLabel>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Chip label={t('sortRelevance')} active={sort === 'relevance'} onPress={() => setSort('relevance')} />
          <Chip label={t('sortPriceAsc')} active={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
          <Chip label={t('sortPriceDesc')} active={sort === 'price_desc'} onPress={() => setSort('price_desc')} />
        </View>

        {products.length === 0 ? (
          <StateView kind="empty" message={t('noResults')} />
        ) : (
          <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                width={160}
                onPress={() => router.push(`/parts/${product.id}`)}
              />
            ))}
          </View>
        )}

        <Body size="caption" muted align="center">
          {t('liveData')}
        </Body>
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  grid: { flexWrap: 'wrap', gap: space.md },
});
