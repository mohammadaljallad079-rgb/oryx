import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
import { ProviderCard } from '../../components/cards';
import { Body, Button, Card, Chip, Field, Screen, StateView } from '../../components/ui';
import { space } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';
import { isOffline, marketplaceApi, type PublicProvider } from '../../lib/api';
import { publicProviderToDemo } from '../../lib/api-adapters';

/** The service categories the marketplace catalogue defines, as filter keys. */
const KINDS = [
  { key: 'all', labelKey: 'categoriesAll' },
  { key: 'vehicle_inspection', labelKey: 'inspection' },
  { key: 'maintenance', labelKey: 'maintenance' },
  { key: 'recovery', labelKey: 'recovery' },
  { key: 'car_wash', labelKey: 'catCarWash' },
] as const;

/**
 * The service directory.
 *
 * The list is the real public marketplace: `GET /marketplace/providers` returns
 * only `APPROVED` providers with `isActive` listings, so a pending or suspended
 * business cannot appear. Filtering is done on the API's `categoryKey`, which is
 * the same catalogue the admin CMS maintains.
 *
 * The API returns no city, no distance and no free-text search, so the screen
 * does not offer them; a filter it cannot honour would be a control that lies.
 * The rating shown is the server's aggregate over **published** reviews only.
 */
export default function Services() {
  const { t, locale, direction } = useApp();
  const params = useLocalSearchParams<{ kind?: string }>();
  const router = useRouter();

  const [kind, setKind] = useState<string>(
    typeof params.kind === 'string' && params.kind.length > 0 ? params.kind : 'all',
  );
  const [query, setQuery] = useState('');

  const providers = useAsync(
    async () =>
      marketplaceApi.providers({
        categoryKey: kind === 'all' ? undefined : kind,
        pageSize: 50,
      }),
    [kind],
  );

  const rows = useMemo<PublicProvider[]>(() => providers.data?.items ?? [], [providers.data]);

  // A text term is applied locally over the fields the API returned — name and
  // listing names — because the public endpoint has no search parameter.
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((p) =>
      `${p.nameEn} ${p.nameAr} ${p.listings.map((l) => `${l.nameEn} ${l.nameAr}`).join(' ')}`
        .toLowerCase()
        .includes(term),
    );
  }, [rows, query]);

  if (providers.error && rows.length === 0) {
    return (
      <Screen padded={false}>
        <AppHeader />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Card>
            <StateView kind="error" message={isOffline() ? t('offlineBody') : t('loadFailed')} />
            <Button title={t('retry')} onPress={providers.reload} />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Field
          label={t('search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchPlaceholder')}
          testID="services-search"
        />

        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {KINDS.map((k) => (
            <Chip
              key={k.key}
              testID={`services-kind-${k.key}`}
              label={t(k.labelKey)}
              active={kind === k.key}
              onPress={() => setKind(k.key)}
            />
          ))}
        </View>

        {providers.loading && rows.length === 0 ? (
          <StateView kind="loading" />
        ) : filtered.length === 0 ? (
          <StateView kind="empty" message={t('noResults')} />
        ) : (
          <>
            <Body size="caption" muted>
              {localizeDigits(filtered.length, locale)} {t('serviceProviders')}
            </Body>
            {filtered.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={publicProviderToDemo(provider)}
                onPress={() => router.push(`/services/${provider.id}`)}
              />
            ))}
          </>
        )}

        <Body size="caption" muted align="center">
          {t('liveData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm },
});
