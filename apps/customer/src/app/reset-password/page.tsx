'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, Button, Field } from '@/components/ui';
import { AuthShell, LoadingPanel, StatePanel } from '@/components/premium';

/** Complete a password reset using the single-use token from the email link. */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="oryx-container oryx-container--narrow">
          <LoadingPanel rows={3} />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const { t } = useUi();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('common.error'));
      return;
    }
    setBusy(true);
    try {
      await customerApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.resetInvalid')}>
        <StatePanel
          tone="error"
          title={t('auth.resetInvalid')}
          message={t('auth.resetInvalidHint')}
          action={
            <Link href="/forgot-password" className="oryx-btn">
              {t('auth.forgotTitle')}
            </Link>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSubtitle')}
      aside={
        <Link href="/login" className="oryx-link">
          {t('nav.login')}
        </Link>
      }
    >
        {done ? (
          <StatePanel
            tone="success"
            icon="check"
            title={t('auth.resetDoneTitle')}
            message={t('auth.resetDone')}
          />
        ) : (
          <form onSubmit={onSubmit}>
            {error && (
              <div style={{ marginBottom: 14 }}>
                <Alert>{error}</Alert>
              </div>
            )}
            <Field label={t('auth.password')}>
              <input
                className="oryx-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </Field>
            <Field label={t('auth.password')}>
              <input
                className="oryx-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </form>
        )}
    </AuthShell>
  );
}
