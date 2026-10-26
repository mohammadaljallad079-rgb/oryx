import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo, photoSmall } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
import { OfferCard, ProductCard, ProviderCard, StoreCard } from '../../components/cards';
import { Photo, Rail, Screen, Scrim, SectionLabel, StateView } from '../../components/ui';
import { brand, radius, space, typography } from '../../lib/theme';

/**
 * The marketplace home.
 *
 * Built to the approved reference, whose section order was read off the image
 * band by band rather than assumed:
 *
 *   1. header with the ORYX lockup and the cart / bell actions
 *   2. photographic hero carrying the tagline and the three-part subtitle
 *   3. a gold "Explore now" action inside the hero
 *   4. the search field, on its own row *below* the hero
 *   5. the five category tiles in one row
 *   6. the SENSAGE card beside the Book a service tile
 *   7. Featured providers with "View all"
 *   8. Popular products with "View all"
 *   9. a five-item navy bottom bar with a gold active item
 *
 * Two of those were wrong before this rewrite: the search sat *inside* the hero
 * (the reference puts it below), and the hero carried no call to action. Both
 * are corrected here.
 *
 * The offers rail and the featured stores are kept from the previous build. The
 * reference does not show them, but they existed before the approved rebuild and
 * the owner's brief names both, so removing them would lose working features.
 * They follow the rails the reference does show.
 *
 * Every rail reads the repository, so the page is a window onto the catalogue
 * rather than a static composition.
 */
