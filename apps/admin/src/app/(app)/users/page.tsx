'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { InvitationDto, RoleDto, UserDto } from '@oryx/shared';
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

  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);

  const users = useAsync(
    () => (scopeCompanyId ? api.listUsers(scopeCompanyId) : Promise.resolve(null)),
    [scopeCompanyId],
  );
  const invitations = useAsync(
    () => (scopeCompanyId ? api.listInvitations(scopeCompanyId) : Promise.resolve([] as InvitationDto[])),
    [scopeCompanyId],
  );

  if (!scopeCompanyId) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title={t('users.title')} subtitle={t('users.subtitle')} />
        <Card>
          <EmptyState title={t('common.selectCompany')} />
        </Card>
      </div>
    );
  }

  const canInvite = can('company.user.invite') || can('platform.user.manage');

  return (
    <div className="flex flex-col gap-5" data-testid="users-page">
      <SectionHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => void users.reload()}>
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            {canInvite ? (
              <Button variant="primary" onClick={() => setInviteOpen(true)} data-testid="invite-user">
                <Icon name="plus" size={16} />
                {t('users.invite')}
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
                <th>{t('users.role')}</th>
                <th>{t('users.branchScope')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.data!.items.map((u) => {
                const m = u.memberships[0];
                return (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td>
                      <span className="block font-semibold">{locale === 'ar' ? u.fullNameAr : u.fullNameEn}</span>
                      <span className="oryx-faint block text-[11.5px]">{u.email}</span>
                    </td>
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
                      <Button size="sm" onClick={() => setSelectedUser(u)} data-testid={`view-perms-${u.email}`}>
                        {t('users.effective')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card data-testid="invitations-table">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <p className="oryx-panel-title m-0">{t('users.invitations')}</p>
          <Badge tone="neutral">{invitations.data?.length ?? 0}</Badge>
        </div>
        {(invitations.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('auth.email')}</th>
                <th>{t('users.role')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invitations.data!.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.roleNameEn}</td>
                  <td>
                    <StatusBadge status={i.status} label={invitationStatusLabel(i.status, t)} />
                  </td>
                  <td>
                    {i.status === 'PENDING' && can('company.user.remove') ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await api.revokeInvitation(i.id);
                          await invitations.reload();
                        }}
                      >
                        {t('users.revoke')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <InviteModal
        open={inviteOpen}
        companyId={scopeCompanyId}
        onClose={() => setInviteOpen(false)}
        onDone={async () => {
          setInviteOpen(false);
          await users.reload();
          await invitations.reload();
        }}
      />

      <EffectivePermissionsModal
        user={selectedUser}
        companyId={scopeCompanyId}
        onClose={() => setSelectedUser(null)}
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

function invitationStatusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case 'PENDING':
      return t('users.pending');
    case 'ACCEPTED':
      return t('users.accepted');
    case 'EXPIRED':
      return t('users.expired');
    case 'REVOKED':
      return t('users.revoked');
    default:
      return status;
  }
}

function InviteModal({
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
  const { t } = useUi();
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [delegable, setDelegable] = useState<string[]>([]);
  const [form, setForm] = useState({ email: '', fullNameEn: '', fullNameAr: '', roleId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [r, d] = await Promise.all([
          api.listRoles(companyId),
          api.delegablePermissions(companyId).catch(() => ({ companyId, permissions: [] })),
        ]);
        setRoles(r);
        setDelegable(d.permissions);
      } catch {
        setRoles([]);
      }
    })();
  }, [open, companyId]);

  // Only roles whose permissions are within the delegable set may be offered.
  const assignableRoles = roles.filter(
    (r) => r.isSystem || r.permissions.every((p) => delegable.includes(p)),
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.inviteUser(companyId, {
        email: form.email,
        fullNameEn: form.fullNameEn || form.email,
        fullNameAr: form.fullNameAr || form.email,
        roleId: form.roleId,
      });
      setToken(res.inviteToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t('users.invite')}
      onClose={onClose}
      footer={
        token ? (
          <Button
            variant="primary"
            onClick={async () => {
              setToken(null);
              setForm({ email: '', fullNameEn: '', fullNameAr: '', roleId: '' });
              await onDone();
            }}
          >
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || !form.email || !form.roleId}
              onClick={submit}
              data-testid="invite-submit"
            >
              {busy ? t('common.loading') : t('users.invite')}
            </Button>
          </>
        )
      }
    >
      {token ? (
        <div>
          <p className="oryx-panel-title m-0">{t('users.inviteToken')}</p>
          <p className="oryx-muted m-0 mb-3 text-[12.5px]">{t('users.inviteTokenHint')}</p>
          <code
            className="block break-all rounded-lg px-3 py-2 font-mono text-[12px]"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)' }}
            data-testid="invite-token"
          >
            {token}
          </code>
        </div>
      ) : (
        <>
          {error ? (
            <p
              className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
              style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
            >
              {error}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.email')} required>
              <input
                className="oryx-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="invite-email"
              />
            </Field>
            <Field label={t('users.role')} required hint={t('users.delegationNote')}>
              <select
                className="oryx-select"
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                data-testid="invite-role"
              >
                <option value="">—</option>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nameEn} ({r.permissions.length})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`${t('common.name')} (EN)`}>
              <input
                className="oryx-input"
                value={form.fullNameEn}
                onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
              />
            </Field>
            <Field label={`${t('common.name')} (AR)`}>
              <input
                className="oryx-input"
                value={form.fullNameAr}
                onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
              />
            </Field>
          </div>
        </>
      )}
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
