import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { useLiveSession } from '../lib/live-session';
import { repository } from '../lib/repository';
import { useAsync } from '../lib/use-async';
import { ScreenHeader } from '../components/brand';
import { Body, Button, Card, Chip, Screen, SectionLabel, StateView } from '../components/ui';
import { space } from '../lib/theme';
import { formatDateTime } from '../lib/format';
import { ApiError, notificationsApi, type CustomerNotification } from '../lib/api';

/**
 * Notifications.
 *
 * Two modes, never mixed. With a **live session** the list is the customer's own
 * in-app notifications from `/customer/notifications`, and the unread marker is
 * the server's `deliveredAt` — marking read calls the API and re-reads, so the
 * badge cannot drift from what the server holds. Without a session the local
 * demo notifications are shown under a "Demo data" label.
 *
 * The unread marker is a dot and a bold title, not a colour-only signal, so it
 * survives a monochrome reading.
 */
export default function Notifications() {
  const { t, theme, locale, direction, dataVersion } = useApp();
  const session = useLiveSession();
  const isLive = session.isLive;

  const demo = useAsync(
    async () => repository.notifications('customer'),
    [dataVersion],
  );

  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    setError(null);
    try {
      const page = await notificationsApi.list({ pageSize: 50 });
      setItems(page.items);
      setUnread(page.unread);
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isLive, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await notificationsApi.markRead([id]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await notificationsApi.markAllRead();
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('serverError'));
    } finally {
      setBusy(false);
    }
  };

  const rowDirection = direction === 'rtl' ? 'row-reverse' : 'row';

  // ------------------------------------------------------------- live mode
  if (isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('notifications')} subtitle={`${unread} ${t('unread')}`} />

        {loading && items.length === 0 ? (
          <StateView kind="loading" />
        ) : error && items.length === 0 ? (
          <Card>
            <StateView kind="error" message={error} />
            <Button title={t('retry')} onPress={() => void load()} />
          </Card>
        ) : items.length === 0 ? (
          <StateView kind="empty" message={t('empty')} />
        ) : (
          <>
            {unread > 0 ? (
              <Button title={t('markAllRead')} variant="secondary" disabled={busy} onPress={() => void markAll()} />
            ) : null}
            {items.map((note) => {
              const read = note.deliveredAt !== null;
              return (
                <Pressable
                  key={note.id}
                  testID={`notification-${note.id}`}
                  disabled={read || busy}
                  onPress={() => void markRead(note.id)}
                >
                  <Card>
                    <View style={[styles.headRow, { flexDirection: rowDirection }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Body size="label" style={{ fontWeight: read ? '500' : '700' }}>
                          {note.subject}
                        </Body>
                        <Body size="caption" muted>
                          {note.body}
                        </Body>
                      </View>
                      {!read ? <View style={[styles.dot, { backgroundColor: theme.gold }]} /> : null}
                    </View>
                    <View style={[styles.metaRow, { flexDirection: rowDirection }]}>
                      <Chip label={note.category} />
                      <Body size="caption" muted>
                        {formatDateTime(note.createdAt)}
                      </Body>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}

        <Body size="caption" muted align="center">
          {t('liveData')}
        </Body>
        <View style={{ height: space.xl }} />
      </Screen>
    );
  }

  // ------------------------------------------------------------- demo mode
  const demoItems = demo.data ?? [];
  return (
    <Screen>
      <ScreenHeader title={t('notifications')} subtitle={`${demoItems.length}`} />

      {demo.loading ? (
        <StateView kind="loading" />
      ) : demoItems.length === 0 ? (
        <StateView kind="empty" message={t('empty')} />
      ) : (
        demoItems.map((note) => (
          <Card key={note.id}>
            <View style={[styles.headRow, { flexDirection: rowDirection }]}>
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
            <View style={[styles.metaRow, { flexDirection: rowDirection }]}>
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
