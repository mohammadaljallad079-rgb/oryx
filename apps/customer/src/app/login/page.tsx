'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { messageOf } from '@/lib/hooks';
import { Alert, Button, Card, Field } from '@/components/ui';

/**
 * Consumer sign-in.
 *
 * When the account has TOTP enabled the API answers with a challenge instead of
 * a session, so the second factor is completed before any token is stored.
 */
export default function LoginPage() {
  const { t } = useUi();
  const router = useRouter();
  const { signIn, verifyMfa } = useCustomerAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (challengeToken) {
        await verifyMfa(challengeToken, code);
      } else {
        const outcome = await signIn(email, password);
        if (outcome.status === 'mfa') {
          setChallengeToken(outcome.challengeToken);
          setBusy(false);
          return;
        }
      }
      router.push('/dashboard');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oryx-container" style={{ maxWidth: 460 }}>
      <Card title={challengeToken ? t('auth.mfaTitle') : t('auth.loginTitle')}>
        <form onSubmit={onSubmit}>
          {error && <div style={{ marginBottom: 14 }}><Alert>{error}</Alert></div>}

          {challengeToken ? (
            <Field label={t('auth.mfaTitle')} hint={t('auth.mfaHint')}>
              <input
                className="oryx-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </Field>
          ) : (
            <>
              <Field label={t('auth.email')}>
                <input
                  className="oryx-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  data-testid="login-email"
                />
              </Field>
              <Field label={t('auth.password')}>
                <input
                  className="oryx-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  data-testid="login-password"
                />
              </Field>
            </>
          )}

          <Button type="submit" variant="primary" disabled={busy} className="oryx-btn-primary">
            {challengeToken ? t('auth.verify') : t('auth.submitLogin')}
          </Button>
        </form>

        {!challengeToken && (
          <p style={{ marginTop: 16, marginBottom: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/forgot-password" className="oryx-muted">
              {t('auth.forgot')}
            </Link>
            <Link href="/register" className="oryx-muted">
              {t('nav.register')}
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
