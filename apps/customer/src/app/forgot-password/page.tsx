'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { Alert, Button, Card, Field } from '@/components/ui';

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
    <div className="oryx-container" style={{ maxWidth: 460 }}>
      <Card title={t('auth.forgotTitle')}>
        {sent ? (
          <Alert tone="success">{t('auth.resetSent')}</Alert>
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
              {t('auth.sendReset')}
            </Button>
          </form>
        )}
        <p style={{ marginTop: 16, marginBottom: 0 }}>
          <Link href="/login" className="oryx-muted">
            {t('nav.login')}
          </Link>
        </p>
      </Card>
    </div>
  );
}
