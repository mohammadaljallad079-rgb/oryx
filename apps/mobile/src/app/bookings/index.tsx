import React from 'react';
import { View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { BookingCard } from '../../components/cards';
import { Button, Screen, StateView } from '../../components/ui';
import { space } from '../../lib/theme';

/**
 * Booking history.
 *
 * A booking row opens its detail screen; the "new booking" action goes to the
 * provider directory, because a booking always starts by choosing one.
 */
export default function Bookings() {
  const { t, account, dataVersion } = useApp();
  const bookings = useAsync(
    async () => (account ? repository.bookings(account.id) : []),
    [account?.id, dataVersion],
  );

  return (
    <Screen>
      <ScreenHeader title={t('myBookings')} subtitle={`${(bookings.data ?? []).length}`} />

      {bookings.loading ? (
        <StateView kind="loading" />
      ) : (bookings.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('noBookings')} />
      ) : (
        (bookings.data ?? []).map((booking) => (
          <BookingCard key={booking.id} booking={booking} provider={repository.provider(booking.providerId)} />
        ))
      )}

      <View style={{ marginTop: space.md }}>
        <Button title={t('bookNow')} onPress={() => undefined} />
      </View>
    </Screen>
  );
}

