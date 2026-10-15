'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { Loading } from '@/components/ui';

/**
 * Client-side gate for consumer screens.
 *
 * This is a convenience, not the security boundary: every API route behind it
 * re-derives the account from the bearer token, so a visitor who bypasses this
 * component still sees nothing. It exists so an expired session redirects
 * instead of rendering an empty shell.
 */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { t } = useUi();
  const router = useRouter();
  const { isAuthenticated, loading } = useCustomerAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/login');
  }, [loading, isAuthenticated, router]);

  if (loading) return <div className="oryx-container"><Loading /></div>;
  if (!isAuthenticated) return <div className="oryx-container"><Loading label={t('auth.needLogin')} /></div>;
  return <>{children}</>;
}
