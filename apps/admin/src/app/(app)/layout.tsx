'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { COLLAPSE_KEY, Sidebar } from '@/components/sidebar';
import { ContextSelector, LocaleToggle, ThemeToggle, UserMenu } from '@/components/topbar-controls';
import { Icon } from '@/components/icons';
import { useUi } from '@/lib/ui-context';

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useUi();

  // Restore the persisted sidebar width preference. Reading it in an effect
  // (rather than during render) keeps the server and client markup identical.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return (
    <RequireAuth>
      <div className="oryx-shell" data-nav={collapsed ? 'collapsed' : 'expanded'}>
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} collapsed={collapsed} />

        <header className="oryx-header">
          <button
            type="button"
            className="oryx-btn oryx-btn--ghost oryx-btn--sm lg:hidden"
            onClick={() => setNavOpen((p) => !p)}
            aria-label={t('nav.openMenu')}
            aria-expanded={navOpen}
            data-testid="nav-drawer-toggle"
          >
            <Icon name="menu" size={18} />
          </button>

          <button
            type="button"
            className="oryx-btn oryx-btn--ghost oryx-btn--sm oryx-nav-collapse-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-pressed={collapsed}
            data-testid="nav-collapse-toggle"
          >
            <Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} size={18} />
          </button>

          <div className="min-w-0 flex-1">
            <ContextSelector />
          </div>

          <div className="flex items-center gap-2">
            <LocaleToggle />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="oryx-main">{children}</main>
      </div>
    </RequireAuth>
  );
}
