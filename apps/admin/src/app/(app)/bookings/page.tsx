'use client';

import { useState } from 'react';
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

interface BookingRow {
  id: string;
  bookingType: string;
  status: string;
  serviceRef: string | null;
  startsAt: string;
  durationMinutes: number;
  resource?: { code: string; nameEn: string; nameAr: string } | null;
  customerAccount?: { fullName: string; email: string } | null;
  vehicle?: { make: string; model: string; vin: string } | null;
}

interface ResourceRow {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  kind: string;
  capacity: number;
  active: boolean;
}

const STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
const BOOKING_TYPES = ['INSPECTION', 'MAINTENANCE', 'PROVIDER_SERVICE'] as const;

/**
 * Staff side of the shared booking engine.
 *
 * The same engine backs inspection bookings, workshop appointments and
 * marketplace provider slots. Availability is computed server-side from opening
 * hours minus existing bookings, and creation re-checks the slot inside a
 * transaction, so two operators cannot take the same slot.
 */
export default function BookingsPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<'bookings' | 'calendar' | 'resources'>('bookings');
  const [status, setStatus] = useState('');
  const [bookingType, setBookingType] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useAsync(
    () => api.bookings({ status: status || undefined, bookingType: bookingType || undefined }),
    [status, bookingType],
  );

  const tabs = [
    { key: 'bookings' as const, label: t('erp.booking.list') },
    { key: 'calendar' as const, label: t('erp.booking.calendar') },
    { key: 'resources' as const, label: t('erp.booking.resources') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="bookings-page">
      <SectionHeader
        title={t('nav.booking_engine')}
        subtitle={t('erp.booking.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`booking-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'bookings' ? (
        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
            <label className="min-w-[160px]">
              <span className="oryx-label">{t('common.status')}</span>
              <select className="oryx-select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="booking-status">
                <option value="">{t('common.all')}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="min-w-[160px]">
              <span className="oryx-label">{t('erp.booking.type')}</span>
              <select className="oryx-select" value={bookingType} onChange={(e) => setBookingType(e.target.value)} data-testid="booking-type">
                <option value="">{t('common.all')}</option>
                {BOOKING_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
          {list.loading ? (
            <div className="p-4"><Skeleton height={160} /></div>
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={t('common.empty')} hint={t('erp.booking.empty')} />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <th>{t('erp.booking.when')}</th>
                  <th>{t('erp.booking.type')}</th>
                  <th>{t('erp.booking.resource')}</th>
                  <th>{t('erp.booking.customer')}</th>
                  <th>{t('erp.booking.duration')}</th>
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(list.data!.items as unknown as BookingRow[]).map((b) => (
                  <tr key={b.id} data-testid={`booking-row-${b.id}`}>
                    <td className="text-[12.5px]">{new Date(b.startsAt).toLocaleString()}</td>
                    <td className="text-[12.5px]">{b.bookingType}</td>
                    <td className="text-[12.5px]">{b.resource?.nameEn ?? '—'}</td>
                    <td className="text-[12.5px]">{b.customerAccount?.fullName ?? '—'}</td>
                    <td className="tabular-nums text-[12.5px]">{b.durationMinutes}</td>
                    <td><StatusBadge status={b.status} label={b.status} /></td>
                    <td className="text-end">
                      <Button size="sm" onClick={() => setOpenId(b.id)} data-testid={`booking-open-${b.id}`}>
                        {t('common.view')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      ) : null}

      {tab === 'calendar' ? <CalendarTab /> : null}
      {tab === 'resources' ? <ResourcesTab canManage={can('erp.booking.resource.manage')} /> : null}

      <BookingModal open={openId !== null} id={openId} canManage={can('erp.booking.manage')} onClose={() => { setOpenId(null); void list.reload(); }} />
    </div>
  );
}

function CalendarTab() {
  const { t } = useUi();
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10));
  const calendar = useAsync(() => api.bookingCalendar(from, to), [from, to]);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label>
          <span className="oryx-label">{t('erp.booking.from')}</span>
          <input type="date" className="oryx-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="calendar-from" />
        </label>
        <label>
          <span className="oryx-label">{t('erp.booking.to')}</span>
          <input type="date" className="oryx-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="calendar-to" />
        </label>
      </div>
      {calendar.error ? <div className="p-4"><ErrorBanner message={calendar.error} onRetry={calendar.reload} /></div> : null}
      {calendar.loading ? <div className="p-4"><Skeleton height={200} /></div> : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="booking-calendar">
          {(calendar.data ?? []).map((day) => (
            <div key={day.date} className="rounded border border-[var(--border)] p-3">
              <div className="mb-2 text-[12px] font-semibold">{day.date}</div>
              {day.items.length === 0 ? (
                <p className="text-[11.5px] text-[var(--muted)]">{t('common.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {day.items.map((item) => (
                    <li key={String(item.id)} className="flex items-center justify-between text-[11.5px]">
                      <span>{new Date(String(item.startsAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <StatusBadge status={String(item.status)} label={String(item.status)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ResourcesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.bookingResources(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', kind: 'BAY', capacity: '1' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.createBookingResource({
        code: form.code.trim(),
        nameEn: form.nameEn.trim(),
        nameAr: form.nameAr.trim() || form.nameEn.trim(),
        kind: form.kind,
        capacity: Number(form.capacity) || 1,
      });
      setOpen(false);
      setForm({ code: '', nameEn: '', nameAr: '', kind: 'BAY', capacity: '1' });
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <span className="text-[12.5px] font-semibold">{t('erp.booking.resources')}</span>
        {canManage ? (
          <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="booking-new-resource">
            {t('erp.booking.newResource')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="p-4"><Skeleton height={140} /></div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.booking.emptyResources')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.booking.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.booking.kind')}</th>
              <th>{t('erp.booking.capacity')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data as unknown as ResourceRow[]).map((r) => (
              <tr key={r.id} data-testid={`booking-resource-${r.code}`}>
                <td className="font-mono text-[12px]">{r.code}</td>
                <td className="text-[12.5px]">{r.nameEn}</td>
                <td className="text-[12.5px]">{r.kind}</td>
                <td className="tabular-nums text-[12.5px]">{r.capacity}</td>
                <td><Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? t('common.active') : t('common.inactive')}</Badge></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={open}
        title={t('erp.booking.newResource')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy || !form.code || !form.nameEn} onClick={submit} data-testid="save-resource">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('erp.booking.code')} required>
            <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} data-testid="resource-code" />
          </Field>
          <Field label={t('erp.booking.kind')} required>
            <select className="oryx-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="resource-kind">
              <option value="BAY">BAY</option>
              <option value="LIFT">LIFT</option>
              <option value="TECHNICIAN">TECHNICIAN</option>
              <option value="PROVIDER">PROVIDER</option>
            </select>
          </Field>
          <Field label={t('erp.booking.nameEn')} required>
            <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="resource-name-en" />
          </Field>
          <Field label={t('erp.booking.nameAr')}>
            <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="resource-name-ar" dir="rtl" />
          </Field>
          <Field label={t('erp.booking.capacity')}>
            <input className="oryx-input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} data-testid="resource-capacity" />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function BookingModal({
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
  const detail = useAsync(() => (id ? api.booking(id) : Promise.resolve(null)), [id]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const booking = detail.data as Record<string, unknown> | null;

  async function act(fn: (bookingId: string) => Promise<unknown>) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await fn(id);
      await detail.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const status = String(booking?.status ?? '');

  return (
    <Modal open={open} title={String(booking?.bookingType ?? t('common.loading'))} onClose={onClose}>
      {detail.loading ? <Skeleton height={180} /> : null}
      {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {booking ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Detail label={t('common.status')} value={status} />
            <Detail label={t('erp.booking.when')} value={new Date(String(booking.startsAt)).toLocaleString()} />
            <Detail label={t('erp.booking.duration')} value={`${String(booking.durationMinutes)} ${t('erp.customerPlatform.minutes')}`} />
            <Detail label={t('erp.booking.serviceRef')} value={String(booking.serviceRef ?? '—')} />
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
              <Button size="sm" disabled={busy || status !== 'PENDING'} onClick={() => act(api.confirmBooking)} data-testid="booking-confirm">
                {t('erp.booking.confirm')}
              </Button>
              <Button size="sm" disabled={busy || status !== 'CONFIRMED'} onClick={() => act(api.startBooking)} data-testid="booking-start">
                {t('erp.booking.start')}
              </Button>
              <Button size="sm" disabled={busy || status !== 'IN_PROGRESS'} onClick={() => act(api.completeBooking)} data-testid="booking-complete">
                {t('erp.booking.complete')}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || !['CONFIRMED', 'PENDING'].includes(status)} onClick={() => act(api.markBookingNoShow)} data-testid="booking-noshow">
                {t('erp.booking.noShow')}
              </Button>
              <Button size="sm" variant="danger" disabled={busy || ['CANCELLED', 'COMPLETED'].includes(status)} onClick={() => act((bid) => api.cancelBooking(bid, 'Cancelled by staff'))} data-testid="booking-cancel">
                {t('erp.booking.cancel')}
              </Button>
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
