import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { Logo } from '../components/brand';
import { Body, Button, Card, Field, Screen } from '../components/ui';
import { space, typography } from '../lib/theme';

/**
 * Create account.
 *
 * A demo build has no server to create an account on, so the form validates its
 * input and then routes to the sign-in screen with a note. It is deliberately not
 * a fake success: claiming an account was created when it was not would be the
 * one dishonest thing this screen could do.
 */
export default function Register() {
  const { t, theme, direction } = useApp();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = name.trim() && email.trim() && password.length >= 6;

  return (
    <Screen>
      <View style={styles.top}>
        <Logo width={140} />
        <Text
          style={[styles.title, { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        >
          {t('signUp')}
        </Text>
        <Body muted>{t('demoNotice')}</Body>
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
        {notice ? (
          <Text style={{ color: theme.gold, fontSize: typography.label, marginBottom: space.sm }}>
            {notice}
          </Text>
        ) : null}
        <Button
          testID="register-submit"
          title={t('signUp')}
          disabled={!canSubmit}
          onPress={() => {
            setNotice(t('demoNotice'));
            setTimeout(() => router.replace('/login'), 900);
          }}
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
