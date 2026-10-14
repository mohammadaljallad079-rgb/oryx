'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SectionHeader, Skeleton } from '@/components/ui';

export default function SettingsPage() {
  const { t, locale, theme, setLocale, setTheme } = useUi();
  const { user, companyId, isPlatform, updatePreferences, refreshSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ fullNameEn: '', fullNameAr: '' });

  const entitlements = useAsync(
    () => (companyId ? api.entitlements(companyId) : Promise.resolve(null)),
    [companyId],
  );

  useEffect(() => {
    if (user) setForm({ fullNameEn: user.fullNameEn, fullNameAr: user.fullNameAr });
  }, [user]);

  async function saveProfile() {
    setBusy(true);
    setSaved(false);
    try {
      await api.updateProfile(form);
      await refreshSession();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="settings-page">
      <SectionHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      {saved ? (
        <p
          className="m-0 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px] font-semibold"
          style={{
            color: 'var(--success)',
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
          }}
        >
          <Icon name="check" size={15} />
          {t('settings.saved')}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="oryx-panel-title m-0 mb-4">{t('settings.profile')}</p>
          <div className="grid gap-4">
            <Field label={t('auth.email')}>
              <input className="oryx-input" value={user?.email ?? ''} readOnly disabled />
            </Field>
            <Field label={`${t('common.name')} (EN)`}>
              <input
                className="oryx-input"
                value={form.fullNameEn}
                onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
                data-testid="settings-name-en"
              />
            </Field>
            <Field label={`${t('common.name')} (AR)`}>
              <input
                className="oryx-input"
                value={form.fullNameAr}
                onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
                data-testid="settings-name-ar"
              />
            </Field>
            <div>
              <Button variant="primary" disabled={busy} onClick={saveProfile} data-testid="save-profile">
                {busy ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="oryx-panel-title m-0 mb-4">{t('settings.preferences')}</p>

          <div className="mb-4">
            <p className="oryx-label">{t('settings.theme')}</p>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={theme === mode ? 'primary' : 'default'}
                  onClick={() => {
                    setTheme(mode);
                    void updatePreferences({ preferredTheme: mode }).catch(() => undefined);
                  }}
                  data-testid={`theme-${mode}`}
                >
                  <Icon name={mode === 'dark' ? 'moon' : 'sun'} size={15} />
                  {mode === 'dark' ? t('theme.dark') : t('theme.light')}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="oryx-label">{t('settings.locale')}</p>
            <div className="flex gap-2">
              {(['ar', 'en'] as const).map((code) => (
                <Button
                  key={code}
                  size="sm"
                  variant={locale === code ? 'primary' : 'default'}
                  onClick={() => {
                    setLocale(code);
                    void updatePreferences({ preferredLocale: code }).catch(() => undefined);
                  }}
                  data-testid={`locale-${code}`}
                >
                  <Icon name="globe" size={15} />
                  {code === 'ar' ? 'العربية' : 'English'}
                </Button>
              ))}
            </div>
          </div>

          <hr className="oryx-divider my-4" />
          <div className="flex flex-wrap gap-2">
            <Badge tone={isPlatform ? 'gold' : 'info'}>{isPlatform ? 'Super Admin' : 'Company user'}</Badge>
            <Badge tone="neutral">{locale.toUpperCase()}</Badge>
            <Badge tone="neutral">{theme}</Badge>
          </div>
        </Card>
      </div>

      {companyId ? (
        <Card className="p-5" data-testid="settings-entitlements">
          <p className="oryx-panel-title m-0 mb-1">{t('subscriptions.licence')}</p>
          <p className="oryx-muted m-0 mb-4 text-[12px]">{t('dash.moduleAdoptionHint')}</p>
          {entitlements.loading ? (
            <Skeleton height={90} />
          ) : entitlements.error ? (
            <ErrorBanner message={entitlements.error} onRetry={entitlements.reload} retryLabel={t('common.retry')} />
          ) : !entitlements.data ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone={entitlements.data.isActive ? 'success' : 'danger'}>
                  {entitlements.data.status ?? 'NONE'}
                </Badge>
                <Badge tone="gold">{entitlements.data.planCode ?? t('companies.noPlan')}</Badge>
                <Badge tone="neutral">
                  {entitlements.data.usage.branches} / {entitlements.data.limits.maxBranches}
                </Badge>
                <Badge tone="neutral">
                  {entitlements.data.usage.users} / {entitlements.data.limits.maxUsers}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {entitlements.data.licensedModules.map((m) => (
                  <span key={m} className="oryx-badge oryx-badge--gold font-mono text-[10.5px]">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
