import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo, photoSmall } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader, DemoBanner } from '../../components/brand';
import { OfferCard, ProductCard, ProviderCard, StoreCard } from '../../components/cards';
import {
  Body,
  Card,
  Heading,
  Photo,
  Rail,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * The marketplace home.
 *
 * The order is deliberate and matches how a customer actually shops: search
 * first, then the four things they came for (parts, services, a check, recovery),
 * then the merchant rails, then the offers. Every rail is real data from the
 * repository, so the page is a window onto the catalogue rather than a mock-up.
 */
export default function Home() {
  const { t, theme, locale, l, direction, dataVersion } = useApp();
  const router = useRouter();

  const banners = useAsync(() => repository.banners(), [dataVersion]);
  const stores = useAsync(() => repository.stores({ sort: 'rating' }), [dataVersion]);
  const offers = useAsync(() => repository.offers(), [dataVersion]);
  const providers = useAsync(() => repository.nearbyProviders(6), [dataVersion]);
  const products = useAsync(() => repository.trendingProducts(8), [dataVersion]);

  const quickActions = [
    { key: 'parts', label: t('parts'), glyph: '▦', href: '/parts' },
    { key: 'services', label: t('services'), glyph: '✦', href: '/services' },
    { key: 'sensage', label: t('sensage'), glyph: '◎', href: '/sensage' },
    { key: 'recovery', label: t('recovery'), glyph: '⛟', href: '/recovery' },
  ];

  const categories = [
    { key: 'spare_parts', label: l({ en: 'Spare parts', ar: 'قطع الغيار' }), photo: 'partsStore' as const },
    { key: 'vehicle_inspection', label: l({ en: 'Inspection', ar: 'الفحص' }), photo: 'inspectionBay' as const },
    { key: 'maintenance', label: l({ en: 'Maintenance', ar: 'الصيانة' }), photo: 'mechanicEngine' as const },
    { key: 'car_wash', label: l({ en: 'Car care', ar: 'العناية بالسيارة' }), photo: 'carwashPremium' as const },
    { key: 'recovery', label: l({ en: 'Recovery', ar: 'السحب' }), photo: 'recoveryTow' as const },
  ];

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <DemoBanner />

        <Pressable
          testID="home-search"
          accessibilityRole="search"
          onPress={() => router.push('/parts')}
          style={({ pressed }) => [
            styles.search,
            { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={{ color: theme.textFaint, fontSize: typography.body }}>
            ⌕  {t('searchPlaceholder')}
          </Text>
        </Pressable>

        {banners.loading ? (
          <StateView kind="loading" />
        ) : (
          <Rail>
            {(banners.data ?? []).map((banner) => (
              <Pressable
                key={banner.id}
                testID={`banner-${banner.id}`}
                accessibilityRole="button"
                onPress={() => router.push(banner.href)}
                style={({ pressed }) => [{ width: 292 }, pressed && { opacity: 0.92 }]}
              >
                <View style={[styles.hero, { borderColor: theme.border }]}>
                  <Photo source={photo(banner.photo)} height={188} width="100%" radiusValue={radius.lg} overlay />
                  <View style={styles.heroBody}>
                    <Text style={styles.heroTitle}>{l({ en: banner.titleEn, ar: banner.titleAr })}</Text>
                    <Text style={styles.heroText}>{l({ en: banner.subtitleEn, ar: banner.subtitleAr })}</Text>
                    <View style={[styles.heroCta, { backgroundColor: theme.gold }]}>
                      <Text style={{ color: theme.onGold, fontWeight: '700', fontSize: typography.label }}>
                        {l({ en: banner.ctaEn, ar: banner.ctaAr })}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </Rail>
        )}

        <View
          style={[
            styles.quickRow,
            { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' },
          ]}
        >
          {quickActions.map((action) => (
            <Pressable
              key={action.key}
              testID={`quick-${action.key}`}
              accessibilityRole="button"
              onPress={() => router.push(action.href)}
              style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}
            >
              <View
                style={[
                  styles.quickIcon,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={{ color: theme.gold, fontSize: 20 }}>{action.glyph}</Text>
              </View>
              <Text style={{ color: theme.text, fontSize: typography.caption, fontWeight: '600' }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHead}>
          <SectionLabel>{t('categories')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')}>
            <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        <Rail>
          {categories.map((category) => (
            <Pressable
              key={category.key}
              testID={`category-${category.key}`}
              accessibilityRole="button"
              onPress={() => router.push(`/parts?category=${category.key}`)}
              style={({ pressed }) => [{ width: 132 }, pressed && { opacity: 0.9 }]}
            >
              <Photo source={photoSmall(category.photo)} height={88} width="100%" radiusValue={radius.md} overlay />
              <Text
                style={{
                  color: theme.text,
                  fontSize: typography.label,
                  fontWeight: '600',
                  marginTop: space.sm,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                }}
              >
                {category.label}
              </Text>
            </Pressable>
          ))}
        </Rail>

        <View style={styles.sectionHead}>
          <SectionLabel>{t('offersAndDiscounts')}</SectionLabel>
        </View>
        <Rail>
          {(offers.data ?? []).map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </Rail>

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
          <SectionLabel>{t('nearbyServices')}</SectionLabel>
          <Pressable onPress={() => router.push('/services')}>
            <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        <Rail>
          {(providers.data ?? []).map((provider) => (
            <View key={provider.id} style={{ width: 268 }}>
              <ProviderCard provider={provider} />
            </View>
          ))}
        </Rail>

        <View style={styles.sectionHead}>
          <SectionLabel>{t('mostRequested')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')}>
            <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        <Rail>
          {(products.data ?? []).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Rail>

        <Card style={{ marginTop: space.md }}>
          <Heading size="subheading">{t('sensageTitle')}</Heading>
          <Body muted size="label" style={{ marginTop: space.xs }}>
            {t('sensageIntro')}
          </Body>
          <Pressable
            onPress={() => router.push('/sensage')}
            style={{ marginTop: space.md }}
            accessibilityRole="button"
          >
            <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
              {t('startAnalysis')} {direction === 'rtl' ? '‹' : '›'}
            </Text>
          </Pressable>
        </Card>

        <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
          {localizeDigits(2026, locale)} · ORYX Marketplace · {t('demoData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 48,
  },
  hero: { borderRadius: radius.lg, overflow: 'hidden' },
  heroBody: { position: 'absolute', inset: 0, padding: space.lg, justifyContent: 'flex-end', gap: space.xs },
  heroTitle: { color: '#ffffff', fontSize: typography.heading, fontWeight: '700' },
  heroText: { color: 'rgba(255,255,255,0.88)', fontSize: typography.label },
  heroCta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.sm,
  },
  quickRow: { gap: space.md, marginTop: space.sm },
  quick: { flex: 1, alignItems: 'center', gap: space.sm },
  quickIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
});
