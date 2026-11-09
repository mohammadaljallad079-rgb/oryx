import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { useLiveSession } from '../../lib/live-session';
import { ApiError, catalogApi, vehiclesApi } from '../../lib/api';
import { ScreenHeader } from '../../components/brand';
import { Body, Button, Card, Field, Notice, Screen, SectionLabel, Select } from '../../components/ui';
import { space } from '../../lib/theme';
import { useAsync } from '../../lib/use-async';

/**
 * Add a vehicle.
 *
 * The make and model are chosen from the reference catalogue the server also
 * validates against, so the same car is stored the same way every time and a
 * model is limited to what the chosen make actually sells. The catalogue is
 * fetched once and cached for the screen's life; while it loads the pickers are
 * disabled rather than offering a free-text box that would store a value the
 * server refuses.
 *
 * Inside a live session the form posts to `POST /customer/vehicles`, so the car
 * lands in the server garage and appears in the account tab and in SENSAGE.
 * Offline the same form is a local demo action that stores nothing, and says so.
 */
export default function NewVehicle() {
  const { t, theme, locale } = useApp();
  const session = useLiveSession();
  const isLive = session.isLive;
  const router = useRouter();

  const catalogue = useAsync(() => catalogApi.vehicleCatalog(), []);

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

  // A new array literal on every render would make `makeOptions` and every
  // memo below it change identity each time, so the reference is pinned here.
  const makes = useMemo(() => catalogue.data?.makes ?? [], [catalogue.data]);
  const selectedMake = useMemo(() => makes.find((m) => m.make === make), [makes, make]);
  const maxYear = catalogue.data?.maxYear ?? new Date().getFullYear() + 1;

  const makeOptions = useMemo(
    () =>
      makes.map((m) => ({
        value: m.make,
        label: locale === 'ar' ? m.makeAr : m.make,
        sublabel: `${m.models.length}`,
        // Both scripts are searchable, so an Arabic typist finds "تويوتا" and an
        // English typist finds "Toyota" without switching the app locale.
        keywords: `${m.make} ${m.makeAr}`,
      })),
    [makes, locale],
  );

  const modelOptions = useMemo(
    () =>
      (selectedMake?.models ?? []).map((name) => ({
        value: name,
        label: name,
        keywords: `${selectedMake?.make ?? ''} ${selectedMake?.makeAr ?? ''}`,
      })),
    [selectedMake],
  );

  const yearOptions = useMemo(() => {
    const first = selectedMake?.fromYear ?? 1990;
    const years: Array<{ value: string; label: string }> = [];
    for (let y = maxYear; y >= first; y -= 1) years.push({ value: String(y), label: String(y) });
    return years;
  }, [selectedMake, maxYear]);

  const modelYear = Number(year);
  const complete =
    make.trim().length > 0 &&
    model.trim().length > 0 &&
    vin.trim().length >= 5 &&
    Number.isInteger(modelYear) &&
    modelYear >= 1900 &&
    modelYear <= maxYear + 1;

  const onSelectMake = (value: string) => {
    setMake(value);
    // A model only means something for the make it was chosen under, so changing
    // the make clears it rather than leaving a combination the server rejects.
    setModel('');
    setYear('');
  };

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
          <Select
            label={t('make')}
            value={make}
            placeholder={catalogue.loading ? t('loading') : t('make')}
            options={makeOptions}
            onSelect={onSelectMake}
            disabled={catalogue.loading || makeOptions.length === 0}
            testID="vehicle-make"
            searchable
            searchPlaceholder={t('searchMake')}
            emptyMessage={t('noResults')}
          />
          <Select
            label={t('model')}
            value={model}
            placeholder={make ? t('model') : t('make')}
            options={modelOptions}
            onSelect={setModel}
            disabled={!make || modelOptions.length === 0}
            testID="vehicle-model"
            searchable
            searchPlaceholder={t('searchModel')}
            emptyMessage={t('noResults')}
          />
          <Select
            label={t('year')}
            value={year}
            placeholder={model ? t('year') : t('model')}
            options={yearOptions}
            onSelect={setYear}
            disabled={!make}
            testID="vehicle-year"
            searchable
            searchPlaceholder={t('searchYear')}
            emptyMessage={t('noResults')}
          />
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
