'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContextResponse } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from './icons';
import { EntityPicker } from './inline-create';
import { CreateBranchModal } from './branch-modal';

/**
 * Company/branch scope selector. Options come from the API and are already
 * filtered to what the principal may access, so an out-of-scope selection is
 * impossible from the UI and is rejected server-side regardless.
 */
export function ContextSelector() {
  const { t } = useUi();
  const { isPlatform, companyId, branchId, setCompanyContext, can, hasModule } = useAuth();
  const [context, setContext] = useState<ContextResponse | null>(null);

  const reload = useCallback(async () => {
    const res = await api.context();
    setContext(res);
  }, []);

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

  // A branch belongs to exactly one company, so the inline create is only
  // offered once a single company scope is active and the principal may create
  // branches under it.
  const canCreateBranch = Boolean(companyId) && can('company.branch.create');

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
        <div style={{ width: '100%', minWidth: 150, maxWidth: 190 }}>
          <EntityPicker
            value={branchId ?? null}
            options={branches.map((b) => ({ value: b.id, label: b.nameEn }))}
            onChange={(v) => setCompanyContext(companyId, v ?? null)}
            placeholder={t('context.allBranches')}
            emptyLabel={t('context.allBranches')}
            disabled={!companyId}
            testId="context-branch"
            createLabel={canCreateBranch ? t('branches.new') : undefined}
            reloadOptions={reload}
            renderCreate={
              canCreateBranch
                ? ({ onClose, onSaved }) => (
                    <CreateBranchModal
                      open
                      companyId={companyId as string}
                      onClose={onClose}
                      onCreated={() => undefined}
                      onSaved={(saved) => void onSaved(saved.id)}
                      hasModule={hasModule('branch_management')}
                    />
                  )
                : undefined
            }
          />
        </div>
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
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; dir: 'up' | 'down' } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu is rendered in a portal at a measured fixed position, because the
  // sticky, backdrop-filtered header clips any absolutely-positioned child and
  // traps `position: fixed` in its own containing block.
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 230;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH + 16 && r.top > spaceBelow;
    const rtl = document.documentElement.getAttribute('data-dir') === 'rtl';
    const minWidth = Math.max(260, Math.round(r.width));
    // Align the menu's inline-end edge to the trigger's, whichever side that is.
    const left = rtl ? r.left : r.right - minWidth;
    setPos({
      top: openUp ? r.top - 8 : r.bottom + 8,
      left: Math.max(8, Math.min(left, window.innerWidth - minWidth - 8)),
      minWidth,
      dir: openUp ? 'up' : 'down',
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    // Re-measure after the first paint so the menu's real height drives the flip.
    const raf = requestAnimationFrame(place);
    const onScroll = () => place();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  if (!user) return null;

  const name = locale === 'ar' ? user.fullNameAr : user.fullNameEn;

  const menu =
    open && pos ? (
      <div
        ref={menuRef}
        role="menu"
        className="oryx-card oryx-menu"
        data-dir={pos.dir}
        style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
      >
        <p className="m-0 truncate text-[13.5px] font-semibold">{name}</p>
        <p className="oryx-faint m-0 mb-2 truncate text-[12px]">{user.email}</p>
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
    ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
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
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
