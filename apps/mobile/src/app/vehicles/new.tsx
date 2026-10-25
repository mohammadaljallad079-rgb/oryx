import React, { useState } from 'react';
import { View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { ScreenHeader } from '../../components/brand';
import { Body, Button, Card, Field, Screen, SectionLabel } from '../../components/ui';
import { space } from '../../lib/theme';

/**
 * Add a vehicle.
 *
 * The form is real and validates its required fields; saving is a demo action
 * that returns to the garage. It does not claim to have stored anything.
 */
export default function NewVehicle() {
  const { t, theme } = useApp();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [colour, setColour] = useState('');
  const [mileage, setMileage] = useState('');
  const [saved, setSaved] = useState(false);

  const complete = make.trim() && model.trim() && year.trim() && plate.trim();

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
          disabled={!complete}
          onPress={() => setSaved(true)}
        />
        {saved ? (
          <Body size="caption" muted style={{ marginTop: space.sm, color: theme.gold }}>
            {t('demoNotice')}
          </Body>
        ) : null}
      </Card>
    </Screen>
  );
}

