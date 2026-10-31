import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useLiveSession } from '../../lib/live-session';
import { ApiError, vehiclesApi } from '../../lib/api';
import { ScreenHeader } from '../../components/brand';
import { Body, Button, Card, Field, Notice, Screen, SectionLabel } from '../../components/ui';
import { space } from '../../lib/theme';

/**
 * Add a vehicle.
 *
 * Inside a live session the form posts to `POST /customer/vehicles`, so the car
 * lands in the server garage and appears in the account tab and in SENSAGE.
 * Offline the same form is a local demo action that stores nothing, and says so.
 */
export default function NewVehicle() {
  const { t, theme } = useApp();
  const session = useLiveSession();
  const isLive = session.isLive;
  const router = useRouter();

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [colour, setColour] = useState('');
  const [mileage, setMileage] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelYear = Number(year);
  const complete =
    make.trim().length > 0 &&
    model.trim().length > 0 &&
    vin.trim().length >= 5 &&
    Number.isInteger(modelYear) &&
    modelYear >= 1900 &&
    modelYear <= 2100;

  const submit = async () => {
    if (!complete || busy) return;
    if (!isLive) {
      setSaved(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await vehiclesApi.create({
        vin: vin.trim(),
        plateNumber: plate.trim() || undefined,
        make: make.trim(),
        model: model.trim(),
        modelYear,
        color: colour.trim() || undefined,
        mileage: mileage.trim() ? Number(mileage) : undefined,
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('serverError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('addVehicle')} />

      <Card>
        <SectionLabel>{t('myVehicles')}</SectionLabel>
        <View style={{ marginTop: space.md }}>
          <Field label={t('make')} value={make} onChangeText={setMake} placeholder="Toyota" testID="vehicle-make" />
          <Field label={t('model')} value={model} onChangeText={setModel} placeholder="Camry" testID="vehicle-model" />
          <Field label={t('year')} value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="2022" testID="vehicle-year" />
          <Field label={t('plate')} value={plate} onChangeText={setPlate} placeholder="1234 ABC" testID="vehicle-plate" />
          <Field label={t('vin')} value={vin} onChangeText={setVin} testID="vehicle-vin" />
          <Field label={t('colour')} value={colour} onChangeText={setColour} testID="vehicle-colour" />
          <Field label={t('mileage')} value={mileage} onChangeText={setMileage} keyboardType="number-pad" testID="vehicle-mileage" />
        </View>
        <Button
          testID="vehicle-save"
          title={t('save')}
          loading={busy}
          disabled={!complete || busy}
          onPress={() => void submit()}
        />
        {error ? <Notice text={error} /> : null}
        {!isLive && saved ? (
          <Body size="caption" muted style={{ marginTop: space.sm, color: theme.gold }}>
            {t('demoNotice')}
          </Body>
        ) : null}
      </Card>
    </Screen>
  );
}
