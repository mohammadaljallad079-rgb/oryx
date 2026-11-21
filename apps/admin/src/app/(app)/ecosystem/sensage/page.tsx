'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';
import { PermissionGate } from '@/components/permission-gate';
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
import type { AiSuggestionDto } from '@oryx/shared';

/**
 * SENSAGE Review (P7).
 *
 * The AI produces a *suggestion*; only a human approval turns it into something
 * a customer may be shown as reviewed. This screen is that review step, and it
 * labels an unapproved row "pending" so the output is never presented as a
 * finished diagnosis.
 */
function SensageInner() {
  const { t } = useUi();
  const [status, setStatus] = useState('PENDING');
  const [detail, setDetail] = useState<AiSuggestionDto | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useAsync(() => api.ecosystemSuggestions(status || undefined), [status]);

  async function review(decision: 'APPROVED' | 'REJECTED') {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await api.reviewSuggestion(detail.id, decision, note.trim() || undefined);
      setDetail(null);
      setNote('');
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="ecosystem-sensage-page">
      <SectionHeader title={t('nav.ecoSensage')} subtitle={t('ecoSensage.subtitle')} />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
          <label className="min-w-[180px]">
            <span className="oryx-label">{t('common.status')}</span>
            <select className="oryx-input" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="sensage-status">
              <option value="">{t('common.all')}</option>
              {['PENDING', 'APPROVED', 'REJECTED'].map((s) => (
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
          <TableShell label={t('nav.ecoSensage')}>
            <thead>
              <tr>
                <th>{t('sensage.summary')}</th>
                <th>{t('sensage.confidence')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data!.map((row) => (
                <tr key={row.id} data-testid={`sensage-row-${row.id}`}>
                  <td className="max-w-[380px] text-[12.5px]">{row.summary}</td>
                  <td className="tabular-nums text-[12.5px]">
                    {row.confidence === null ? '—' : `${Math.round(row.confidence * 100)}%`}
                  </td>
                  <td><StatusBadge status={row.reviewStatus} label={row.reviewStatus} /></td>
                  <td className="text-end">
                    <Button size="sm" onClick={() => setDetail(row)} data-testid={`sensage-open-${row.id}`}>
                      {t('common.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Modal open={detail !== null} title={t('nav.ecoSensage')} onClose={() => setDetail(null)}>
        {detail ? (
          <div className="flex flex-col gap-4">
            {error ? <ErrorBanner message={error} /> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Detail label={t('sensage.provider')} value={detail.providerKey} />
              <Detail label={t('sensage.photo')} value={detail.photoId ?? '—'} />
              <Detail label={t('sensage.confidence')} value={detail.confidence === null ? '—' : `${Math.round(detail.confidence * 100)}%`} />
              <Detail label={t('common.status')} value={detail.reviewStatus} />
            </div>
            <div>
              <div className="mb-1 text-[12px] font-semibold">{t('sensage.summary')}</div>
              <p className="m-0 text-[12.5px]">{detail.summary}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={detail.verified ? 'success' : 'warning'}>
                {detail.verified ? t('sensage.verified') : t('sensage.pending')}
              </Badge>
              <span className="text-[11.5px] text-[var(--muted)]">{t('sensage.advisory')}</span>
            </div>

            {detail.reviewStatus === 'PENDING' ? (
              <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                <Field label={t('sensage.reviewNote')}>
                  <input className="oryx-input" value={note} onChange={(e) => setNote(e.target.value)} data-testid="sensage-note" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void review('APPROVED')} data-testid="sensage-approve">
                    {t('erp.providers.approve')}
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => void review('REJECTED')} data-testid="sensage-reject">
                    {t('erp.providers.reject')}
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

export default function SensagePage() {
  return (
    <PermissionGate anyOf={['erp.customer_portal.read']}>
      <SensageInner />
    </PermissionGate>
  );
}
