import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { RecoveryCard } from '../../components/cards';
import { Body, Button, Card, Chip, Field, Screen, SectionLabel, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney, localizeDigits } from '../../lib/format';
import { RECOVERY_ISSUES } from '../../demo/providers';

/**
 * Recovery.
 *
 * Request a tow and follow the requests already open. The quote is derived from
 * the chosen issue, which is what the provider directory shows as a starting
 * price. Tracking is a demo simulation: the status advances on the screen, and
 * the disclaimer says so.
 */
export default function Recovery() {
  const { t, theme, locale, direction, account, dataVersion } = useApp();
  const router = useRouter();

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [issueKey, setIssueKey] = useState<string>(RECOVERY_ISSUES[0]?.key ?? 'battery');
  const [submitted, setSubmitted] = useState(false);

  const jobs = useAsync(
    async () => (account ? repository.recoveryJobs(account.id) : []),
    [account?.id, dataVersion],
  );
  const providers = useAsync(async () => repository.providers({ kind: 'recovery' }), [dataVersion]);

  const quoteMinor = 18_000 + RECOVERY_ISSUES.findIndex((i) => i.key === issueKey) * 2_500;

  return (
    <Screen>
      <ScreenHeader title={t('recoveryTitle')} />

      <Card>
        <SectionLabel>{t('requestRecovery')}</SectionLabel>
        <View style={{ marginTop: space.md }}>
          <Field label={t('pickupLocation')} value={pickup} onChangeText={setPickup} testID="recovery-pickup" />
          <Field label={t('dropoffLocation')} value={dropoff} onChangeText={setDropoff} testID="recovery-dropoff" />
        </View>
        <SectionLabel>{t('problem')}</SectionLabel>
        <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {RECOVERY_ISSUES.map((issue) => (
            <Chip
              key={issue.key}
              testID={`recovery-issue-${issue.key}`}
              label={locale === 'ar' ? issue.ar : issue.en}
              active={issueKey === issue.key}
              onPress={() => setIssueKey(issue.key)}
            />
          ))}
        </View>
        <Body size="label" style={{ marginTop: space.md }}>
          {t('estimatedPrice')}: <Text style={{ color: theme.gold, fontWeight: '700' }}>{formatMoney(quoteMinor)}</Text>
        </Body>
        <View style={{ marginTop: space.md }}>
          <Button
            testID="recovery-request"
            title={submitted ? t('searchingDriver') : t('requestRecovery')}
            disabled={!pickup || !dropoff}
            onPress={() => setSubmitted(true)}
          />
        </View>
        {submitted ? (
          <Body size="caption" muted style={{ marginTop: space.sm }}>
            {t('demoNotice')}
          </Body>
        ) : null}
      </Card>

      <SectionLabel>{t('myRecoveryRequests')}</SectionLabel>
      {jobs.loading ? (
        <StateView kind="loading" />
      ) : (jobs.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('noRecoveryRequests')} />
      ) : (
        (jobs.data ?? []).map((job) => <RecoveryCard key={job.id} job={job} />)
      )}

      <SectionLabel>{t('serviceProviders')}</SectionLabel>
      {providers.loading ? (
        <StateView kind="loading" />
      ) : (
        (providers.data ?? []).slice(0, 4).map((provider) => (
          <Card key={provider.id} onPress={() => router.push(`/services/${provider.id}`)}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body, flex: 1 }}>
                {locale === 'ar' ? provider.nameAr : provider.nameEn}
              </Text>
              <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                {localizeDigits(provider.distanceKm, locale)} {t('km')}
              </Text>
            </View>
          </Card>
        ))
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
