import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import { Badge, Body, Button, Card, Heading, Screen, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatDateTime } from '../../lib/format';

/** In-app notification inbox. */
export default function NotificationsScreen() {
  const { t, theme } = useApp();
  const notifications = useAsync(() => api.notifications(), []);

  async function markAllRead() {
    await api.markAllNotificationsRead();
    notifications.reload();
  }

  const unread = (notifications.data?.items ?? []).filter((item) => !item.readAt).length;

  return (
    <Screen>
      <Heading>{t('notifications')}</Heading>
      {unread > 0 ? (
        <Button title={t('markAllRead')} variant="secondary" onPress={markAllRead} />
      ) : null}
      <View style={{ height: space.md }} />

      {notifications.loading ? (
        <StateView kind="loading" />
      ) : notifications.error ? (
        <StateView kind="error" message={notifications.error} onRetry={notifications.reload} />
      ) : (notifications.data?.items ?? []).length === 0 ? (
        <Card>
          <Body muted>{t('noNotifications')}</Body>
        </Card>
      ) : (
        (notifications.data?.items ?? []).map((item) => (
          <Card key={item.id}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '700', flexShrink: 1 }}>
                {item.title ?? item.category}
              </Text>
              {!item.readAt ? <Badge text={item.category} status="PENDING" /> : null}
            </View>
            <View style={{ height: space.sm }} />
            <Text style={{ color: theme.textMuted, fontSize: typography.body }}>{item.body}</Text>
            <View style={{ height: space.sm }} />
            <Text style={{ color: theme.textFaint, fontSize: typography.caption }}>
              {formatDateTime(item.createdAt)}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
