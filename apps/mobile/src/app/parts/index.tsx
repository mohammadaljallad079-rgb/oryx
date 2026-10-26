import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { DEMO_CAR_MAKES } from '../../demo/catalogue';
import { filterProducts, repository, type DemoProduct, type ProductFilter } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
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

type SortKey = NonNullable<ProductFilter['sort']>;

/**
 * The parts catalogue.
 *
 * Two tabs — products and stores — with a filter sheet over the products. The
 * filter is applied by the pure `filterProducts` function the repository exports,
 * so the same logic can be unit tested and later moved behind the API without a
 * screen change.
 *
 * The sort and filter state is local; the catalogue itself comes from the
 * repository, which is what the eventual API will serve.
 */
export default function Parts() {
  const { t, theme, direction, locale, dataVersion } = useApp();
  const params = useLocalSearchParams<{ category?: string; store?: string; tab?: string }>();

  const [tab, setTab] = useState<'products' | 'stores'>(
    params.tab === 'stores' ? 'stores' : 'products',
  );
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [make, setMake] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string | undefined>(params.store);

  const allProducts = useAsync(() => repository.products(), [dataVersion]);
  const groups = useAsync(() => repository.productGroups(), [dataVersion]);
  const stores = useAsync(
    () => repository.stores({ sort: 'rating', query }),
    [query, dataVersion],
  );

  const filtered: DemoProduct[] = useMemo(
    () =>
      filterProducts(allProducts.data ?? [], {
        query,
        groupEn: group,
        make,
        storeId: storeFilter,
        sort,
        inStockOnly,
        discountedOnly,
        categoryKey: (params.category as ProductFilter['categoryKey']) ?? 'all',
      }),
    [
      allProducts.data,
      query,
      group,
      make,
      storeFilter,
      sort,
      inStockOnly,
      discountedOnly,
      params.category,
    ],
  );

  const activeFilterCount =
    (group !== 'all' ? 1 : 0) +
    (make !== 'all' ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (discountedOnly ? 1 : 0) +
    (storeFilter ? 1 : 0);

  const clearFilters = () => {
    setGroup('all');
    setMake('all');
    setInStockOnly(false);
    setDiscountedOnly(false);
    setStoreFilter(undefined);
    setSort('relevance');
  };

  const sortOptions: Array<{ key: SortKey; label: string }> = [
    { key: 'relevance', label: t('sortRelevance') },
    { key: 'price_asc', label: t('sortPriceAsc') },
    { key: 'price_desc', label: t('sortPriceDesc') },
    { key: 'rating', label: t('sortRating') },
    { key: 'newest', label: t('sortNewest') },
  ];

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
                <Text style={{ color: activeFilterCount ? theme.gold : theme.text, fontWeight: '600', fontSize: typography.label }}>
                  {t('filters')}
                  {activeFilterCount ? ` (${localizeDigits(activeFilterCount, locale)})` : ''}
                </Text>
              </Pressable>
              <Body size="label" muted>
                {localizeDigits(filtered.length, locale)} {t('resultsCount')}
              </Body>
            </View>

            {showFilters ? (
              <Card testID="parts-filters">
                <SectionLabel>{t('partGroup')}</SectionLabel>
                <View style={[styles.chipWrap, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  <Chip label={t('categoriesAll')} active={group === 'all'} onPress={() => setGroup('all')} />
                  {(groups.data ?? []).map((g) => (
                    <Chip
                      key={g.en}
                      label={locale === 'ar' ? g.ar : g.en}
                      active={group === g.en}
                      onPress={() => setGroup(g.en)}
                    />
                  ))}
                </View>

                <SectionLabel>{t('fitsMake')}</SectionLabel>
                <View style={[styles.chipWrap, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  <Chip label={t('categoriesAll')} active={make === 'all'} onPress={() => setMake('all')} />
                  {DEMO_CAR_MAKES.map((m) => (
                    <Chip key={m} label={m} active={make === m} onPress={() => setMake(m)} />
                  ))}
                </View>

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
                  <Chip label={t('inStockOnly')} active={inStockOnly} onPress={() => setInStockOnly((v) => !v)} />
                  <Chip label={t('discountedOnly')} active={discountedOnly} onPress={() => setDiscountedOnly((v) => !v)} />
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
                  {t('soldBy')}: {stores.data?.find((s) => s.id === storeFilter)?.nameEn ?? storeFilter} · {t('remove')}
                </Body>
              </Card>
            ) : null}

            {allProducts.loading ? (
              <StateView kind="loading" />
            ) : filtered.length === 0 ? (
              <StateView kind="empty" message={t('noResults')} />
            ) : (
              <View
                style={[
                  styles.grid,
                  { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' },
                ]}
              >
                {filtered.map((product) => (
                  <ProductCard key={product.id} product={product} width={160} />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {stores.loading ? (
              <StateView kind="loading" />
            ) : (stores.data ?? []).length === 0 ? (
              <StateView kind="empty" message={t('noResults')} />
            ) : (
              (stores.data ?? []).map((store) => (
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
