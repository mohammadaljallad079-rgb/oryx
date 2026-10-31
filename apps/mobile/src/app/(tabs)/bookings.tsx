import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { useLiveBookings } from '../../lib/live-bookings';
import { ScreenHeader } from '../../components/brand';
import { BookingCard, LiveBookingCard } from '../../components/cards';
import { Body, Button, Card, Screen, SectionLabel, StateView } from '../../components/ui';
import { space } from '../../lib/theme';

/**
 * Booking history.
 *
 * Two sources, never mixed. Inside a live session the list is the server's
 * (`GET /customer/bookings`), which is scoped to the signed-in account; a row
 * opens its live detail screen, where cancellation is permitted only while the
 * API still allows it. A guest or demo session sees the local demo bookings and
 * a banner that says so.
 *
 * The "new booking" action goes to the provider directory, because a booking
 * always starts by choosing one.
 */
export default function Bookings() {
  const { t, theme, account, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const live = useLiveBookings();
  const router = useRouter();

  // The demo list is only read when no live session is active, so a real
  // booking can never appear beside a local one.
  const demoBookings = useAsync(
    async () => (account && !isLive ? repository.bookings(account.id) : []),
    [account?.id, dataVersion, isLive],
  );

  const count = isLive ? live.items.length : (demoBookings.data ?? []).length;
  const loading = isLive ? live.loading : demoBookings.loading;

  return (
    <Screen>
      <ScreenHeader title={t('myBookings')} subtitle={`${count}`} />

      {isLive ? (
        <Card>
          <SectionLabel>{t('liveMode')}</SectionLabel>
          <Body size="caption" muted style={{ marginTop: space.xs }}>
            {t('liveModeHint')}
          </Body>
        </Card>
      ) : (
        <Card>
          <SectionLabel>{t('demoMode')}</SectionLabel>
          <Body size="caption" muted style={{ marginTop: space.xs }}>
            {t('demoModeHint')}
          </Body>
        </Card>
      )}

      {loading ? (
        <StateView kind="loading" />
      ) : count === 0 ? (
        <StateView kind="empty" message={t('noBookings')} />
      ) : isLive ? (
        live.items.map((booking) => (
          <LiveBookingCard
            key={booking.id}
            booking={booking}
            onPress={() => router.push(`/bookings/${booking.id}`)}
          />
        ))
      ) : (
        (demoBookings.data ?? []).map((booking) => (
          <BookingCard key={booking.id} booking={booking} provider={repository.provider(booking.providerId)} />
        ))
      )}

      {live.error && isLive ? (
        <Body size="caption" muted align="center" style={{ marginTop: space.sm, color: theme.danger }}>
          {t('loadFailed')}
        </Body>
      ) : null}

      <View style={{ marginTop: space.md }}>
        <Button
          testID="bookings-new"
          title={t('bookNow')}
          onPress={() => router.push('/services')}
        />
      </View>
    </Screen>
  );
}

