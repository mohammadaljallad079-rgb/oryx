'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PlanDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync, useDebounced } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  Pagination,
  SectionHeader,
  Skeleton,
  StatusBadge,
  TableShell,
} from '@/components/ui';

export default function CompaniesPage() {
  const { t, locale } = useUi();
  const { isPlatform, can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debounced = useDebounced(search);

  const canCreate = can('platform.company.create');
  const canSuspend = can('platform.company.suspend');

  const list = useAsync(
    () => api.listCompanies({ page, pageSize: 12, search: debounced || undefined, type: typeFilter || undefined }),
    [page, debounced, typeFilter],
  );

  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5" data-testid="companies-page">
      <SectionHeader
        title={t('companies.title')}
        subtitle={t('companies.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => void list.reload()}>
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            {canCreate ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="new-company">
                <Icon name="plus" size={16} />
                {t('companies.new')}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="oryx-label">{t('common.search')}</span>
            <input
              className="oryx-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={locale === 'ar' ? 'اسم الشركة أو الرمز' : 'Company name or code'}
              data-testid="company-search"
            />
          </label>
          <label className="min-w-[170px]">
            <span className="oryx-label">{t('common.type')}</span>
            <select
              className="oryx-select"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              <option value="INTERNAL">{t('companies.internal')}</option>
              <option value="SAAS_TENANT">{t('companies.tenant')}</option>
            </select>
          </label>
        </div>
      </Card>

      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} retryLabel={t('common.retry')} /> : null}

      <Card>
        {list.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={38} />
            ))}
          </div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.type')}</th>
                  <th>{t('companies.plan')}</th>
                  <th>{t('companies.branches')}</th>
                  <th>{t('companies.users')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data!.items.map((c) => (
                  <tr key={c.id} data-testid={`company-row-${c.code}`}>
                    <td>
                      <span className="block font-semibold">{locale === 'ar' ? c.nameAr : c.nameEn}</span>
                      <span className="oryx-faint block font-mono text-[11px]">{c.code}</span>
                      {c.parentCompanyNameEn ? (
                        <span className="oryx-faint block text-[11px]">
                          {t('companies.parent')}: {c.parentCompanyNameEn}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={c.type === 'INTERNAL' ? 'gold' : 'info'}>
                        {c.type === 'INTERNAL' ? t('companies.internal') : t('companies.tenant')}
                      </Badge>
                    </td>
                    <td>
                      {c.subscription ? (
                        <span className="block">
                          <span className="block text-[12.5px] font-semibold">
                            {locale === 'ar' ? c.subscription.planNameAr : c.subscription.planNameEn}
                          </span>
                          <span className="oryx-faint block text-[11px]">
                            {c.subscription.billingPeriod === 'ANNUAL' ? t('plans.annual') : t('plans.monthly')} ·{' '}
                            {c.subscription.currency} {c.subscription.price.toLocaleString()}
                          </span>
                        </span>
                      ) : (
                        <span className="oryx-faint text-[12px]">{t('companies.noPlan')}</span>
                      )}
                    </td>
                    <td className="tabular-nums">{c.branchCount ?? 0}</td>
                    <td className="tabular-nums">{c.userCount ?? 0}</td>
                    <td>
                      <StatusBadge status={c.status} label={statusLabel(c.status, t)} />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/branches?companyId=${c.id}`} className="oryx-btn oryx-btn--sm">
                          {t('companies.branches')}
                        </Link>
                        <Link href={`/users?companyId=${c.id}`} className="oryx-btn oryx-btn--sm">
                          {t('companies.users')}
                        </Link>
                        {isPlatform && canSuspend && c.type === 'SAAS_TENANT' ? (
                          <Button
                            size="sm"
                            variant={c.status === 'ACTIVE' ? 'danger' : 'default'}
                            onClick={async () => {
                              await api.setCompanyStatus(c.id, c.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
                              await list.reload();
                            }}
                          >
                            {c.status === 'ACTIVE' ? t('companies.suspend') : t('companies.activate')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination
              page={list.data!.page}
              pageSize={list.data!.pageSize}
              total={list.data!.total}
              onPage={setPage}
              labels={{
                previous: t('common.previous'),
                next: t('common.next'),
                page: t('common.page'),
                of: t('common.of'),
              }}
            />
          </>
        )}
      </Card>

      <CreateCompanyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await list.reload();
        }}
      />
    </div>
  );
}

function statusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case 'ACTIVE':
      return t('common.active');
    case 'SUSPENDED':
      return t('companies.suspended');
    case 'PROVISIONING':
      return t('companies.provisioning');
    case 'ARCHIVED':
      return t('companies.archived');
    default:
      return status;
  }
}

function CreateCompanyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    type: 'SAAS_TENANT',
    industry: '',
    planId: '',
    adminEmail: '',
    adminFullNameEn: '',
    adminFullNameAr: '',
  });

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        setPlans(await api.listPlans());
      } catch {
        setPlans([]);
      }
    })();
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createCompany({
        code: form.code.toUpperCase(),
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        type: form.type,
        industry: form.industry || undefined,
        planId: form.planId || undefined,
      });

      // Invite the first company administrator if an email was supplied.
      if (form.adminEmail && res.company?.id) {
        const roles = await api.listRoles(res.company.id);
        const adminRole = roles.find((r) => r.code === 'company_admin') ?? roles[0];
        if (adminRole) {
          await api.inviteUser(res.company.id, {
            email: form.adminEmail,
            fullNameEn: form.adminFullNameEn || form.adminEmail,
            fullNameAr: form.adminFullNameAr || form.adminEmail,
            roleId: adminRole.id,
          });
        }
      }

      await onCreated();
      setForm({
        code: '',
        nameEn: '',
        nameAr: '',
        type: 'SAAS_TENANT',
        industry: '',
        planId: '',
        adminEmail: '',
        adminFullNameEn: '',
        adminFullNameAr: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t('companies.createTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.code || !form.nameEn || !form.nameAr}
            onClick={submit}
            data-testid="create-company-submit"
          >
            {busy ? t('common.loading') : t('common.create')}
          </Button>
        </>
      }
    >
      <p className="oryx-muted m-0 mb-4 text-[12.5px]">{t('companies.createHint')}</p>
      {error ? (
        <p className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}>
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.code')} required hint="UPPERCASE, digits and dashes">
          <input
            className="oryx-input"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            data-testid="company-code"
          />
        </Field>
        <Field label={t('common.type')} required>
          <select
            className="oryx-select"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            data-testid="company-type"
          >
            <option value="SAAS_TENANT">{t('companies.tenant')}</option>
            <option value="INTERNAL">{t('companies.internal')}</option>
          </select>
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input
            className="oryx-input"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            data-testid="company-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input
            className="oryx-input"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            data-testid="company-name-ar"
          />
        </Field>
        <Field label={t('companies.selectPlan')} hint={t('plans.note')}>
          <select
            className="oryx-select"
            value={form.planId}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
            data-testid="company-plan"
          >
            <option value="">{t('companies.noPlan')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {locale === 'ar' ? p.nameAr : p.nameEn} — {p.currency} {p.monthlyPrice.toLocaleString()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.name') + ' — ' + (locale === 'ar' ? 'القطاع' : 'Industry')}>
          <input
            className="oryx-input"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
          />
        </Field>
      </div>

      <hr className="oryx-divider my-4" />

      <p className="oryx-panel-title m-0 mb-3">{t('users.invite')}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('companies.adminEmail')}>
          <input
            className="oryx-input"
            type="email"
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            data-testid="company-admin-email"
          />
        </Field>
        <Field label={t('companies.adminNameEn')}>
          <input
            className="oryx-input"
            value={form.adminFullNameEn}
            onChange={(e) => setForm({ ...form, adminFullNameEn: e.target.value })}
          />
        </Field>
        <Field label={t('companies.adminNameAr')}>
          <input
            className="oryx-input"
            value={form.adminFullNameAr}
            onChange={(e) => setForm({ ...form, adminFullNameAr: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
