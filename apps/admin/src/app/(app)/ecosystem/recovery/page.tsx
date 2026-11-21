'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { PermissionGate } from '@/components/permission-gate';
import { EntityPicker } from '@/components/inline-create';
import { MarketplaceProviderModal } from '@/components/entity-modals';
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
import type { RecoveryRequestDto } from '@oryx/shared';

/**
 * Recovery Dispatch (P5).
 *
 * A consumer raises an SOS; this queue is where an operator assigns an approved
 * provider. The API rejects an assignment for a provider that is not approved or
 * for a request that has already moved past the assignable state, so the control
 * below cannot force an invalid transition.
 */
function RecoveryInner() {
  const { t } = useUi();
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<RecoveryRequestDto | null>(null);
  const [providerId, setProviderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useAsync(() => api.ecosystemRecovery(status || undefined), [status]);
  // Only approved providers are assignable, so the picker is limited to them.
  const providers = useAsync(() => api.marketplaceProviders({ status: 'APPROVED' }), []);

  async function assign() {
    if (!detail || !providerId) return;
    setBusy(true);
    setError(null);
    try {
      await api.assignRecovery(detail.id, providerId);
      setDetail(null);
      setProviderId('');
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="ecosystem-recovery-page">
      <SectionHeader title={t('nav.ecoRecovery')} subtitle={t('ecoRecovery.subtitle')} />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
          <label className="min-w-[180px]">
            <span className="oryx-label">{t('common.status')}</span>
            <select className="oryx-input" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="recovery-status">
              <option value="">{t('common.all')}</option>
              {['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        {list.loading ? (
          <div className="p-4"><Skeleton height={120} /></div>
        ) : list.error ? (
          <div className="p-4"><ErrorBanner message={list.error} onRetry={() => void list.reload()} /></div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          <TableShell label={t('nav.ecoRecovery')}>
            <thead>
              <tr>
                <th>{t('recovery.reference')}</th>
                <th>{t('recovery.urgency')}</th>
                <th>{t('recovery.provider')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data!.map((row) => (
                <tr key={row.id} data-testid={`recovery-row-${row.reference}`}>
                  <td className="font-mono text-[12px]">{row.reference}</td>
                  <td>
                    <Badge tone={row.urgency === 'CRITICAL' ? 'danger' : row.urgency === 'URGENT' ? 'warning' : 'neutral'}>
                      {row.urgency}
                    </Badge>
                  </td>
                  <td className="text-[12.5px]">{row.provider?.name ?? '—'}</td>
                  <td><StatusBadge status={row.status} label={row.status} /></td>
                  <td className="text-end">
                    <Button size="sm" onClick={() => setDetail(row)} data-testid={`recovery-open-${row.reference}`}>
                      {t('common.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Modal open={detail !== null} title={detail?.reference ?? ''} onClose={() => setDetail(null)}>
        {detail ? (
          <div className="flex flex-col gap-4">
            {error ? <ErrorBanner message={error} /> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Detail label={t('recovery.issue')} value={detail.issue} />
              <Detail label={t('common.status')} value={detail.status} />
              <Detail label={t('recovery.contact')} value={detail.contactPhone} />
              <Detail
                label={t('recovery.pickup')}
                value={`${detail.pickup.label ?? t('recovery.pickup')} (${detail.pickup.latitude.toFixed(4)}, ${detail.pickup.longitude.toFixed(4)})`}
              />
            </div>

            <div>
              <div className="mb-1 text-[12px] font-semibold">{t('recovery.timeline')}</div>
              <ul className="flex flex-col gap-1" data-testid="recovery-timeline">
                {detail.timeline.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-[12.5px]">
                    <span>{e.status}{e.note ? ` — ${e.note}` : ''}</span>
                    <span className="text-[var(--muted)]">{new Date(e.createdAt).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            </div>

            {detail.status === 'REQUESTED' ? (
              <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                <Field label={t('recovery.assignProvider')} hint={t('recovery.assignHint')}>
                  <EntityPicker
                    value={providerId || null}
                    options={(providers.data?.items ?? []).map((p) => ({ value: p.id, label: p.nameEn }))}
                    onChange={(v) => setProviderId(v ?? '')}
                    placeholder={t('common.select')}
                    testId="recovery-provider"
                    createLabel={t('erp.automotive.newProvider')}
                    reloadOptions={providers.reload}
                    renderCreate={({ onClose: closeCreate, onSaved }) => (
                      <MarketplaceProviderModal
                        open
                        autoApprove={can('erp.marketplace.provider.manage')}
                        onClose={closeCreate}
                        onCreated={providers.reload}
                        onSaved={(saved) => void onSaved(saved.id)}
                      />
                    )}
                  />
                </Field>
                <div>
                  <Button size="sm" variant="primary" disabled={busy || !providerId} onClick={() => void assign()} data-testid="recovery-assign">
                    {t('erp.providers.assign')}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="text-[12.5px]">{value}</div>
    </div>
  );
}

export default function RecoveryPage() {
  return (
    <PermissionGate anyOf={['erp.marketplace.request.manage']}>
      <RecoveryInner />
    </PermissionGate>
  );
}
