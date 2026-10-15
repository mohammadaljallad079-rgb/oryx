import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../../lib/app-context';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/use-async';
import {
  Badge,
  Body,
  Button,
  Card,
  DetailRow,
  Heading,
  Screen,
  StateView,
} from '../../../components/ui';
import { space, typography } from '../../../lib/theme';
import { formatMoney } from '../../../lib/format';

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Provider profile with listings, opening hours and reviews. */
export default function ProviderDetailScreen() {
  const { t, locale, theme } = useApp();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const provider = useAsync(() => api.provider(id), [id]);

  const days = locale === 'ar' ? DAYS_AR : DAYS_EN;

  return (
    <Screen>
      {provider.loading ? (
        <StateView kind="loading" />
      ) : provider.error ? (
        <StateView kind="error" message={provider.error} onRetry={provider.reload} />
      ) : provider.data ? (
        <>
          <Card>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '800', fontSize: typography.heading }}>
                {locale === 'ar' ? provider.data.nameAr : provider.data.nameEn}
              </Text>
              {provider.data.averageRating ? (
                <Badge text={`★ ${provider.data.averageRating.toFixed(1)}`} status="APPROVED" />
              ) : null}
            </View>
            <View style={{ height: space.sm }} />
            <DetailRow label={t('reference')} value={provider.data.code} />
            {provider.data.city ? <DetailRow label={t('category')} value={provider.data.city} /> : null}
            {provider.data.reviewCount !== undefined ? (
              <DetailRow label={t('rating')} value={String(provider.data.reviewCount)} />
            ) : null}
          </Card>

          <Heading>{t('services')}</Heading>
          {provider.data.listings.length === 0 ? (
            <Card>
              <Body muted>{t('none')}</Body>
            </Card>
          ) : (
            <Card>
              {provider.data.listings.map((listing) => (
                <DetailRow
                  key={listing.id}
                  label={locale === 'ar' ? listing.nameAr : listing.nameEn}
                  value={formatMoney(listing.priceMinor, 'BHD', 3)}
                />
              ))}
            </Card>
          )}

          <Heading>{t('date')}</Heading>
          <Card>
            {provider.data.availability.length === 0 ? (
              <Body muted>{t('none')}</Body>
            ) : (
              provider.data.availability.map((entry) => (
                <DetailRow
                  key={`${entry.dayOfWeek}-${entry.opensAt}`}
                  label={days[entry.dayOfWeek] ?? String(entry.dayOfWeek)}
                  value={entry.isClosed ? t('none') : `${entry.opensAt} – ${entry.closesAt}`}
                />
              ))
            )}
          </Card>

          <Heading>{t('rating')}</Heading>
          {provider.data.reviews.length === 0 ? (
            <Card>
              <Body muted>{t('none')}</Body>
            </Card>
          ) : (
            provider.data.reviews.map((review) => (
              <Card key={review.id}>
                <Badge text={`★ ${review.rating}`} status="APPROVED" />
                {review.title ? (
                  <Text style={{ color: theme.text, fontWeight: '700', marginTop: space.sm }}>
                    {review.title}
                  </Text>
                ) : null}
                {review.comment ? (
                  <Text style={{ color: theme.textMuted, marginTop: space.xs }}>{review.comment}</Text>
                ) : null}
                {review.providerReply ? (
                  <Text style={{ color: theme.goldSoft, marginTop: space.sm }}>
                    {review.providerReply}
                  </Text>
                ) : null}
              </Card>
            ))
          )}

          <Button title={t('requestService')} onPress={() => router.push('/(app)/services')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
