'use client';

import { useEffect, useState } from 'react';
import type { CompanyDto, PlanDto, SubscriptionDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
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
  StatusBadge,
  TableShell,
} from '@/components/ui';

type SubscriptionRow = SubscriptionDto & { events: Array<Record<string, unknown>> };

export default function SubscriptionsPage() {
  const { t, locale } = useUi();
  const subs = useAsync(() => api.listSubscriptions(), []);
  const companies = useAsync(() => api.listCompanies({ pageSize: 100 }), []);
  const plans = useAsync(() => api.listPlans(), []);

  const [assignTo, setAssignTo] = useState<CompanyDto | null>(null);
  const [historyOf, setHistoryOf] = useState<SubscriptionRow | null>(null);

  return (
    <div className="flex flex-col gap-5" data-testid="subscriptions-page">
      <SectionHeader
        title={t('subscriptions.title')}
        subtitle={t('subscriptions.subtitle')}
        actions={
          <Button size="sm" onClick={() => void subs.reload()}>
            <Icon name="search" size={15} />
            {t('common.refresh')}
          </Button>
        }
      />

      {subs.error ? <ErrorBanner message={subs.error} onRetry={subs.reload} retryLabel={t('common.retry')} /> : null}

      <Card data-testid="subscriptions-table">
        {subs.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={38} />
            ))}
          </div>
        ) : (subs.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('context.company')}</th>
                <th>{t('companies.plan')}</th>
                <th>{t('subscriptions.period')}</th>
                <th>{t('subscriptions.price')}</th>
                <th>{t('subscriptions.licence')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {subs.data!.map((s) => (
                <tr key={s.id} data-testid={`subscription-${s.companyId}`}>
                  <td className="font-semibold">{locale === 'ar' ? s.companyNameAr : s.companyNameEn}</td>
                  <td>{locale === 'ar' ? s.planNameAr : s.planNameEn}</td>
                  <td>{s.billingPeriod === 'ANNUAL' ? t('plans.annual') : t('plans.monthly')}</td>
                  <td className="tabular-nums">
                    {s.currency} {s.price.toLocaleString()}
                  </td>
                  <td>
                    <Badge tone="gold">{s.licensedModules.length}</Badge>
                  </td>
                  <td>
                    <StatusBadge status={s.status} label={s.status} />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setHistoryOf(s)}>
                        {t('subscriptions.history')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          const next = s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                          await api.changeSubscriptionStatus(s.id, next, 'Changed from admin console');
                          await subs.reload();
                        }}
                      >
                        {s.status === 'ACTIVE' ? t('companies.suspend') : t('companies.activate')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card className="p-5">
        <p className="oryx-panel-title m-0 mb-3">{t('subscriptions.assign')}</p>
        <div className="flex flex-wrap gap-2">
          {(companies.data?.items ?? [])
            .filter((c) => c.type === 'SAAS_TENANT' || c.type === 'INTERNAL')
            .map((c) => (
              <Button key={c.id} size="sm" onClick={() => setAssignTo(c)}>
                <Icon name="creditCard" size={14} />
                {locale === 'ar' ? c.nameAr : c.nameEn}
              </Button>
            ))}
        </div>
      </Card>

      <AssignModal
        company={assignTo}
        plans={plans.data ?? []}
        onClose={() => setAssignTo(null)}
        onDone={async () => {
          setAssignTo(null);
          await subs.reload();
        }}
      />

      <HistoryModal subscription={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

function AssignModal({
  company,
  plans,
  onClose,
  onDone,
}: {
  company: CompanyDto | null;
  plans: PlanDto[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const [planId, setPlanId] = useState('');
  const [period, setPeriod] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    setPlanId(company.subscription?.planId ?? plans[0]?.id ?? '');
    setPeriod(company.subscription?.billingPeriod ?? 'MONTHLY');
    setError(null);
  }, [company, plans]);

  async function submit() {
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      await api.assignSubscription(company.id, { planId, billingPeriod: period });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(company)}
      title={`${t('subscriptions.assign')} — ${company ? (locale === 'ar' ? company.nameAr : company.nameEn) : ''}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !planId} onClick={submit} data-testid="assign-submit">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('companies.selectPlan')} required>
          <select
            className="oryx-select"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            data-testid="assign-plan"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {locale === 'ar' ? p.nameAr : p.nameEn} — {p.modules.length} modules
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('subscriptions.period')} required>
          <select
            className="oryx-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'MONTHLY' | 'ANNUAL')}
          >
            <option value="MONTHLY">{t('plans.monthly')}</option>
            <option value="ANNUAL">{t('plans.annual')}</option>
          </select>
        </Field>
      </div>
      <p className="oryx-faint mt-3 text-[11.5px]">{t('plans.note')}</p>
    </Modal>
  );
}

function HistoryModal({ subscription, onClose }: { subscription: SubscriptionRow | null; onClose: () => void }) {
  const { t } = useUi();
  if (!subscription) return null;
  return (
    <Modal open title={`${t('subscriptions.history')} — ${subscription.planNameEn}`} onClose={onClose}>
      {subscription.events.length === 0 ? (
        <EmptyState title={t('common.empty')} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {subscription.events.map((e, i) => (
            <li
              key={String(e.id ?? i)}
              className="rounded-xl p-3 text-[12.5px]"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{String(e.type)}</strong>
                <span className="oryx-faint">
                  {new Date(String(e.createdAt)).toLocaleString()}
                </span>
              </div>
              <p className="oryx-muted m-0 mt-1">
                {e.fromStatus ? `${String(e.fromStatus)} → ` : ''}
                {String(e.toStatus ?? '')}
                {e.note ? ` · ${String(e.note)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
