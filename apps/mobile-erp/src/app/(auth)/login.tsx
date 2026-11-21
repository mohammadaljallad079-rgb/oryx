import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { api, ApiError } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { Button, Card, Field, Screen } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { Text } from 'react-native';

/**
 * Sign-in.
 *
 * Two steps when the account has a second factor: the password step returns a
 * challenge token, and the code step exchanges it for a session. No token is
 * issued by the password step, so a stolen password alone cannot obtain access —
 * the same rule the control plane enforces.
 *
 * The refresh token arrives in the response body because every request carries
 * `x-oryx-client: mobile`; `api.ts` seals it in the platform keychain.
 */
export default function LoginScreen() {
  const { theme, t, refreshProfile } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPassword = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    try {
      const result = await api.login(email.trim(), password);
      if (result.mfaRequired && result.challengeToken) {
        setChallengeToken(result.challengeToken);
        return;
      }
      await refreshProfile();
      router.replace('/(app)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setError(null);
    if (!code.trim() || !challengeToken) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    try {
      await api.verifyMfaLogin(challengeToken, code.trim());
      await refreshProfile();
      router.replace('/(app)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: space.xxl, marginBottom: space.xl }}>
        <Text style={{ color: theme.gold, fontSize: 34, fontWeight: '700' }}>{t('appName')}</Text>
        <Text style={{ color: theme.textMuted, fontSize: typography.label, marginTop: space.xs }}>
          {t('tagline')}
        </Text>
      </View>

      <Card>
        {challengeToken ? (
          <>
            <Text style={{ color: theme.textMuted, marginBottom: space.md }}>{t('mfaPrompt')}</Text>
            <Field
              label={t('mfaCode')}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              testID="mfa-code"
            />
            <Button title={t('verify')} onPress={submitCode} loading={busy} testID="mfa-submit" />
          </>
        ) : (
          <>
            <Field
              label={t('email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              testID="login-email"
            />
            <Field
              label={t('password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              testID="login-password"
            />
            <Button
              title={busy ? t('signingIn') : t('signIn')}
              onPress={submitPassword}
              loading={busy}
              testID="login-submit"
            />
          </>
        )}

        {error ? (
          <Text
            style={{
              color: theme.danger,
              fontSize: typography.label,
              marginTop: space.md,
              textAlign: 'center',
            }}
            testID="login-error"
          >
            {error}
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}
