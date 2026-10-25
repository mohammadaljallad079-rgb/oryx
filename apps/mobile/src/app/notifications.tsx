import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Card, Chip, Screen, SectionLabel, StateView } from '../components/ui';
import { space } from '../lib/theme';
import { formatDateTime } from '../lib/format';

/**
 * Notifications.
 *
 * The demo carries a customer and a merchant audience, so the screen shows the
 * one that belongs to the signed-in role. The unread marker is a dot, not a
 * colour-only signal, so it survives a monochrome reading.
 */
export default function Notifications() {
  const { t, theme, locale, isMerchant, direction, dataVersion } = useApp();
  const notifications = useAsync(
    async () => repository.notifications(isMerchant ? 'merchant' : 'customer'),
    [isMerchant, dataVersion],
  );

  return (
    <Screen>
      <ScreenHeader title={t('notifications')} subtitle={`${(notifications.data ?? []).length}`} />

      {notifications.loading ? (
        <StateView kind="loading" />
      ) : (notifications.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('empty')} />
      ) : (
        (notifications.data ?? []).map((note) => (
          <Card key={note.id}>
            <View style={[styles.headRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Body size="label" style={{ fontWeight: '700' }}>
                  {locale === 'ar' ? note.titleAr : note.titleEn}
                </Body>
                <Body size="caption" muted>
                  {locale === 'ar' ? note.bodyAr : note.bodyEn}
                </Body>
              </View>
              {!note.read ? <View style={[styles.dot, { backgroundColor: theme.gold }]} /> : null}
            </View>
            <View style={[styles.metaRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <Chip label={note.kind} />
              <Body size="caption" muted>
                {formatDateTime(note.createdAt)}
              </Body>
            </View>
          </Card>
        ))
      )}
      <SectionLabel>{t('demoData')}</SectionLabel>
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { alignItems: 'flex-start', gap: space.md },
  metaRow: { alignItems: 'center', justifyContent: 'space-between', marginTop: space.md, gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
});
