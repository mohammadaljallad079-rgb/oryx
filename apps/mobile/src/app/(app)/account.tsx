import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { api, ApiError } from '../../lib/api';
import { Badge, Body, Button, Card, DetailRow, Heading, Screen } from '../../components/ui';
import { space, typography } from '../../lib/theme';

const SUPPORT_EMAIL = 'support@oryx.local';

/**
 * Account settings.
 *
 * Language and theme are written back to the account so the website and the app
 * agree on the same preferences, and are applied locally first so the switch is
 * immediate.
 */
export default function AccountScreen() {
  const { t, theme, profile, locale, setLocale, setThemeMode, refreshProfile, signOut } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function persist(next: { preferredLocale?: 'ar' | 'en'; preferredTheme?: 'dark' | 'light' }) {
    setBusy(true);
    setMessage(null);
    try {
      await api.updateProfile(next);
      await refreshProfile();
      setMessage(t('saved'));
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Heading>{profile?.fullName ?? ''}</Heading>
        <DetailRow label={t('email')} value={profile?.email ?? ''} />
        {profile?.phone ? <DetailRow label={t('phone')} value={profile.phone} /> : null}
        <DetailRow label={t('status')} value={profile?.status ?? ''} />
        {profile?.mfaEnabled ? (
          <>
            <View style={{ height: space.sm }} />
            <Badge text="MFA" status="APPROVED" />
          </>
        ) : null}
      </Card>

      <Heading>{t('language')}</Heading>
      <Card>
        <View style={styles.actions}>
          <Button
            title={t('arabic')}
            variant={locale === 'ar' ? 'primary' : 'secondary'}
            onPress={() => {
              setLocale('ar');
              void persist({ preferredLocale: 'ar' });
            }}
          />
          <Button
            title={t('english')}
            variant={locale === 'en' ? 'primary' : 'secondary'}
            onPress={() => {
              setLocale('en');
              void persist({ preferredLocale: 'en' });
            }}
          />
        </View>
      </Card>

      <Heading>{t('theme')}</Heading>
      <Card>
        <View style={styles.actions}>
          <Button
            title={t('dark')}
            variant={theme.mode === 'dark' ? 'primary' : 'secondary'}
            onPress={() => {
              setThemeMode('dark');
              void persist({ preferredTheme: 'dark' });
            }}
          />
          <Button
            title={t('light')}
            variant={theme.mode === 'light' ? 'primary' : 'secondary'}
            onPress={() => {
              setThemeMode('light');
              void persist({ preferredTheme: 'light' });
            }}
          />
        </View>
      </Card>

      {message ? (
        <Card>
          <Body muted>{message}</Body>
        </Card>
      ) : null}

      <Heading>{t('support')}</Heading>
      <Card>
        <Body muted>{t('supportHint')}</Body>
        <View style={{ height: space.md }} />
        <Button
          title={SUPPORT_EMAIL}
          variant="secondary"
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
      </Card>

      <Button
        title={t('signOut')}
        variant="danger"
        loading={busy}
        onPress={async () => {
          await signOut();
          router.replace('/(auth)/login');
        }}
        testID="sign-out"
      />

      <View style={styles.footer}>
        <Text style={{ color: theme.textFaint, fontSize: typography.caption }}>
          {t('appName')} · {t('version')} 0.1.0
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  footer: { alignItems: 'center', paddingVertical: space.xl },
});
