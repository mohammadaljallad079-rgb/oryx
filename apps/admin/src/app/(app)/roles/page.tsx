'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { RoleDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
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
} from '@/components/ui';

interface CatalogPermission {
  code: string;
  group: string;
  labelEn: string;
  labelAr: string;
  scope: string;
  delegable: boolean;
  moduleKey: string | null;
}

export default function RolesPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <RolesInner />
    </Suspense>
  );
}

function RolesInner() {
  const { t, locale } = useUi();
  const { companyId, can } = useAuth();
  const params = useSearchParams();
  const scopeCompanyId = params.get('companyId') ?? companyId;

  const roles = useAsync(
    () => (scopeCompanyId ? api.listRoles(scopeCompanyId) : Promise.resolve([] as RoleDto[])),
    [scopeCompanyId],
  );
  const catalog = useAsync(() => api.permissionCatalog(), []);
  const delegable = useAsync(
    () =>
      scopeCompanyId
        ? api.delegablePermissions(scopeCompanyId).catch(() => ({ companyId: scopeCompanyId, permissions: [] as string[] }))
        : Promise.resolve({ companyId: '', permissions: [] as string[] }),
    [scopeCompanyId],
  );

  const [editing, setEditing] = useState<RoleDto | null>(null);
  const [creating, setCreating] = useState(false);

  const delegableSet = useMemo(() => new Set(delegable.data?.permissions ?? []), [delegable.data]);
  const catalogByCode = useMemo(() => {
    const map = new Map<string, CatalogPermission>();
    for (const p of catalog.data?.permissions ?? []) map.set(p.code, p);
    return map;
  }, [catalog.data]);

  if (!scopeCompanyId) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title={t('roles.title')} subtitle={t('roles.subtitle')} />
        <Card>
          <EmptyState title={t('common.selectCompany')} />
        </Card>
      </div>
    );
  }

  const canCreate = can('company.role.create') || can('platform.company.update');

  return (
    <div className="flex flex-col gap-5" data-testid="roles-page">
      <SectionHeader
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => void roles.reload()}>
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            {canCreate ? (
              <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-role">
                <Icon name="plus" size={16} />
                {t('roles.new')}
              </Button>
            ) : null}
          </>
        }
      />

      {roles.error ? <ErrorBanner message={roles.error} onRetry={roles.reload} retryLabel={t('common.retry')} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.loading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={170} />)
          : (roles.data ?? []).map((r) => (
              <Card key={r.id} className="p-5" data-testid={`role-card-${r.code}`}>
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="oryx-panel-title m-0">{locale === 'ar' ? r.nameAr : r.nameEn}</p>
                    <p className="oryx-faint m-0 font-mono text-[11px]">{r.code}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={r.isSystem ? 'gold' : 'info'}>
                      {r.isSystem ? t('roles.system') : t('roles.custom')}
                    </Badge>
                    <Badge tone="neutral">
                      {r.memberCount ?? 0} {t('roles.members')}
                    </Badge>
                  </div>
                </div>

                <p className="oryx-muted m-0 mb-3 text-[12px]">{r.descriptionEn ?? ''}</p>

                <div className="mb-3 flex flex-wrap gap-1">
                  {r.permissions.slice(0, 10).map((p) => {
                    const def = catalogByCode.get(p);
                    const blocked = !r.isSystem && !delegableSet.has(p);
                    return (
                      <span
                        key={p}
                        className={`oryx-badge ${blocked ? 'oryx-badge--danger' : 'oryx-badge--neutral'} font-mono text-[10px]`}
                        title={def ? def.labelEn : p}
                      >
                        {p}
                      </span>
                    );
                  })}
                  {r.permissions.length > 10 ? (
                    <span className="oryx-badge oryx-badge--neutral text-[10px]">
                      +{r.permissions.length - 10}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {r.permissions.length} {t('roles.permissionCount')}
                  </Badge>
                  {!r.isSystem && can('company.role.update') ? (
                    <Button size="sm" onClick={() => setEditing(r)} data-testid={`edit-role-${r.code}`}>
                      {t('common.edit')}
                    </Button>
                  ) : (
                    <span className="oryx-faint text-[11.5px]">{t('roles.systemLocked')}</span>
                  )}
                </div>
              </Card>
            ))}
      </div>

      <Card className="p-5" data-testid="permission-catalog">
        <p className="oryx-panel-title m-0 mb-1">Permission catalog</p>
        <p className="oryx-muted m-0 mb-4 text-[12px]">
          {locale === 'ar'
            ? 'كل صلاحية تُقيَّم على الخادم. الصلاحيات المرتبطة بوحدة غير مرخصة تُعطَّل تلقائياً.'
            : 'Every permission is enforced server-side. Permissions tied to an unlicensed module are suppressed automatically.'}
        </p>
        {(catalog.data?.groups ?? []).map((group) => (
          <div key={group} className="mb-4">
            <p className="oryx-nav-group-label">{group}</p>
            <div className="flex flex-wrap gap-1">
              {(catalog.data?.permissions ?? [])
                .filter((p) => p.group === group)
                .map((p) => {
                  const allowed = delegableSet.has(p.code);
                  return (
                    <span
                      key={p.code}
                      className={`oryx-badge ${allowed ? 'oryx-badge--success' : 'oryx-badge--neutral'} font-mono text-[10px]`}
                      title={locale === 'ar' ? p.labelAr : p.labelEn}
                    >
                      {p.code}
                    </span>
                  );
                })}
            </div>
          </div>
        ))}
      </Card>

      <RoleEditor
        open={creating || Boolean(editing)}
        role={editing}
        companyId={scopeCompanyId}
        catalog={catalog.data?.permissions ?? []}
        delegableSet={delegableSet}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await roles.reload();
        }}
      />
    </div>
  );
}

