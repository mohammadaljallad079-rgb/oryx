import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { useLiveSession } from '../lib/live-session';
import { authApi, ApiError } from '../lib/api';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Field, Notice, Screen, SectionLabel } from '../components/ui';
import { space } from '../lib/theme';

/**
 * Account security.
 *
 * Password change and "sign out everywhere" for a live session. Both are real
 * server calls: `POST /customer/auth/change-password` verifies the current
 * password before accepting a new one, and `POST /customer/auth/logout-all`
 * revokes the customer's other refresh tokens.
 *
 * A guest or demo session sees an explanation rather than a form that would
 * post nowhere.
 */
export default function AccountSecurity() {
  const { t } = useApp();
  const { isLive } = useLiveSession();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await authApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setNotice(t('passwordChanged'));
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('passwordChangeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await authApi.logoutAll();
      setNotice(`${t('signedOutEverywhere')} (${result.revoked})`);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('accountSecurity')} subtitle={t('accountSecurityHint')} />

      {isLive ? (
        <>
          <Card>
            <SectionLabel>{t('changePassword')}</SectionLabel>
            <View style={{ marginTop: space.md }}>
              <Field
                label={t('currentPassword')}
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                testID="security-current"
              />
              <Field
                label={t('newPassword')}
                value={next}
                onChangeText={setNext}
                secureTextEntry
                testID="security-new"
              />
            </View>
            <Button
              testID="security-change"
              title={t('changePassword')}
              disabled={current.length === 0 || next.length < 10}
              loading={busy}
              onPress={change}
            />
          </Card>

          <Card>
            <SectionLabel>{t('sessions')}</SectionLabel>
            <Body size="caption" muted style={{ marginTop: space.xs, marginBottom: space.md }}>
              {t('sessionsHint')}
            </Body>
            <Button
              testID="security-logout-all"
              title={t('signOutEverywhere')}
              variant="secondary"
              loading={busy}
              onPress={revokeAll}
            />
          </Card>
        </>
      ) : (
        <Card>
          <Body size="label" muted>
            {t('securityNeedsLive')}
          </Body>
          <View style={{ marginTop: space.md }}>
            <Button title={t('signIn')} onPress={() => router.push('/login')} />
          </View>
        </Card>
      )}

      <Notice text={error ?? notice} />
      <View style={{ height: space.xl }} />
    </Screen>
  );
}
