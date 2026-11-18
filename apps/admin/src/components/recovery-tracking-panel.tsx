'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { RecoveryRequestDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Badge, Card, ErrorBanner, Skeleton } from '@/components/ui';

const ACTIVE = new Set(['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE']);
const POLL_MS = 15_000;
type Location = { latitude: number; longitude: number; updatedAt: string | null; source: 'event' | 'pickup' };

function currentLocation(request: RecoveryRequestDto): Location | null {
  const tracked = [...(request.timeline ?? [])].reverse().find(
    (event) => event.latitude != null && event.longitude != null,
  );
  const latitude = Number(tracked?.latitude ?? request.pickup?.latitude);
  const longitude = Number(tracked?.longitude ?? request.pickup?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    latitude,
    longitude,
    updatedAt: tracked?.createdAt ?? null,
    source: tracked ? 'event' : 'pickup',
  };
}

function mapUrl(point: Location) {
  // The embedded map shows one selected real coordinate, never a fabricated truck position.
  const lat = point.latitude;
  const lon = point.longitude;
  const delta = 0.015;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`;
}

export function RecoveryTrackingPanel({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useUi();
  const { can, isPlatform, companyId } = useAuth();
  const authorized = isPlatform || can('erp.marketplace.request.manage');
  const [requests, setRequests] = useState<RecoveryRequestDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!authorized) return;
    try {
      const rows = await api.ecosystemRecovery();
      setRequests(rows);
      setLastChecked(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [authorized, companyId, t]);

  useEffect(() => {
    if (!authorized) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [authorized, refresh]);

  const active = useMemo(() => requests.filter((item) => ACTIVE.has(item.status)), [requests]);
  const selected = active.find((item) => item.id === selectedId) ?? active[0] ?? null;
  const point = selected ? currentLocation(selected) : null;
  const lastEvent = selected?.timeline?.length ? selected.timeline[selected.timeline.length - 1] : null;
  const en = locale === 'en';

  if (!authorized) return null;

  return (
    <Card className="p-4" data-testid="recovery-tracking-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-extrabold">{en ? 'Vehicle & towing tracking' : 'تتبع المركبات وخدمات السحب'}</h2>
          <p className="oryx-muted mt-1 text-xs">{en ? 'Real dispatch records; updates every 15 seconds when the GPS event feed changes.' : 'بيانات عمليات السحب الفعلية، يتم تحديثها كل 15 ثانية عند ورود أحداث موقع جديدة.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">{active.length} {en ? 'Active' : 'نشطة'}</Badge>
          <button type="button" className="oryx-btn oryx-btn--sm" onClick={() => void refresh()}>{en ? 'Refresh' : 'تحديث'}</button>
          <Link href="/vehicle-tracking" className="oryx-btn oryx-btn--sm oryx-btn--primary">{en ? 'Tracking center' : 'مركز التتبع'}</Link>
        </div>
      </div>
      {lastChecked ? <p className="oryx-faint mb-2 text-[11px]">{en ? 'Last checked' : 'آخر فحص'}: {lastChecked.toLocaleTimeString(en ? 'en-GB' : 'ar-BH')}</p> : null}
      {!loading && !compact ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="tracking-status-cards">
          {([
            ['REQUESTED', en ? 'New requests' : 'طلبات جديدة'],
            ['ASSIGNED', en ? 'Assigned' : 'تم الإسناد'],
            ['EN_ROUTE', en ? 'On the way' : 'في الطريق'],
            ['ON_SITE', en ? 'At pickup' : 'في الموقع'],
          ] as const).map(([status, label]) => (
            <div key={status} className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
              <p className="oryx-muted m-0 text-xs">{label}</p>
              <strong className="mt-1 block text-2xl">{active.filter((item) => item.status === status).length}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <ErrorBanner message={error} onRetry={() => void refresh()} /> : null}
      {loading ? <Skeleton height={compact ? 240 : 390} /> : !active.length ? (
        <div className="grid min-h-[210px] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-6 text-center">
          <div>
            <p className="font-bold">{en ? 'No active towing operations' : 'لا توجد عمليات سحب نشطة حاليًا'}</p>
            <p className="oryx-muted mt-1 text-xs">{en ? 'New recovery requests appear here automatically.' : 'تظهر هنا طلبات سحب المركبات الجديدة تلقائيًا.'}</p>
          </div>
        </div>
      ) : (
        <div className={compact ? 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]' : 'grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]'}>
          <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
            {point ? (
              <iframe
                key={selected?.id}
                title={en ? 'Selected recovery location' : 'موقع عملية السحب المحددة'}
                src={mapUrl(point)}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-[280px] w-full border-0 md:h-[380px]"
                data-testid="tracking-map"
              />
            ) : <div className="grid h-[280px] place-items-center p-4 text-center text-sm">{en ? 'No coordinates supplied' : 'لا توجد إحداثيات لهذه العملية'}</div>}
            <p className="oryx-muted m-0 border-t border-[var(--border)] px-3 py-2 text-xs">
              {point?.source === 'event'
                ? (en ? 'Last recorded truck event position (not continuous live GPS)' : 'آخر موقع مسجّل في أحداث السحب (ليس GPS مباشرًا مستمرًا)')
                : (en ? 'Pickup location only — truck GPS has not been reported' : 'موقع الاستلام فقط — لم تصل إحداثيات شاحنة السحب')}
              {point?.updatedAt ? ` · ${new Date(point.updatedAt).toLocaleString(en ? 'en-GB' : 'ar-BH')}` : ''}
            </p>
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto" style={{ maxHeight: compact ? 345 : 445 }}>
            {active.slice(0, compact ? 6 : 100).map((item) => {
              const loc = currentLocation(item);
              return (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
                  className="w-full rounded-xl border p-3 text-start"
                  style={{ borderColor: item.id === selected?.id ? 'var(--gold)' : 'var(--border)', background: item.id === selected?.id ? 'var(--tint-fill)' : 'var(--surface)' }}>
                  <div className="flex items-center justify-between gap-2"><strong className="text-sm">{item.reference}</strong><Badge tone={item.urgency === 'CRITICAL' ? 'danger' : 'neutral'}>{item.status}</Badge></div>
                  <p className="oryx-muted mb-1 mt-2 text-xs">{item.issue}</p>
                  <p className="oryx-faint m-0 text-xs">{item.provider?.name ?? (en ? 'Unassigned' : 'غير مسندة')} · {loc?.source === 'event' ? (en ? 'Location reported' : 'تم إرسال الموقع') : (en ? 'Pickup only' : 'الاستلام فقط')}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!compact && selected && lastEvent ? <p className="oryx-muted mt-3 text-xs">{en ? 'Last activity' : 'آخر تحديث للعملية'}: {lastEvent.status} — {new Date(lastEvent.createdAt).toLocaleString(en ? 'en-GB' : 'ar-BH')}</p> : null}
    </Card>
  );
}
