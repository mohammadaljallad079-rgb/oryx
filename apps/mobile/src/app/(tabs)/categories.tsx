import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader, DemoBanner } from '../../components/brand';
import { ProviderCard, StoreCard } from '../../components/cards';
import { Body, Photo, Screen, SectionLabel, StateView } from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';

/**
 * The categories tab.
 *
 * The reference puts five service categories in a rail on the home screen and a
 * Categories destination in the bottom bar. This is that destination: the same
 * five categories, one per row and large enough to read, followed by the store
 * directory, which is the other way a customer browses.
 *
 * Each tile carries a real bundled photograph and opens the catalogue filtered to
 * that category, so the tab is a way into the catalogue rather than a static list.
 */
export default function Categories() {
  const { t, theme, direction, dataVersion } = useApp();
  const router = useRouter();

  const stores = useAsync(() => repository.stores({ sort: 'rating' }), [dataVersion]);
  const providers = useAsync(() => repository.nearbyProviders(4), [dataVersion]);

  const categories = [
    {
      key: 'spare_parts',
      label: t('spareParts'),
      photo: 'partsStore' as const,
      href: '/parts?category=spare_parts',
    },
    {
      key: 'maintenance',
      label: t('maintenance'),
      photo: 'mechanicEngine' as const,
      href: '/services?kind=maintenance',
    },
    {
      key: 'vehicle_inspection',
      label: t('carInspection'),
      photo: 'inspectionBay' as const,
      href: '/services?kind=inspection',
    },
    {
      key: 'recovery',
      label: t('catTowing'),
      photo: 'recoveryTow' as const,
      href: '/recovery',
    },
    {
      key: 'accessories',
      label: t('accessories'),
      photo: 'carwashPremium' as const,
      href: '/parts?category=accessories',
    },
  ];

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <DemoBanner />

        <SectionLabel>{t('categories')}</SectionLabel>
        <View style={{ gap: space.md }}>
          {categories.map((category) => (
            <Pressable
              key={category.key}
              testID={`category-tile-${category.key}`}
              accessibilityRole="button"
              accessibilityLabel={category.label}
              onPress={() => router.push(category.href)}
              style={({ pressed }) => [
                styles.tile,
                { borderColor: theme.border, backgroundColor: theme.surface },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Photo
                source={photo(category.photo)}
                height={104}
                width={104}
                radiusValue={radius.md}
              />
              <View
                style={[
                  styles.tileBody,
                  { alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' },
                ]}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.subheading }}>
                  {category.label}
                </Text>
                <Text style={{ color: theme.gold, fontSize: typography.label, marginTop: space.xs }}>
                  {direction === 'rtl' ? '‹' : '›'} {t('seeAll')}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredStores')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts?tab=stores')}>
            <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        {(stores.data ?? []).slice(0, 4).map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}

        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredProviders')}</SectionLabel>
          <Pressable onPress={() => router.push('/services')}>
            <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        {(providers.data ?? []).length === 0 ? (
          <StateView kind="empty" />
        ) : (
          (providers.data ?? []).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))
        )}

        <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
          {t('demoData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  tileBody: { flex: 1, gap: space.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
});
