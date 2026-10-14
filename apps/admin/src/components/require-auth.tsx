'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from './icons';

/**
 * Guards the authenticated area. Redirects to /login when there is no session
 * and shows a lightweight boot state while the session resolves.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, ready } = useAuth();
  const { t } = useUi();
  const router = useRouter();

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 animate-pulse place-items-center rounded-xl"
            style={{ background: 'linear-gradient(145deg, var(--gold-soft), var(--gold-deep))', color: 'var(--text-inverse)' }}
          >
            <Icon name="gauge" size={20} />
          </span>
          <span className="oryx-muted text-[13px]">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
