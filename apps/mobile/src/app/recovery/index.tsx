import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { useLiveRequests } from '../../lib/live-requests';
import { useLiveProviders } from '../../lib/live-catalog';
import { ApiError } from '../../lib/api';
import { publicProviderToDemo, serviceRequestToDemo } from '../../lib/api-adapters';
import { ScreenHeader } from '../../components/brand';
import { RecoveryCard } from '../../components/cards';
import { Body, Button, Card, Chip, Field, Screen, SectionLabel, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatMoney } from '../../lib/format';
import { RECOVERY_ISSUES } from '../../demo/providers';

/**
 * Recovery.
 *
 * Request a tow and follow the requests already open. Inside a live session the
 * request is raised through the real marketplace (`POST
 * /customer/marketplace/requests`, category `recovery`) and the list is the
 * server's own, scoped to the signed-in account; the provider directory is the
 * approved, live one. In the offline demo the same form drives the local
 * simulation and the screen says so.
 */
export default function Recovery() {
  const { t, theme, locale, direction, account, dataVersion } = useApp();
  const { isLive } = useLiveSession();
  const live = useLiveRequests();
  const liveProviders = useLiveProviders({ categoryKey: 'recovery' });
  const router = useRouter();

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [issueKey, setIssueKey] = useState<string>(RECOVERY_ISSUES[0]?.key ?? 'battery');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const jobs = useAsync(
    async () => (account && !isLive ? repository.recoveryJobs(account.id) : []),
    [account?.id, dataVersion, isLive],
  );
  const demoProviders = useAsync(
    async () => (!isLive ? repository.providers({ kind: 'recovery' }) : []),
    [dataVersion, isLive],
  );

  const issueLabel = (key: string) => {
    const found = RECOVERY_ISSUES.find((i) => i.key === key);
    return found ? (locale === 'ar' ? found.ar : found.en) : key;
  };

  /** Raises the request through the API in a live session, or the local demo. */
  async function requestRecovery() {
    if (!isLive) {
      setSubmitted(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const description = [
      `${issueLabel(issueKey)}`,
      pickup ? `Pickup: ${pickup}` : null,
      dropoff ? `Dropoff: ${dropoff}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const result = await live.create({ categoryKey: 'recovery', description });
    setBusy(false);
    if (result.ok) {
      setSubmitted(true);
      setNotice(t('requestSubmitted'));
    } else {
      setNotice(
        result.error instanceof ApiError && result.error.kind === 'offline'
          ? t('offlineBody')
          : t('requestFailed'),
      );
    }
  }

  const providers = isLive
    ? liveProviders.providers.map(publicProviderToDemo)
    : (demoProviders.data ?? []);
  const providersLoading = isLive ? liveProviders.loading : demoProviders.loading;

  const liveJobs = live.items.map(serviceRequestToDemo);
  const jobList = isLive ? liveJobs : (jobs.data ?? []);
  const jobsLoading = isLive ? live.loading : jobs.loading;

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
        {isLive ? null : (
          <Body size="label" style={{ marginTop: space.md }}>
            {t('estimatedPrice')}: <Text style={{ color: theme.gold, fontWeight: '700' }}>{formatMoney(quoteMinor)}</Text>
          </Body>
        )}
        <View style={{ marginTop: space.md }}>
          <Button
            testID="recovery-request"
            title={submitted ? t('searchingDriver') : t('requestRecovery')}
            disabled={!pickup || !dropoff || busy}
            onPress={() => void requestRecovery()}
          />
        </View>
        {notice ? (
          <Body size="caption" muted style={{ marginTop: space.sm }}>
            {notice}
          </Body>
        ) : submitted ? (
          <Body size="caption" muted style={{ marginTop: space.sm }}>
            {isLive ? t('liveNotice') : t('demoNotice')}
          </Body>
        ) : null}
      </Card>

      <SectionLabel>{t('myRecoveryRequests')}</SectionLabel>
      {jobsLoading ? (
        <StateView kind="loading" />
      ) : jobList.length === 0 ? (
        <StateView kind="empty" message={t('noRecoveryRequests')} />
      ) : (
        jobList.map((job) => <RecoveryCard key={job.id} job={job} />)
      )}

      <SectionLabel>{t('serviceProviders')}</SectionLabel>
      {providersLoading ? (
        <StateView kind="loading" />
      ) : providers.length === 0 ? (
        <StateView kind="empty" />
      ) : (
        providers.slice(0, 4).map((provider) => (
          <Card key={provider.id} onPress={() => router.push(`/services/${provider.id}`)}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body, flex: 1 }}>
                {locale === 'ar' ? provider.nameAr : provider.nameEn}
              </Text>
              <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                {t('viewAll')}
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
