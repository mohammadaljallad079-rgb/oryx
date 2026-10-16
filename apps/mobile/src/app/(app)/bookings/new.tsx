import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../../lib/app-context';
import { api, ApiError, type AvailableSlot } from '../../../lib/api';
import { useAsync } from '../../../lib/use-async';
import {
  Badge,
  Body,
  Button,
  Card,
  DetailRow,
  Field,
  Heading,
  Screen,
  StateView,
} from '../../../components/ui';
import { space, typography } from '../../../lib/theme';
import { toDateParam, toTimeLabel } from '../../../lib/format';

const DURATIONS = [30, 60, 90, 120] as const;

/**
 * Booking creation.
 *
 * Slots are computed by the API from the company's opening hours minus existing
 * bookings, and the reservation itself is protected by a partial unique index on
 * `(resourceKey, startsAt)`. This screen therefore re-reads availability after a
 * conflict instead of assuming its cached list is still valid.
 */
export default function NewBookingScreen() {
  const { t, theme } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; vehicleId?: string }>();
  const bookingType = params.type === 'INSPECTION' ? 'INSPECTION' : 'MAINTENANCE';

  const [date, setDate] = useState(() => new Date());
  const [duration, setDuration] = useState<number>(60);
  const [vehicleId, setVehicleId] = useState<string | null>(params.vehicleId ?? null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicles = useAsync(() => api.vehicles(), []);
  const dateParam = toDateParam(date);
  const slots = useAsync(
    () => api.availability({ date: dateParam, durationMinutes: duration }),
    [dateParam, duration],
  );

  function shiftDay(days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    setDate(next);
  }

  async function book(slot: AvailableSlot) {
    setBusy(true);
    setError(null);
    try {
      await api.createBooking({
        bookingType,
        startsAt: slot.startsAt,
        durationMinutes: duration,
        vehicleId: vehicleId ?? undefined,
        notes: notes.trim() || undefined,
      });
      router.replace('/(app)/bookings');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
      // The slot may have been taken between the read and the write.
      slots.reload();
    } finally {
      setBusy(false);
    }
  }

  const dayLabel = date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });

  return (
    <Screen>
      <Heading>{bookingType === 'INSPECTION' ? t('bookInspection') : t('bookMaintenance')}</Heading>

      <Card>
        <DetailRow label={t('category')} value={bookingType} />
        <View style={{ height: space.md }} />
        <Text style={{ color: theme.textMuted, fontSize: typography.label, marginBottom: space.xs }}>
          {t('date')}
        </Text>
        <View style={styles.dayPicker}>
          <Button title="‹" variant="secondary" onPress={() => shiftDay(-1)} />
          <Text style={[styles.dayLabel, { color: theme.text }]}>{dayLabel}</Text>
          <Button title="›" variant="secondary" onPress={() => shiftDay(1)} />
        </View>

        <View style={{ height: space.md }} />
        <Text style={{ color: theme.textMuted, fontSize: typography.label, marginBottom: space.xs }}>
          {t('duration')}
        </Text>
        <View style={styles.chips}>
          {DURATIONS.map((minutes) => (
            <Button
              key={minutes}
              title={`${minutes} min`}
              variant={duration === minutes ? 'primary' : 'secondary'}
              onPress={() => setDuration(minutes)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={{ color: theme.textMuted, fontSize: typography.label, marginBottom: space.xs }}>
          {t('garage')}
        </Text>
        {(vehicles.data ?? []).length === 0 ? (
          <Body muted>{t('noVehicles')}</Body>
        ) : (
          <View style={styles.chips}>
            {(vehicles.data ?? []).map((vehicle) => (
              <Button
                key={vehicle.id}
                title={`${vehicle.make} ${vehicle.model}`}
                variant={vehicleId === vehicle.id ? 'primary' : 'secondary'}
                onPress={() => setVehicleId(vehicle.id)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card>
        <Field
          label={t('notes')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('notesHint')}
          multiline
          maxLength={500}
          editable={!busy}
        />
      </Card>

      <Heading>{t('availableSlots')}</Heading>
      {slots.loading ? (
        <StateView kind="loading" />
      ) : slots.error ? (
        <StateView kind="error" message={slots.error} onRetry={slots.reload} />
      ) : (slots.data ?? []).length === 0 ? (
        <Card>
          <Body muted>{t('noSlots')}</Body>
        </Card>
      ) : (
        <View style={styles.chips}>
          {(slots.data ?? []).map((slot) => (
            <Button
              key={slot.startsAt}
              title={`${toTimeLabel(slot.startsAt)} – ${toTimeLabel(slot.endsAt)}`}
              variant="secondary"
              disabled={busy}
              onPress={() => book(slot)}
            />
          ))}
        </View>
      )}

      {error ? (
        <Card style={{ borderColor: theme.danger }}>
          <Badge text={t('error')} status="FAILED" />
          <View style={{ height: space.sm }} />
          <Text style={{ color: theme.danger }}>{error}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayPicker: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dayLabel: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: typography.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
