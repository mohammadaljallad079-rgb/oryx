import React, { useState } from 'react';
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
  Scrim,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * The marketplace home.
 *
 * Laid out to the approved mockup. Read from the reference, top to bottom: the
 * wordmark header with notifications and the cart, the hero photograph carrying
 * the tagline and its search field, the service category rail, the two booking
 * tiles, the SENSAGE card, featured providers, then popular products. The
 * reference puts search *inside* the hero rather than above it, so that is where
 * it sits here.
 *
 * Every rail reads the repository, so the page is a window onto the catalogue
 * rather than a static composition. The hero photograph is a bundled asset with a
 * navy scrim, not a flattened mockup.
 */
export default function Home() {
  const { t, theme, locale, l, direction, dataVersion } = useApp();
  const router = useRouter();

  const banners = useAsync(() => repository.banners(), [dataVersion]);
  const stores = useAsync(() => repository.stores({ sort: 'rating' }), [dataVersion]);
  const offers = useAsync(() => repository.offers(), [dataVersion]);
  const providers = useAsync(() => repository.nearbyProviders(6), [dataVersion]);
  const products = useAsync(() => repository.trendingProducts(8), [dataVersion]);

  const [heroIndex, setHeroIndex] = useState(0);

  const quickActions = [
    { key: 'parts', label: t('parts'), glyph: '▦', href: '/parts' },
    { key: 'services', label: t('services'), glyph: '✦', href: '/services' },
    { key: 'sensage', label: t('sensage'), glyph: '◎', href: '/sensage' },
    { key: 'recovery', label: t('recovery'), glyph: '⛟', href: '/recovery' },
  ];

  const categories = [
    { key: 'spare_parts', label: t('spareParts'), photo: 'partsStore' as const },
    { key: 'maintenance', label: t('maintenance'), photo: 'mechanicEngine' as const },
    { key: 'vehicle_inspection', label: t('carInspection'), photo: 'inspectionBay' as const },
    { key: 'recovery', label: t('catTowing'), photo: 'recoveryTow' as const },
    { key: 'accessories', label: t('accessories'), photo: 'carwashPremium' as const },
  ];

  return (
    <Screen padded={false}>
      <AppHeader />

      {/* ------------------------------------------------------------- hero */}
      <View style={styles.heroWrap}>
        <Photo
          source={photo('garageInterior')}
          radiusValue={0}
          style={StyleSheet.absoluteFill}
        />
        <Scrim color="#00162b" from={0.86} to={0.32} bands={12} />
        <View style={styles.heroLowerFade}>
          <Scrim color="#000f1e" from={0.2} to={0.94} bands={12} />
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
            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: typography.body }}>
              ⌕  {t('searchEverything')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ padding: space.lg, gap: space.md }}>
        <DemoBanner />

        {/* --------------------------------------------------- hero slider */}
        {banners.loading ? (
          <StateView kind="loading" />
        ) : (banners.data ?? []).length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Rail>
              {(banners.data ?? []).map((banner, i) => (
                <Pressable
                  key={banner.id}
                  testID={`banner-${banner.id}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setHeroIndex(i);
                    router.push(banner.href);
                  }}
                  style={({ pressed }) => [{ width: 292 }, pressed && { opacity: 0.92 }]}
                >
                  <View style={[styles.offer, { borderColor: theme.border }]}>
                    <Photo
                      source={photo(banner.photo)}
                      height={168}
                      width="100%"
                      radiusValue={radius.lg}
                    />
                    <View style={styles.offerBody}>
                      <Text style={styles.offerTitle}>
                        {l({ en: banner.titleEn, ar: banner.titleAr })}
                      </Text>
                      <Text style={styles.offerText}>
                        {l({ en: banner.subtitleEn, ar: banner.subtitleAr })}
                      </Text>
                      <View style={[styles.offerCta, { backgroundColor: theme.gold }]}>
                        <Text
                          style={{
                            color: theme.onGold,
                            fontWeight: '700',
                            fontSize: typography.label,
                          }}
                        >
                          {l({ en: banner.ctaEn, ar: banner.ctaAr })}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </Rail>
            <View
              style={[
                styles.dots,
                { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' },
              ]}
            >
              {(banners.data ?? []).map((b, i) => (
                <View
                  key={b.id}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: i === heroIndex ? theme.gold : theme.border,
                      width: i === heroIndex ? 18 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ------------------------------------------------ quick actions */}
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
              <Text
                style={{ color: theme.text, fontSize: typography.caption, fontWeight: '600' }}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* -------------------------------------------- service categories */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('categories')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')} testID="categories-see-all">
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
              style={({ pressed }) => [{ width: 118 }, pressed && { opacity: 0.9 }]}
            >
              <View style={[styles.catTile, { borderColor: theme.border }]}>
                <Photo
                  source={photoSmall(category.photo)}
                  height={82}
                  width="100%"
                  radiusValue={radius.md}
                />
              </View>
              <Text
                style={{
                  color: theme.text,
                  fontSize: typography.caption,
                  fontWeight: '600',
                  marginTop: space.sm,
                  textAlign: 'center',
                }}
                numberOfLines={2}
              >
                {category.label}
              </Text>
            </Pressable>
          ))}
        </Rail>

        {/* ------------------------------------- the two booking tiles */}
        <View
          style={[styles.bookRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}
        >
          <Pressable
            testID="book-service"
            accessibilityRole="button"
            onPress={() => router.push('/bookings/new')}
            style={({ pressed }) => [
              styles.bookTile,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={{ color: theme.gold, fontSize: 22 }}>🛠</Text>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label }}>
              {t('bookMaintenance')}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: typography.caption }}>
              {t('services')}
            </Text>
          </Pressable>

          <Pressable
            testID="book-inspection"
            accessibilityRole="button"
            onPress={() => router.push('/bookings/new')}
            style={({ pressed }) => [
              styles.bookTile,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={{ color: theme.gold, fontSize: 22 }}>🔍</Text>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label }}>
              {t('bookInspection')}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: typography.caption }}>
              {t('carInspection')}
            </Text>
          </Pressable>
        </View>

        {/* ------------------------------------------------------ SENSAGE */}
        <Card>
          <View
            style={[
              styles.sensageRow,
              { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Heading size="subheading">{t('sensageTitle')}</Heading>
              <Body muted size="label" style={{ marginTop: space.xs }}>
                {t('sensageIntro')}
              </Body>
              <Pressable
                onPress={() => router.push('/sensage')}
                style={{ marginTop: space.md }}
                accessibilityRole="button"
                testID="sensage-cta"
              >
                <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                  {t('startAnalysis')} {direction === 'rtl' ? '‹' : '›'}
                </Text>
              </Pressable>
            </View>
            <Photo
              source={photoSmall('evCharging')}
              height={84}
              width={84}
              radiusValue={radius.md}
            />
          </View>
        </Card>

        {/* -------------------------------------------- featured providers */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredProviders')}</SectionLabel>
          <Pressable onPress={() => router.push('/services')} testID="providers-see-all">
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

        {/* --------------------------------------------- popular products */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('popularProducts')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')} testID="products-see-all">
            <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        <Rail>
          {(products.data ?? []).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Rail>

        {/* ------------------------------------------ offers and stores */}
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

        <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
          {localizeDigits(2026, locale)} · ORYX Marketplace · {t('demoData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroWrap: { height: 336, overflow: 'hidden', backgroundColor: '#00162b' },
  heroLowerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: space.xs,
  },
  heroTagline: {
    color: '#ffffff',
    fontSize: typography.title,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroSub: { color: 'rgba(255,255,255,0.86)', fontSize: typography.label },
  heroSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(0,22,43,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 48,
    marginTop: space.sm,
  },
  offer: { borderRadius: radius.lg, overflow: 'hidden' },
  offerBody: {
    position: 'absolute',
    inset: 0,
    padding: space.md,
    justifyContent: 'flex-end',
    gap: space.xs,
  },
  offerTitle: { color: '#ffffff', fontSize: typography.heading, fontWeight: '700' },
  offerText: { color: 'rgba(255,255,255,0.88)', fontSize: typography.caption },
  offerCta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.xs,
  },
  dots: { gap: space.sm, justifyContent: 'center', alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
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
  catTile: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  bookRow: { gap: space.md, marginTop: space.sm },
  bookTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    minHeight: 104,
  },
  sensageRow: { alignItems: 'center', gap: space.md },
});