function RoleEditor({
  open,
  role,
  companyId,
  catalog,
  delegableSet,
  onClose,
  onSaved,
}: {
  open: boolean;
  role: RoleDto | null;
  companyId: string;
  catalog: CatalogPermission[];
  delegableSet: Set<string>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', descriptionEn: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (role) {
      setForm({
        code: role.code,
        nameEn: role.nameEn,
        nameAr: role.nameAr,
        descriptionEn: role.descriptionEn ?? '',
      });
      setSelected(new Set(role.permissions));
    } else {
      setForm({ code: '', nameEn: '', nameAr: '', descriptionEn: '' });
      setSelected(new Set());
    }
  }, [open, role]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogPermission[]>();
    for (const p of catalog) {
      // Only company-scope permissions are offered; platform permissions are
      // never delegable to a tenant role.
      if (p.scope === 'PLATFORM') continue;
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return map;
  }, [catalog]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const permissions = [...selected];
      if (role) {
        await api.updateRole(role.id, {
          nameEn: form.nameEn,
          nameAr: form.nameAr,
          descriptionEn: form.descriptionEn || undefined,
          permissions,
        });
      } else {
        await api.createRole(companyId, {
          code: form.code,
          nameEn: form.nameEn,
          nameAr: form.nameAr,
          descriptionEn: form.descriptionEn || undefined,
          permissions,
        });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={role ? `${t('common.edit')} — ${role.nameEn}` : t('roles.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.nameEn || !form.nameAr || (!role && !form.code)}
            onClick={submit}
            data-testid="save-role"
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
          data-testid="role-error"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {!role ? (
          <Field label={t('common.code')} required>
            <input
              className="oryx-input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              data-testid="role-code"
            />
          </Field>
        ) : null}
        <Field label={`${t('common.name')} (EN)`} required>
          <input
            className="oryx-input"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            data-testid="role-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input
            className="oryx-input"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            data-testid="role-name-ar"
          />
        </Field>
      </div>

      <hr className="oryx-divider my-4" />
      <p className="oryx-label">{t('roles.permissionCount')}</p>
      <p className="oryx-faint m-0 mb-3 text-[11.5px]">{t('users.delegationNote')}</p>

      <div className="flex max-h-[320px] flex-col gap-3 overflow-y-auto pe-1">
        {[...grouped.entries()].map(([group, perms]) => (
          <div key={group}>
            <p className="oryx-nav-group-label">{group}</p>
            <div className="flex flex-col gap-1">
              {perms.map((p) => {
                const allowed = delegableSet.has(p.code);
                const checked = selected.has(p.code);
                return (
                  <label
                    key={p.code}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5"
                    style={{
                      background: checked ? 'color-mix(in srgb, var(--gold) 10%, transparent)' : 'transparent',
                      opacity: allowed ? 1 : 0.5,
                    }}
                    title={allowed ? undefined : t('error.delegation')}
                  >
                    <input
                      type="checkbox"
                      className="oryx-checkbox mt-1"
                      checked={checked}
                      disabled={!allowed}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(p.code);
                        else next.delete(p.code);
                        setSelected(next);
                      }}
                      data-testid={`perm-${p.code}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold">{p.labelEn}</span>
                      <span className="oryx-faint block font-mono text-[10.5px]">{p.code}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
