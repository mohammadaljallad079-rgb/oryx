'use client';

import { useEffect, useState } from 'react';
import type { ContextResponse } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from './icons';

/**
 * Company/branch scope selector. Options come from the API and are already
 * filtered to what the principal may access, so an out-of-scope selection is
 * impossible from the UI and is rejected server-side regardless.
 */
export function ContextSelector() {
  const { t } = useUi();
  const { isPlatform, companyId, branchId, setCompanyContext } = useAuth();
  const [context, setContext] = useState<ContextResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.context();
        if (!cancelled) setContext(res);
      } catch {
        if (!cancelled) setContext(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const companies = context?.companies ?? [];
  const branches = (context?.branches ?? []).filter((b) => !companyId || b.companyId === companyId);

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="context-selector">
      {isPlatform ? (
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="oryx-faint hidden text-[11.5px] font-semibold uppercase tracking-wide md:inline">
            {t('context.company')}
          </span>
          <select
            className="oryx-select"
            style={{ width: '100%', maxWidth: 220 }}
            value={companyId ?? ''}
            onChange={(e) => setCompanyContext(e.target.value || null, null)}
            aria-label={t('context.company')}
          >
            <option value="">{t('context.allCompanies')}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn} — {c.type === 'INTERNAL' ? t('companies.internal') : t('companies.tenant')}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex min-w-0 items-center gap-2">
        <span className="oryx-faint hidden text-[11.5px] font-semibold uppercase tracking-wide md:inline">
          {t('context.branch')}
        </span>
        <select
          className="oryx-select"
          style={{ width: '100%', maxWidth: 190 }}
          value={branchId ?? ''}
          disabled={!companyId}
          onChange={(e) => setCompanyContext(companyId, e.target.value || null)}
          aria-label={t('context.branch')}
        >
          <option value="">{t('context.allBranches')}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nameEn}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme, t } = useUi();
  const { user, updatePreferences } = useAuth();

  return (
    <button
      type="button"
      className="oryx-btn oryx-btn--ghost oryx-btn--sm"
      onClick={() => {
        toggleTheme();
        // Persist for the signed-in user so the choice survives sign-out.
        if (user) {
          void updatePreferences({ preferredTheme: theme === 'dark' ? 'light' : 'dark' }).catch(() => undefined);
        }
      }}
      title={t('theme.toggle')}
      aria-label={t('theme.toggle')}
      data-testid="theme-toggle"
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      <span className="hidden sm:inline">{theme === 'dark' ? t('theme.light') : t('theme.dark')}</span>
    </button>
  );
}

export function LocaleToggle() {
  const { locale, toggleLocale, t } = useUi();
  const { user, updatePreferences } = useAuth();

  return (
    <button
      type="button"
      className="oryx-btn oryx-btn--ghost oryx-btn--sm"
      onClick={() => {
        toggleLocale();
        if (user) {
          void updatePreferences({ preferredLocale: locale === 'ar' ? 'en' : 'ar' }).catch(() => undefined);
        }
      }}
      title={t('locale.toggle')}
      aria-label={t('locale.toggle')}
      data-testid="locale-toggle"
    >
      <Icon name="globe" size={16} />
      <span>{locale === 'ar' ? 'EN' : 'ع'}</span>
    </button>
  );
}

export function UserMenu() {
  const { user, logout, isPlatform } = useAuth();
  const { t, locale } = useUi();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const name = locale === 'ar' ? user.fullNameAr : user.fullNameEn;

  return (
    <div className="relative">
      <button
        type="button"
        className="oryx-btn oryx-btn--ghost oryx-btn--sm"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="user-menu"
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold"
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)' }}
        >
          {name.slice(0, 1)}
        </span>
        <span className="hidden max-w-[140px] truncate md:inline">{name}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div
          className="oryx-card absolute end-0 z-50 mt-2 w-64 p-3"
          role="menu"
          style={{ insetInlineEnd: 0 }}
        >
          <p className="m-0 truncate text-[13px] font-semibold">{name}</p>
          <p className="oryx-faint m-0 mb-2 truncate text-[11.5px]">{user.email}</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {isPlatform ? <span className="oryx-badge oryx-badge--gold">Super Admin</span> : null}
            <span className="oryx-badge oryx-badge--neutral">{locale.toUpperCase()}</span>
          </div>
          <hr className="oryx-divider my-2" />
          <button
            type="button"
            className="oryx-btn oryx-btn--ghost w-full justify-start"
            onClick={() => void logout()}
            data-testid="logout"
          >
            <Icon name="logout" size={16} />
            {t('auth.logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
