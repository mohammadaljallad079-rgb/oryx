'use client';

import { useState } from 'react';
import { PermissionGate } from '@/components/permission-gate';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  SectionHeader,
  Skeleton,
  TableShell,
} from '@/components/ui';
import { MiniBarChart } from '@/components/charts';
import { api, ApiError } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';

type BadgeTone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info';

/**
 * A delivery status maps to a tone that never overstates what happened.
 *
 * `SENT` is amber, not green: an in-app row is "sent" the moment it is written,
 * while `DELIVERED` means a provider accepted it. Only a provider-confirmed
 * state is green.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  DELIVERED: 'success',
  SENT: 'warning',
  QUEUED: 'info',
  PENDING: 'info',
  SKIPPED: 'neutral',
  FAILED: 'danger',
};

const CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'];
const STATUSES = ['QUEUED', 'PENDING', 'SENT', 'DELIVERED', 'SKIPPED', 'FAILED'];

function NotificationsPageInner() {
  const { t, locale } = useUi();
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const deliveries = useAsync(
    () => api.notificationDeliveries({ channel: channel || undefined, status: status || undefined, page, pageSize: 25 }),
    [channel, status, page],
  );
  const summary = useAsync(() => api.notificationSummary(), []);

  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceBody, setAnnounceBody] = useState('');
  const [announceSeverity, setAnnounceSeverity] = useState('INFO');
  const [announceUsers, setAnnounceUsers] = useState('');
  const [announceAudience, setAnnounceAudience] = useState<'staff' | 'customers'>('staff');
  const [announceAllCustomers, setAnnounceAllCustomers] = useState(false);
  const [announceCustomers, setAnnounceCustomers] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const total = deliveries.data?.total ?? 0;
  const pageSize = deliveries.data?.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function resetComposer() {
    setAnnounceTitle('');
    setAnnounceBody('');
    setAnnounceUsers('');
    setAnnounceCustomers('');
    setAnnounceAllCustomers(false);
  }

  async function sendAnnouncement() {
    const split = (value: string) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const userIds = announceAudience === 'staff' ? split(announceUsers) : [];
    const customerAccountIds = announceAudience === 'customers' && !announceAllCustomers ? split(announceCustomers) : [];

    // An announcement with no audience reaches nobody; refuse it here rather
    // than writing a success notice for a no-op.
    if (announceAudience === 'staff' && userIds.length === 0) {
      setError(t('notif.announceUsersHint'));
      return;
    }
    if (announceAudience === 'customers' && !announceAllCustomers && customerAccountIds.length === 0) {
      setError(t('notif.announceCustomersHint'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await api.sendAnnouncement({
        title: announceTitle,
        body: announceBody,
        severity: announceSeverity,
        userIds,
        customerAccountIds,
        allCustomers: announceAudience === 'customers' && announceAllCustomers ? true : undefined,
      });
      setNotice(t('notif.announceQueued').replace('{count}', String(result.queued)));
      setAnnounceOpen(false);
      resetComposer();
      await Promise.all([deliveries.reload(), summary.reload()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTemplate(id: string, active: boolean) {
    try {
      await api.toggleNotificationTemplate(id, active);
      await summary.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const rows = deliveries.data?.items ?? [];
  const channelData = (summary.data?.byChannel ?? []).map((r) => ({ label: r.key, value: r.count }));
  const statusData = (summary.data?.byStatus ?? []).map((r) => ({ label: r.key, value: r.count }));

  return (
    <div className="flex flex-col gap-5" data-testid="notifications-page">
      <SectionHeader
        title={t('notif.title')}
        subtitle={t('notif.subtitle')}
        actions={
          <Button variant="primary" onClick={() => setAnnounceOpen(true)} data-testid="open-announce">
            <Icon name="bell" size={16} />
            {t('notif.announce')}
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => void deliveries.reload()} retryLabel={t('common.retry')} /> : null}
      {notice ? <Badge tone="success">{notice}</Badge> : null}

      <Card className="flex items-start gap-3 p-4" flat>
        <span style={{ color: 'var(--gold)' }}>
          <Icon name="info" size={18} />
        </span>
        <p className="oryx-muted m-0 text-[12.5px]">{t('notif.notice')}</p>
      </Card>

      {/* Breakdown */}
      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5" data-testid="notif-by-channel">
          <p className="oryx-panel-title m-0">{t('notif.byChannel')}</p>
          {summary.loading ? (
            <Skeleton height={160} />
          ) : channelData.length === 0 ? (
            <EmptyState title={t('notif.empty')} hint={t('common.emptyHint')} />
          ) : (
            <MiniBarChart data={channelData} height={160} />
          )}
        </Card>
        <Card className="p-5" data-testid="notif-by-status">
          <p className="oryx-panel-title m-0">{t('notif.byStatus')}</p>
          {summary.loading ? (
            <Skeleton height={160} />
          ) : statusData.length === 0 ? (
            <EmptyState title={t('notif.empty')} hint={t('common.emptyHint')} />
          ) : (
            <MiniBarChart data={statusData} height={160} />
          )}
        </Card>
      </section>

      {/* Delivery log */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[170px]">
            <Field label={t('notif.channel')}>
              <select
                className="oryx-input"
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('notif.filterChannel')}</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="min-w-[170px]">
            <Field label={t('notif.status')}>
              <select
                className="oryx-input"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('notif.filterStatus')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Badge tone="neutral">{total}</Badge>
        </div>

        {deliveries.loading ? (
          <Card className="p-5">
            <Skeleton height={240} />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState title={t('notif.empty')} hint={t('common.emptyHint')} />
          </Card>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('notif.channel')}</th>
                <th>{t('notif.category')}</th>
                <th>{t('notif.recipient')}</th>
                <th>{t('notif.subject')}</th>
                <th>{t('notif.status')}</th>
                <th>{t('notif.attempts')}</th>
                <th>{t('notif.createdAt')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} data-testid={`notif-row-${d.id}`}>
                  <td>
                    <Badge tone="info">{d.channel}</Badge>
                  </td>
                  <td>{d.category}</td>
                  <td className="oryx-faint">{d.recipient ?? '—'}</td>
                  <td>{d.subject ?? d.templateKey ?? '—'}</td>
                  <td>
                    <Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>{d.status}</Badge>
                    {d.provider ? (
                      <span className="oryx-faint block text-[11px]">{d.provider}</span>
                    ) : null}
                  </td>
                  <td>{d.attempts}</td>
                  <td className="oryx-faint">
                    {new Date(d.createdAt).toLocaleString(locale === 'ar' ? 'ar-BH' : 'en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}

        {pages > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹
            </Button>
            <span className="oryx-muted text-[12.5px]">
              {page} / {pages}
            </span>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              ›
            </Button>
          </div>
        ) : null}
      </section>

      {/* Templates */}
      <Card className="p-5" data-testid="notif-templates">
        <p className="oryx-panel-title m-0 mb-3">{t('notif.templates')}</p>
        {summary.loading ? (
          <Skeleton height={140} />
        ) : (summary.data?.templates.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('notif.templateKey')}</th>
                <th>{t('notif.channel')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.data!.templates.map((tpl) => (
                <tr key={tpl.id} data-testid={`template-row-${tpl.key}-${tpl.locale}`}>
                  <td>
                    <strong>{tpl.key}</strong>
                    <span className="oryx-faint block text-[11.5px]">{tpl.locale.toUpperCase()}</span>
                  </td>
                  <td>{tpl.channel}</td>
                  <td>
                    <Badge tone={tpl.isActive ? 'success' : 'neutral'}>
                      {tpl.isActive ? t('notif.templateActive') : t('notif.templateDisabled')}
                    </Badge>
                  </td>
                  <td>
                    <Button size="sm" onClick={() => void toggleTemplate(tpl.id, !tpl.isActive)}>
                      {t('notif.toggle')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Modal
        open={announceOpen}
        title={t('notif.announce')}
        onClose={() => setAnnounceOpen(false)}
        footer={
          <>
            <Button onClick={() => setAnnounceOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => void sendAnnouncement()}
              disabled={busy || !announceTitle || !announceBody}
            >
              {busy ? t('common.saving') : t('notif.announceSend')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <Field label={t('notif.announceTitle')} required>
            <input className="oryx-input" value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} />
          </Field>
          <Field label={t('notif.announceBody')} required>
            <textarea
              className="oryx-input"
              rows={4}
              value={announceBody}
              onChange={(e) => setAnnounceBody(e.target.value)}
            />
          </Field>
          <Field label={t('notif.announceSeverity')}>
            <select
              className="oryx-input"
              value={announceSeverity}
              onChange={(e) => setAnnounceSeverity(e.target.value)}
            >
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </Field>
          <Field label={t('notif.announceAudience')}>
            <select
              className="oryx-input"
              value={announceAudience}
              onChange={(e) => setAnnounceAudience(e.target.value as 'staff' | 'customers')}
              data-testid="announce-audience"
            >
              <option value="staff">{t('notif.announceAudienceStaff')}</option>
              <option value="customers">{t('notif.announceAudienceCustomers')}</option>
            </select>
          </Field>
          {announceAudience === 'staff' ? (
            <Field label={t('notif.announceUsers')} hint={t('notif.announceUsersHint')}>
              <input className="oryx-input" value={announceUsers} onChange={(e) => setAnnounceUsers(e.target.value)} />
            </Field>
          ) : (
            <>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold">
                <input
                  type="checkbox"
                  className="oryx-checkbox"
                  checked={announceAllCustomers}
                  onChange={(e) => setAnnounceAllCustomers(e.target.checked)}
                  data-testid="announce-all-customers"
                />
                {t('notif.announceAllCustomers')}
              </label>
              {!announceAllCustomers ? (
                <Field label={t('notif.announceCustomers')} hint={t('notif.announceCustomersHint')}>
                  <input
                    className="oryx-input"
                    value={announceCustomers}
                    onChange={(e) => setAnnounceCustomers(e.target.value)}
                    data-testid="announce-customers"
                  />
                </Field>
              ) : null}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <PermissionGate anyOf={['platform.notification.read', 'platform.notification.manage']}>
      <NotificationsPageInner />
    </PermissionGate>
  );
}
