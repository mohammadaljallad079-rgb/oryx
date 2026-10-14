'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Button, Card, Field } from '@/components/ui';
import { LocaleToggle, ThemeToggle } from '@/components/topbar-controls';

export default function LoginPage() {
  const { t } = useUi();
  const { login, isAuthenticated, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && isAuthenticated) router.replace('/dashboard');
  }, [ready, isAuthenticated, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch {
      setError(t('auth.invalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative z-10 grid min-h-screen place-items-center px-4 py-10">
      <div className="absolute end-4 top-4 flex gap-2">
        <LocaleToggle />
        <ThemeToggle />
      </div>

      <div
        className="w-full max-w-[980px] overflow-hidden rounded-[22px] border"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="grid md:grid-cols-[1.05fr_1fr]">
          {/* Brand panel — navy and gold identity from the approved reference. */}
          <div
            className="relative hidden min-h-[520px] flex-col justify-between p-8 md:flex"
            style={{ background: 'var(--bg-deep)' }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(600px 320px at 20% 0%, rgba(212,175,55,.22), transparent 60%), radial-gradient(500px 300px at 90% 90%, rgba(74,168,255,.10), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-11 w-11 place-items-center rounded-xl"
                  style={{
                    background: 'linear-gradient(145deg, var(--gold-soft), var(--gold-deep))',
                    color: 'var(--text-inverse)',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3 21 12 12 21 3 12Z" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                </span>
                <div>
                  <p className="m-0 text-[20px] font-extrabold tracking-[0.24em]">ORYX</p>
                  <p className="oryx-muted m-0 text-[12px]">{t('brand.tagline')}</p>
                </div>
              </div>

              <h2 className="mt-12 text-[30px] font-extrabold leading-tight">{t('dash.heroTitle')}</h2>
              <p className="oryx-muted mt-3 max-w-[40ch] text-[13.5px]">{t('dash.heroBody')}</p>
            </div>

            <ul className="relative m-0 flex list-none flex-col gap-2 p-0 text-[12.5px]">
              {[t('nav.group.platform'), t('nav.group.website'), t('nav.plans'), t('nav.users')].map(
                (label) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="oryx-gold">
                      <Icon name="check" size={15} />
                    </span>
                    <span className="oryx-muted">{label}</span>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Sign-in form */}
          <Card className="rounded-none border-0 p-8 md:p-10" flat>
            <h1 className="m-0 text-[22px] font-extrabold">{t('auth.welcome')}</h1>
            <p className="oryx-muted mt-1 mb-6 text-[13px]">{t('auth.subtitle')}</p>

            <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="login-form">
              <Field label={t('auth.email')} required>
                <input
                  className="oryx-input"
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="login-email"
                />
              </Field>
              <Field label={t('auth.password')} required>
                <input
                  className="oryx-input"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password"
                />
              </Field>

              {error ? (
                <p
                  className="m-0 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
                  style={{
                    color: 'var(--danger)',
                    background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
                  }}
                  role="alert"
                  data-testid="login-error"
                >
                  <Icon name="alert" size={15} />
                  {error}
                </p>
              ) : null}

              <Button type="submit" variant="primary" disabled={busy} data-testid="login-submit">
                {busy ? t('auth.signingIn') : t('auth.signInCta')}
              </Button>
            </form>

            <p className="oryx-faint mt-6 text-[11.5px] leading-relaxed">
              Execution 01 — Super Admin foundation. Seeded development accounts are documented in the
              local runbook; no production credentials ship with this repository.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
