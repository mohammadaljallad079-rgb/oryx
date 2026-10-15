'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
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
  StatusBadge,
  TableShell,
} from '@/components/ui';

interface AccountRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  preferredLocale: string;
  preferredTheme: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  _count?: { vehicles: number; bookings: number; serviceRequests: number };
}

interface AccountDetail extends AccountRow {
  vehicles: Array<{ id: string; vin: string; make: string; model: string; modelYear: number; plateNumber: string | null; status: string }>;
  bookings: Array<{ id: string; bookingType: string; status: string; startsAt: string; durationMinutes: number }>;
  addresses: Array<{ id: string; label: string | null; addressLine1: string; city: string; isDefault: boolean }>;
  requests: Array<{ id: string; requestNumber: string; categoryKey: string; status: string; createdAt: string }>;
}

/**
 * Staff view of the customer platform.
 *
 * The consumer plane (website and app) owns these rows; this console lets an
 * operator find the consumers registered against their company, inspect a
 * garage and suspend an account. Everything is scoped server-side to the
 * caller's company, so a guessed id from another tenant returns 404.
 */
export default function CustomerPlatformPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const summary = useAsync(() => api.customerPlatformSummary(), []);
  const list = useAsync(
    () => api.customerAccounts({ search: search || undefined, status: status || undefined }),
    [search, status],
  );

  return (
    <div className="flex flex-col gap-5" data-testid="customer-platform-page">
      <SectionHeader
        title={t('nav.customer_portal')}
        subtitle={t('erp.customerPlatform.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t('erp.customerPlatform.accounts')} value={summary.data?.accounts} testId="cp-stat-accounts" />
        <Stat label={t('erp.customerPlatform.active')} value={summary.data?.active} testId="cp-stat-active" />
        <Stat label={t('erp.customerPlatform.vehicles')} value={summary.data?.vehicles} testId="cp-stat-vehicles" />
        <Stat label={t('erp.customerPlatform.bookings')} value={summary.data?.bookings} testId="cp-stat-bookings" />
        <Stat label={t('erp.customerPlatform.openRequests')} value={summary.data?.openRequests} testId="cp-stat-requests" />
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
          <label className="min-w-[220px] flex-1">
            <span className="oryx-label">{t('common.search')}</span>
            <input
              className="oryx-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('erp.customerPlatform.searchPlaceholder')}
              data-testid="cp-search"
            />
          </label>
          <label className="min-w-[160px]">
            <span className="oryx-label">{t('common.status')}</span>
            <select className="oryx-select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="cp-status">
              <option value="">{t('common.all')}</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING">PENDING</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
        </div>

        {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
        {list.loading ? (
          <div className="p-4"><Skeleton height={160} /></div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('erp.customerPlatform.empty')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.email')}</th>
                <th>{t('common.status')}</th>
                <th>{t('erp.customerPlatform.vehicles')}</th>
                <th>{t('erp.customerPlatform.bookings')}</th>
                <th>{t('erp.customerPlatform.lastLogin')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(list.data!.items as unknown as AccountRow[]).map((a) => (
                <tr key={a.id} data-testid={`cp-row-${a.email}`}>
                  <td className="text-[12.5px]">{a.fullName}</td>
                  <td className="text-[12.5px]">{a.email}</td>
                  <td><StatusBadge status={a.status} label={a.status} /></td>
                  <td className="tabular-nums text-[12.5px]">{a._count?.vehicles ?? 0}</td>
                  <td className="tabular-nums text-[12.5px]">{a._count?.bookings ?? 0}</td>
                  <td className="text-[12px] text-[var(--muted)]">
                    {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString() : t('common.never')}
                  </td>
                  <td className="text-end">
                    <Button size="sm" onClick={() => setOpenId(a.id)} data-testid={`cp-open-${a.email}`}>
                      {t('common.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <AccountModal
        open={openId !== null}
        id={openId}
        canManage={can('erp.customer_portal.manage')}
        onClose={() => { setOpenId(null); void list.reload(); }}
      />
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value?: number; testId: string }) {
  return (
    <Card>
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
        <div className="mt-1 text-[22px] font-semibold tabular-nums" data-testid={testId}>
          {value ?? '—'}
        </div>
      </div>
    </Card>
  );
}

function AccountModal({
  open,
  id,
  canManage,
  onClose,
}: {
  open: boolean;
  id: string | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t } = useUi();
  const detail = useAsync(() => (id ? api.customerAccount(id) : Promise.resolve(null)), [id]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const account = detail.data as unknown as AccountDetail | null;

  async function changeStatus(next: 'ACTIVE' | 'SUSPENDED') {
    if (!id) return;
    if (!reason.trim()) {
      setError(t('erp.customerPlatform.reasonRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.setCustomerAccountStatus(id, next, reason.trim());
      setReason('');
      await detail.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={account?.fullName ?? t('common.loading')} onClose={onClose}>
      {detail.loading ? <Skeleton height={200} /> : null}
      {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {account ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Detail label={t('common.email')} value={account.email} />
            <Detail label={t('erp.customerPlatform.phone')} value={account.phone ?? '—'} />
            <Detail label={t('common.status')} value={account.status} />
            <Detail label={t('erp.customerPlatform.locale')} value={`${account.preferredLocale} / ${account.preferredTheme}`} />
            <Detail label={t('erp.customerPlatform.mfa')} value={account.mfaEnabled ? t('common.yes') : t('common.no')} />
          </div>

          <Section title={`${t('erp.customerPlatform.garage')} (${account.vehicles.length})`}>
            {account.vehicles.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">{t('common.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="cp-vehicles">
                {account.vehicles.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-[12.5px]">
                    <span>{v.make} {v.model} ({v.modelYear})</span>
                    <span className="font-mono text-[11px] text-[var(--muted)]">{v.vin}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`${t('erp.customerPlatform.bookings')} (${account.bookings.length})`}>
            {account.bookings.length === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">{t('common.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="cp-bookings">
                {account.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-[12.5px]">
                    <span>{b.bookingType} · {b.durationMinutes} {t('erp.customerPlatform.minutes')}</span>
                    <StatusBadge status={b.status} label={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {canManage ? (
            <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
              <Field label={t('erp.customerPlatform.reason')} required>
                <input className="oryx-input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="cp-reason" />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy || account.status === 'SUSPENDED'}
                  onClick={() => changeStatus('SUSPENDED')}
                  data-testid="cp-suspend"
                >
                  {t('erp.customerPlatform.suspend')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || account.status === 'ACTIVE'}
                  onClick={() => changeStatus('ACTIVE')}
                  data-testid="cp-reinstate"
                >
                  {t('erp.customerPlatform.reinstate')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="text-[12.5px]">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-semibold">{title}</div>
      {children}
    </div>
  );
}
