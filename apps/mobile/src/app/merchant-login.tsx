import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { useMerchantSession } from '../lib/merchant-session';
import type { TranslateKey } from '../lib/i18n';
import { Logo } from '../components/brand';
import { Body, Button, Card, Field, Screen } from '../components/ui';
import { space, typography } from '../lib/theme';

/**
 * Merchant sign-in.
 *
 * A merchant is a staff account linked to a marketplace provider. This screen
 * signs in against the staff endpoint and then resolves the provider membership;
 * an account that is not linked to a provider is refused with a clear message
 * rather than being let into a portal that would reject every call.
 *
 * The customer sign-in is a different screen and a different token slot, so the
 * two identities never share a session.
 */
export default function MerchantLogin() {
  const { t, theme, direction } = useApp();
  const { signIn, busy } = useMerchantSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(t((result.error ?? 'invalidCredentials') as TranslateKey));
      return;
    }
    router.replace('/merchant/dashboard');
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Logo width={150} />
        <Text
          style={[styles.title, { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        >
          {t('merchantAccess')}
        </Text>
        <Body muted>{t('merchantAccessHint')}</Body>
      </View>

      <Card>
        <Field
          label={t('email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          testID="merchant-login-email"
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          testID="merchant-login-password"
        />
        {error ? (
          <Text style={{ color: theme.danger, fontSize: typography.label, marginBottom: space.sm }}>
            {error}
          </Text>
        ) : null}
        <Button
          testID="merchant-login-submit"
          title={t('signIn')}
          onPress={submit}
          loading={busy}
          disabled={!email.trim() || password.length === 0}
        />
        <Pressable onPress={() => router.replace('/login')} style={styles.linkRow}>
          <Text style={{ color: theme.textMuted, fontSize: typography.label }}>
            {t('continueAsGuest')}
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
