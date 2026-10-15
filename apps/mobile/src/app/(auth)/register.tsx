import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { api, ApiError } from '../../lib/api';
import { Body, Button, Card, Field, Heading, Screen } from '../../components/ui';
import { radius, space, typography } from '../../lib/theme';

/** Customer self-registration. The new account is signed in immediately. */
export default function RegisterScreen() {
  const { t, theme, refreshProfile, locale } = useApp();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      setError(password.length > 0 && password.length < 8
        ? 'Password must be at least 8 characters.'
        : t('required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.register({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
      });
      // Register the account in the language the customer is reading the app in.
      await api.updateProfile({ preferredLocale: locale });
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
          <Heading>{t('signUp')}</Heading>
          <Field label={t('fullName')} value={fullName} onChangeText={setFullName} testID="register-name" />
          <Field
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
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
          {error ? <Text style={{ color: theme.danger, marginBottom: space.sm }}>{error}</Text> : null}
          <Button title={t('signUp')} onPress={submit} loading={busy} testID="register-submit" />
        </Card>

        <View style={styles.footer}>
          <Body muted>{t('haveAccount')}</Body>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={{ color: theme.gold, fontWeight: '700', marginTop: space.xs }}>
                {t('signIn')}
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
