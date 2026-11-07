import React from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { useAsync } from '../../lib/use-async';
import { formatDateTime } from '../../lib/format';
import { Badge, Button, Card, Screen, SectionTitle, TableRow } from '../../components/ui';
import { space, typography } from '../../lib/theme';

/**
 * Account.
 *
 * Shows the signed-in staff identity, the tenant scope, the licensed modules and
 * the live sessions, and offers the two preferences the control plane stores on
 * the account: language and theme. Saving a preference writes it to the server so
 * the web app and the handset agree on the same account.
 *
 * The session list is per-device and each row can be revoked on its own; revoking
 * the current device signs the user out. Sessions are native (device-kind
 * `mobile`) and are revoked through `DELETE /auth/sessions/:id`.
 */
export default function AccountScreen() {
  const {
    user,
    memberships,
    companyId,
    licensedModules,
    locale,
    theme,
    t,
    can,
    setLocale,
    setThemeMode,
    selectCompany,
    signOut,
    refreshProfile,
  } = useApp();

  const sessions = useAsync(() => (can('erp.company.manage') ? api.sessions() : Promise.resolve({ sessions: [] })), []);

  const savePreference = async (patch: { preferredLocale?: 'ar' | 'en'; preferredTheme?: 'dark' | 'light' }) => {
    await api.updateProfile(patch);
    await refreshProfile();
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: t('account') }} />

      <Card>
        <SectionTitle>{t('profile')}</SectionTitle>
        <TableRow label={t('name')} value={locale === 'ar' ? user?.fullNameAr ?? '' : user?.fullNameEn ?? ''} />
        <TableRow label={t('email')} value={user?.email ?? ''} last />
      </Card>

      <Card>
        <SectionTitle>{t('switchCompany')}</SectionTitle>
        <View style={{ gap: space.xs }}>
          {memberships.map((membership) => {
            const active = membership.companyId === companyId;
            return (
              <Text
                key={membership.companyId}
                onPress={() => void selectCompany(membership.companyId)}
                style={{ color: active ? theme.gold : theme.text, fontWeight: active ? '700' : '400' }}
              >
                {active ? '● ' : '○ '}
                {locale === 'ar' ? membership.companyNameAr : membership.companyNameEn}
              </Text>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('language')}</SectionTitle>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            title={t('arabic')}
            variant={locale === 'ar' ? 'primary' : 'secondary'}
            onPress={() => {
              setLocale('ar');
              void savePreference({ preferredLocale: 'ar' });
            }}
          />
          <Button
            title={t('english')}
            variant={locale === 'en' ? 'primary' : 'secondary'}
            onPress={() => {
              setLocale('en');
              void savePreference({ preferredLocale: 'en' });
            }}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('appearance')}</SectionTitle>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            title={t('darkTheme')}
            variant={theme.mode === 'dark' ? 'primary' : 'secondary'}
            onPress={() => {
              setThemeMode('dark');
              void savePreference({ preferredTheme: 'dark' });
            }}
            testID="theme-dark"
          />
          <Button
            title={t('lightTheme')}
            variant={theme.mode === 'light' ? 'primary' : 'secondary'}
            onPress={() => {
              setThemeMode('light');
              void savePreference({ preferredTheme: 'light' });
            }}
            testID="theme-light"
          />
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('modules')}</SectionTitle>
        {licensedModules.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>{t('none')}</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {licensedModules.map((moduleKey) => (
              <Badge key={moduleKey} text={moduleKey} />
            ))}
          </View>
        )}
      </Card>

      {sessions.data?.sessions?.length ? (
        <Card>
          <SectionTitle>{t('sessions')}</SectionTitle>
          {sessions.data.sessions.map((row, index, all) => (
            <View key={row.id} style={{ marginBottom: space.sm }}>
              <TableRow
                label={row.deviceName ?? row.deviceKind}
                value={formatDateTime(row.createdAt)}
                last={index === all.length - 1}
              />
              <Button
                title={t('revokeSession')}
                variant="danger"
                onPress={async () => {
                  await api.revokeSession(row.id);
                  sessions.reload();
                }}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Text style={{ color: theme.textFaint, fontSize: typography.caption, textAlign: 'center', marginBottom: space.md }}>
        {t('version')} 0.1.0
      </Text>
      <Button title={t('signOut')} variant="danger" onPress={() => void signOut()} testID="sign-out" />
    </Screen>
  );
}
