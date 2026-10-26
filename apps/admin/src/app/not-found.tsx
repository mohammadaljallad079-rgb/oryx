'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { BrandLogo } from '@/components/brand-logo';
import { Button, Card, EmptyState } from '@/components/ui';

/**
 * Themed 404 for the console.
 *
 * Next's built-in not-found injects `body{background:#fff}` after the app
 * stylesheet, which painted a white field over the navy dark theme. Declaring a
 * not-found for the app replaces that document, so an unknown console URL stays
 * on the theme's own `--bg`.
 */
export default function NotFound() {
  const { t } = useUi();

  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <Card className="w-full max-w-[520px] text-center">
        <div className="mb-6 flex justify-center">
          <BrandLogo />
        </div>
        <EmptyState
          title={t('notFound.title')}
          hint={t('notFound.body')}
          action={
            <Link href="/dashboard">
              <Button variant="primary">{t('notFound.action')}</Button>
            </Link>
          }
        />
      </Card>
    </main>
  );
}
