import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { photo } from '../../lib/assets';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
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
import { radius, space, typography } from '../../lib/theme';
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
  const router = useRouter();
  const reports = useAsync(
    () => (account ? repository.sensageReports(account.id) : Promise.resolve([])),
    [account?.id, dataVersion],
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
          <SectionLabel>{t('myReports')}</SectionLabel>
        </View>

        {reports.loading ? (
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
          {t('demoData')} · {localizeDigits(reports.data?.length ?? 0, locale)} {t('myReports')} ·{' '}
          {formatDate(new Date().toISOString())}
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, overflow: 'hidden' },
  heroBody: { position: 'absolute', inset: 0, padding: space.lg, justifyContent: 'flex-end', gap: space.xs },
  heroTitle: { color: '#ffffff', fontSize: typography.heading, fontWeight: '700' },
  heroText: { color: 'rgba(255,255,255,0.9)', fontSize: typography.label },
  sectionHead: { marginTop: space.md },
});
