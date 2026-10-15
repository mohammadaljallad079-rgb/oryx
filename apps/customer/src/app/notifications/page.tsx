'use client';

import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Button, Card, EmptyState, Loading, formatDate } from '@/components/ui';

/** In-app notifications with read state. */
export default function NotificationsPage() {
  return (
    <RequireCustomer>
      <NotificationsContent />
    </RequireCustomer>
  );
}

function NotificationsContent() {
  const { t, locale } = useUi();
  const notifications = useAsync(() => customerApi.notifications(), []);

  async function markAll() {
    await customerApi.markAllNotificationsRead();
    await notifications.reload();
  }

  async function markOne(id: string) {
    await customerApi.markNotificationsRead([id]);
    await notifications.reload();
  }

  return (
    <div className="oryx-container">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h1 className="oryx-section-title">{t('notifications.title')}</h1>
        <Button onClick={() => void markAll()}>{t('notifications.markAll')}</Button>
      </div>

      <Card>
        {notifications.loading ? (
          <Loading />
        ) : (notifications.data?.items.length ?? 0) === 0 ? (
          <EmptyState message={t('notifications.none')} />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {notifications.data?.items.map((item) => (
              <li
                key={item.id}
                style={{
                  padding: '14px 0',
                  borderBottom: '1px solid var(--border-soft)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: item.readAt ? 400 : 650 }}>
                    {item.title ?? item.category}
                  </div>
                  <div className="oryx-muted">{item.body}</div>
                  <div className="oryx-muted">{formatDate(item.createdAt, locale)}</div>
                </div>
                {!item.readAt && (
                  <Button variant="ghost" onClick={() => void markOne(item.id)}>
                    {t('notifications.markAll')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
