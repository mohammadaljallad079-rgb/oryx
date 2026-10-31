import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photoSmall } from '../../lib/assets';
import { useLiveCatalog, useLiveProviders } from '../../lib/live-catalog';
import { catalogProductToDemo, catalogStoreToDemo, publicProviderToDemo } from '../../lib/api-adapters';
import { AppHeader } from '../../components/brand';
import { ProviderCard, StoreCard } from '../../components/cards';
import {
  Body,
  Chip,
  Field,
  Photo,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';

/**
 * The search tab.
 *
 * One field over the live marketplace — products, stores and approved providers —
 * with the result kind as a filter chip. Products and stores are narrowed by the
 * API's own `query` parameter, so the catalogue is searched server-side; the
 * provider directory has no search parameter, so its (bounded) list is narrowed
 * locally. A term that finds nothing says so rather than showing an empty list.
 */
export default function Search() {
  const { t, theme, direction } = useApp();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'products' | 'stores' | 'providers'>('all');

  const term = query.trim().toLowerCase();
  const enabled = term.length > 0;

  // Products and stores are searched by the API; a blank term loads nothing.
  const liveCatalog = useLiveCatalog({ query: term, enabled });
  const liveProviders = useLiveProviders({ enabled });

  const results = useMemo(() => {
    if (term.length === 0) {
      return { products: [], stores: [], providers: [] };
    }
    const has = (...values: Array<string | undefined>) =>
      values.some((v) => (v ?? '').toLowerCase().includes(term));
    return {
      products: liveCatalog.products.map(catalogProductToDemo),
      stores: liveCatalog.stores.map(catalogStoreToDemo),
      providers: liveProviders.providers
        .filter((p) => has(p.nameEn, p.nameAr))
        .map(publicProviderToDemo),
    };
  }, [term, liveCatalog.products, liveCatalog.stores, liveProviders.providers]);

  const total = results.products.length + results.stores.length + results.providers.length;
  const show = (k: typeof kind) => kind === 'all' || kind === k;

  const kinds: Array<{ key: typeof kind; label: string }> = [
    { key: 'all', label: t('categoriesAll') },
    { key: 'products', label: t('parts') },
    { key: 'stores', label: t('stores') },
    { key: 'providers', label: t('services') },
  ];

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Field
          label={t('search')}
          testID="search-field"
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchEverything')}
          autoCorrect={false}
          returnKeyType="search"
        />

        <View
          style={[styles.chips, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}
        >
          {kinds.map((k) => (
            <Chip
              key={k.key}
              testID={`search-kind-${k.key}`}
              label={k.label}
              active={kind === k.key}
              onPress={() => setKind(k.key)}
            />
          ))}
        </View>

        {term.length === 0 ? (
          <StateView kind="empty" message={t('searchEverything')} />
        ) : total === 0 ? (
          <StateView kind="empty" message={t('empty')} />
        ) : (
          <>
            {show('products') && results.products.length > 0 ? (
              <>
                <SectionLabel>{t('parts')}</SectionLabel>
                {results.products.slice(0, 12).map((product) => (
                  <Pressable
                    key={product.id}
                    testID={`search-product-${product.id}`}
                    accessibilityRole="button"
                    onPress={() => router.push(`/parts/${product.id}`)}
                    style={({ pressed }) => [
                      styles.row,
                      { borderColor: theme.borderSoft },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Photo
                      source={photoSmall(product.photo)}
                      height={56}
                      width={56}
                      radiusValue={radius.md}
                    />
                    <View
                      style={[
                        styles.rowBody,
                        { alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' },
                      ]}
                    >
                      <Text
                        style={{ color: theme.text, fontWeight: '600', fontSize: typography.body }}
                        numberOfLines={1}
                      >
                        {product.nameEn}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: typography.caption }}>
                        {product.sku}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            ) : null}

            {show('stores') && results.stores.length > 0 ? (
              <>
                <SectionLabel>{t('stores')}</SectionLabel>
                {results.stores.map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
              </>
            ) : null}

            {show('providers') && results.providers.length > 0 ? (
              <>
                <SectionLabel>{t('services')}</SectionLabel>
                {results.providers.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} />
                ))}
              </>
            ) : null}

            <Body size="caption" muted align="center">
              {total}
            </Body>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: space.sm, flexWrap: 'wrap' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
  },
  rowBody: { flex: 1, gap: 2 },
});
