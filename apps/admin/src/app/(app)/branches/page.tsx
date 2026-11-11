'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { api } from '@/lib/api';
import { errorMessageKey, useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import type { BranchDto } from '@oryx/shared';
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
  TableShell,
} from '@/components/ui';

export default function BranchesPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <BranchesInner />
    </Suspense>
  );
}

function BranchesInner() {
  const { t, locale } = useUi();
  const { companyId, can, hasModule } = useAuth();
  const params = useSearchParams();
  const queryCompanyId = params.get('companyId');
  const scopeCompanyId = queryCompanyId ?? companyId;

  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BranchDto | null>(null);
  const [limit, setLimit] = useState<{ maxBranches: number; used: number } | null>(null);

  const list = useAsync(
    () => (scopeCompanyId ? api.listBranches(scopeCompanyId) : Promise.resolve(null)),
    [scopeCompanyId],
  );

  useEffect(() => {
    if (!scopeCompanyId) return;
    void (async () => {
      try {
        const ent = await api.entitlements(scopeCompanyId);
        setLimit({ maxBranches: ent.limits.maxBranches, used: ent.usage.branches });
      } catch {
        setLimit(null);
      }
    })();
  }, [scopeCompanyId]);

  const canCreate = can('company.branch.create') || can('platform.branch.manage');
  const canEdit = can('company.branch.update') || can('platform.branch.manage');
  const canDelete = can('company.branch.delete') || can('platform.branch.manage');

  if (!scopeCompanyId) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title={t('branches.title')} subtitle={t('branches.subtitle')} />
        <Card>
          <EmptyState title={t('common.selectCompany')} hint={t('context.company')} />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="branches-page">
      <SectionHeader
        title={t('branches.title')}
        subtitle={t('branches.subtitle')}
        actions={
          <>
            {limit ? (
              <Badge tone={limit.used >= limit.maxBranches && limit.maxBranches !== -1 ? 'warning' : 'gold'}>
                {t('branches.limit')}: {limit.used}/{limit.maxBranches === -1 ? '∞' : limit.maxBranches}
              </Badge>
            ) : null}
            <Button size="sm" onClick={() => void list.reload()}>
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            {canCreate ? (
              <Button variant="primary" onClick={() => setOpen(true)} data-testid="new-branch">
                <Icon name="plus" size={16} />
                {t('branches.new')}
              </Button>
            ) : null}
          </>
        }
      />

      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} retryLabel={t('common.retry')} /> : null}

      <Card>
        {list.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={38} />
            ))}
          </div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.code')}</th>
                <th>{t('common.city')}</th>
                <th>{t('branches.phone')}</th>
                <th>{t('branches.usersAssigned')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.items.map((b) => (
                <tr key={b.id} data-testid={`branch-row-${b.code}`}>
                  <td className="font-semibold">{locale === 'ar' ? b.nameAr : b.nameEn}</td>
                  <td className="font-mono text-[12px]">{b.code}</td>
                  <td>{b.city ?? '—'}</td>
                  <td className="tabular-nums text-[12.5px]">{b.phone ?? '—'}</td>
                  <td className="tabular-nums">{b.userCount ?? 0}</td>
                  <td>
                    <Badge tone={b.isActive ? 'success' : 'neutral'}>
                      {b.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                        <Button
                          size="sm"
                          onClick={() => setEditTarget(b)}
                          data-testid={`edit-branch-${b.code}`}
                        >
                          {t('branches.edit')}
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            if (!window.confirm(t('branches.confirmDelete').replace('{name}', locale === 'ar' ? b.nameAr : b.nameEn))) return;
                            try {
                              await api.deleteBranch(b.id);
                              await list.reload();
                            } catch (err) {
                              window.alert(err instanceof Error ? err.message : t('common.error'));
                            }
                          }}
                          data-testid={`delete-branch-${b.code}`}
                        >
                          <Icon name="trash" size={14} />
                          {t('common.delete')}
                        </Button>
                      ) : null}
                      {canEdit ? (
                        b.isActive ? (
                          <Button
                            size="sm"
                            onClick={async () => {
                              await api.updateBranch(b.id, { isActive: false });
                              await list.reload();
                            }}
                            data-testid={`deactivate-branch-${b.code}`}
                          >
                            {t('branches.deactivate')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={async () => {
                              await api.updateBranch(b.id, { isActive: true });
                              await list.reload();
                            }}
                            data-testid={`reactivate-branch-${b.code}`}
                          >
                            {t('branches.reactivate')}
                          </Button>
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <CreateBranchModal
        open={open}
        companyId={scopeCompanyId}
        onClose={() => setOpen(false)}
        onCreated={async () => {
          setOpen(false);
          await list.reload();
          try {
            const ent = await api.entitlements(scopeCompanyId);
            setLimit({ maxBranches: ent.limits.maxBranches, used: ent.usage.branches });
          } catch {
            /* ignore */
          }
        }}
        hasModule={hasModule('branch_management')}
      />

      <EditBranchModal
        branch={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={async () => {
          setEditTarget(null);
          await list.reload();
        }}
      />
    </div>
  );
}

function EditBranchModal({
  branch,
  onClose,
  onSaved,
}: {
  branch: BranchDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nameEn: '', nameAr: '', city: '', countryCode: 'BH', addressLine: '', phone: '', timezone: 'Asia/Bahrain' });

  // Re-seed the form whenever a different branch is opened.
  useEffect(() => {
    if (!branch) return;
    setForm({
      nameEn: branch.nameEn,
      nameAr: branch.nameAr,
      city: branch.city ?? '',
      countryCode: branch.countryCode ?? 'BH',
      addressLine: branch.addressLine ?? '',
      phone: branch.phone ?? '',
      timezone: branch.timezone ?? 'Asia/Bahrain',
    });
    setError(null);
  }, [branch]);

  async function submit() {
    if (!branch) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateBranch(branch.id, {
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        city: form.city || undefined,
        countryCode: form.countryCode || undefined,
        addressLine: form.addressLine || undefined,
        phone: form.phone || undefined,
        timezone: form.timezone || undefined,
      });
      await onSaved();
    } catch (err) {
      const key = errorMessageKey(err);
      setError(key === 'common.error' ? (err instanceof Error ? err.message : t('common.error')) : t(key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(branch)}
      title={t('branches.editTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.nameEn || !form.nameAr}
            onClick={submit}
            data-testid="save-branch"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
          data-testid="edit-branch-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t('common.name')} (EN)`} required>
          <input
            className="oryx-input"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            data-testid="edit-branch-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input
            className="oryx-input"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            data-testid="edit-branch-name-ar"
          />
        </Field>
        <Field label={t('common.city')}>
          <input
            className="oryx-input"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            data-testid="edit-branch-city"
          />
        </Field>
        <Field label={t('branches.phone')}>
          <input
            className="oryx-input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            data-testid="edit-branch-phone"
          />
        </Field>
        <Field label={t('branches.addressLine')}>
          <input
            className="oryx-input"
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            data-testid="edit-branch-address"
          />
        </Field>
        <Field label={t('branches.country')}>
          <input
            className="oryx-input"
            value={form.countryCode}
            maxLength={2}
            onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
            data-testid="edit-branch-country"
          />
        </Field>
        <Field label={t('branches.timezone')}>
          <input
            className="oryx-input"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            data-testid="edit-branch-timezone"
          />
        </Field>
      </div>
    </Modal>
  );
}

function CreateBranchModal({
  open,
  companyId,
  onClose,
  onCreated,
  hasModule,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
  hasModule: boolean;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emptyForm = { code: '', nameEn: '', nameAr: '', city: '', countryCode: 'BH', addressLine: '', phone: '', timezone: 'Asia/Bahrain' };
  const [form, setForm] = useState(emptyForm);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.createBranch(companyId, {
        code: form.code.toUpperCase(),
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        city: form.city || undefined,
        countryCode: form.countryCode || undefined,
        addressLine: form.addressLine || undefined,
        phone: form.phone || undefined,
        timezone: form.timezone || undefined,
      });
      await onCreated();
      setForm(emptyForm);
    } catch (err) {
      // Localise the failure so the plan-limit rejection reads naturally in
      // both Arabic and English rather than leaking the raw API message.
      const key = errorMessageKey(err);
      setError(key === 'common.error' ? (err instanceof Error ? err.message : t('common.error')) : t(key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t('branches.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.code || !form.nameEn || !form.nameAr}
            onClick={submit}
            data-testid="create-branch-submit"
          >
            {busy ? t('common.loading') : t('common.create')}
          </Button>
        </>
      }
    >
      {!hasModule ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{
            color: 'var(--warning)',
            background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
          }}
        >
          {t('error.moduleNotLicensed')}
        </p>
      ) : null}
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
          data-testid="branch-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input
            className="oryx-input"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            data-testid="branch-code"
          />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input
            className="oryx-input"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            data-testid="branch-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input
            className="oryx-input"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            data-testid="branch-name-ar"
          />
        </Field>
        <Field label={t('common.city')}>
          <input
            className="oryx-input"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            data-testid="branch-city"
          />
        </Field>
        <Field label={t('branches.phone')}>
          <input
            className="oryx-input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            data-testid="branch-phone"
          />
        </Field>
        <Field label={t('branches.addressLine')}>
          <input
            className="oryx-input"
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            data-testid="branch-address"
          />
        </Field>
        <Field label={t('branches.country')}>
          <input
            className="oryx-input"
            value={form.countryCode}
            maxLength={2}
            onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
            data-testid="branch-country"
          />
        </Field>
        <Field label={t('branches.timezone')}>
          <input
            className="oryx-input"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            data-testid="branch-timezone"
          />
        </Field>
      </div>
    </Modal>
  );
}
