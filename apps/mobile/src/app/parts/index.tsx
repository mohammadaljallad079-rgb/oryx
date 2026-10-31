import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository, type DemoProduct } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveCatalog, filterLiveProducts } from '../../lib/live-catalog';
import { useLiveSession } from '../../lib/live-session';
import { catalogProductToDemo, catalogStoreToDemo } from '../../lib/api-adapters';
import { AppHeader, DemoBanner } from '../../components/brand';
import { ProductCard, StoreCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';
import { isOffline } from '../../lib/api';

/** The sorts the live catalogue can honour. A rating sort is not offered: the
 * public projection carries no rating to sort by. */
type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'name';

/**
 * The parts catalogue.
 *
 * The default source is the **real** public catalogue from
 * `/customer/catalog/products`, with the store directory from
 * `/customer/catalog/stores`. The filters the API can honour — a text term, a
 * price sort, availability and a store — are applied to the live rows; a filter
 * that needs a field the public projection does not carry (a discount, a car
 * make) is not offered against live data rather than faked.
 *
 * A live failure shows the failure and a retry. It does not silently swap in the
 * demo catalogue, because a customer must never be shown an invented price.
 */
export default function Parts() {
  const { t, theme, direction, locale } = useApp();
  const { isLive } = useLiveSession();
  const params = useLocalSearchParams<{ category?: string; store?: string; tab?: string }>();

  const [tab, setTab] = useState<'products' | 'stores'>(
    params.tab === 'stores' ? 'stores' : 'products',
  );
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string | undefined>(params.store);

  // Live catalogue. The API also narrows by term and tenant, so a large
  // catalogue is filtered server-side as well as locally.
  const live = useLiveCatalog({ query, companyId: storeFilter, sort });

  // The demo catalogue is read only so a screen can tell the two apart; it is
  // never blended into the live list.
  const demoProducts = useAsync(() => repository.products(), []);

  const liveProducts = useMemo(
    () => filterLiveProducts(live.products, { query, sort, availableOnly }),
    [live.products, query, sort, availableOnly],
  );
  const liveStores = useMemo(() => live.stores.map(catalogStoreToDemo), [live.stores]);

  // A live failure with nothing to show is an error state, not an empty one.
  if (live.error && live.products.length === 0 && live.stores.length === 0) {
    return (
      <Screen padded={false}>
        <AppHeader />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Card>
            <StateView kind="error" message={isOffline() ? t('offlineBody') : t('loadFailed')} />
            <Button title={t('retry')} onPress={live.reload} />
          </Card>
        </View>
      </Screen>
    );
  }

  const activeFilterCount =
    (availableOnly ? 1 : 0) + (storeFilter ? 1 : 0) + (sort !== 'relevance' ? 1 : 0);

  const clearFilters = () => {
    setAvailableOnly(false);
    setStoreFilter(undefined);
    setSort('relevance');
  };

  const sortOptions: Array<{ key: SortKey; label: string }> = [
    { key: 'relevance', label: t('sortRelevance') },
    { key: 'price_asc', label: t('sortPriceAsc') },
    { key: 'price_desc', label: t('sortPriceDesc') },
    { key: 'name', label: t('sortName') },
  ];

  const products: DemoProduct[] = liveProducts.map(catalogProductToDemo);
  const stores = liveStores;
  // The demo rail is for the offline demo only. A live session with an empty
  // catalogue shows the empty state, never an invented product.
  const usingDemo = !isLive && live.products.length === 0 && live.stores.length === 0 && !live.loading;

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={[styles.tabs, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Chip
            testID="parts-tab-products"
            label={t('parts')}
            active={tab === 'products'}
            onPress={() => setTab('products')}
          />
          <Chip
            testID="parts-tab-stores"
            label={t('stores')}
            active={tab === 'stores'}
            onPress={() => setTab('stores')}
          />
        </View>

        <Field
          label={t('search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchPlaceholder')}
          testID="parts-search"
        />

        {tab === 'products' ? (
          <>
            <View style={[styles.toolbar, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Pressable
                testID="parts-open-filters"
                accessibilityRole="button"
                onPress={() => setShowFilters((v) => !v)}
                style={[
                  styles.filterButton,
                  {
                    borderColor: activeFilterCount ? theme.gold : theme.border,
                    backgroundColor: theme.surfaceRaised,
                  },
                ]}
              >
                <Text
                  style={{
                    color: activeFilterCount ? theme.gold : theme.text,
                    fontWeight: '600',
                    fontSize: typography.label,
                  }}
                >
                  {t('filters')}
                  {activeFilterCount ? ` (${localizeDigits(activeFilterCount, locale)})` : ''}
                </Text>
              </Pressable>
              <Body size="label" muted>
                {localizeDigits(products.length, locale)} {t('resultsCount')}
              </Body>
            </View>

            {showFilters ? (
              <Card testID="parts-filters">
                <SectionLabel>{t('sortBy')}</SectionLabel>
                <View style={[styles.chipWrap, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  {sortOptions.map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      active={sort === option.key}
                      onPress={() => setSort(option.key)}
                    />
                  ))}
                </View>

                <View style={[styles.chipWrap, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  <Chip
                    label={t('inStockOnly')}
                    active={availableOnly}
                    onPress={() => setAvailableOnly((v) => !v)}
                  />
                </View>

                <View style={{ marginTop: space.md, gap: space.sm }}>
                  <Button title={t('clearFilters')} variant="secondary" onPress={clearFilters} />
                  <Button title={t('applyFilters')} onPress={() => setShowFilters(false)} />
                </View>
              </Card>
            ) : null}

            {storeFilter ? (
              <Card onPress={() => setStoreFilter(undefined)}>
                <Body size="label" muted>
                  {t('soldBy')}: {live.stores.find((s) => s.id === storeFilter)?.name ?? storeFilter} ·{' '}
                  {t('remove')}
                </Body>
              </Card>
            ) : null}

            {live.loading && products.length === 0 ? (
              <StateView kind="loading" />
            ) : products.length === 0 ? (
              <StateView kind="empty" message={t('noResults')} />
            ) : (
              <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} width={160} />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {live.loading && stores.length === 0 ? (
              <StateView kind="loading" />
            ) : stores.length === 0 ? (
              <StateView kind="empty" message={t('noResults')} />
            ) : (
              stores.map((store) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  onPress={() => {
                    setStoreFilter(store.id);
                    setTab('products');
                  }}
                />
              ))
            )}
          </>
        )}

        {usingDemo ? (
          <>
            <DemoBanner />
            <SectionLabel>{t('demoData')}</SectionLabel>
            {(demoProducts.data ?? []).slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} width={160} />
            ))}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: space.sm },
  toolbar: { alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  filterButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  chipWrap: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.md },
  grid: { flexWrap: 'wrap', gap: space.md },
});
