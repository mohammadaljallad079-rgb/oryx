import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { photo } from '../lib/assets';
import { Logo } from '../components/brand';
import { Body, Button, Card, Field, Photo, Screen } from '../components/ui';
import { radius, space, typography } from '../lib/theme';

/**
 * Sign in.
 *
 * The demo has no backend, so the two seeded accounts are also offered as
 * one-tap buttons. The email and password path works too — it validates against
 * the same seeded records — so the screen behaves like the real thing rather
 * than a shortcut-only mock.
 */
export default function Login() {
  const { t, theme, direction, signIn, signInAs } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(t('invalidCredentials'));
      return;
    }
    router.replace(email.toLowerCase().startsWith('merchant') ? '/merchant/dashboard' : '/(tabs)/home');
  };

  const quick = async (role: 'customer' | 'merchant') => {
    await signInAs(role);
    router.replace(role === 'merchant' ? '/merchant/dashboard' : '/(tabs)/home');
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Logo width={150} />
        <Text
          style={[
            styles.title,
            { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' },
          ]}
        >
          {t('signIn')}
        </Text>
        <Body muted>{t('signInSubtitle')}</Body>
      </View>

      <Card>
        <Field
          label={t('email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="customer@oryx.demo"
          testID="login-email"
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="demo1234"
          testID="login-password"
        />
        {error ? (
          <Text style={{ color: theme.danger, fontSize: typography.label, marginBottom: space.sm }}>
            {error}
          </Text>
        ) : null}
        <Button
          testID="login-submit"
          title={t('signIn')}
          onPress={submit}
          loading={busy}
        />
        <Pressable onPress={() => router.push('/register')} style={styles.linkRow}>
          <Text style={{ color: theme.textMuted, fontSize: typography.label }}>
            {t('noAccount')}{' '}
            <Text style={{ color: theme.gold, fontWeight: '700' }}>{t('signUp')}</Text>
          </Text>
        </Pressable>
      </Card>

      <Text style={[styles.section, { color: theme.textMuted }]}>{t('demoAccess')}</Text>
      <Card onPress={() => quick('customer')} testID="demo-customer">
        <View style={styles.demoRow}>
          <Photo source={photo('autoService')} height={48} width={48} radiusValue={radius.md} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
              {t('demoCustomer')}
            </Text>
            <Body size="caption" muted>
              {t('demoCustomerHint')}
            </Body>
          </View>
          <Text style={{ color: theme.gold, fontSize: 20 }}>›</Text>
        </View>
      </Card>
      <Card onPress={() => quick('merchant')} testID="demo-merchant">
        <View style={styles.demoRow}>
          <Photo source={photo('partsStore')} height={48} width={48} radiusValue={radius.md} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
              {t('demoMerchant')}
            </Text>
            <Body size="caption" muted>
              {t('demoMerchantHint')}
            </Body>
          </View>
          <Text style={{ color: theme.gold, fontSize: 20 }}>›</Text>
        </View>
      </Card>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-start', gap: space.sm, marginTop: space.xl, marginBottom: space.lg },
  title: { fontSize: typography.title, fontWeight: '700' },
  linkRow: { alignItems: 'center', paddingTop: space.md },
  section: {
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
