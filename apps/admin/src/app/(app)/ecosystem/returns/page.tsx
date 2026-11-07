'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';
import { PermissionGate } from '@/components/permission-gate';
import {
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
import type { CustomerReturnDto } from '@oryx/shared';

/**
 * Customer Returns (P4).
 *
 * The consumer raises a return against an order; this queue is where staff
 * approve or reject it, then receive the goods into stock and mark the refund.
 * The API refuses the receive step before an approval, so the buttons below are
 * a guide, not the rule.
 */
function ReturnsInner() {
  const { t } = useUi();
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<CustomerReturnDto | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useAsync(() => api.ecosystemReturns(status || undefined), [status]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
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
    <div className="flex flex-col gap-4" data-testid="ecosystem-returns-page">
      <SectionHeader title={t('nav.ecoReturns')} subtitle={t('ecoReturns.subtitle')} />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
          <label className="min-w-[180px]">
            <span className="oryx-label">{t('common.status')}</span>
            <select className="oryx-input" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="returns-status">
              <option value="">{t('common.all')}</option>
              {['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED'].map((s) => (
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
          <TableShell label={t('nav.ecoReturns')}>
            <thead>
              <tr>
                <th>{t('returns.reference')}</th>
                <th>{t('returns.order')}</th>
                <th>{t('returns.lines')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data!.map((row) => (
                <tr key={row.id} data-testid={`return-row-${row.reference}`}>
                  <td className="font-mono text-[12px]">{row.reference}</td>
                  <td className="text-[12.5px]">{row.orderReference ?? row.orderId}</td>
                  <td className="tabular-nums text-[12.5px]">{row.lines.length}</td>
                  <td><StatusBadge status={row.status} label={row.status} /></td>
                  <td className="text-end">
                    <Button size="sm" onClick={() => setDetail(row)} data-testid={`return-open-${row.reference}`}>
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
              <Detail label={t('returns.order')} value={detail.orderReference ?? detail.orderId} />
              <Detail label={t('common.status')} value={detail.status} />
              <Detail label={t('returns.reason')} value={detail.reason} />
              <Detail label={t('returns.requestedAt')} value={new Date(detail.requestedAt).toLocaleString()} />
            </div>
            <div>
              <div className="mb-1 text-[12px] font-semibold">{t('returns.lines')}</div>
              <ul className="flex flex-col gap-1" data-testid="return-lines">
                {detail.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between text-[12.5px]">
                    <span className="font-mono">{l.productId}</span>
                    <span className="tabular-nums text-[var(--muted)]">×{l.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>

            {detail.status === 'REQUESTED' ? (
              <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                <Field label={t('erp.providers.decisionNote')}>
                  <input className="oryx-input" value={note} onChange={(e) => setNote(e.target.value)} data-testid="return-note" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" disabled={busy} data-testid="return-approve"
                    onClick={() => void act(() => api.decideReturn(detail.id, 'APPROVED', note.trim() || undefined))}>
                    {t('erp.providers.approve')}
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy} data-testid="return-reject"
                    onClick={() => void act(() => api.decideReturn(detail.id, 'REJECTED', note.trim() || undefined))}>
                    {t('erp.providers.reject')}
                  </Button>
                </div>
              </div>
            ) : null}

            {detail.status === 'APPROVED' ? (
              <div className="border-t border-[var(--border)] pt-3">
                <Button size="sm" variant="primary" disabled={busy} data-testid="return-receive"
                  onClick={() => void act(() => api.receiveReturn(detail.id))}>
                  {t('returns.receive')}
                </Button>
                <p className="mt-1 text-[11.5px] text-[var(--muted)]">{t('returns.receiveHint')}</p>
              </div>
            ) : null}

            {detail.status === 'RECEIVED' ? (
              <div className="border-t border-[var(--border)] pt-3">
                <Button size="sm" variant="primary" disabled={busy} data-testid="return-refund"
                  onClick={() => void act(() => api.refundReturn(detail.id))}>
                  {t('returns.refund')}
                </Button>
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

export default function ReturnsPage() {
  return (
    <PermissionGate anyOf={['erp.customer_portal.read']}>
      <ReturnsInner />
    </PermissionGate>
  );
}
