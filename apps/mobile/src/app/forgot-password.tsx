import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { authApi, ApiError } from '../lib/api';
import { Logo } from '../components/brand';
import { Body, Button, Card, Field, Screen } from '../components/ui';
import { space, typography } from '../lib/theme';

/**
 * Forgot password, then reset.
 *
 * Two steps on one screen because the second only exists to consume the token
 * the first produces.
 *
 * The request step always reports the same thing whether or not the address is
 * registered: the API answers `{ requested: true }` for both, so the screen must
 * not imply that a known address was found. Outside production the API also
 * returns the token, because no email provider is configured; when it does the
 * screen shows it and moves straight to the reset step, which keeps the flow
 * testable without a mailbox.
 */
export default function ForgotPassword() {
  const { t, theme, direction } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>('request');
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.forgotPassword(email.trim());
      setNotice(t('resetSent'));
      if (result.resetToken) {
        setDevToken(result.resetToken);
        setToken(result.resetToken);
      }
      setStage('reset');
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.resetPassword(token.trim(), password);
      setStage('done');
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Logo width={140} />
        <Text
          style={[styles.title, { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        >
          {t('resetPassword')}
        </Text>
        <Body muted>{t('resetPasswordHint')}</Body>
      </View>

      <Card>
        {stage === 'request' ? (
          <>
            <Field
              label={t('email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="forgot-email"
            />
            <Button
              testID="forgot-submit"
              title={t('sendResetCode')}
              disabled={!email.includes('@')}
              loading={busy}
              onPress={request}
            />
          </>
        ) : stage === 'reset' ? (
          <>
            <Field
              label={t('resetToken')}
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              testID="reset-token"
            />
            <Field
              label={t('newPassword')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              testID="reset-password"
            />
            <Body size="caption" muted style={{ marginBottom: space.sm }}>
              {t('passwordHint')}
            </Body>
            <Button
              testID="reset-submit"
              title={t('resetPassword')}
              disabled={token.trim().length < 10 || password.length < 10}
              loading={busy}
              onPress={reset}
            />
          </>
        ) : (
          <Body size="label" style={{ marginBottom: space.sm }}>
            {t('resetComplete')}
          </Body>
        )}

        {notice && stage === 'reset' ? (
          <Body size="caption" muted style={{ marginBottom: space.sm }}>
            {notice}
          </Body>
        ) : null}
        {devToken ? (
          <Body size="caption" muted style={{ marginBottom: space.sm }}>
            {t('devResetToken')} {devToken}
          </Body>
        ) : null}
        {error ? (
          <Text style={{ color: theme.danger, fontSize: typography.label, marginBottom: space.sm }}>
            {error}
          </Text>
        ) : null}

        <Pressable onPress={() => router.replace('/login')} style={styles.linkRow}>
          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
            {t('backToSignIn')}
          </Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start', gap: space.sm, marginTop: space.xl, marginBottom: space.lg },
  title: { fontSize: typography.title, fontWeight: '700' },
  linkRow: { alignItems: 'center', paddingTop: space.md },
});
