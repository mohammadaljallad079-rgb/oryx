import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { ProductCard, ProviderCard, StoreCard } from '../components/cards';
import { Screen, SectionLabel, StateView } from '../components/ui';
import { space } from '../lib/theme';

/**
 * Favourites.
 *
 * The stored keys are `kind:id`, so one list holds products, stores and
 * providers without a second table. A key that no longer resolves is dropped
 * rather than rendered as a blank card.
 */
export default function Favourites() {
  const { t, direction, favourites, dataVersion } = useApp();
  const products = useAsync(async () => repository.products(), [dataVersion]);
  const stores = useAsync(async () => repository.stores(), [dataVersion]);
  const providers = useAsync(async () => repository.providers(), [dataVersion]);

  const loading = products.loading || stores.loading || providers.loading;
  const savedProducts = (products.data ?? []).filter((p) => favourites.includes(`product:${p.id}`));
  const savedStores = (stores.data ?? []).filter((s) => favourites.includes(`store:${s.id}`));
  const savedProviders = (providers.data ?? []).filter((p) => favourites.includes(`provider:${p.id}`));
  const total = savedProducts.length + savedStores.length + savedProviders.length;

  return (
    <Screen>
      <ScreenHeader title={t('favourites')} subtitle={`${total}`} />

      {loading ? (
        <StateView kind="loading" />
      ) : total === 0 ? (
        <StateView kind="empty" message={t('empty')} />
      ) : (
        <>
          {savedProducts.length > 0 ? (
            <>
              <SectionLabel>{t('parts')}</SectionLabel>
              <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                {savedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} width={160} />
                ))}
              </View>
            </>
          ) : null}
          {savedStores.length > 0 ? (
            <>
              <SectionLabel>{t('stores')}</SectionLabel>
              {savedStores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </>
          ) : null}
          {savedProviders.length > 0 ? (
            <>
              <SectionLabel>{t('serviceProviders')}</SectionLabel>
              {savedProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </>
          ) : null}
        </>
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
});
