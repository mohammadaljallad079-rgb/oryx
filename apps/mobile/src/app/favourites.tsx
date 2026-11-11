import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { useLiveFavorites } from '../lib/live-favorites';
import { favoriteToDemoProduct } from '../lib/api-adapters';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { ProductCard, ProviderCard, StoreCard } from '../components/cards';
import { Body, Button, Screen, SectionLabel, StateView } from '../components/ui';
import { isOffline } from '../lib/api';
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
  const live = useLiveFavorites();
  const isLive = live.mode === 'live';
  const products = useAsync(async () => repository.products(), [dataVersion]);
  const stores = useAsync(async () => repository.stores(), [dataVersion]);
  const providers = useAsync(async () => repository.providers(), [dataVersion]);

  const loading = products.loading || stores.loading || providers.loading;
  const savedProducts = (products.data ?? []).filter((p) => favourites.includes(`product:${p.id}`));
  const savedStores = (stores.data ?? []).filter((s) => favourites.includes(`store:${s.id}`));
  const savedProviders = (providers.data ?? []).filter((p) => favourites.includes(`provider:${p.id}`));
  // In live mode the list is the server's, mapped onto the card's shape. The
  // demo lists are untouched and are only used when there is no session.
  const liveProducts = live.items.map(favoriteToDemoProduct);
  const total = isLive ? live.items.length : savedProducts.length + savedStores.length + savedProviders.length;

  if (isLive && live.error && live.items.length === 0) {
    return (
      <Screen>
        <ScreenHeader title={t('favourites')} />
        <StateView kind="error" message={isOffline() ? t('offlineBody') : t('loadFailed')} />
        <Button title={t('retry')} onPress={() => void live.refresh()} />
      </Screen>
    );
  }

  if (isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('favourites')} subtitle={`${total}`} />
        {live.loading && live.items.length === 0 ? (
          <StateView kind="loading" />
        ) : total === 0 ? (
          <StateView kind="empty" message={t('empty')} />
        ) : (
          <>
            <SectionLabel>{t('parts')}</SectionLabel>
            <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {liveProducts.map((product) => (
                <ProductCard key={product.id} product={product} width={160} />
              ))}
            </View>
          </>
        )}
        <Body size="caption" muted align="center">
          {t('liveData')}
        </Body>
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

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
      <Body size="caption" muted align="center">
        {t('demoData')}
      </Body>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
});
