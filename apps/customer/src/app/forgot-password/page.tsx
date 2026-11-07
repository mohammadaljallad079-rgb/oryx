'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { Alert, Button, Field } from '@/components/ui';
import { AuthShell, StatePanel } from '@/components/premium';

/**
 * Password reset request.
 *
 * The API answers identically whether or not the account exists, so the UI must
 * not reveal which case occurred.
 */
export default function ForgotPasswordPage() {
  const { t } = useUi();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await customerApi.forgotPassword(email);
      setSent(true);
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
      aside={
        <Link href="/login" className="oryx-link">
          {t('nav.login')}
        </Link>
      }
    >
        {sent ? (
          <StatePanel
            tone="success"
            icon="check"
            title={t('auth.resetSentTitle')}
            message={t('auth.resetSent')}
          />
        ) : (
          <form onSubmit={onSubmit}>
            {error && (
              <div style={{ marginBottom: 14 }}>
                <Alert>{error}</Alert>
              </div>
            )}
            <Field label={t('auth.email')} hint={t('auth.forgotHint')}>
              <input
                className="oryx-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t('common.saving') : t('auth.sendReset')}
            </Button>
          </form>
        )}
    </AuthShell>
  );
}
