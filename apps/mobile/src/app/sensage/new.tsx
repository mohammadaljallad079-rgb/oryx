import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { ApiError, inspectionPhotosApi, type UploadFile } from '../../lib/api';
import type { PhotoKey } from '../../demo/catalogue';
import {
  capturePhoto,
  openAppSettings,
  pickFromGallery,
  type CaptureFailure,
} from '../../lib/photo-capture';
import { ScreenHeader } from '../../components/brand';
import { VehicleCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Heading,
  ProgressBar,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { brand, radius, space, typography } from '../../lib/theme';
import { localizeDigits } from '../../lib/format';

/**
 * A new SENSAGE inspection.
 *
 * Three steps: choose the car, add photographs with the device camera or from
 * the gallery, then watch four named stages and read the result.
 *
 * The photographs are the user's own. Nothing is uploaded: the URIs are local
 * file paths from the picker, and the analysis is the demo report. The screen
 * says so in the result, so a demo score is never read as a diagnosis.
 */
const STAGES = ['analysisStep1', 'analysisStep2', 'analysisStep3', 'analysisStep4'] as const;

/** A captured photo, with the source kept so the label can say where it came from. */
interface Shot {
  uri: string;
  source: 'camera' | 'gallery';
  /** Set once the shot has been uploaded to the backend, in a live session. */
  uploadedId?: string;
}

/** A live vehicle row, shaped for `VehicleCard` (which is typed for a demo vehicle). */
interface LiveVehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  vin: string;
  colourEn: string;
  colourAr: string;
  mileageKm: number;
  photo: PhotoKey;
}

const FAILURE_KEY: Record<CaptureFailure, string> = {
  cancelled: 'noPhotoChosen',
  'permission-denied': 'cameraPermissionBody',
  'too-large': 'photoTooLarge',
  unsupported: 'unsupportedImage',
  failed: 'photoPickFailed',
};

