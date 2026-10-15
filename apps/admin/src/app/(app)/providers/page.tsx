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

interface ProviderRow {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  categoryKey: string | null;
  status: string;
  commissionPercentBp: number;
  approvedAt: string | null;
  _count?: { listings: number; requests: number };
}

interface RequestRow {
  id: string;
  requestNumber: string;
  categoryKey: string;
  status: string;
  providerId: string | null;
  provider?: { code: string; nameEn: string; nameAr: string; status: string } | null;
  createdAt: string;
}

interface SettlementRow {
  id: string;
  providerId: string;
  periodStart: string;
  periodEnd: string;
  grossMinor: number;
  commissionMinor: number;
  netMinor: number;
  currency: string;
  status: string;
  provider?: { code: string; nameEn: string } | null;
}

type Tab = 'providers' | 'requests' | 'settlements';

/**
 * Provider portal and marketplace console.
 *
 * Provider onboarding is an approval flow: a provider registers as PENDING and
 * only becomes visible in the marketplace once an operator approves it. The
 * commission is stored per provider in basis points and copied onto each
 * settlement, so changing it later never rewrites a past settlement.
 */
export default function ProvidersPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('providers');

  const tabs = [
    { key: 'providers' as const, label: t('erp.providers.directory') },
    { key: 'requests' as const, label: t('erp.providers.requests') },
    { key: 'settlements' as const, label: t('erp.providers.settlements') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="providers-page">
      <SectionHeader
        title={t('nav.provider_portal')}
        subtitle={t('erp.providers.subtitle')}
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
            data-testid={`providers-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'providers' ? <ProvidersTab canDecide={can('erp.provider_portal.manage')} /> : null}
      {tab === 'requests' ? <RequestsTab canAssign={can('erp.provider_portal.manage')} /> : null}
      {tab === 'settlements' ? <SettlementsTab canSettle={can('erp.payments.manage')} /> : null}
    </div>
  );
}

function ProvidersTab({ canDecide }: { canDecide: boolean }) {
  const { t } = useUi();
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<ProviderRow | null>(null);
  const list = useAsync(() => api.marketplaceProviders({ status: status || undefined }), [status]);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[170px]">
          <span className="oryx-label">{t('common.status')}</span>
          <select className="oryx-select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="provider-status">
            <option value="">{t('common.all')}</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
      </div>

      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="p-4"><Skeleton height={150} /></div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.providers.empty')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.providers.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.providers.category')}</th>
              <th>{t('erp.providers.commission')}</th>
              <th>{t('erp.providers.listings')}</th>
              <th>{t('common.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data!.items as ProviderRow[]).map((p) => (
              <tr key={p.id} data-testid={`provider-row-${p.code}`}>
                <td className="font-mono text-[12px]">{p.code}</td>
                <td className="text-[12.5px]">{p.nameEn}</td>
                <td className="text-[12.5px]">{p.categoryKey ?? '—'}</td>
                <td className="tabular-nums text-[12.5px]">{(p.commissionPercentBp / 100).toFixed(2)}%</td>
                <td className="tabular-nums text-[12.5px]">{p._count?.listings ?? 0}</td>
                <td><StatusBadge status={p.status} label={p.status} /></td>
                <td className="text-end">
                  <Button size="sm" onClick={() => setDetail(p)} data-testid={`provider-open-${p.code}`}>
                    {t('common.view')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <ProviderModal
        provider={detail}
        canDecide={canDecide}
        onClose={() => { setDetail(null); void list.reload(); }}
      />
    </Card>
  );
}

function ProviderModal({
  provider,
  canDecide,
  onClose,
}: {
  provider: ProviderRow | null;
  canDecide: boolean;
  onClose: () => void;
}) {
  const { t } = useUi();
  const listings = useAsync(
    () => (provider ? api.providerListings(provider.id) : Promise.resolve(null)),
    [provider?.id],
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED') {
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      await api.decideProvider(provider.id, decision, note.trim() || undefined);
      setNote('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={provider !== null} title={provider?.nameEn ?? ''} onClose={onClose}>
      {provider ? (
        <div className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Detail label={t('erp.providers.code')} value={provider.code} />
            <Detail label={t('common.status')} value={provider.status} />
            <Detail label={t('erp.providers.nameAr')} value={provider.nameAr} />
            <Detail label={t('erp.providers.commission')} value={`${(provider.commissionPercentBp / 100).toFixed(2)}%`} />
            <Detail label={t('erp.providers.approvedAt')} value={provider.approvedAt ? new Date(provider.approvedAt).toLocaleDateString() : '—'} />
            <Detail label={t('erp.providers.requests')} value={String(provider._count?.requests ?? 0)} />
          </div>

          <div>
            <div className="mb-1 text-[12px] font-semibold">{t('erp.providers.listings')}</div>
            {listings.loading ? <Skeleton height={80} /> : (listings.data?.items.length ?? 0) === 0 ? (
              <p className="text-[12px] text-[var(--muted)]">{t('common.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="provider-listings">
                {(listings.data!.items as Array<Record<string, unknown>>).map((l) => (
                  <li key={String(l.id)} className="flex items-center justify-between text-[12.5px]">
                    <span>{String(l.titleEn ?? l.nameEn ?? l.serviceRef ?? l.id)}</span>
                    <span className="tabular-nums text-[var(--muted)]">{String(l.priceMinor ?? '')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canDecide ? (
            <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
              <Field label={t('erp.providers.decisionNote')}>
                <input className="oryx-input" value={note} onChange={(e) => setNote(e.target.value)} data-testid="provider-note" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={busy || provider.status === 'APPROVED'} onClick={() => decide('APPROVED')} data-testid="provider-approve">
                  {t('erp.providers.approve')}
                </Button>
                <Button size="sm" variant="danger" disabled={busy || provider.status === 'REJECTED'} onClick={() => decide('REJECTED')} data-testid="provider-reject">
                  {t('erp.providers.reject')}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy || provider.status !== 'APPROVED'} onClick={() => decide('SUSPENDED')} data-testid="provider-suspend">
                  {t('erp.providers.suspend')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function RequestsTab({ canAssign }: { canAssign: boolean }) {
  const { t } = useUi();
  const [status, setStatus] = useState('');
  const list = useAsync(() => api.serviceRequests({ status: status || undefined }), [status]);
  const providers = useAsync(() => api.marketplaceProviders({ status: 'APPROVED' }), []);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function assign() {
    if (!assignId || !providerId) return;
    setBusy(true);
    setError(null);
    try {
      await api.assignServiceRequest(assignId, providerId);
      setAssignId(null);
      setProviderId('');
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[170px]">
          <span className="oryx-label">{t('common.status')}</span>
          <select className="oryx-select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="request-status">
            <option value="">{t('common.all')}</option>
            {['NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="p-4"><Skeleton height={150} /></div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.providers.emptyRequests')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.providers.requestNumber')}</th>
              <th>{t('erp.providers.category')}</th>
              <th>{t('erp.providers.assignedTo')}</th>
              <th>{t('common.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data!.items as RequestRow[]).map((r) => (
              <tr key={r.id} data-testid={`request-row-${r.requestNumber}`}>
                <td className="font-mono text-[12px]">{r.requestNumber}</td>
                <td className="text-[12.5px]">{r.categoryKey}</td>
                <td className="text-[12.5px]">{r.provider?.nameEn ?? '—'}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td className="text-end">
                  {canAssign ? (
                    <Button size="sm" disabled={r.status === 'COMPLETED'} onClick={() => { setAssignId(r.id); setProviderId(r.providerId ?? ''); }} data-testid={`request-assign-${r.requestNumber}`}>
                      {t('erp.providers.assign')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={assignId !== null}
        title={t('erp.providers.assign')}
        onClose={() => setAssignId(null)}
        footer={
          <>
            <Button onClick={() => setAssignId(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy || !providerId} onClick={assign} data-testid="assign-submit">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <Field label={t('erp.providers.provider')} required>
          <select className="oryx-select" value={providerId} onChange={(e) => setProviderId(e.target.value)} data-testid="assign-provider">
            <option value="">—</option>
            {(providers.data?.items ?? []).map((p) => (
              <option key={(p as ProviderRow).id} value={(p as ProviderRow).id}>
                {(p as ProviderRow).code} — {(p as ProviderRow).nameEn}
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    </Card>
  );
}

function SettlementsTab({ canSettle }: { canSettle: boolean }) {
  const { t } = useUi();
  const [status, setStatus] = useState('');
  const list = useAsync(() => api.settlements({ status: status || undefined }), [status]);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[170px]">
          <span className="oryx-label">{t('common.status')}</span>
          <select className="oryx-select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="settlement-status">
            <option value="">{t('common.all')}</option>
            {['DRAFT', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        {canSettle ? <span className="text-[11.5px] text-[var(--muted)]">{t('erp.providers.settlementHint')}</span> : null}
      </div>

      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="p-4"><Skeleton height={150} /></div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.providers.emptySettlements')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.providers.provider')}</th>
              <th>{t('erp.providers.period')}</th>
              <th>{t('erp.providers.gross')}</th>
              <th>{t('erp.providers.commission')}</th>
              <th>{t('erp.providers.net')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data!.items as SettlementRow[]).map((s) => (
              <tr key={s.id} data-testid={`settlement-row-${s.id}`}>
                <td className="text-[12.5px]">{s.provider?.nameEn ?? s.providerId}</td>
                <td className="text-[12px]">
                  {new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}
                </td>
                <td className="tabular-nums text-[12.5px]">{(s.grossMinor / 1000).toFixed(3)} {s.currency}</td>
                <td className="tabular-nums text-[12.5px]">{(s.commissionMinor / 1000).toFixed(3)}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{(s.netMinor / 1000).toFixed(3)}</td>
                <td><StatusBadge status={s.status} label={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
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
