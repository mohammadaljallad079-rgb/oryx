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

interface ProviderStatus {
  provider: string;
  mode: string;
  configured: boolean;
}

interface IntentRow {
  id: string;
  intentNumber: string;
  targetType: string;
  targetId: string;
  amountMinor: number;
  currency: string;
  currencyScale: number;
  status: string;
  provider: string;
  description: string | null;
  succeededAt: string | null;
  createdAt: string;
  refunds?: Array<{ id: string; refundNumber: string; amountMinor: number; status: string }>;
}

type Tab = 'intents' | 'providers' | 'reconciliation';

/**
 * Payments console.
 *
 * A provider is listed as configured only when its credentials are present. No
 * gateway is ever shown as live: `configured` and `live` are separate fields and
 * `live` stays false until a real transaction is verified. Manual confirm exists
 * for cash and bank transfer, where the operator confirms the funds arrived.
 */
export default function PaymentsPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('intents');

  const tabs = [
    { key: 'intents' as const, label: t('erp.payments.intents') },
    { key: 'providers' as const, label: t('erp.payments.providers') },
    { key: 'reconciliation' as const, label: t('erp.payments.reconciliation') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="payments-page">
      <SectionHeader
        title={t('nav.payments')}
        subtitle={t('erp.payments.subtitle')}
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
            data-testid={`payments-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'intents' ? <IntentsTab canManage={can('erp.payments.manage')} /> : null}
      {tab === 'providers' ? <ProvidersTab /> : null}
      {tab === 'reconciliation' ? <ReconciliationTab canManage={can('erp.payments.manage')} /> : null}
    </div>
  );
}

function IntentsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useAsync(() => api.paymentIntents({ status: status || undefined }), [status]);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[170px]">
          <span className="oryx-label">{t('common.status')}</span>
          <select className="oryx-select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="intent-status">
            <option value="">{t('common.all')}</option>
            {['PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="p-4"><Skeleton height={150} /></div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.payments.emptyIntents')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.payments.intentNumber')}</th>
              <th>{t('erp.payments.target')}</th>
              <th>{t('erp.payments.amount')}</th>
              <th>{t('erp.payments.provider')}</th>
              <th>{t('common.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data!.items as unknown as IntentRow[]).map((p) => (
              <tr key={p.id} data-testid={`intent-row-${p.intentNumber}`}>
                <td className="font-mono text-[12px]">{p.intentNumber}</td>
                <td className="text-[12.5px]">{p.targetType}</td>
                <td className="tabular-nums text-[12.5px]">
                  {(p.amountMinor / 10 ** p.currencyScale).toFixed(p.currencyScale)} {p.currency}
                </td>
                <td className="text-[12.5px]">{p.provider}</td>
                <td><StatusBadge status={p.status} label={p.status} /></td>
                <td className="text-end">
                  <Button size="sm" onClick={() => setOpenId(p.id)} data-testid={`intent-open-${p.intentNumber}`}>
                    {t('common.view')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <IntentModal open={openId !== null} id={openId} canManage={canManage} onClose={() => { setOpenId(null); void list.reload(); }} />
    </Card>
  );
}

function IntentModal({
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
  const detail = useAsync(() => (id ? api.paymentIntent(id) : Promise.resolve(null)), [id]);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const intent = detail.data as unknown as IntentRow | null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await detail.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const status = intent?.status ?? '';
  const scale = intent?.currencyScale ?? 3;

  return (
    <Modal open={open} title={intent?.intentNumber ?? t('common.loading')} onClose={onClose}>
      {detail.loading ? <Skeleton height={180} /> : null}
      {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {intent ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Detail label={t('common.status')} value={status} />
            <Detail
              label={t('erp.payments.amount')}
              value={`${(intent.amountMinor / 10 ** scale).toFixed(scale)} ${intent.currency}`}
            />
            <Detail label={t('erp.payments.provider')} value={intent.provider} />
            <Detail label={t('erp.payments.target')} value={intent.targetType} />
            <Detail label={t('erp.payments.description')} value={intent.description ?? '—'} />
            <Detail
              label={t('erp.payments.succeededAt')}
              value={intent.succeededAt ? new Date(intent.succeededAt).toLocaleString() : '—'}
            />
          </div>

          {intent.refunds && intent.refunds.length > 0 ? (
            <div>
              <div className="mb-1 text-[12px] font-semibold">{t('erp.payments.refunds')}</div>
              <ul className="flex flex-col gap-1" data-testid="intent-refunds">
                {intent.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-[12.5px]">
                    <span className="font-mono text-[11px]">{r.refundNumber}</span>
                    <span className="tabular-nums">{(r.amountMinor / 10 ** scale).toFixed(scale)}</span>
                    <StatusBadge status={r.status} label={r.status} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canManage ? (
            <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
              {status === 'PENDING' || status === 'REQUIRES_ACTION' ? (
                <>
                  <Field label={t('erp.payments.manualReference')} hint={t('erp.payments.manualReferenceHint')}>
                    <input className="oryx-input" value={reference} onChange={(e) => setReference(e.target.value)} data-testid="intent-reference" />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy || !reference.trim()}
                      onClick={() => run(() => api.confirmPaymentIntent(intent.id, reference.trim()))}
                      data-testid="intent-confirm"
                    >
                      {t('erp.payments.confirmManual')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || !reason.trim()}
                      onClick={() => run(() => api.cancelPaymentIntent(intent.id, reason.trim()))}
                      data-testid="intent-cancel"
                    >
                      {t('erp.payments.cancelIntent')}
                    </Button>
                  </div>
                </>
              ) : null}

              {status === 'SUCCEEDED' || status === 'PARTIALLY_REFUNDED' ? (
                <>
                  <Field label={t('erp.payments.refundAmountMinor')} hint={t('erp.payments.refundHint')}>
                    <input className="oryx-input" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} data-testid="refund-amount" />
                  </Field>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy || !refundAmount.trim()}
                    onClick={() =>
                      run(() =>
                        api.requestRefund(intent.id, {
                          amountMinor: Number(refundAmount),
                          reason: reason.trim() || 'Customer request',
                        }),
                      )
                    }
                    data-testid="refund-request"
                  >
                    {t('erp.payments.requestRefund')}
                  </Button>
                </>
              ) : null}

              {status === 'PENDING' || status === 'REQUIRES_ACTION' ? (
                <Field label={t('erp.payments.reason')}>
                  <input className="oryx-input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="intent-reason" />
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function ProvidersTab() {
  const { t } = useUi();
  const list = useAsync(() => api.paymentProviders(), []);

  return (
    <Card>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="p-4"><Skeleton height={140} /></div>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.payments.provider')}</th>
              <th>{t('erp.payments.mode')}</th>
              <th>{t('erp.payments.configured')}</th>
              <th>{t('erp.payments.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data as unknown as ProviderStatus[] ?? []).map((p) => (
              <tr key={p.provider} data-testid={`provider-status-${p.provider}`}>
                <td className="text-[12.5px]">{p.provider}</td>
                <td className="text-[12.5px]">{p.mode}</td>
                <td><Badge tone={p.configured ? 'success' : 'neutral'}>{p.configured ? t('common.yes') : t('common.no')}</Badge></td>
                <td className="text-[11.5px] text-[var(--muted)]">
                  {p.configured ? t('erp.payments.credentialsPresent') : t('erp.payments.awaitingCredentials')}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

function ReconciliationTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    provider: 'CASH',
    businessDate: new Date().toISOString().slice(0, 10),
    externalCount: '0',
    externalMinor: '0',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useAsync(() => api.paymentReconciliations(onlyUnmatched), [onlyUnmatched]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.reconcilePayments({
        provider: form.provider,
        businessDate: form.businessDate,
        externalCount: Number(form.externalCount),
        externalMinor: Number(form.externalMinor),
      });
      setOpen(false);
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} data-testid="recon-unmatched" />
          {t('erp.payments.onlyUnmatched')}
        </label>
        {canManage ? (
          <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="recon-new">
            {t('erp.payments.newReconciliation')}
          </Button>
        ) : null}
      </div>

      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="p-4"><Skeleton height={140} /></div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.payments.emptyReconciliation')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.payments.businessDate')}</th>
              <th>{t('erp.payments.provider')}</th>
              <th>{t('erp.payments.internal')}</th>
              <th>{t('erp.payments.external')}</th>
              <th>{t('erp.payments.variance')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data as Array<Record<string, unknown>> ?? []).map((r) => (
              <tr key={String(r.id)} data-testid={`recon-row-${String(r.id)}`}>
                <td className="text-[12px]">{new Date(String(r.businessDate)).toLocaleDateString()}</td>
                <td className="text-[12.5px]">{String(r.provider ?? '')}</td>
                <td className="tabular-nums text-[12.5px]">{String(r.internalMinor ?? 0)}</td>
                <td className="tabular-nums text-[12.5px]">{String(r.externalMinor ?? 0)}</td>
                <td className="tabular-nums text-[12.5px]">{String(r.varianceMinor ?? 0)}</td>
                <td><StatusBadge status={r.matched ? 'MATCHED' : 'UNMATCHED'} label={r.matched ? t('erp.payments.matched') : t('erp.payments.unmatched')} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={open}
        title={t('erp.payments.newReconciliation')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy} onClick={submit} data-testid="recon-submit">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('erp.payments.provider')} required>
            <select className="oryx-select" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} data-testid="recon-provider">
              {['CASH', 'CARD', 'BANK_TRANSFER', 'BENEFITPAY'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={t('erp.payments.businessDate')} required>
            <input type="date" className="oryx-input" value={form.businessDate} onChange={(e) => setForm({ ...form, businessDate: e.target.value })} data-testid="recon-date" />
          </Field>
          <Field label={t('erp.payments.externalCount')} required>
            <input className="oryx-input" value={form.externalCount} onChange={(e) => setForm({ ...form, externalCount: e.target.value })} data-testid="recon-count" />
          </Field>
          <Field label={t('erp.payments.externalMinor')} required>
            <input className="oryx-input" value={form.externalMinor} onChange={(e) => setForm({ ...form, externalMinor: e.target.value })} data-testid="recon-external" />
          </Field>
        </div>
      </Modal>
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
