import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { inspectionPhotosApi, mediaUrl, type InspectionPhoto } from '../../lib/api';
import { AppHeader, DemoBanner } from '../../components/brand';
import { ReportCard } from '../../components/cards';
import {
  Body,
  Button,
  Card,
  Heading,
  Photo,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { brand, radius, space, typography } from '../../lib/theme';
import { formatDate, localizeDigits } from '../../lib/format';

/**
 * The SENSAGE hub.
 *
 * Explains the check, starts a new one and lists the reports already produced.
 * The disclaimer is on the screen itself, not buried: the output is demo data
 * and must not read as a diagnosis.
 */
export default function SensageHome() {
  const { t, theme, locale, account, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const router = useRouter();

  // The demo reports exist only in the offline demo. In a live session the real
  // content is the photographs the customer uploaded, so the demo reports are
  // never shown beside them.
  const reports = useAsync(
    () => (account && !isLive ? repository.sensageReports(account.id) : Promise.resolve([])),
    [account?.id, dataVersion, isLive],
  );
  const photos = useAsync(
    () => (isLive ? inspectionPhotosApi.list() : Promise.resolve([] as InspectionPhoto[])),
    [isLive, dataVersion],
  );

  return (
    <Screen padded={false}>
      <AppHeader />
      <View style={{ padding: space.lg, gap: space.md }}>
        <DemoBanner />

        <View style={[styles.hero, { borderColor: theme.border }]}>
          <Photo source={photo('inspectionBay')} height={168} width="100%" radiusValue={radius.lg} overlay />
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{t('sensageTitle')}</Text>
            <Text style={styles.heroText}>{t('sensageIntro')}</Text>
          </View>
        </View>

        <Card style={{ borderColor: theme.borderStrong }}>
          <Heading size="subheading">{t('addPhotos')}</Heading>
          <Body muted size="label" style={{ marginTop: space.xs }}>
            {t('addPhotosHint')}
          </Body>
          <View style={{ marginTop: space.md }}>
            <Button
              testID="sensage-start"
              title={t('startAnalysis')}
              onPress={() => router.push('/sensage/new')}
            />
          </View>
        </Card>

        <View style={styles.sectionHead}>
          <SectionLabel>{isLive ? t('myPhotos') : t('myReports')}</SectionLabel>
        </View>

        {isLive ? (
          photos.loading ? (
            <StateView kind="loading" />
          ) : (photos.data ?? []).length === 0 ? (
            <StateView kind="empty" message={t('noReports')} />
          ) : (
            <View style={styles.photoGrid}>
              {(photos.data ?? []).map((shot) => (
                <Photo
                  key={shot.id}
                  source={photo('inspectionBay')}
                  uri={mediaUrl(shot.url)}
                  height={104}
                  width={104}
                  radiusValue={radius.md}
                />
              ))}
            </View>
          )
        ) : reports.loading ? (
          <StateView kind="loading" />
        ) : (reports.data ?? []).length === 0 ? (
          <StateView kind="empty" message={t('noReports')} />
        ) : (
          (reports.data ?? []).map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onPress={() => router.push(`/sensage/${report.id}`)}
            />
          ))
        )}

        <Card>
          <SectionLabel>{t('recommendations')}</SectionLabel>
          <Body size="label" muted style={{ marginTop: space.sm }}>
            {t('sensageDisclaimer')}
          </Body>
        </Card>

        <Pressable onPress={() => router.push('/services?kind=maintenance')} accessibilityRole="button">
          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label, textAlign: 'center' }}>
            {t('viewNearbyWorkshops')}
          </Text>
        </Pressable>

        <Body size="caption" muted align="center">
          {isLive ? t('liveData') : t('demoData')} ·{' '}
          {localizeDigits((isLive ? photos.data?.length : reports.data?.length) ?? 0, locale)}{' '}
          {isLive ? t('myPhotos') : t('myReports')} · {formatDate(new Date().toISOString())}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, overflow: 'hidden' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  heroBody: { position: 'absolute', inset: 0, padding: space.lg, justifyContent: 'flex-end', gap: space.xs },
  heroTitle: { color: brand.onNavy, fontSize: typography.heading, fontWeight: '700' },
  heroText: { color: 'rgba(255,255,255,0.9)', fontSize: typography.label },
  sectionHead: { marginTop: space.md },
});
