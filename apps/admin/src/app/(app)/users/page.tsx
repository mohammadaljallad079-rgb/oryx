'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { BranchDto, RoleDto, UserDto } from '@oryx/shared';
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
  SearchableSelect,
  SectionHeader,
  Skeleton,
  StatusBadge,
  TableShell,
} from '@/components/ui';

export default function UsersPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <UsersInner />
    </Suspense>
  );
}

function UsersInner() {
  const { t, locale } = useUi();
  const { companyId, can } = useAuth();
  const params = useSearchParams();
  const scopeCompanyId = params.get('companyId') ?? companyId;

  const [addOpen, setAddOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<UserDto | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  const [manageUser, setManageUser] = useState<UserDto | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [nationalityFilter, setNationalityFilter] = useState('');

  const users = useAsync(
    () => (scopeCompanyId ? api.listUsers(scopeCompanyId, { search: search || undefined, status: statusFilter || undefined }) : Promise.resolve(null)),
    [scopeCompanyId, search, statusFilter],
  );
  const roles = useAsync(
    () => (scopeCompanyId ? api.listRoles(scopeCompanyId) : Promise.resolve([] as RoleDto[])),
    [scopeCompanyId],
  );

  if (!scopeCompanyId) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title={t('users.title')} subtitle={t('users.subtitle')} />
        <Card>
          <EmptyState title={t('common.selectCompany')} />
        </Card>
      </div>
    );
  }

  const canManage = can('company.user.update') || can('platform.user.manage');
  const canAdd = can('company.user.invite') || can('platform.user.manage');

  // Role and nationality filtering are client-side: a user has exactly one
  // membership per company in this view, so they narrow the already-fetched page
  // without another round-trip.
  const visibleUsers = (users.data?.items ?? []).filter(
    (u) =>
      (!roleFilter || u.memberships[0]?.roleId === roleFilter) &&
      (!nationalityFilter || (u.nationality ?? '').toLowerCase().includes(nationalityFilter.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-4" data-testid="users-page">
      <SectionHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => void users.reload()}>
              <Icon name="refresh" size={15} />
              {t('common.refresh')}
            </Button>
            {canAdd ? (
              <Button variant="primary" onClick={() => setAddOpen(true)} data-testid="add-user">
                <Icon name="plus" size={16} />
                {t('users.add')}
              </Button>
            ) : null}
          </>
        }
      />

      <p
        className="m-0 flex items-start gap-2 rounded-xl border px-4 py-3 text-[12.5px]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <span className="oryx-gold mt-[2px]">
          <Icon name="shield" size={15} />
        </span>
        <span className="oryx-muted">{t('users.delegationNote')}</span>
      </p>

      {users.error ? <ErrorBanner message={users.error} onRetry={users.reload} retryLabel={t('common.retry')} /> : null}

      <Card data-testid="users-filters">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label={t('common.search')}>
            <input
              className="oryx-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              data-testid="user-search"
            />
          </Field>
          <Field label={t('users.role')}>
            <select
              className="oryx-input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              data-testid="user-role-filter"
            >
              <option value="">{t('users.allRoles')}</option>
              {(roles.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {locale === 'ar' ? r.nameAr : r.nameEn}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('users.nationality')}>
            <input
              className="oryx-input"
              value={nationalityFilter}
              onChange={(e) => setNationalityFilter(e.target.value)}
              placeholder={t('users.allNationalities')}
              data-testid="user-nationality-filter"
            />
          </Field>
          <Field label={t('common.status')}>
            <select
              className="oryx-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              data-testid="user-status-filter"
            >
              <option value="">{t('users.allStatuses')}</option>
              <option value="ACTIVE">{t('common.active')}</option>
              <option value="INVITED">{t('users.invited')}</option>
              <option value="SUSPENDED">{t('companies.suspended')}</option>
              <option value="DISABLED">{t('users.disabled')}</option>
            </select>
          </Field>
          <Button
            size="sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setRoleFilter('');
              setNationalityFilter('');
            }}
            data-testid="user-clear-filters"
          >
            <Icon name="refresh" size={14} />
            {t('users.clearFilters')}
          </Button>
        </div>
      </Card>

      <Card data-testid="users-table">
        {users.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={38} />
            ))}
          </div>
        ) : (users.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('users.nationalId')}</th>
                <th>{t('users.nationality')}</th>
                <th>{t('users.phone')}</th>
                <th>{t('users.role')}</th>
                <th>{t('users.branchScope')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
                  </td>
                </tr>
              ) : null}
              {visibleUsers.map((u) => {
                const m = u.memberships[0];
                return (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td>
                      <span className="block font-semibold">{locale === 'ar' ? u.fullNameAr : u.fullNameEn}</span>
                      <span className="oryx-faint block text-[11.5px]">{u.email}</span>
                    </td>
                    <td className="font-mono text-[12px]">{u.nationalId ?? '—'}</td>
                    <td className="text-[12.5px]">{u.nationality ?? '—'}</td>
                    <td className="font-mono text-[12px]">{u.phone ?? '—'}</td>
                    <td>{m ? (locale === 'ar' ? m.roleNameAr : m.roleNameEn) : '—'}</td>
                    <td>
                      {(m?.branchIds.length ?? 0) === 0 ? (
                        <Badge tone="gold">{t('users.allBranches')}</Badge>
                      ) : (
                        <span className="oryx-muted text-[12px]">{m!.branchIds.length}</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={u.status} label={userStatusLabel(u.status, t)} />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" onClick={() => setSelectedUser(u)} data-testid={`view-perms-${u.email}`}>
                          {t('users.effective')}
                        </Button>
                        {canManage ? (
                          <Button size="sm" variant="ghost" onClick={() => setEditProfile(u)} data-testid={`edit-profile-${u.email}`}>
                            <Icon name="edit" size={14} />
                            {t('users.editProfile')}
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button size="sm" variant="ghost" onClick={() => setManageUser(u)} data-testid={`manage-access-${u.email}`}>
                            <Icon name="shield" size={14} />
                            {t('users.manageAccess')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <AddUserModal
        open={addOpen}
        companyId={scopeCompanyId}
        onClose={() => setAddOpen(false)}
        onDone={async () => {
          setAddOpen(false);
          await users.reload();
        }}
      />

      <EditProfileModal
        user={editProfile}
        companyId={scopeCompanyId}
        onClose={() => setEditProfile(null)}
        onSaved={async () => {
          setEditProfile(null);
          await users.reload();
        }}
      />

      <EffectivePermissionsModal
        user={selectedUser}
        companyId={scopeCompanyId}
        onClose={() => setSelectedUser(null)}
      />

      <ManageAccessModal
        user={manageUser}
        companyId={scopeCompanyId}
        onClose={() => setManageUser(null)}
        onSaved={users.reload}
      />
    </div>
  );
}

function userStatusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case 'ACTIVE':
      return t('common.active');
    case 'INVITED':
      return t('users.invited');
    case 'SUSPENDED':
      return t('companies.suspended');
    case 'DISABLED':
      return t('users.disabled');
    default:
      return status;
  }
}

function ManageAccessModal({
  user,
  companyId,
  onClose,
  onSaved,
}: {
  user: UserDto | null;
  companyId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [delegable, setDelegable] = useState<string[]>([]);
  const [roleId, setRoleId] = useState('');
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const membership = user?.memberships[0];

  useEffect(() => {
    if (!user) return;
    setError(null);
    setRoleId(membership?.roleId ?? '');
    setBranchIds(membership?.branchIds ?? []);
    setIsActive(membership?.isActive ?? true);
    void (async () => {
      try {
        const [r, b, d] = await Promise.all([
          api.listRoles(companyId),
          api.listBranches(companyId, { pageSize: 100 }),
          api.delegablePermissions(companyId).catch(() => ({ companyId, permissions: [] })),
        ]);
        setRoles(r);
        setBranches(b.items);
        setDelegable(d.permissions);
      } catch {
        setRoles([]);
        setBranches([]);
      }
    })();
    // The membership is the subject; reloading on every render would reset edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, companyId]);

  // Only roles whose permissions are within the delegable set may be offered,
  // matching the invitation rule. A company administrator can never grant a
  // permission it does not hold.
  const assignableRoles = roles.filter(
    (r) => r.isSystem || r.permissions.every((p) => delegable.includes(p)),
  );

  const canManage = can('company.user.update') || can('platform.user.manage');

  async function submit() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMembership(companyId, user.id, {
        roleId: roleId || undefined,
        branchIds,
        isActive,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const toggleBranch = (id: string) =>
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Modal
      open={Boolean(user)}
      title={user ? `${t('users.manageAccess')} — ${user.email}` : t('users.manageAccess')}
      onClose={onClose}
      footer={
        canManage ? (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy} onClick={submit} data-testid="membership-save">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="flex flex-col gap-3">
        <Field label={t('users.role')} required>
          <SearchableSelect
            value={roleId || null}
            disabled={!canManage}
            options={assignableRoles.map((r) => ({
              value: r.id,
              label: locale === 'ar' ? r.nameAr : r.nameEn,
            }))}
            onChange={(v) => setRoleId(v ?? '')}
            placeholder={t('common.select')}
            testId="membership-role"
          />
        </Field>

        <Field label={t('users.branchScope')} hint={t('users.branchScopeHint')}>
          <div className="flex flex-wrap gap-2" data-testid="membership-branches">
            {branches.length === 0 ? (
              <span className="oryx-faint text-[12px]">—</span>
            ) : (
              branches.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1 text-[12px]"
                >
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={branchIds.includes(b.id)}
                    onChange={() => toggleBranch(b.id)}
                    data-testid={`membership-branch-${b.code}`}
                  />
                  {locale === 'ar' ? b.nameAr : b.nameEn}
                </label>
              ))
            )}
          </div>
        </Field>

        <Field label={t('common.status')}>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              data-testid="membership-active"
            />
            {isActive ? t('common.active') : t('common.inactive')}
          </label>
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Direct user creation. This sets a password and creates an active account in
 * one step, and it captures the identity/contact fields the tenant asked for.
 * The role list is filtered to delegable roles: a company administrator cannot
 * hand out a permission it does not hold.
 */
function AddUserModal({
  open,
  companyId,
  onClose,
  onDone,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [delegable, setDelegable] = useState<string[]>([]);
  const [form, setForm] = useState({
    email: '',
    fullNameEn: '',
    fullNameAr: '',
    password: '',
    nationalId: '',
    nationality: '',
    address: '',
    phone: '',
    roleId: '',
  });
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      email: '',
      fullNameEn: '',
      fullNameAr: '',
      password: '',
      nationalId: '',
      nationality: '',
      address: '',
      phone: '',
      roleId: '',
    });
    setBranchIds([]);
    void (async () => {
      try {
        const [r, b, d] = await Promise.all([
          api.listRoles(companyId),
          api.listBranches(companyId, { pageSize: 100 }),
          api.delegablePermissions(companyId).catch(() => ({ companyId, permissions: [] })),
        ]);
        setRoles(r);
        setBranches(b.items);
        setDelegable(d.permissions);
      } catch {
        setRoles([]);
        setBranches([]);
      }
    })();
  }, [open, companyId]);

  const assignableRoles = roles.filter(
    (r) => r.isSystem || r.permissions.every((p) => delegable.includes(p)),
  );

  const toggleBranch = (id: string) =>
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.createUser(companyId, {
        email: form.email,
        fullNameEn: form.fullNameEn || form.email,
        fullNameAr: form.fullNameAr || form.email,
        password: form.password,
        nationalId: form.nationalId || undefined,
        nationality: form.nationality || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        roleId: form.roleId,
        branchIds,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy && Boolean(form.email) && Boolean(form.roleId) && form.password.length >= 8;

  return (
    <Modal
      open={open}
      title={t('users.add')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit} data-testid="add-user-submit">
            {busy ? t('common.loading') : t('users.add')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('auth.email')} required>
          <input
            className="oryx-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            data-testid="add-user-email"
          />
        </Field>
        <Field label={t('users.role')} required hint={t('users.delegationNote')}>
          <SearchableSelect
            value={form.roleId || null}
            options={assignableRoles.map((r) => ({
              value: r.id,
              label: locale === 'ar' ? r.nameAr : r.nameEn,
            }))}
            onChange={(v) => setForm({ ...form, roleId: v ?? '' })}
            placeholder={t('common.select')}
            testId="add-user-role"
          />
        </Field>
        <Field label={`${t('common.name')} (EN)`}>
          <input
            className="oryx-input"
            value={form.fullNameEn}
            onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
            data-testid="add-user-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`}>
          <input
            className="oryx-input"
            value={form.fullNameAr}
            onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
            data-testid="add-user-name-ar"
          />
        </Field>
        <Field label={t('users.password')} required hint="8+">
          <input
            className="oryx-input"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            data-testid="add-user-password"
          />
        </Field>
        <Field label={t('users.nationalId')}>
          <input
            className="oryx-input"
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
            data-testid="add-user-national-id"
          />
        </Field>
        <Field label={t('users.nationality')}>
          <input
            className="oryx-input"
            value={form.nationality}
            onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            data-testid="add-user-nationality"
          />
        </Field>
        <Field label={t('users.address')}>
          <input
            className="oryx-input"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            data-testid="add-user-address"
          />
        </Field>
        <Field label={t('users.phone')}>
          <input
            className="oryx-input"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            data-testid="add-user-phone"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label={t('users.branchScope')} hint={t('users.branchScopeHint')}>
          <div className="flex flex-wrap gap-2" data-testid="add-user-branches">
            {branches.length === 0 ? (
              <span className="oryx-faint text-[12px]">—</span>
            ) : (
              branches.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1 text-[12px]"
                >
                  <input
                    type="checkbox"
                    checked={branchIds.includes(b.id)}
                    onChange={() => toggleBranch(b.id)}
                    data-testid={`add-user-branch-${b.code}`}
                  />
                  {locale === 'ar' ? b.nameAr : b.nameEn}
                </label>
              ))
            )}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/** Edit a user's identity and contact details (not their access). */
function EditProfileModal({
  user,
  companyId,
  onClose,
  onSaved,
}: {
  user: UserDto | null;
  companyId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [form, setForm] = useState({
    fullNameEn: '',
    fullNameAr: '',
    nationalId: '',
    nationality: '',
    address: '',
    phone: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setError(null);
    setForm({
      fullNameEn: user.fullNameEn,
      fullNameAr: user.fullNameAr,
      nationalId: user.nationalId ?? '',
      nationality: user.nationality ?? '',
      address: user.address ?? '',
      phone: user.phone ?? '',
    });
  }, [user]);

  async function submit() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateUser(companyId, user.id, {
        fullNameEn: form.fullNameEn,
        fullNameAr: form.fullNameAr,
        nationalId: form.nationalId,
        nationality: form.nationality,
        address: form.address,
        phone: form.phone,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(user)}
      title={user ? `${t('users.editProfile')} — ${user.email}` : t('users.editProfile')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="edit-profile-submit">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${t('common.name')} (EN)`}>
          <input
            className="oryx-input"
            value={form.fullNameEn}
            onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
            data-testid="edit-profile-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`}>
          <input
            className="oryx-input"
            value={form.fullNameAr}
            onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
            data-testid="edit-profile-name-ar"
          />
        </Field>
        <Field label={t('users.nationalId')}>
          <input
            className="oryx-input"
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
            data-testid="edit-profile-national-id"
          />
        </Field>
        <Field label={t('users.nationality')}>
          <input
            className="oryx-input"
            value={form.nationality}
            onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            data-testid="edit-profile-nationality"
          />
        </Field>
        <Field label={t('users.address')}>
          <input
            className="oryx-input"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            data-testid="edit-profile-address"
          />
        </Field>
        <Field label={t('users.phone')}>
          <input
            className="oryx-input"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            data-testid="edit-profile-phone"
          />
        </Field>
      </div>
    </Modal>
  );
}

function EffectivePermissionsModal({
  user,
  companyId,
  onClose,
}: {
  user: UserDto | null;
  companyId: string;
  onClose: () => void;
}) {
  const { t } = useUi();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.effectivePermissions>> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    void (async () => {
      try {
        setData(await api.effectivePermissions(companyId, user.id));
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, companyId]);

  return (
    <Modal open={Boolean(user)} title={`${t('users.effective')} — ${user?.email ?? ''}`} onClose={onClose}>
      {loading ? (
        <Skeleton height={120} />
      ) : !data ? (
        <EmptyState title={t('common.empty')} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="gold">{data.role.nameEn}</Badge>
            <Badge tone="neutral">
              {data.branchIds.length === 0 ? t('users.allBranches') : `${data.branchIds.length} ${t('context.branch')}`}
            </Badge>
            <Badge tone="info">
              {data.effective.length} / {data.granted.length}
            </Badge>
          </div>

          <div>
            <p className="oryx-label">{t('users.effective')}</p>
            <div className="flex flex-wrap gap-1">
              {data.effective.map((p) => (
                <span key={p} className="oryx-badge oryx-badge--success font-mono text-[10.5px]">
                  {p}
                </span>
              ))}
            </div>
          </div>

          {data.suppressedByEntitlement.length > 0 ? (
            <div>
              <p className="oryx-label">{t('users.suppressed')}</p>
              <div className="flex flex-wrap gap-1">
                {data.suppressedByEntitlement.map((s) => (
                  <span key={s.code} className="oryx-badge oryx-badge--warning font-mono text-[10.5px]">
                    {s.code}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