export default function Home() {
  const { t, theme, direction, dataVersion } = useApp();
  const router = useRouter();

  const providers = useAsync(() => repository.nearbyProviders(6), [dataVersion]);
  const products = useAsync(() => repository.trendingProducts(8), [dataVersion]);
  const offers = useAsync(() => repository.offers(), [dataVersion]);
  const stores = useAsync(() => repository.stores({ sort: 'rating' }), [dataVersion]);

  const categories = [
    { key: 'spare_parts', label: t('spareParts'), photo: 'partsStore' as const },
    { key: 'maintenance', label: t('maintenance'), photo: 'mechanicEngine' as const },
    { key: 'vehicle_inspection', label: t('carInspection'), photo: 'inspectionBay' as const },
    { key: 'recovery', label: t('catTowing'), photo: 'recoveryTow' as const },
    { key: 'accessories', label: t('accessories'), photo: 'carwashPremium' as const },
  ];

  const row = direction === 'rtl' ? 'row-reverse' : 'row';
  const arrow = direction === 'rtl' ? '←' : '→';

  return (
    <Screen padded={false}>
      <AppHeader />

      {/* ------------------------------------------------------------- hero
          Measured off the reference: the hero occupies 8-32% of the frame, so
          with a ~64px header on a 915px handset that is ~265px of hero. It uses
          the same approved cinematic scene as the splash — the vehicle is the
          focal point and must not be a different photograph. */}
      <View style={styles.heroWrap}>
        <Photo source={photo('splashScene')} radiusValue={0} style={StyleSheet.absoluteFill} />
        <Scrim color={brand.navy} from={0.42} to={0.0} bands={10} />
        <View style={styles.heroLowerFade}>
          <Scrim color={brand.navyDeep} from={0.0} to={0.94} bands={16} />
        </View>

        <View style={styles.heroContent}>
          <Text style={[styles.heroTagline, { writingDirection: direction }]}>
            {t('heroTagline')}
          </Text>
          <Text style={[styles.heroSub, { writingDirection: direction }]}>
            {t('heroSubtitle')}
          </Text>

          <Pressable
            testID="home-explore"
            accessibilityRole="button"
            onPress={() => router.push('/services')}
            style={({ pressed }) => [styles.heroCta, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.heroCtaLabel}>
              {t('exploreNow')} {arrow}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* --------------------------------------------------------- search
          On its own row below the hero, where the reference places it. */}
      <View style={styles.searchRow}>
        <Pressable
          testID="home-search"
          accessibilityRole="search"
          accessibilityLabel={t('searchEverything')}
          onPress={() => router.push('/search')}
          style={({ pressed }) => [
            styles.searchField,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && { opacity: 0.92 },
          ]}
        >
          <Text style={[styles.searchGlyph, { color: theme.gold }]}>⌕</Text>
          <Text style={{ color: theme.textFaint, fontSize: typography.body, flexShrink: 1 }}>
            {t('searchEverything')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* -------------------------------------------- service categories
            The reference shows the tiles directly under the search field with no
            section heading, so there is none here. */}
        <Rail>
          {categories.map((category) => (
            <Pressable
              key={category.key}
              testID={`category-${category.key}`}
              accessibilityRole="button"
              onPress={() => router.push(`/parts?category=${category.key}`)}
              style={({ pressed }) => [{ width: 96 }, pressed && { opacity: 0.9 }]}
            >
              <View style={[styles.catTile, { borderColor: theme.border }]}>
                <Photo
                  source={photoSmall(category.photo)}
                  height={84}
                  width="100%"
                  radiusValue={radius.md}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,22,43,0.45)' }]} />
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
              {t('carInspection')}
            </Text>
            <Text style={[styles.tileCta, { color: theme.gold }]}>
              {t('startAnalysis')} {arrow}
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
              {t('maintenance')}
            </Text>
          </Pressable>
        </View>

        {/* -------------------------------------------- featured providers */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredProviders')}</SectionLabel>
          <Pressable onPress={() => router.push('/services')} testID="providers-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '700' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        {providers.loading ? (
          <StateView kind="loading" />
        ) : (
          <Rail>
            {(providers.data ?? []).map((provider) => (
              <View key={provider.id} style={{ width: 244 }}>
                <ProviderCard provider={provider} />
              </View>
            ))}
          </Rail>
        )}

        {/* --------------------------------------------- popular products */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('popularProducts')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')} testID="products-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '700' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        <Rail>
          {(products.data ?? []).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Rail>

        {/* --------------------------------------- offers and featured stores
            Kept from the previous build: the reference does not show them, but
            the brief names both and they were present before the approved
            rebuild, so dropping them would lose working features. */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('offersAndDiscounts')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts')} testID="offers-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '700' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        {offers.loading ? (
          <StateView kind="loading" />
        ) : (
          <Rail>
            {(offers.data ?? []).map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </Rail>
        )}

        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredStores')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts?tab=stores')} testID="stores-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '700' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        {stores.loading ? (
          <StateView kind="loading" />
        ) : (
          <View style={{ gap: space.md }}>
            {(stores.data ?? []).slice(0, 4).map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The reference hero fills roughly the top third of the frame and is tall
  // enough for the tagline, the subtitle and one action.
  heroWrap: { height: 265, overflow: 'hidden', backgroundColor: brand.navy },
  heroLowerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '68%' },
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: space.xs,
  },
  heroTagline: {
    color: brand.onNavy,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: typography.label,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  heroCta: {
    alignSelf: 'flex-start',
    backgroundColor: brand.gold,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    marginTop: space.sm,
    minHeight: 38,
    justifyContent: 'center',
  },
  heroCtaLabel: { color: brand.navy, fontSize: typography.label, fontWeight: '800', letterSpacing: 0.2 },

  // The search row sits on the page background, directly under the hero.
  searchRow: { paddingHorizontal: space.lg, paddingTop: space.md },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    minHeight: 48,
  },
  searchGlyph: { fontSize: 17 },

  body: { padding: space.lg, gap: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  catTile: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', height: 84 },
  catLabel: {
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    bottom: space.sm,
    color: brand.onNavy,
    fontSize: typography.caption,
    fontWeight: '700',
    textAlign: 'center',
  },
  tileRow: { gap: space.md },
  sensageTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    minHeight: 104,
  },
  sensageHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bookTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    minHeight: 104,
  },
  tileTitle: { fontSize: typography.label, fontWeight: '700' },
  tileBody: { fontSize: typography.caption },
  tileCta: { fontSize: typography.caption, fontWeight: '700', marginTop: 'auto' },
});
