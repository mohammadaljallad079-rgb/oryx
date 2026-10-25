import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { VehicleCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Chip,
  Heading,
  Photo,
  ProgressBar,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * A new SENSAGE analysis.
 *
 * Three steps: choose the car, add photographs, then watch four named stages.
 * The stages advance on a timer and the result is a demo report — the screen
 * never claims a diagnosis, and the disclaimer sits under the progress bar.
 */
const STAGES = ['analysisStep1', 'analysisStep2', 'analysisStep3', 'analysisStep4'] as const;
const PHOTO_SLOTS = ['mechanicEngine', 'inspectionBay', 'garageInterior', 'autoService'] as const;

export default function NewSensage() {
  const { t, theme, locale, direction, account, dataVersion } = useApp();
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);

  const vehicles = useAsync(
    async () => (account ? repository.vehicles(account.id) : []),
    [account?.id, dataVersion],
  );

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setStage((s) => {
        if (s >= STAGES.length - 1) {
          clearInterval(timer);
          return s;
        }
        return s + 1;
      });
    }, 1100);
    return () => clearInterval(timer);
  }, [running]);

  const done = running && stage === STAGES.length - 1;

  return (
    <Screen>
      <ScreenHeader title={t('sensageTitle')} subtitle={t('startAnalysis')} />

      <Card>
        <SectionLabel>{t('selectVehicle')}</SectionLabel>
        {vehicles.loading ? (
          <StateView kind="loading" />
        ) : (vehicles.data ?? []).length === 0 ? (
          <Body muted size="label" style={{ marginTop: space.sm }}>
            {t('noVehicles')}
          </Body>
        ) : (
          (vehicles.data ?? []).map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              selected={vehicleId === vehicle.id}
              onPress={() => setVehicleId(vehicle.id)}
            />
          ))
        )}
      </Card>

      <Card>
        <SectionLabel>{t('addPhotos')}</SectionLabel>
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {t('addPhotosHint')}
        </Body>
        <View style={[styles.grid, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {PHOTO_SLOTS.map((slot) => {
            const added = photos.includes(slot);
            return (
              <View key={slot} style={{ width: 88 }}>
                <Photo
                  source={photo(slot)}
                  height={88}
                  width={88}
                  radiusValue={radius.md}
                  overlay={added}
                />
                <View style={{ marginTop: space.xs }}>
                  <Chip
                    testID={`sensage-photo-${slot}`}
                    label={added ? t('photoAdded') : t('addPhotos')}
                    active={added}
                    onPress={() => setPhotos((p) => (added ? p.filter((x) => x !== slot) : [...p, slot]))}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {running ? (
        <Card>
          <SectionLabel>{t('analysing')}</SectionLabel>
          <View style={{ marginTop: space.md }}>
            <ProgressBar value={(stage + 1) / STAGES.length} />
          </View>
          <View style={{ marginTop: space.md, gap: space.xs }}>
            {STAGES.map((key, i) => (
              <Text
                key={key}
                style={{
                  color: i <= stage ? theme.gold : theme.textFaint,
                  fontSize: typography.label,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                }}
              >
                {i < stage ? '✓ ' : i === stage ? '● ' : '○ '}
                {t(key)}
              </Text>
            ))}
          </View>
          <Body size="caption" muted style={{ marginTop: space.md }}>
            {t('sensageDisclaimer')}
          </Body>
        </Card>
      ) : null}

      {done ? (
        <Card>
          <Heading size="subheading">{t('reportReady')}</Heading>
          <View style={{ marginTop: space.md }}>
            <Button
              testID="sensage-view-report"
              title={t('reportDetails')}
              onPress={() => router.replace(`/sensage/report-01`)}
            />
          </View>
        </Card>
      ) : (
        <Button
          testID="sensage-run"
          title={t('startAnalysis')}
          disabled={!vehicleId || photos.length === 0 || running}
          onPress={() => setRunning(true)}
        />
      )}

      <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
        {localizeDigits(photos.length, locale)} {t('photosSubmitted')} · {t('demoData')}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: space.md, marginTop: space.md },
});
