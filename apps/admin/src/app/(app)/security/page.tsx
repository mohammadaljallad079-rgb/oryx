'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { PasswordField } from '@/components/password-field';
import { Badge, Button, Card, ErrorBanner, Field, Modal, SectionHeader, Skeleton } from '@/components/ui';

type Status = { enabled: boolean; enrolledAt: string | null; recoveryCodesRemaining: number };

/**
 * Account security screen: TOTP enrollment, recovery codes, disable and reset.
 *
 * Every control performs a real operation against the API. Secrets and recovery
 * codes are shown exactly once and never persisted client-side beyond the
 * immediate display.
 */
export default function SecurityPage() {
  const { t, locale } = useUi();
  const { isPlatform, refreshSession } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api.mfaStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-5" data-testid="security-page">
      <SectionHeader
        title={t('mfa.title')}
        subtitle={t('mfa.subtitle')}
        actions={
          <Button size="sm" onClick={() => void load()}>
            <Icon name="search" size={15} />
            {t('common.refresh')}
          </Button>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={load} retryLabel={t('common.retry')} /> : null}

      <Card className="p-5" data-testid="mfa-card">
        {loading ? (
          <Skeleton height={120} />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span
                  className="grid h-11 w-11 flex-none place-items-center rounded-xl"
                  style={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border-strong)',
                    color: status?.enabled ? 'var(--success)' : 'var(--gold)',
                  }}
                >
                  <Icon name="shield" size={20} />
                </span>
                <div>
                  <p className="oryx-panel-title m-0">{t('mfa.title')}</p>
                  <p className="oryx-muted m-0 text-[12.5px]">
                    {status?.enabled ? t('mfa.enabled') : t('mfa.disabled')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={status?.enabled ? 'success' : 'warning'}>
                      {status?.enabled ? t('mfa.enabled') : t('mfa.disabled')}
                    </Badge>
                    {isPlatform ? <Badge tone="gold">{t('mfa.requiredForSuperAdmin')}</Badge> : null}
                    {status?.enabled ? (
                      <Badge tone="neutral">
                        {t('mfa.remaining')}: {status.recoveryCodesRemaining}
                      </Badge>
                    ) : null}
                    {status?.enrolledAt ? (
                      <Badge tone="neutral">
                        {t('mfa.enrolledAt')}:{' '}
                        {new Date(status.enrolledAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB')}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!status?.enabled ? (
                  <Button variant="primary" onClick={() => setEnrollOpen(true)} data-testid="mfa-enroll">
                    <Icon name="shield" size={16} />
                    {t('mfa.enroll')}
                  </Button>
                ) : (
                  <>
                    <Button onClick={() => setRegenerateOpen(true)} data-testid="mfa-regenerate">
                      {t('mfa.regenerate')}
                    </Button>
                    <Button variant="danger" onClick={() => setDisableOpen(true)} data-testid="mfa-disable">
                      {t('mfa.disable')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      <PasswordCard />

      {isPlatform ? (
        <Card className="p-5" data-testid="mfa-admin-reset">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="oryx-panel-title m-0">{t('mfa.adminReset')}</p>
              <p className="oryx-muted m-0 max-w-[70ch] text-[12.5px]">{t('mfa.adminResetHint')}</p>
            </div>
            <Button onClick={() => setResetOpen(true)} data-testid="mfa-open-reset">
              {t('mfa.adminReset')}
            </Button>
          </div>
        </Card>
      ) : null}

      <EnrollModal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        onEnrolled={async (recoveryCodes) => {
          setEnrollOpen(false);
          setCodes(recoveryCodes);
          await load();
          await refreshSession();
        }}
      />

      <CodeModal
        open={disableOpen}
        title={t('mfa.disable')}
        hint={t('mfa.disableHint')}
        confirmLabel={t('mfa.disable')}
        onClose={() => setDisableOpen(false)}
        onSubmit={async (code) => {
          await api.mfaDisable(code);
          setDisableOpen(false);
          await load();
          await refreshSession();
        }}
      />

      <CodeModal
        open={regenerateOpen}
        title={t('mfa.regenerate')}
        hint={t('mfa.regenerateHint')}
        confirmLabel={t('mfa.regenerate')}
        onClose={() => setRegenerateOpen(false)}
        onSubmit={async (code) => {
          const res = await api.mfaRegenerateRecoveryCodes(code);
          setRegenerateOpen(false);
          setCodes(res.recoveryCodes);
          await load();
        }}
      />

      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} />

      <Modal
        open={Boolean(codes)}
        title={t('mfa.recoveryCodes')}
        onClose={() => {
          setCodes(null);
          setCopied(false);
        }}
        footer={
          <>
            <Button
              onClick={async () => {
                if (!codes) return;
                try {
                  await navigator.clipboard.writeText(codes.join('\n'));
                  setCopied(true);
                } catch {
                  /* clipboard may be unavailable; the codes remain on screen */
                }
              }}
            >
              <Icon name="check" size={15} />
              {copied ? t('mfa.codesCopied') : t('mfa.copyCodes')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setCodes(null);
                setCopied(false);
              }}
            >
              {t('common.close')}
            </Button>
          </>
        }
      >
        <p className="oryx-muted m-0 mb-3 text-[12.5px]">{t('mfa.recoveryCodesHint')}</p>
        <div
          className="grid gap-2 rounded-xl p-4 font-mono text-[13px] sm:grid-cols-2"
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)' }}
          data-testid="mfa-recovery-codes"
        >
          {(codes ?? []).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function PasswordCard() {
  const { t } = useUi();
  const router = useRouter();
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate locally first so an obvious mismatch never costs a round trip.
    if (next.length < 10) return setError(t('password.tooShort'));
    if (next !== confirm) return setError(t('password.mismatch'));
    if (next === current) return setError(t('password.sameAsCurrent'));

    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      // The API revokes every refresh token, including this session's, so the
      // only honest next step is to clear local state and sign in again.
      await logout();
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setBusy(false);
    }
  }

  return (
    <Card className="p-5" data-testid="password-card">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <p className="oryx-panel-title m-0">{t('password.title')}</p>
          <p className="oryx-muted m-0 max-w-[70ch] text-[12.5px]">{t('password.subtitle')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <PasswordField
            label={t('password.current')}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            required
            testId="password-current"
          />
          <PasswordField
            label={t('password.new')}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            required
            hint={t('password.tooShort')}
            testId="password-new"
          />
          <PasswordField
            label={t('password.confirm')}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required
            testId="password-confirm"
          />
        </div>

        <p className="oryx-faint m-0 text-[11.5px]">{t('password.changeHint')}</p>

        {error ? <ErrorBanner message={error} /> : null}

        <div>
          <Button type="submit" variant="primary" disabled={busy} data-testid="password-submit">
            {busy ? t('common.saving') : t('password.changeCta')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EnrollModal({
  open,
  onClose,
  onEnrolled,
}: {
  open: boolean;
  onClose: () => void;
  onEnrolled: (recoveryCodes: string[]) => Promise<void>;
}) {
  const { t } = useUi();
  const [data, setData] = useState<{ qrDataUrl: string; secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setCode('');
      setError(null);
      return;
    }
    void (async () => {
      try {
        const res = await api.mfaStartEnrollment();
        setData({ qrDataUrl: res.qrDataUrl, secret: res.secret, otpauthUri: res.otpauthUri });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      title={t('mfa.enrollTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || code.trim().length < 6 || !data}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await api.mfaConfirmEnrollment(code.trim());
                await onEnrolled(res.recoveryCodes);
              } catch (err) {
                setError(err instanceof Error ? err.message : t('mfa.invalidCode'));
              } finally {
                setBusy(false);
              }
            }}
            data-testid="mfa-confirm-enroll"
          >
            {busy ? t('common.loading') : t('mfa.confirm')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
          data-testid="mfa-enroll-error"
        >
          {error}
        </p>
      ) : null}

      {!data ? (
        <Skeleton height={260} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="oryx-muted m-0 text-center text-[12.5px]">{t('mfa.scanQr')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.qrDataUrl}
            alt={t('mfa.scanQr')}
            width={220}
            height={220}
            style={{ borderRadius: 12, border: '1px solid var(--border-strong)' }}
            data-testid="mfa-qr"
          />
          <div className="w-full text-center">
            <p className="oryx-label m-0 mb-1">{t('mfa.manualEntry')}</p>
            <code
              className="inline-block break-all rounded-lg px-3 py-2 font-mono text-[12.5px]"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
              data-testid="mfa-secret"
            >
              {data.secret}
            </code>
            <p className="oryx-faint mt-1 mb-0 text-[11px]">{t('mfa.secretOnce')}</p>
          </div>
          <div className="w-full">
            <Field label={t('mfa.enterCode')} required>
              <input
                className="oryx-input text-center font-mono text-[16px] tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                data-testid="mfa-enroll-code"
              />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CodeModal({
  open,
  title,
  hint,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  hint: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (code: string) => Promise<void>;
}) {
  const { t } = useUi();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCode('');
      setError(null);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || code.trim().length < 6}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit(code.trim());
              } catch (err) {
                setError(err instanceof Error ? err.message : t('mfa.invalidCode'));
              } finally {
                setBusy(false);
              }
            }}
            data-testid="mfa-code-submit"
          >
            {busy ? t('common.loading') : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="oryx-muted m-0 mb-3 text-[12.5px]">{hint}</p>
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
          data-testid="mfa-code-error"
        >
          {error}
        </p>
      ) : null}
      <Field label={t('mfa.code')} required>
        <input
          className="oryx-input text-center font-mono text-[16px] tracking-[0.3em]"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          data-testid="mfa-code-input"
        />
      </Field>
    </Modal>
  );
}

function ResetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useUi();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setError(null);
      setDone(false);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      title={t('mfa.adminReset')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button
            variant="primary"
            disabled={busy || !email.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                // Resolve the user by email through the admin user list.
                const companies = await api.listCompanies({ pageSize: 100 });
                let targetId: string | null = null;
                for (const c of companies.items) {
                  const users = await api.listUsers(c.id, { pageSize: 100 });
                  const match = users.items.find(
                    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
                  );
                  if (match) {
                    targetId = match.id;
                    break;
                  }
                }
                if (!targetId) {
                  setError(t('error.notFound'));
                  return;
                }
                await api.mfaAdminReset(targetId);
                setDone(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : t('common.error'));
              } finally {
                setBusy(false);
              }
            }}
            data-testid="mfa-reset-submit"
          >
            {busy ? t('common.loading') : t('mfa.adminReset')}
          </Button>
        </>
      }
    >
      <p className="oryx-muted m-0 mb-3 text-[12.5px]">{t('mfa.adminResetHint')}</p>
      {done ? (
        <p
          className="m-0 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{
            color: 'var(--success)',
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
          }}
          data-testid="mfa-reset-done"
        >
          {t('mfa.resetDone')}
        </p>
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
          <Field label={t('auth.email')} required>
            <input
              className="oryx-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="mfa-reset-email"
            />
          </Field>
        </>
      )}
    </Modal>
  );
}
