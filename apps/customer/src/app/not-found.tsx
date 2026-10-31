'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { StatePanel } from '@/components/premium';

/**
 * Themed 404.
 *
 * Next's built-in not-found injects `body{background:#fff}` after the app
 * stylesheet, so an unknown URL painted a white field on the ivory light theme
 * and a white field on the navy dark theme. Declaring a not-found for the app
 * replaces that document and keeps the page on the theme's own `--bg`.
 */
export default function NotFound() {
  const { t } = useUi();

  return (
    <div className="oryx-container oryx-main oryx-not-found">
      <StatePanel
        tone="info"
        icon="search"
        title={t('notFound.title')}
        message={t('notFound.body')}
        action={
          <div className="oryx-not-found__actions">
            <Link className="oryx-btn oryx-btn-primary" href="/">
              {t('notFound.home')}
            </Link>
            <Link className="oryx-btn" href="/services">
              {t('notFound.services')}
            </Link>
          </div>
        }
      />
    </div>
  );
}
