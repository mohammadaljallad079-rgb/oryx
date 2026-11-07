import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { repository } from '../../lib/repository';
import { useAsync } from '../../lib/use-async';
import { useLiveSession } from '../../lib/live-session';
import { useLiveRecovery } from '../../lib/live-recovery';
import { useLiveProviders } from '../../lib/live-catalog';
import { ApiError, addressesApi } from '../../lib/api';
import { publicProviderToDemo } from '../../lib/api-adapters';
import { ScreenHeader } from '../../components/brand';
import { RecoveryCard } from '../../components/cards';
import { Body, Button, Card, Chip, Field, Screen, SectionLabel, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatDateTime, formatMoney, localizeDigits } from '../../lib/format';
import { RECOVERY_ISSUES } from '../../demo/providers';

/**
 * Recovery.
 *
 * Request a tow and follow the jobs already open. Inside a live session the
 * request is raised through the real recovery plane (`POST /customer/recovery`)
 * with a pickup point taken from the customer's own saved address, and the list
 * and tracking trail are the server's own, scoped to the signed-in account. In
 * the offline demo the same form drives the local simulation and the screen says
 * so.
 */
export default function Recovery() {
  const { t, theme, locale, direction, account, dataVersion } = useApp();
  const { isLive, account: sessionAccount } = useLiveSession();
  const recovery = useLiveRecovery();
  const liveProviders = useLiveProviders({ categoryKey: 'recovery' });
  const router = useRouter();

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [issueKey, setIssueKey] = useState<string>(RECOVERY_ISSUES[0]?.key ?? 'battery');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState('');

  const jobs = useAsync(
    async () => (account && !isLive ? repository.recoveryJobs(account.id) : []),
    [account?.id, dataVersion, isLive],
  );
  const demoProviders = useAsync(
    async () => (!isLive ? repository.providers({ kind: 'recovery' }) : []),
    [dataVersion, isLive],
  );

  // The customer's own saved addresses, so a live recovery uses a real pickup
  // point rather than a typed string with no coordinates behind it.
  const savedAddresses = useAsync(
    async () => (isLive ? addressesApi.list() : []),
    [isLive, dataVersion],
  );
  const addresses = (savedAddresses.data ?? []).filter(
    (a) => a.latitude != null && a.longitude != null,
  );
  useEffect(() => {
    if (!addressId && addresses.length > 0) setAddressId(addresses[0]!.id);
    if (!contactPhone && isLive && sessionAccount?.phone) setContactPhone(sessionAccount.phone);
  }, [addressId, addresses, contactPhone, isLive, sessionAccount?.phone]);

  const issueLabel = (key: string) => {
    const found = RECOVERY_ISSUES.find((i) => i.key === key);
    return found ? (locale === 'ar' ? found.ar : found.en) : key;
  };

  /**
   * Raises the request.
   *
   * In a live session this goes through the real recovery plane
   * (`POST /customer/recovery`), which requires an actual pickup point. The
   * coordinates come from one of the customer's own saved addresses — a recovery
   * request is never given an invented location. In the offline demo the same
   * form drives the local simulation.
   */
  async function requestRecovery() {
    if (!isLive) {
      setSubmitted(true);
      return;
    }
    if (busy) return;
    const point = addresses.find((a) => a.id === addressId);
    if (!point || point.latitude == null || point.longitude == null) {
      setNotice(t('recoveryNeedAddress'));
      return;
    }
    if (!contactPhone.trim()) {
      setNotice(t('recoveryNeedPhone'));
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await recovery.create({
      pickupLatitude: point.latitude,
      pickupLongitude: point.longitude,
      pickupLabel: point.label ?? point.addressLine1,
      contactPhone: contactPhone.trim(),
      issue: issueLabel(issueKey),
    });
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

  const jobList = jobs.data ?? [];

  const quoteMinor = 18_000 + RECOVERY_ISSUES.findIndex((i) => i.key === issueKey) * 2_500;

  return (
    <Screen>
      <ScreenHeader title={t('recoveryTitle')} />

      <Card>
        <SectionLabel>{t('requestRecovery')}</SectionLabel>
        {isLive ? null : (
          <View style={{ marginTop: space.md }}>
            <Field label={t('pickupLocation')} value={pickup} onChangeText={setPickup} testID="recovery-pickup" />
            <Field label={t('dropoffLocation')} value={dropoff} onChangeText={setDropoff} testID="recovery-dropoff" />
          </View>
        )}
        {isLive ? (
          <>
            <SectionLabel>{t('recoveryPickupPoint')}</SectionLabel>
            {addresses.length === 0 ? (
              <Body size="caption" muted style={{ marginBottom: space.md }}>
                {t('recoveryNeedAddress')}
              </Body>
            ) : (
              <View style={[styles.row, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
                {addresses.map((address) => (
                  <Chip
                    key={address.id}
                    testID={`recovery-address-${address.id}`}
                    label={address.label ?? address.addressLine1}
                    active={addressId === address.id}
                    onPress={() => setAddressId(address.id)}
                  />
                ))}
              </View>
            )}
            <Field
              label={t('phone')}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              testID="recovery-phone"
            />
          </>
        ) : null}
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
            disabled={isLive ? !addressId || !contactPhone.trim() || busy : !pickup || !dropoff || busy}
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
      {isLive ? (
        recovery.loading && recovery.items.length === 0 ? (
          <StateView kind="loading" />
        ) : recovery.items.length === 0 ? (
          <StateView kind="empty" message={t('noRecoveryRequests')} />
        ) : (
          recovery.items.map((job) => (
            <Card key={job.id} testID={`recovery-card-${job.reference}`} onPress={() => router.push(`/recovery/${job.id}`)}>
              <View style={styles.row}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body, flex: 1 }}>
                  {job.reference}
                </Text>
                <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
                  {job.status}
                </Text>
              </View>
              <Body size="caption" muted style={{ marginTop: space.xs }}>
                {job.issue}
              </Body>
              <Body size="caption" muted>
                {`${localizeDigits(job.timeline.length, locale)} ${t('trackingEvents')} · ${formatDateTime(job.createdAt)}`}
              </Body>
            </Card>
          ))
        )
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
