import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
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
import { formatMoney, localizeDigits } from '../../lib/format';

/**
 * A service provider.
 *
 * The published price list is the point of the screen, so it is rendered as rows
 * with a book action per service rather than one generic button. The working
 * hours and the closed days come from the same record the booking engine reads.
 */
export default function ProviderDetail() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const provider = useAsync(async () => repository.provider(id), [id, dataVersion]);
  const reviews = useAsync(async () => repository.reviews(id), [id, dataVersion]);

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
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const shop = provider.data;
  const name = locale === 'ar' ? shop.nameAr : shop.nameEn;

  return (
    <Screen padded={false}>
      <Photo source={photo(shop.photo)} height={220} width="100%" radiusValue={0} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <ScreenHeader title={name} subtitle={locale === 'ar' ? shop.aboutAr : shop.aboutEn} />

        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <RatingPill rating={shop.rating} count={shop.reviewCount} />
          {shop.verified ? <Chip label={t('verified')} active /> : null}
          <Chip label={`${localizeDigits(shop.distanceKm, locale)} ${t('km')}`} />
        </View>

        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <View style={{ flex: 1 }}>
            <Button title={t('callProvider')} variant="secondary" onPress={() => Linking.openURL(`tel:${shop.phone}`)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('getDirections')} variant="secondary" onPress={() => router.push('/support')} />
          </View>
        </View>

        <Card>
          <SectionLabel>{t('servicesAndPrices')}</SectionLabel>
          {shop.services.map((service) => (
            <View key={service.nameEn} style={{ marginTop: space.md }}>
              <View style={styles.serviceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
                    {locale === 'ar' ? service.nameAr : service.nameEn}
                  </Text>
                  <Body size="caption" muted>
                    {t('duration')}: {localizeDigits(service.durationMinutes, locale)} {t('minutes')}
                  </Body>
                </View>
                <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.body }}>
                  {formatMoney(service.priceMinor)}
                </Text>
              </View>
              <View style={{ marginTop: space.sm }}>
                <Button
                  title={t('bookNow')}
                  variant="secondary"
                  onPress={() => router.push(`/bookings/new?providerId=${shop.id}&service=${encodeURIComponent(service.nameEn)}`)}
                />
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Heading size="subheading">{t('workingHours')}</Heading>
          <Divider />
          <DetailRow label={t('availableSlots')} value={`${localizeDigits(shop.opensAt, locale)} – ${localizeDigits(shop.closesAt, locale)}`} />
          <DetailRow label={t('closedOn')} value={shop.closedOn.join(', ')} />
        </Card>

        <Card>
          <SectionLabel>{t('reviews')}</SectionLabel>
          {(reviews.data ?? []).length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('noReviews')}
            </Body>
          ) : (
            (reviews.data ?? []).map((review) => (
              <View key={review.id} style={{ marginTop: space.md }}>
                <View style={styles.row}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label }}>
                    {locale === 'ar' ? review.authorAr : review.authorEn}
                  </Text>
                  <Text style={{ color: theme.gold, fontSize: typography.caption }}>
                    {'★'.repeat(Math.max(1, Math.round(review.rating)))}
                  </Text>
                </View>
                <Body size="caption" muted style={{ marginTop: 2 }}>
                  {locale === 'ar' ? review.bodyAr : review.bodyEn}
                </Body>
              </View>
            ))
          )}
        </Card>

        <Card>
          <ListRow title={t('viewNearbyWorkshops')} onPress={() => router.push('/services?kind=maintenance')} />
          <ListRow title={t('requestRecovery')} onPress={() => router.push('/recovery')} />
          <ListRow title={t('sensageTitle')} onPress={() => router.push('/sensage')} />
        </Card>

        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
