'use client';

import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Button, Card, formatDate } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

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

  const items = notifications.data?.items ?? [];
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        art="/art/service-recovery.svg"
        actions={
          unread > 0 ? (
            <Button variant="primary" onClick={() => void markAll()}>
              <Icon name="check" size={16} />
              {t('notifications.markAll')}
            </Button>
          ) : undefined
        }
      />

      <Card
        title={t('notifications.title')}
        subtitle={t('notifications.count', { count: String(items.length), unread: String(unread) })}
      >
        {notifications.loading ? (
          <LoadingPanel rows={5} />
        ) : items.length === 0 ? (
          <StatePanel
            icon="bell"
            title={t('notifications.none')}
            message={t('notifications.noneHint')}
          />
        ) : (
          <ul className="oryx-list">
            {items.map((item) => (
              <li
                key={item.id}
                className={item.readAt ? 'oryx-list__item' : 'oryx-list__item oryx-notice--unread'}
              >
                <div className="oryx-notice">
                  <span
                    className={item.readAt ? 'oryx-notice__dot oryx-notice__dot--read' : 'oryx-notice__dot'}
                    aria-hidden
                  />
                  <div className="oryx-notice__body">
                    <div
                      className={
                        item.readAt ? 'oryx-notice__title oryx-notice__title--read' : 'oryx-notice__title'
                      }
                    >
                      {item.title ?? item.category}
                    </div>
                    <div className="oryx-muted">{item.body}</div>
                    <div className="oryx-notice__meta">{formatDate(item.createdAt, locale)}</div>
                  </div>
                  {!item.readAt && (
                    <Button variant="ghost" onClick={() => void markOne(item.id)}>
                      {t('notifications.markRead')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
