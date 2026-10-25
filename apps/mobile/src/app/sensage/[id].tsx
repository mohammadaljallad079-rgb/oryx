import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import {
  Badge,
  Body,
  Button,
  Card,
  Divider,
  Heading,
  ProgressBar,
  Screen,
  SectionLabel,
  StateView,
} from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatDate, formatMoney, localizeDigits } from '../../lib/format';

/**
 * A SENSAGE report.
 *
 * The condition score, the findings with their confidence and indicative cost,
 * and the recommendations. The disclaimer is at the top, not the bottom, because
 * a page that looks like a diagnosis must say it is not one before it is read.
 */
export default function SensageReport() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const report = useAsync(async () => repository.sensageReport(id), [id, dataVersion]);

  if (report.loading) {
    return (
      <Screen>
        <ScreenHeader title={t('reportDetails')} />
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!report.data) {
    return (
      <Screen>
        <ScreenHeader title={t('reportDetails')} />
        <StateView kind="error" message={t('noResults')} />
      </Screen>
    );
  }

  const record = report.data;
  const vehicle = repository.vehicle(record.vehicleId);
  const tone = record.score >= 80 ? theme.success : record.score >= 65 ? theme.warning : theme.danger;

  return (
    <Screen>
      <ScreenHeader
        title={record.reference}
        subtitle={vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : undefined}
      />

      <Card style={{ borderColor: tone, borderWidth: 1 }}>
        <View style={styles.scoreRow}>
          <View style={{ flex: 1 }}>
            <SectionLabel>{t('conditionScore')}</SectionLabel>
            <Text style={{ color: tone, fontSize: typography.display, fontWeight: '700' }}>
              {localizeDigits(record.score, locale)}
            </Text>
            <Body size="caption" muted>
              {t('outOf100')} · {formatDate(record.createdAt)}
            </Body>
          </View>
          <View style={{ width: 140 }}>
            <ProgressBar value={record.score / 100} height={8} />
            <Body size="caption" muted style={{ marginTop: space.xs }}>
              {localizeDigits(record.photoCount, locale)} {t('photosSubmitted')}
            </Body>
          </View>
        </View>
      </Card>

      <Card>
        <Body size="caption" muted>
          {t('sensageDisclaimer')}
        </Body>
      </Card>

      <Card>
        <SectionLabel>{t('findings')}</SectionLabel>
        {record.findings.map((finding, index) => (
          <View key={`${finding.titleEn}-${index}`} style={{ marginTop: space.md }}>
            <View style={styles.titleRow}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body, flex: 1 }}>
                {locale === 'ar' ? finding.titleAr : finding.titleEn}
              </Text>
              <Badge
                text={t(
                  finding.severity === 'high'
                    ? 'severityHigh'
                    : finding.severity === 'medium'
                      ? 'severityMedium'
                      : 'severityLow',
                )}
                tone={finding.severity === 'high' ? 'danger' : finding.severity === 'medium' ? 'gold' : 'neutral'}
              />
            </View>
            <Body size="caption" muted style={{ marginTop: 2 }}>
              {locale === 'ar' ? finding.detailAr : finding.detailEn}
            </Body>
            <View style={[styles.metaRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Body size="caption" muted>
                {t('confidence')}: {localizeDigits(Math.round(finding.confidence * 100), locale)}%
              </Body>
              <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                {t('estimatedCost')}: {formatMoney(finding.costMinor)}
              </Text>
            </View>
            <Divider />
          </View>
        ))}
      </Card>

      <Card>
        <Heading size="subheading">{t('recommendations')}</Heading>
        <View style={{ marginTop: space.sm, gap: space.xs }}>
          {(locale === 'ar' ? record.recommendationsAr : record.recommendationsEn).map((line) => (
            <Text
              key={line}
              style={{
                color: theme.textMuted,
                fontSize: typography.label,
                textAlign: direction === 'rtl' ? 'right' : 'left',
              }}
            >
              • {line}
            </Text>
          ))}
        </View>
      </Card>

      <Button title={t('bookWorkshop')} onPress={() => router.push('/services?kind=maintenance')} />
      <View style={{ height: space.sm }} />
      <Button title={t('rerunCheck')} variant="secondary" onPress={() => router.replace('/sensage/new')} />
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  metaRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
});
