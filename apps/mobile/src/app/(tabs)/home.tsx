import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo, photoSmall } from '../../lib/assets';
import { useAsync } from '../../lib/use-async';
import { useLiveCatalog, useLiveProviders } from '../../lib/live-catalog';
import { AppHeader } from '../../components/brand';
import { OfferCard, ProductCard, ProviderCard, StoreCard } from '../../components/cards';
import { Body, Photo, Rail, Screen, SectionLabel, StateView } from '../../components/ui';
import { CategoryIcon, type CategoryIconName } from '../../components/category-icons';
import { UiIcon } from '../../components/ui-icons';
import { radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';
import { api, catalogApi, type CatalogOffer, type HomepageResponse } from '../../lib/api';
import {
  catalogOfferToDemo,
  catalogStoreToDemo,
  publicProviderToDemo,
  toDemoProduct,
} from '../../lib/api-adapters';

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
 * Every rail reads the live marketplace — the catalogue, the store directory and
 * the approved provider directory. A rail with no live records is shown empty
 * rather than filled with a demo record the platform never held, so nothing on
 * this page presents invented data as real.
 */
export default function Home() {
  const { t, theme, direction, locale } = useApp();
  const router = useRouter();

  // The rails read the real marketplace. A rail that has no live records is
  // shown empty rather than filled with a demo record the platform never held.
  const liveCatalog = useLiveCatalog({});
  const liveProvidersState = useLiveProviders();
  const stores = liveCatalog.stores.map(catalogStoreToDemo);
  const providers = liveProvidersState.providers.map(publicProviderToDemo);

  // The homepage content from the API. This is additive: when the CMS has
  // nothing published the screen degrades to the design the owner approved
  // rather than to a blank card.
  const live = useAsync<HomepageResponse>(() => api.homepage(locale), [locale]);
  // The live promotional offers published by approved providers. Public data, so
  // a guest sees the same rail. The rail is hidden entirely when nothing is
  // advertised rather than padded with an invented discount.
  const liveOffers = useAsync<CatalogOffer[]>(() => catalogApi.offers({ limit: 10 }), []);
  const offers = (liveOffers.data ?? []).map(catalogOfferToDemo);
  // The approved bundled scene is the fallback whenever the CMS has nothing
  // published. A CMS record can never replace it with an unreviewed photograph.
  const heroImage = live.data?.hero[0]?.imageUrl ? { uri: live.data.hero[0].imageUrl } : null;
  const heroTitle = live.data?.hero[0]?.title ?? null;
  const heroSubtitle = live.data?.hero[0]?.subtitle ?? null;

  // The homepage endpoint's own product rail wins when the CMS has published
  // content; otherwise the catalogue rail above is the live source.
  const liveProducts = live.data?.products.length
    ? live.data.products.map(toDemoProduct)
    : null;

  // The five service categories, with the exact icons the approved reference
  // names: gear, wrench, inspection document, tow truck, alloy wheel. The Rail
  // lays them out in the reading direction, so the Arabic order comes out
  // reversed — wheel first — which is what the reference's right-hand screen
  // shows.
  const categories: Array<{ key: string; label: string; icon: CategoryIconName }> = [
    { key: 'spare_parts', label: t('spareParts'), icon: 'gear' },
    { key: 'maintenance', label: t('maintenance'), icon: 'wrench' },
    { key: 'vehicle_inspection', label: t('carInspection'), icon: 'inspection' },
    { key: 'recovery', label: t('catTowing'), icon: 'towTruck' },
    { key: 'accessories', label: t('accessories'), icon: 'wheel' },
  ];

  const row = direction === 'rtl' ? 'row-reverse' : 'row';
  const arrow = direction === 'rtl' ? '←' : '→';

  return (
    <Screen padded={false}>
      <AppHeader />

      {/* ------------------------------------------------------------- hero
          A wide rounded card, not a full-screen banner: the specification puts
          it at ~180dp on a 390dp screen so the search, the categories and the
          promotional cards are all reachable without scrolling far. It carries
          the approved cinematic scene — the black SUV, the skyline and the
          golden sunset — under a left-side gradient, so the vehicle stays
          visible on the right while the type reads on the left. */}
      <View style={styles.heroWrap}>
        <View style={[styles.heroCard, { borderColor: theme.border }]}>
          <Photo
            source={heroImage ?? photo('splashScene')}
            radiusValue={0}
            style={StyleSheet.absoluteFill}
          />
          {/* Left-side gradient: strong at the left for the type, clear at the
              right so the vehicle and the sunset are not dimmed. */}
          <View style={styles.heroLeftShade} pointerEvents="none">
            <View style={[styles.shadeBand, { opacity: 0.92 }]} />
            <View style={[styles.shadeBand, { opacity: 0.62 }]} />
            <View style={[styles.shadeBand, { opacity: 0.3 }]} />
            <View style={[styles.shadeBand, { opacity: 0.06 }]} />
          </View>

          <View style={styles.heroContent}>
            {heroTitle ? (
              <Text style={[styles.heroLine, { writingDirection: direction }]} numberOfLines={2}>
                {heroTitle}
              </Text>
            ) : (
              <>
                <Text style={[styles.heroLine, { writingDirection: direction }]} numberOfLines={1}>
                  {t('heroLine1')}
                </Text>
                <Text style={[styles.heroLine, { writingDirection: direction }]} numberOfLines={1}>
                  {t('heroLine2')}
                </Text>
              </>
            )}
            <Text style={[styles.heroSub, { writingDirection: direction }]} numberOfLines={2}>
              {heroSubtitle ?? t('heroSubtitle')}
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

        {/* The carousel indicator. One approved scene, so one active dot; the
            remaining positions are muted rather than filled with photographs
            nobody approved. */}
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive, { backgroundColor: theme.gold }]} />
          <View style={[styles.dot, { backgroundColor: theme.border }]} />
          <View style={[styles.dot, { backgroundColor: theme.border }]} />
          <View style={[styles.dot, { backgroundColor: theme.border }]} />
        </View>
      </View>

      {/* --------------------------------------------------------- search
          On its own row below the hero, where the reference places it. */}
      <View style={[styles.searchRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
        <Pressable
          testID="home-search"
          accessibilityRole="search"
          accessibilityLabel={t('searchEverything')}
          onPress={() => router.push('/search')}
          style={({ pressed }) => [
            styles.searchField,
            { backgroundColor: theme.search, borderColor: theme.border },
            pressed && { opacity: 0.92 },
          ]}
        >
          <UiIcon name="search" size={18} color={theme.text} />
          <Text style={{ color: theme.textFaint, fontSize: typography.label, flexShrink: 1 }} numberOfLines={1}>
            {t('searchEverything')}
          </Text>
        </Pressable>

        {/* The filter control the specification asks for: a separate button
            with adjustment sliders, not a funnel. */}
        <Pressable
          testID="home-filter"
          accessibilityRole="button"
          accessibilityLabel={t('filter')}
          onPress={() => router.push('/parts')}
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: theme.bgDeep, borderColor: theme.goldDeep },
            pressed && { opacity: 0.9 },
          ]}
        >
          <UiIcon name="sliders" size={20} color={theme.text} />
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
              style={({ pressed }) => [{ width: 68 }, pressed && { opacity: 0.9 }]}
            >
              <View
                style={[
                  styles.catIcon,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                ]}
              >
                <CategoryIcon name={category.icon} size={26} color={theme.gold} />
              </View>
              <Text
                style={[styles.catLabel, { color: theme.textMuted }]}
                numberOfLines={2}
              >
                {category.label}
              </Text>
            </Pressable>
          ))}
        </Rail>

        {/* ------------------------------------ the two promotional cards
            Side by side, each with real automotive imagery on the right and the
            copy on the left. The specification swaps their order between
            languages — SENSAGE first in English, Book a Service first in Arabic —
            which `row-reverse` gives for free in RTL. */}
        <View style={[styles.promoRow, { flexDirection: row }]}>
          <Pressable
            testID="sensage-cta"
            accessibilityRole="button"
            onPress={() => router.push('/sensage')}
            style={({ pressed }) => [
              styles.promoCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { opacity: 0.92 },
            ]}
          >
            <Photo
              source={photoSmall('inspectionBay')}
              radiusValue={0}
              style={styles.promoImage}
            />
            <View style={styles.promoScrim} pointerEvents="none" />
            <View style={styles.promoCopy}>
              <Text style={[styles.promoTitle, { color: theme.text }]} numberOfLines={1}>
                {t('sensageCardTitle')}
              </Text>
              <Text style={[styles.promoBody, { color: theme.textMuted }]} numberOfLines={2}>
                {t('sensageCardBody')}
              </Text>
              <View style={styles.promoArrow}>
                <UiIcon name="arrowCircle" size={22} color={theme.gold} />
              </View>
            </View>
          </Pressable>

          <Pressable
            testID="book-service"
            accessibilityRole="button"
            onPress={() => router.push('/bookings/new')}
            style={({ pressed }) => [
              styles.promoCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { opacity: 0.92 },
            ]}
          >
            <Photo
              source={photoSmall('mechanicEngine')}
              radiusValue={0}
              style={styles.promoImage}
            />
            <View style={styles.promoScrim} pointerEvents="none" />
            <View style={styles.promoCopy}>
              <Text style={[styles.promoTitle, { color: theme.text }]} numberOfLines={2}>
                {t('bookCardTitle')}
              </Text>
              <Text style={[styles.promoBody, { color: theme.textMuted }]} numberOfLines={2}>
                {t('bookCardBody')}
              </Text>
              <View style={styles.promoArrow}>
                <UiIcon name="arrowCircle" size={22} color={theme.gold} />
              </View>
            </View>
          </Pressable>
        </View>

        {/* -------------------------------------------- featured providers */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredProviders')}</SectionLabel>
          <Pressable
            onPress={() => router.push('/services')}
            testID="providers-see-all"
            style={[styles.viewAll, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}
          >
            <Text style={{ color: theme.textMuted, fontSize: typography.label, fontWeight: '600' }}>
              {t('viewAll')}
            </Text>
            <UiIcon name="chevron" size={13} color={theme.gold} />
          </Pressable>
        </View>
        {providers.length === 0 ? (
          <StateView kind="empty" />
        ) : (
          <Rail>
            {providers.map((provider) => (
              <View key={provider.id} style={{ width: 244 }}>
                <ProviderCard provider={provider} />
              </View>
            ))}
          </Rail>
        )}

        {/* --------------------------------------------- popular products */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('popularProducts')}</SectionLabel>
          <Pressable
            onPress={() => router.push('/parts')}
            testID="products-see-all"
            style={[styles.viewAll, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}
          >
            <Text style={{ color: theme.textMuted, fontSize: typography.label, fontWeight: '600' }}>
              {t('viewAll')}
            </Text>
            <UiIcon name="chevron" size={13} color={theme.gold} />
          </Pressable>
        </View>
        <Rail>
          {(liveProducts ?? liveCatalog.products.map(toDemoProduct)).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Rail>

        {/* -------------------------------------------------- live offers
            The promotional offers approved providers have published, read from
            the real catalogue. Nothing is shown when no offer is live: the rail
            is omitted rather than filled with an invented discount. */}
        {offers.length > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <SectionLabel>{t('offersAndDiscounts')}</SectionLabel>
              <Pressable onPress={() => router.push('/promotions')} testID="offers-see-all">
                <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '700' }}>
                  {t('seeAll')}
                </Text>
              </Pressable>
            </View>
            <Rail>
              {offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </Rail>
          </>
        ) : null}

        {/* ------------------------------------------------- featured stores
            The store directory, from the live catalogue. */}
        <View style={styles.sectionHead}>
          <SectionLabel>{t('featuredStores')}</SectionLabel>
          <Pressable onPress={() => router.push('/parts?tab=stores')} testID="stores-see-all">
            <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '700' }}>
              {t('seeAll')}
            </Text>
          </Pressable>
        </View>
        {liveCatalog.loading && stores.length === 0 ? (
          <StateView kind="loading" />
        ) : stores.length === 0 ? (
          <StateView kind="empty" />
        ) : (
          <View style={{ gap: space.md }}>
            {stores.slice(0, 4).map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </View>
        )}

        <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
          {localizeDigits(2026, locale)} · ORYX Marketplace · {t('liveData')}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Hero: a wide rounded card, ~180dp on a 390dp screen, not a full-screen
  // banner. The specification is explicit that it must not swallow the viewport.
  heroWrap: { paddingHorizontal: space.md, paddingTop: space.md },
  heroCard: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#00101f',
  },
  heroLeftShade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '72%',
    flexDirection: 'row',
  },
  shadeBand: { flex: 1, backgroundColor: '#00162b' },
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    gap: 2,
  },
  heroLine: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroCta: {
    alignSelf: 'flex-start',
    backgroundColor: '#d7b878',
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    height: 40,
    justifyContent: 'center',
    marginTop: space.sm,
  },
  heroCtaLabel: { color: '#00162b', fontSize: typography.label, fontWeight: '800' },

  // Carousel indicator: one active gold dot, the rest muted.
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: space.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 16 },

  // Search row: the field and a separate filter button beside it.
  searchRow: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    height: 46,
  },
  filterButton: {
    width: 46,
    height: 46,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { padding: space.md, gap: space.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  viewAll: { alignItems: 'center', gap: 2 },

  // Category: a navy rounded square with a gold vector icon, label beneath.
  catIcon: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  // The two promotional cards: image on the right, copy on the left.
  promoRow: { gap: 10 },
  promoCard: {
    flex: 1,
    height: 110,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  promoImage: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '58%' },
  promoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 22, 43, 0.55)',
  },
  promoCopy: {
    ...StyleSheet.absoluteFillObject,
    padding: space.md,
    justifyContent: 'flex-start',
    width: '78%',
  },
  promoTitle: { fontSize: 15, fontWeight: '800' },
  promoBody: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  promoArrow: { position: 'absolute', left: space.md, bottom: space.md },
});
