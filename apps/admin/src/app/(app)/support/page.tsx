'use client';

import { PermissionGate } from '@/components/permission-gate';
import { useState } from 'react';
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
  TableShell,
} from '@/components/ui';

function SupportPageInner() {
  const { t, locale } = useUi();
  const sessions = useAsync(() => api.supportSessions(), []);
  const companies = useAsync(() => api.listCompanies({ pageSize: 100 }), []);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5" data-testid="support-page">
      <SectionHeader
        title={t('support.title')}
        subtitle={t('support.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => void sessions.reload()}>
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            <Button variant="primary" onClick={() => setOpen(true)} data-testid="open-support">
              <Icon name="plus" size={16} />
              {t('support.open')}
            </Button>
          </>
        }
      />

      {sessions.error ? (
        <ErrorBanner message={sessions.error} onRetry={sessions.reload} retryLabel={t('common.retry')} />
      ) : null}

      <Card data-testid="support-table">
        {sessions.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={34} />
            ))}
          </div>
        ) : (sessions.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('support.subtitle')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('context.company')}</th>
                <th>{t('support.reason')}</th>
                <th>{t('audit.actor')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data!.map((s, i) => {
                const status = String(s.status);
                const isCurrent = Boolean(s.isCurrent);
                return (
                  <tr key={String(s.id ?? i)}>
                    <td className="font-semibold">
                      {String(locale === 'ar' ? s.companyNameAr : s.companyNameEn)}
                    </td>
                    <td className="max-w-[340px] text-[12.5px]">{String(s.reason)}</td>
                    <td className="text-[12px]">{String(s.actorEmail ?? '—')}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {status === 'ACTIVE'
                            ? t('support.active')
                            : status === 'ENDED'
                              ? t('support.ended')
                              : t('support.expired')}
                        </Badge>
                        {isCurrent ? <Badge tone="gold">{t('support.current')}</Badge> : null}
                      </div>
                    </td>
                    <td>
                      {status === 'ACTIVE' ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            await api.endSupportSession(String(s.id));
                            await sessions.reload();
                          }}
                        >
                          {t('support.end')}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <OpenSupportModal
        open={open}
        companies={(companies.data?.items ?? []).map((c) => ({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr }))}
        onClose={() => setOpen(false)}
        onDone={async () => {
          setOpen(false);
          await sessions.reload();
        }}
      />
    </div>
  );
}

function OpenSupportModal({
  open,
  companies,
  onClose,
  onDone,
}: {
  open: boolean;
  companies: Array<{ id: string; nameEn: string; nameAr: string }>;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const [form, setForm] = useState({ companyId: '', reason: '', minutes: 60 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.openSupportSession(form);
      setSessionId(String(res.supportSessionId ?? res.id ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t('support.open')}
      onClose={onClose}
      footer={
        sessionId ? (
          <Button variant="primary" onClick={onDone}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || !form.companyId || form.reason.trim().length < 10}
              onClick={submit}
              data-testid="support-submit"
            >
              {busy ? t('common.loading') : t('support.open')}
            </Button>
          </>
        )
      }
    >
      {sessionId ? (
        <div>
          <p className="oryx-panel-title m-0">{t('support.current')}</p>
          <p className="oryx-muted m-0 mb-3 text-[12.5px]">
            {locale === 'ar'
              ? 'أرسل هذا المعرّف في الترويسة x-oryx-support-session للعمل داخل الشركة.'
              : 'Send this value in the x-oryx-support-session header to act inside the tenant.'}
          </p>
          <code
            className="block break-all rounded-lg px-3 py-2 font-mono text-[12px]"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)' }}
          >
            {sessionId}
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
            <Field label={t('context.company')} required>
              <select
                className="oryx-select"
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                data-testid="support-company"
              >
                <option value="">—</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === 'ar' ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('support.duration')}>
              <input
                className="oryx-input"
                type="number"
                min={5}
                max={240}
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t('support.reason')}
                required
                hint={locale === 'ar' ? '10 أحرف على الأقل' : 'At least 10 characters'}
              >
                <textarea
                  className="oryx-textarea"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  data-testid="support-reason"
                />
              </Field>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Page() {
  return (
    <PermissionGate anyOf={['platform.support.access']}>
      <SupportPageInner />
    </PermissionGate>
  );
}
