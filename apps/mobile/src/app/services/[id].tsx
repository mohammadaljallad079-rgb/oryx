import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import {
  Body,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  Heading,
  ListRow,
  Photo,
  RatingPill,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney } from '../../lib/format';
import { isOffline, marketplaceApi } from '../../lib/api';
import { fallbackPhoto } from '../../lib/api-adapters';

/** The days the API numbers, in the order it stores them. */
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * A service provider.
 *
 * Everything here is the provider's own record from
 * `GET /marketplace/providers/:id`: its active listings and prices, its working
 * hours and its **published** reviews. A review awaiting moderation is not
 * returned, so the screen never shows one the platform has not approved.
 *
 * The API returns no distance and no marketing copy, so neither is claimed. The
 * phone number is the provider's own and only becomes a call action when it is
 * present.
 */
export default function ProviderDetail() {
  const { t, theme, locale, direction } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const provider = useAsync(async () => (id ? marketplaceApi.provider(id) : null), [id]);

  if (provider.loading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!provider.data) {
    return (
      <Screen>
        <ScreenHeader title={t('error')} />
        <StateView kind="error" message={isOffline() ? t('offlineBody') : t('noResults')} />
        <Button title={t('retry')} onPress={provider.reload} />
      </Screen>
    );
  }

  const shop = provider.data;
  const name = locale === 'ar' ? shop.nameAr : shop.nameEn;
  const openDays = shop.availability.filter((a) => !a.isClosed);

  return (
    <Screen padded={false}>
      <Photo source={photo(fallbackPhoto(shop.id))} height={220} width="100%" radiusValue={0} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <ScreenHeader title={name} />

        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {shop.reviewCount > 0 ? (
            <RatingPill rating={shop.averageRating ?? 0} count={shop.reviewCount} />
          ) : null}
          <Chip label={t('verified')} active />
          {shop.categoryKey ? <Chip label={shop.categoryKey} /> : null}
        </View>

        {shop.phone ? (
          <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
            <View style={{ flex: 1 }}>
              <Button
                title={t('callProvider')}
                variant="secondary"
                onPress={() => Linking.openURL(`tel:${shop.phone}`)}
              />
            </View>
          </View>
        ) : null}

        <Card>
          <SectionLabel>{t('servicesAndPrices')}</SectionLabel>
          {shop.listings.length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('noResults')}
            </Body>
          ) : (
            shop.listings.map((listing) => (
              <View key={listing.id} style={{ marginTop: space.md }}>
                <View style={styles.serviceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                      {locale === 'ar' ? listing.nameAr : listing.nameEn}
                    </Text>
                  </View>
                  <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.body }}>
                    {formatMoney(listing.priceMinor)}
                  </Text>
                </View>
                <View style={{ marginTop: space.sm }}>
                  <Button
                    title={t('bookNow')}
                    variant="secondary"
                    onPress={() =>
                      router.push(
                        `/bookings/new?providerId=${shop.id}&listingId=${listing.id}&service=${encodeURIComponent(
                          locale === 'ar' ? listing.nameAr : listing.nameEn,
                        )}`,
                      )
                    }
                  />
                </View>
              </View>
            ))
          )}
        </Card>

        <Card>
          <Heading size="subheading">{t('workingHours')}</Heading>
          <Divider />
          {openDays.length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('empty')}
            </Body>
          ) : (
            openDays.map((slot) => (
              <DetailRow
                key={slot.id}
                label={t(DAYS[slot.dayOfWeek] ?? 'mon')}
                value={`${slot.opensAt} – ${slot.closesAt}`}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionLabel>{t('reviews')}</SectionLabel>
          {shop.reviews.length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('noReviews')}
            </Body>
          ) : (
            shop.reviews.map((review) => (
              <View key={review.id} style={{ marginTop: space.md }}>
                <View style={styles.row}>
                  {review.title ? (
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label }}>
                      {review.title}
                    </Text>
                  ) : null}
                  <Text style={{ color: theme.gold, fontSize: typography.caption }}>
                    {'★'.repeat(Math.max(1, Math.round(review.rating)))}
                  </Text>
                </View>
                {review.comment ? (
                  <Body size="caption" muted style={{ marginTop: 2 }}>
                    {review.comment}
                  </Body>
                ) : null}
                {review.providerReply ? (
                  <Body size="caption" muted style={{ marginTop: 2 }}>
                    {t('providerReply')}: {review.providerReply}
                  </Body>
                ) : null}
              </View>
            ))
          )}
        </Card>

        <Card>
          <ListRow title={t('viewNearbyWorkshops')} onPress={() => router.push('/services?kind=maintenance')} />
          <ListRow title={t('requestRecovery')} onPress={() => router.push('/recovery')} />
          <ListRow title={t('sensageTitle')} onPress={() => router.push('/sensage')} />
        </Card>

        <Body size="caption" muted align="center">
          {t('liveData')}
        </Body>
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
