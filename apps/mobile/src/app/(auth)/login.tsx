import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { api, ApiError } from '../../lib/api';
import { Body, Button, Card, Field, Heading, Screen } from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';

/**
 * Customer sign-in.
 *
 * Handles the MFA challenge: when the account has TOTP enabled the API answers
 * with a `challengeToken` instead of a session, and the screen switches to the
 * code step without ever receiving a refresh token.
 */
export default function LoginScreen() {
  const { t, theme, refreshProfile } = useApp();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCredentials() {
    if (!email.trim() || !password) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(email.trim(), password);
      if ('mfaRequired' in result && result.mfaRequired && result.challengeToken) {
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
  }

  async function submitCode() {
    if (!challengeToken) return;
    if (code.trim().length < 6) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.verifyMfaLogin(challengeToken, code.trim());
      await refreshProfile();
      router.replace('/(app)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <View style={styles.brand}>
          <View style={[styles.mark, { borderColor: theme.gold }]}>
            <Text style={{ color: theme.gold, fontWeight: '800', fontSize: 22 }}>O</Text>
          </View>
          <Text style={[styles.brandName, { color: theme.text }]}>{t('appName')}</Text>
          <Body muted>{t('tagline')}</Body>
        </View>

        <Card>
          <Heading>{t('signIn')}</Heading>

          {challengeToken ? (
            <>
              <Body muted>{t('mfaPrompt')}</Body>
              <View style={{ height: space.md }} />
              <Field
                label={t('mfaCode')}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                testID="mfa-code"
              />
              {error ? <Text style={{ color: theme.danger, marginBottom: space.sm }}>{error}</Text> : null}
              <Button title={t('verify')} onPress={submitCode} loading={busy} testID="mfa-submit" />
            </>
          ) : (
            <>
              <Field
                label={t('email')}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
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
              {error ? <Text style={{ color: theme.danger, marginBottom: space.sm }}>{error}</Text> : null}
              <Button title={t('signIn')} onPress={submitCredentials} loading={busy} testID="login-submit" />
              <View style={{ height: space.sm }} />
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable>
                  <Text style={{ color: theme.goldSoft, textAlign: 'center', fontSize: typography.label }}>
                    {t('forgotPassword')}
                  </Text>
                </Pressable>
              </Link>
            </>
          )}
        </Card>

        <View style={styles.footer}>
          <Body muted>{t('noAccount')}</Body>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={{ color: theme.gold, fontWeight: '700', marginTop: space.xs }}>
                {t('signUp')}
              </Text>
            </Pressable>
          </Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', paddingVertical: space.xxl },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  brandName: { fontSize: typography.title, fontWeight: '800', letterSpacing: 1 },
  footer: { alignItems: 'center', paddingVertical: space.lg },
});
