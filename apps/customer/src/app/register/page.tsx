'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { customerApi, customerSession } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, Button, Card, Field } from '@/components/ui';

/** Customer self-registration. */
export default function RegisterPage() {
  const { t } = useUi();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await customerApi.register({
        email,
        password,
        fullName,
        ...(phone ? { phone } : {}),
      });
      customerSession.setAccessToken(session.accessToken);
      router.push('/garage');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oryx-container" style={{ maxWidth: 460 }}>
      <Card title={t('auth.registerTitle')}>
        <form onSubmit={onSubmit}>
          {error && (
            <div style={{ marginBottom: 14 }}>
              <Alert>{error}</Alert>
            </div>
          )}
          <Field label={t('auth.fullName')}>
            <input
              className="oryx-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
              data-testid="register-name"
            />
          </Field>
          <Field label={t('auth.email')}>
            <input
              className="oryx-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              data-testid="register-email"
            />
          </Field>
          <Field label={t('profile.phone')} hint={t('common.optional')}>
            <input
              className="oryx-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              dir="ltr"
            />
          </Field>
          <Field label={t('auth.password')}>
            <input
              className="oryx-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={10}
              data-testid="register-password"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            {t('auth.submitRegister')}
          </Button>
        </form>
        <p style={{ marginTop: 16, marginBottom: 0 }}>
          <Link href="/login" className="oryx-muted">
            {t('nav.login')}
          </Link>
        </p>
      </Card>
    </div>
  );
}
