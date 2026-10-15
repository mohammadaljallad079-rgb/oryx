import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { api, ApiError, type Vehicle } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
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
} from '../../components/ui';
import { space, typography } from '../../lib/theme';

/**
 * Vehicle garage.
 *
 * A vehicle belongs to exactly one customer account; the API rejects a booking
 * that references a vehicle from another account, and this screen only ever lists
 * the caller's own rows.
 */
export default function GarageScreen() {
  const { t, theme } = useApp();
  const router = useRouter();
  const vehicles = useAsync(() => api.vehicles(), []);
  const [adding, setAdding] = useState(false);

  return (
    <Screen>
      {vehicles.loading ? (
        <StateView kind="loading" />
      ) : vehicles.error ? (
        <StateView kind="error" message={vehicles.error} onRetry={vehicles.reload} />
      ) : (
        <>
          {(vehicles.data ?? []).length === 0 && !adding ? (
            <Card>
              <Body muted>{t('noVehicles')}</Body>
            </Card>
          ) : (
            (vehicles.data ?? []).map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} onChanged={vehicles.reload} />
            ))
          )}

          {adding ? (
            <AddVehicleForm
              onDone={() => {
                setAdding(false);
                vehicles.reload();
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button
              title={t('addVehicle')}
              onPress={() => setAdding(true)}
              testID="add-vehicle"
            />
          )}

          <View style={{ height: space.md }} />
          <Button
            title={t('bookMaintenance')}
            variant="secondary"
            onPress={() => router.push('/(app)/bookings/new?type=MAINTENANCE')}
          />
        </>
      )}
    </Screen>
  );
}

function VehicleCard({ vehicle, onChanged }: { vehicle: Vehicle; onChanged: () => void }) {
  const { t, theme } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.removeVehicle(vehicle.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={styles.row}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.heading }}>
          {vehicle.make} {vehicle.model}
        </Text>
        <Badge text={vehicle.status} status={vehicle.status} />
      </View>
      <View style={{ height: space.sm }} />
      <DetailRow label={t('year')} value={String(vehicle.modelYear)} />
      <DetailRow label={t('vin')} value={vehicle.vin} />
      {vehicle.plateNumber ? <DetailRow label={t('plate')} value={vehicle.plateNumber} /> : null}
      {vehicle.color ? <DetailRow label={t('color')} value={vehicle.color} /> : null}
      <DetailRow label={t('mileage')} value={String(vehicle.mileage)} />
      {error ? <Text style={{ color: theme.danger, marginTop: space.sm }}>{error}</Text> : null}
      <View style={{ height: space.md }} />
      <View style={styles.actions}>
        <Button
          title={t('serviceHistory')}
          variant="secondary"
          onPress={() => router.push(`/(app)/garage/${vehicle.id}`)}
        />
        <Button title={t('remove')} variant="danger" onPress={remove} loading={busy} />
      </View>
    </Card>
  );
}

function AddVehicleForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t, theme } = useApp();
  const [vin, setVin] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [plate, setPlate] = useState('');
  const [mileage, setMileage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const modelYear = Number(year);
    if (!vin.trim() || !make.trim() || !model.trim()) {
      setError(t('required'));
      return;
    }
    if (!Number.isInteger(modelYear) || modelYear < 1900 || modelYear > 2100) {
      setError('Enter a valid model year.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addVehicle({
        vin: vin.trim().toUpperCase(),
        make: make.trim(),
        model: model.trim(),
        modelYear,
        plateNumber: plate.trim() || undefined,
        mileage: mileage.trim() ? Number(mileage) : undefined,
      });
      onDone();
    } catch (err) {
      // A duplicate VIN is a conflict the API reports clearly; show it verbatim.
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading>{t('addVehicle')}</Heading>
      <Field label={t('vin')} value={vin} onChangeText={setVin} autoCapitalize="characters" testID="vehicle-vin" />
      <Field label={t('make')} value={make} onChangeText={setMake} testID="vehicle-make" />
      <Field label={t('model')} value={model} onChangeText={setModel} testID="vehicle-model" />
      <Field label={t('year')} value={year} onChangeText={setYear} keyboardType="number-pad" testID="vehicle-year" />
      <Field label={t('plate')} value={plate} onChangeText={setPlate} autoCapitalize="characters" />
      <Field label={t('mileage')} value={mileage} onChangeText={setMileage} keyboardType="number-pad" />
      {error ? <Text style={{ color: theme.danger, marginBottom: space.sm }}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button title={t('save')} onPress={submit} loading={busy} testID="vehicle-submit" />
        <Button title={t('cancel')} variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { gap: space.sm },
});
