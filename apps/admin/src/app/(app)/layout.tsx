'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Sidebar } from '@/components/sidebar';
import { ContextSelector, LocaleToggle, ThemeToggle, UserMenu } from '@/components/topbar-controls';
import { Icon } from '@/components/icons';
import { useUi } from '@/lib/ui-context';

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { t } = useUi();

  return (
    <RequireAuth>
      <div className="oryx-shell">
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

        <header className="oryx-header">
          <button
            type="button"
            className="oryx-btn oryx-btn--ghost oryx-btn--sm lg:hidden"
            onClick={() => setNavOpen((p) => !p)}
            aria-label={t('context.scope')}
            aria-expanded={navOpen}
          >
            <Icon name="menu" size={18} />
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
