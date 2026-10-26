import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo, photoSmall } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader, DemoBanner } from '../../components/brand';
import { ProductCard, ProviderCard } from '../../components/cards';
import { Body, Photo, Rail, Screen, Scrim, SectionLabel, StateView } from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * The marketplace home.
 *
 * Built to the approved reference, top to bottom: the wordmark header with the
 * language toggle, cart and notifications; a tall photographic hero carrying the
 * tagline and its search field; the five service categories; the two booking
 * tiles beside the SENSAGE card; featured providers with their ratings; then
 * popular products.
 *
 * The reference places search *inside* the hero rather than above it, so that is
 * where it sits. Every rail reads the repository, so the page is a window onto
 * the catalogue rather than a static composition, and the hero photograph is a
 * bundled asset under a navy scrim, not a flattened mockup.
 */
export default function Home() {
  const { t, theme, locale, l, direction, dataVersion } = useApp();
  const router = useRouter();

  const providers = useAsync(() => repository.nearbyProviders(6), [dataVersion]);
  const products = useAsync(() => repository.trendingProducts(8), [dataVersion]);

  const categories = [
    { key: 'spare_parts', label: t('spareParts'), photo: 'partsStore' as const },
    { key: 'maintenance', label: t('maintenance'), photo: 'mechanicEngine' as const },
    { key: 'vehicle_inspection', label: t('carInspection'), photo: 'inspectionBay' as const },
    { key: 'recovery', label: t('catTowing'), photo: 'recoveryTow' as const },
    { key: 'accessories', label: t('accessories'), photo: 'carwashPremium' as const },
  ];

  const row = direction === 'rtl' ? 'row-reverse' : 'row';

  return (
    <Screen padded={false}>
      <AppHeader />

      {/* ------------------------------------------------------------- hero */}
      <View style={styles.heroWrap}>
        <Photo source={photo('autoService')} radiusValue={0} style={StyleSheet.absoluteFill} />
        <Scrim color="#00162b" from={0.9} to={0.26} bands={12} />
        <View style={styles.heroLowerFade}>
          <Scrim color="#000f1e" from={0.16} to={0.95} bands={14} />
        </View>

        <View style={styles.heroContent}>
          <Text style={[styles.heroTagline, { writingDirection: direction }]}>
            {t('heroTagline')}
          </Text>
          <Text style={[styles.heroSub, { writingDirection: direction }]}>
            {t('heroSubtitle')}
          </Text>

          <Pressable
            testID="home-search"
            accessibilityRole="search"
            accessibilityLabel={t('searchEverything')}
            onPress={() => router.push('/parts')}
            style={({ pressed }) => [styles.heroSearch, pressed && { opacity: 0.92 }]}
          >
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: typography.body }}>
              ⌕  {t('searchEverything')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ padding: space.lg, gap: space.md }}>
        <DemoBanner />

        {/* -------------------------------------------- service categories */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('categories')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')} testID="categories-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '600' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        <Rail>
          {categories.map((category) => (
            <Pressable
              key={category.key}
              testID={`category-${category.key}`}
              accessibilityRole="button"
              onPress={() => router.push(`/parts?category=${category.key}`)}
              style={({ pressed }) => [{ width: 108 }, pressed && { opacity: 0.9 }]}
            >
              <View style={[styles.catTile, { borderColor: theme.border }]}>
                <Photo
                  source={photoSmall(category.photo)}
                  height={96}
                  width="100%"
                  radiusValue={radius.md}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,22,43,0.42)' }]} />
                <Text style={styles.catLabel} numberOfLines={2}>
                  {category.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </Rail>

        {/* ---------------------------------- SENSAGE and the booking tiles */}
        <View style={[styles.tileRow, { flexDirection: row }]}>
          <Pressable
            testID="sensage-cta"
            accessibilityRole="button"
            onPress={() => router.push('/sensage')}
            style={({ pressed }) => [
              styles.sensageTile,
              { backgroundColor: theme.surface, borderColor: theme.borderStrong },
              pressed && { opacity: 0.92 },
            ]}
          >
            <View style={styles.sensageHead}>
              <Text style={{ color: theme.gold, fontSize: 18 }}>◎</Text>
              <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                SENSAGE AI
              </Text>
            </View>
            <Text style={[styles.tileBody, { color: theme.textMuted }]} numberOfLines={2}>
              {l({ en: 'Car inspection with AI', ar: 'فحص السيارة بالذكاء الاصطناعي' })}
            </Text>
            <Text style={[styles.tileCta, { color: theme.gold }]}>
              {t('startAnalysis')} {direction === 'rtl' ? '‹' : '›'}
            </Text>
          </Pressable>

          <Pressable
            testID="book-service"
            accessibilityRole="button"
            onPress={() => router.push('/bookings/new')}
            style={({ pressed }) => [
              styles.bookTile,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { opacity: 0.92 },
            ]}
          >
            <Text style={{ color: theme.gold, fontSize: 18 }}>🛠</Text>
            <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
              {t('bookService')}
            </Text>
            <Text style={[styles.tileBody, { color: theme.textMuted }]} numberOfLines={2}>
              {l({ en: 'Maintenance & repair', ar: 'صيانة وإصلاح' })}
            </Text>
          </Pressable>
        </View>

        {/* -------------------------------------------- featured providers */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredProviders')}</SectionLabel>
          <Pressable onPress={() => router.push('/services')} testID="providers-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '600' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        {providers.loading ? (
          <StateView kind="loading" />
        ) : (
          <Rail>
            {(providers.data ?? []).map((provider) => (
              <View key={provider.id} style={{ width: 252 }}>
                <ProviderCard provider={provider} />
              </View>
            ))}
          </Rail>
        )}

        {/* --------------------------------------------- popular products */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('popularProducts')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')} testID="products-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '600' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        <Rail>
          {(products.data ?? []).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Rail>

        {/* ---------------------------------------- the two CTA banners */}
        <View style={[styles.tileRow, { flexDirection: row }]}>
          <Pressable
            testID="book-inspection"
            accessibilityRole="button"
            onPress={() => router.push('/bookings/new')}
            style={({ pressed }) => [
              styles.bookTile,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { opacity: 0.92 },
            ]}
          >
            <Text style={{ color: theme.gold, fontSize: 18 }}>🔍</Text>
            <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
              {t('bookInspection')}
            </Text>
            <Text style={[styles.tileBody, { color: theme.textMuted }]} numberOfLines={2}>
              {t('carInspection')}
            </Text>
          </Pressable>

          <Pressable
            testID="quick-recovery"
            accessibilityRole="button"
            onPress={() => router.push('/recovery')}
            style={({ pressed }) => [
              styles.bookTile,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { opacity: 0.92 },
            ]}
          >
            <Text style={{ color: theme.gold, fontSize: 18 }}>⛟</Text>
            <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
              {t('recovery')}
            </Text>
            <Text style={[styles.tileBody, { color: theme.textMuted }]} numberOfLines={2}>
              {t('catTowing')}
            </Text>
          </Pressable>
        </View>

        <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
          {localizeDigits(2026, locale)} · ORYX Marketplace · {t('demoData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroWrap: { height: 392, overflow: 'hidden', backgroundColor: '#00162b' },
  heroLowerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%' },
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: space.xs,
  },
  heroTagline: {
    color: '#ffffff',
    fontSize: typography.display,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: typography.label },
  heroSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(0,22,43,0.62)',
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 48,
    marginTop: space.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  catTile: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', height: 96 },
  catLabel: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    color: '#ffffff',
    fontSize: typography.caption,
    fontWeight: '700',
    textAlign: 'center',
  },
  tileRow: { gap: space.md, marginTop: space.xs },
  sensageTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    minHeight: 116,
  },
  sensageHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bookTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    minHeight: 116,
  },
  tileTitle: { fontSize: typography.label, fontWeight: '700' },
  tileBody: { fontSize: typography.caption },
  tileCta: { fontSize: typography.caption, fontWeight: '700', marginTop: 'auto' },
});