export default function NewSensage() {
  const { t, theme, locale, direction, account, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  /** A message to show under the capture buttons, or null when there is none. */
  const [notice, setNotice] = useState<string | null>(null);
  /** True when the notice is a denied permission we cannot re-prompt. */
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  /** Live upload state, only meaningful inside a live session. */
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; caption: string | null; createdAt: string }>>([]);

  const vehicles = useAsync(
    async () => (account ? repository.vehicles(account.id) : []),
    [account?.id, dataVersion],
  );

  // The real garage, only when a live session is active. A demo session has no
  // server-side vehicles, so it keeps using the demo list above.
  const [liveVehicles, setLiveVehicles] = useState<LiveVehicle[]>([]);
  useEffect(() => {
    if (!isLive) {
      setLiveVehicles([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { vehiclesApi } = await import('../../lib/api');
        const rows = await vehiclesApi.list();
        if (cancelled) return;
        setLiveVehicles(
          rows.map((v) => ({
            id: v.id,
            ownerId: 'live',
            make: v.make,
            model: v.model,
            year: v.modelYear,
            plate: v.plateNumber ?? v.vin,
            vin: v.vin,
            colourEn: v.color ?? '',
            colourAr: v.color ?? '',
            mileageKm: v.mileage ?? 0,
            photo: 'inspectionBay' as PhotoKey,
          })),
        );
      } catch {
        /* leave the list empty; the screen shows "no vehicles" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  // The upload history, so a customer can see what has already been sent.
  useEffect(() => {
    if (!isLive) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await inspectionPhotosApi.list();
        if (!cancelled) {
          setHistory(rows.map((r) => ({ id: r.id, caption: r.caption, createdAt: r.createdAt })));
        }
      } catch {
        /* history is optional; a failure must not block capture */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive, uploadedCount]);

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
  const align = direction === 'rtl' ? 'right' : 'left';

  /**
   * Runs a capture and folds the result into state. A cancelled picker is not an
   * error and says nothing; every other failure explains itself.
   *
   * Inside a live session the file is uploaded immediately, so the backend holds
   * the photograph before the (demo) analysis runs and the customer can see it in
   * their history. An upload failure is reported and the shot is kept locally, so
   * the user does not silently lose a photo.
   */
  async function capture(source: 'camera' | 'gallery') {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setCanOpenSettings(false);
    try {
      const result = source === 'camera' ? await capturePhoto() : await pickFromGallery();
      if (result.ok) {
        const shot: Shot = { uri: result.uri, source: result.source };
        setShots((prev) => [...prev, shot]);
        if (isLive) {
          void uploadShot(shot);
        }
        return;
      }
      if (result.reason === 'cancelled') return;
      const title =
        result.reason === 'permission-denied'
          ? source === 'camera'
            ? t('cameraPermissionTitle')
            : t('galleryPermissionTitle')
          : null;
      setNotice(title ? `${title} — ${t(FAILURE_KEY[result.reason])}` : t(FAILURE_KEY[result.reason]));
      setCanOpenSettings(Boolean(result.canOpenSettings));
    } finally {
      setBusy(false);
    }
  }

  /** Uploads one shot to the backend and records its id on the shot. */
  async function uploadShot(shot: Shot) {
    setUploading(true);
    try {
      const file: UploadFile = {
        uri: shot.uri,
        name: shot.uri.split('/').pop() ?? 'inspection.jpg',
        mimeType: 'image/jpeg',
      };
      const uploaded = await inspectionPhotosApi.upload(file, {
        vehicleId: vehicleId || undefined,
        caption: shot.source === 'camera' ? t('takePhoto') : t('chooseFromGallery'),
      });
      setShots((prev) => prev.map((s) => (s.uri === shot.uri ? { ...s, uploadedId: uploaded.id } : s)));
      setUploadedCount((n) => n + 1);
    } catch (err) {
      const key =
        err instanceof ApiError && err.kind === 'offline'
          ? 'offlineBody'
          : err instanceof ApiError && err.kind === 'validation'
            ? 'validationFailed'
            : 'uploadFailed';
      setNotice(t(key as never));
    } finally {
      setUploading(false);
    }
  }

  function removeShot(uri: string) {
    setShots((prev) => prev.filter((s) => s.uri !== uri));
    setNotice(null);
  }

  return (
    <Screen>
      <ScreenHeader title={t('sensageTitle')} subtitle={t('sensageIntro')} />

      <Card>
        <SectionLabel>{t('selectVehicle')}</SectionLabel>
        {isLive ? (
          liveVehicles.length === 0 ? (
            <Body muted size="label" style={{ marginTop: space.sm }}>
              {t('noVehicles')}
            </Body>
          ) : (
            liveVehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                selected={vehicleId === vehicle.id}
                onPress={() => setVehicleId(vehicle.id)}
              />
            ))
          )
        ) : vehicles.loading ? (
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

      {/* ------------------------------------------------ camera and gallery */}
      <Card>
        <SectionLabel>{t('addPhotoTitle')}</SectionLabel>
        <Body size="caption" muted style={{ marginTop: space.xs, textAlign: align }}>
          {t('addPhotosHint')}
        </Body>

        <View style={[styles.actions, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          <View style={styles.action}>
            <Button
              testID="sensage-take-photo"
              title={t('takePhoto')}
              variant="primary"
              loading={busy}
              disabled={uploading}
              onPress={() => capture('camera')}
            />
          </View>
          <View style={styles.action}>
            <Button
              testID="sensage-pick-gallery"
              title={t('chooseFromGallery')}
              variant="secondary"
              disabled={busy || uploading}
              onPress={() => capture('gallery')}
            />
          </View>
        </View>

        {/* The failure message. A denied permission offers Settings, because the
            OS will not show the prompt a second time. */}
        {notice ? (
          <View style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
            <Text style={{ color: theme.textMuted, fontSize: typography.label, textAlign: align }}>
              {notice}
            </Text>
            {canOpenSettings ? (
              <Pressable testID="sensage-open-settings" onPress={openAppSettings} style={{ marginTop: space.sm }}>
                <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '700', textAlign: align }}>
                  {t('openSettings')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* The previews. Each is the real captured file, shown at its own aspect. */}
        {shots.length ? (
          <>
            <SectionLabel>{`${t('photoPreview')} · ${localizeDigits(shots.length, locale)}`}</SectionLabel>
            <View style={[styles.previews, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              {shots.map((shot) => (
                <View key={shot.uri} style={styles.preview}>
                  <Image source={{ uri: shot.uri }} style={styles.previewImage} resizeMode="cover" />
                  <Text style={[styles.previewSource, { color: theme.textFaint }]} numberOfLines={1}>
                    {shot.source === 'camera' ? t('takePhoto') : t('chooseFromGallery')}
                  </Text>
                  {isLive ? (
                    <Text
                      testID={`sensage-upload-${shot.source}`}
                      style={{
                        color: shot.uploadedId ? theme.gold : theme.textFaint,
                        fontSize: typography.caption,
                        marginTop: 2,
                      }}
                    >
                      {shot.uploadedId ? `✓ ${t('uploaded')}` : t('uploading')}
                    </Text>
                  ) : null}
                  <Pressable
                    testID={`sensage-remove-${shot.source}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('removePhoto')}
                    onPress={() => removeShot(shot.uri)}
                    style={[styles.remove, { borderColor: theme.borderStrong, backgroundColor: theme.surface }]}
                  >
                    <Text style={{ color: theme.gold, fontSize: 13, fontWeight: '800' }}>×</Text>
                  </Pressable>
                  <Pressable
                    testID={`sensage-replace-${shot.source}`}
                    accessibilityRole="button"
                    onPress={() => {
                      removeShot(shot.uri);
                      void capture(shot.source);
                    }}
                  >
                    <Text style={{ color: theme.gold, fontSize: typography.caption, fontWeight: '700', marginTop: 4 }}>
                      {shot.source === 'camera' ? t('retake') : t('replacePhoto')}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      {/* ------------------------------------------ upload history (live only) */}
      {isLive && history.length ? (
        <Card>
          <SectionLabel>{t('uploadHistory')}</SectionLabel>
          <View style={{ marginTop: space.sm, gap: space.xs }}>
            {history.slice(0, 6).map((row) => (
              <Text key={row.id} style={{ color: theme.textMuted, fontSize: typography.label, textAlign: align }}>
                {row.caption ?? t('photoPreview')} · {localizeDigits(row.createdAt.slice(0, 10), locale)}
              </Text>
            ))}
          </View>
          <Body size="caption" muted style={{ marginTop: space.sm, textAlign: align }}>
            {t('liveModeHint')}
          </Body>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- the analysis */}
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
                  textAlign: align,
                }}
              >
                {i < stage ? '✓ ' : i === stage ? '● ' : '○ '}
                {t(key)}
              </Text>
            ))}
          </View>
          <Body size="caption" muted style={{ marginTop: space.md, textAlign: align }}>
            {t('sensageDisclaimer')}
          </Body>
        </Card>
      ) : null}

      {done ? (
        <Card>
          <Heading size="subheading">{t('reportReady')}</Heading>
          {/* The demo result is labelled as a demo, on the result itself. */}
          <View style={[styles.demoTag, { borderColor: theme.borderStrong, backgroundColor: theme.surfaceRaised }]}>
            <Text style={{ color: theme.gold, fontSize: typography.caption, fontWeight: '700', textAlign: align }}>
              {t('demoData')}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: typography.caption, textAlign: align }}>
              {t('demoResultNotice')}
            </Text>
          </View>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Button
              testID="sensage-view-report"
              title={t('reportDetails')}
              onPress={() => router.replace('/sensage/report-01')}
            />
            <Button
              testID="sensage-new-inspection"
              title={t('newInspection')}
              variant="secondary"
              onPress={() => {
                setRunning(false);
                setStage(0);
                setShots([]);
                setVehicleId('');
              }}
            />
          </View>
        </Card>
      ) : (
        <Button
          testID="sensage-run"
          title={t('startAnalysis')}
          disabled={!vehicleId || shots.length === 0 || running}
          onPress={() => setRunning(true)}
        />
      )}

      <Body size="caption" muted align="center" style={{ marginTop: space.md }}>
        {localizeDigits(shots.length, locale)} {t('photosSubmitted')} · {t('demoData')}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md, marginTop: space.md },
  action: { flex: 1 },
  notice: {
    marginTop: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  previews: { flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  preview: { width: 104, position: 'relative' },
  previewImage: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    backgroundColor: brand.navyDeep,
  },
  previewSource: { fontSize: typography.caption, marginTop: 4 },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoTag: {
    marginTop: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
});
