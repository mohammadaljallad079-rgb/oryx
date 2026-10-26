import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
import { ProviderCard } from '../../components/cards';
import { Body, Chip, Field, Screen, StateView } from '../../components/ui';
import { space } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * The service directory.
 *
 * One list of providers, filtered by kind — inspection, maintenance or recovery —
 * and by city and name. Each card links to a detail screen that carries the
 * published prices, which is where a booking starts.
 */
export default function Services() {
  const { t, locale, direction, dataVersion } = useApp();
  const params = useLocalSearchParams<{ kind?: string }>();
  const router = useRouter();

  const [kind, setKind] = useState<'all' | 'inspection' | 'maintenance' | 'recovery'>(
    params.kind === 'inspection' || params.kind === 'maintenance' || params.kind === 'recovery'
      ? params.kind
      : 'all',
  );
  const [city, setCity] = useState<string>('all');
  const [query, setQuery] = useState('');

  const providers = useAsync(
    () => repository.providers({ kind, cityKey: city === 'all' ? undefined : city, query, sort: 'rating' }),
    [kind, city, query, dataVersion],
  );

  const kinds: Array<{ key: typeof kind; label: string }> = [
    { key: 'all', label: t('categoriesAll') },
    { key: 'inspection', label: t('inspection') },
    { key: 'maintenance', label: t('maintenance') },
    { key: 'recovery', label: t('recovery') },
  ];

  const cities = [
    { key: 'all', label: t('categoriesAll') },
    { key: 'manama', label: locale === 'ar' ? 'المنامة' : 'Manama' },
    { key: 'riffa', label: locale === 'ar' ? 'الرفاع' : 'Riffa' },
    { key: 'muharraq', label: locale === 'ar' ? 'المحرق' : 'Muharraq' },
    { key: 'isa', label: locale === 'ar' ? 'مدينة عيسى' : 'Isa Town' },
    { key: 'hamad', label: locale === 'ar' ? 'مدينة حمد' : 'Hamad Town' },
    { key: 'sitrah', label: locale === 'ar' ? 'سترة' : 'Sitrah' },
  ];

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
          {kinds.map((k) => (
            <Chip
              key={k.key}
              testID={`services-kind-${k.key}`}
              label={k.label}
              active={kind === k.key}
              onPress={() => setKind(k.key)}
            />
          ))}
        </View>

        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {cities.map((c) => (
            <Chip key={c.key} label={c.label} active={city === c.key} onPress={() => setCity(c.key)} />
          ))}
        </View>

        {providers.loading ? (
          <StateView kind="loading" />
        ) : (providers.data ?? []).length === 0 ? (
          <StateView kind="empty" message={t('noResults')} />
        ) : (
          <>
            <Body size="caption" muted>
              {localizeDigits(providers.data?.length ?? 0, locale)} {t('serviceProviders')}
            </Body>
            {(providers.data ?? []).map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onPress={() => router.push(`/services/${provider.id}`)}
              />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm },
});
