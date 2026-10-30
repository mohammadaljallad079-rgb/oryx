import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { useLiveSession } from '../lib/live-session';
import type { TranslateKey } from '../lib/i18n';
import { Logo } from '../components/brand';
import { Body, Button, Card, Field, Screen } from '../components/ui';
import { space, typography } from '../lib/theme';

/**
 * Create account.
 *
 * Creates a real consumer account through `POST /customer/auth/register`, then
 * signs in with the session the API returns. The password rule mirrors the
 * server's (at least ten characters, higher than the staff baseline because the
 * account guards a garage and payment history) so the common mistake is caught
 * before a round trip; the server remains the authority and a rejected
 * registration is shown verbatim.
 */
export default function Register() {
  const { t, theme, direction, locale } = useApp();
  const { register, busy: liveBusy } = useLiveSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 1 && email.includes('@') && password.length >= 10;

  const submit = async () => {
    setError(null);
    const result = await register({
      email,
      password,
      fullName: name,
      phone: phone.trim() || undefined,
      preferredLocale: locale,
    });
    if (!result.ok) {
      setError(t((result.error ?? 'validationFailed') as TranslateKey));
      return;
    }
    router.replace('/(tabs)/home');
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Logo width={140} />
        <Text
          style={[styles.title, { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        >
          {t('signUp')}
        </Text>
        <Body muted>{t('createAccountSubtitle')}</Body>
      </View>

      <Card>
        <Field label={t('fullName')} value={name} onChangeText={setName} testID="register-name" />
        <Field
          label={t('email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          testID="register-email"
        />
        <Field
          label={t('phone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          testID="register-phone"
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          testID="register-password"
        />
        <Body size="caption" muted style={{ marginBottom: space.sm }}>
          {t('passwordHint')}
        </Body>
        {error ? (
          <Text style={{ color: theme.danger, fontSize: typography.label, marginBottom: space.sm }}>
            {error}
          </Text>
        ) : null}
        <Button
          testID="register-submit"
          title={t('signUp')}
          disabled={!canSubmit}
          loading={liveBusy}
          onPress={submit}
        />
        <Pressable onPress={() => router.replace('/login')} style={styles.linkRow}>
          <Text style={{ color: theme.textMuted, fontSize: typography.label }}>
            {t('haveAccount')}{' '}
            <Text style={{ color: theme.gold, fontWeight: '700' }}>{t('signIn')}</Text>
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
