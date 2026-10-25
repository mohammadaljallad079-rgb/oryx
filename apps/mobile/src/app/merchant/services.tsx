import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { AppHeader } from '../../components/brand';
import { BookingCard, RecoveryCard } from '../../components/cards';
import { Body, Button, Card, Chip, Field, Screen, SectionLabel, StateView } from '../../components/ui';
import { space } from '../../lib/theme';

/**
 * The merchant service desk.
 *
 * Bookings and recovery requests in one place, because a workshop handles both.
 * The service list is editable inline, mirroring the catalogue screen.
 */
export default function MerchantServices() {
  const { t, account, direction, dataVersion } = useApp();
  const storeId = account?.storeId ?? 'store-01';
  const [tab, setTab] = useState<'bookings' | 'recovery' | 'services'>('bookings');
  const [draft, setDraft] = useState({ name: '', price: '', duration: '' });

  const bookings = useAsync(async () => repository.merchantBookings(storeId), [storeId, dataVersion]);
  const recovery = useAsync(async () => repository.merchantRecoveryRequests(storeId), [storeId, dataVersion]);

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <Chip testID="merchant-services-bookings" label={t('myBookings')} active={tab === 'bookings'} onPress={() => setTab('bookings')} />
          <Chip testID="merchant-services-recovery" label={t('recoveryRequests')} active={tab === 'recovery'} onPress={() => setTab('recovery')} />
          <Chip testID="merchant-services-catalogue" label={t('manageServices')} active={tab === 'services'} onPress={() => setTab('services')} />
        </View>

        {tab === 'bookings' ? (
          bookings.loading ? (
            <StateView kind="loading" />
          ) : (
            (bookings.data ?? []).map((booking) => (
              <BookingCard key={booking.id} booking={booking} provider={repository.provider(booking.providerId)} />
            ))
          )
        ) : null}

        {tab === 'recovery' ? (
          recovery.loading ? (
            <StateView kind="loading" />
          ) : (
            (recovery.data ?? []).map((job) => (
              <View key={job.id}>
                <RecoveryCard job={job} />
                <View style={[styles.actionRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                  <Button title={t('acceptRequest')} variant="secondary" onPress={() => undefined} />
                  <Button title={t('rejectRequest')} variant="danger" onPress={() => undefined} />
                </View>
              </View>
            ))
          )
        ) : null}

        {tab === 'services' ? (
          <Card>
            <SectionLabel>{t('addService')}</SectionLabel>
            <View style={{ marginTop: space.md }}>
              <Field
                label={t('serviceName')}
                value={draft.name}
                onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                testID="merchant-service-name"
              />
              <Field
                label={t('servicePrice')}
                value={draft.price}
                onChangeText={(price) => setDraft((d) => ({ ...d, price }))}
                keyboardType="number-pad"
                hint="minor units, e.g. 25000"
                testID="merchant-service-price"
              />
              <Field
                label={t('serviceDuration')}
                value={draft.duration}
                onChangeText={(duration) => setDraft((d) => ({ ...d, duration }))}
                keyboardType="number-pad"
                testID="merchant-service-duration"
              />
            </View>
            <Button title={t('addService')} disabled={!draft.name} onPress={() => setDraft({ name: '', price: '', duration: '' })} />
            <View style={{ height: space.sm }} />
            <Body size="caption" muted>
              {t('demoNotice')}
            </Body>
          </Card>
        ) : null}
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm },
  actionRow: { gap: space.sm, marginBottom: space.md, marginTop: -space.sm },
});
