import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { api, ApiError } from '../../lib/api';
import { Body, Button, Card, Field, Heading, Screen } from '../../components/ui';
import { space, typography } from '../../lib/theme';

/**
 * Password reset request.
 *
 * The API answers `accepted: true` whether or not the address exists, so the
 * screen shows the same confirmation either way and cannot be used to discover
 * which emails have accounts.
 */
export default function ForgotPasswordScreen() {
  const { t, theme } = useApp();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>{t('forgotPassword')}</Text>
      </View>

      <Card>
        {sent ? (
          <>
            <Heading>{t('resetSent')}</Heading>
            <Body muted>{email}</Body>
            <View style={{ height: space.md }} />
            <Button title={t('signIn')} onPress={() => router.replace('/(auth)/login')} />
          </>
        ) : (
          <>
            <Field
              label={t('email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="forgot-email"
            />
            {error ? <Text style={{ color: theme.danger, marginBottom: space.sm }}>{error}</Text> : null}
            <Button title={t('confirm')} onPress={submit} loading={busy} testID="forgot-submit" />
          </>
        )}
      </Card>

      <Button title={t('signIn')} onPress={() => router.back()} variant="ghost" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingVertical: space.xl },
  title: { fontSize: typography.title, fontWeight: '800' },
});
