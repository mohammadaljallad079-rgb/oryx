'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi, type Translator } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { PasswordField } from '@/components/password-field';
import { Button, Card, Field } from '@/components/ui';
import { LocaleToggle, ThemeToggle } from '@/components/topbar-controls';
import { BrandLogo } from '@/components/brand-logo';

/**
 * Map a failed sign-in to a message the user can act on.
 *
 * The API answers a throttled login with 429 and a locked or inactive account
 * with 403, so reporting every failure as "invalid email or password" is wrong:
 * it sends a user with a correct password hunting for a typo while the real
 * cause is the rate limiter. Only a 401 means the credentials were rejected.
 */
function signInErrorMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return t('auth.throttled');
    if (error.code === 'auth.account_locked') return t('auth.locked');
    if (error.code === 'auth.account_inactive') return t('auth.inactive');
    // 400 is a request-shape problem (a stray space in the email, a password
    // below the minimum length), never a credential rejection. Reporting it as
    // "invalid email or password" sends the user hunting for a typo.
    if (error.status === 400) return t('auth.badRequest');
    if (error.status >= 500) return t('auth.unavailable');
    return t('auth.invalid');
  }
  return t('auth.unavailable');
}

export default function LoginPage() {
  const { t } = useUi();
  const { login, completeMfaLogin, isAuthenticated, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Set once the password step succeeds and a second factor is required. */
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    if (ready && isAuthenticated) router.replace('/dashboard');
  }, [ready, isAuthenticated, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      if (result && result.mfaRequired) {
        // Password accepted; a second factor is required before a session exists.
        setChallengeToken(result.challengeToken);
        return;
      }
      router.replace('/dashboard');
    } catch (err) {
      setError(signInErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setBusy(true);
    setError(null);
    try {
      await completeMfaLogin(challengeToken, mfaCode);
      router.replace('/dashboard');
    } catch {
      setError(t('mfa.invalidCode'));
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
              <div className="flex flex-col items-start gap-3">
                <BrandLogo height={38} />
                <p className="oryx-muted m-0 text-[12px]">{t('brand.tagline')}</p>
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

            <form
              onSubmit={challengeToken ? onVerifyMfa : onSubmit}
              className="flex flex-col gap-4"
              data-testid="login-form"
            >
              {challengeToken ? (
                <>
                  <p
                    className="m-0 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]"
                    style={{
                      color: 'var(--gold)',
                      background: 'color-mix(in srgb, var(--gold) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--gold) 35%, transparent)',
                    }}
                    data-testid="mfa-challenge-notice"
                  >
                    <Icon name="shield" size={15} />
                    {t('mfa.challengeBody')}
                  </p>
                  <Field label={t('mfa.code')} required hint={t('mfa.codeHint')}>
                    <input
                      className="oryx-input"
                      inputMode="text"
                      autoComplete="one-time-code"
                      autoFocus
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      data-testid="mfa-code"
                    />
                  </Field>
                </>
              ) : (
                <>
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
                  <PasswordField
                    label={t('auth.password')}
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                    required
                    testId="login-password"
                  />
                </>
              )}

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
                {busy ? t('auth.signingIn') : challengeToken ? t('mfa.verify') : t('auth.signInCta')}
              </Button>

              {challengeToken ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setChallengeToken(null);
                    setMfaCode('');
                    setError(null);
                  }}
                  data-testid="mfa-cancel"
                >
                  {t('common.cancel')}
                </Button>
              ) : null}
            </form>

            <p className="oryx-faint mt-6 text-[11.5px] leading-relaxed">
              Execution 01.1 — sessions use HttpOnly cookies; privileged accounts require TOTP MFA.
              Seeded development accounts are documented in the local runbook; no production
              credentials ship with this repository.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
