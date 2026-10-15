'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';

/**
 * Public site header.
 *
 * Navigation is identical in both directions: the markup order is fixed and the
 * document direction flips it, so nothing is duplicated for RTL.
 */
export function SiteHeader() {
  const { t, locale, toggleLocale, theme, toggleTheme } = useUi();
  const { isAuthenticated, profile, signOut } = useCustomerAuth();
  const pathname = usePathname();

  const links = [
    { href: '/', key: 'nav.home' },
    { href: '/services', key: 'nav.services' },
    { href: '/providers', key: 'nav.providers' },
    { href: '/bookings', key: 'nav.bookings' },
    { href: '/invoices', key: 'nav.invoices' },
    { href: '/support', key: 'nav.support' },
  ];

  return (
    <header className="oryx-header">
      <div className="oryx-container oryx-header-inner">
        <Link href="/" className="oryx-brand" aria-label="ORYX">
          <span className="oryx-brand-mark" aria-hidden>
            O
          </span>
          <span>
            ORYX
            <span className="oryx-muted" style={{ display: 'block', fontSize: 10, letterSpacing: '0.12em' }}>
              {t('brand.tagline')}
            </span>
          </span>
        </Link>

        <nav className="oryx-nav" aria-label={t('nav.home')}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="oryx-btn oryx-btn-ghost"
            onClick={toggleLocale}
            aria-label={t('common.language')}
            data-testid="locale-toggle"
          >
            {locale === 'ar' ? 'EN' : 'ع'}
          </button>
          <button
            type="button"
            className="oryx-btn oryx-btn-ghost"
            onClick={toggleTheme}
            aria-label={t('common.theme')}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {isAuthenticated ? (
            <>
              <Link href="/dashboard" className="oryx-btn">
                {profile?.fullName?.split(' ')[0] ?? t('nav.dashboard')}
              </Link>
              <button type="button" className="oryx-btn oryx-btn-ghost" onClick={() => void signOut()}>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="oryx-btn">
                {t('nav.login')}
              </Link>
              <Link href="/register" className="oryx-btn oryx-btn-primary">
                {t('nav.register')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useUi();
  return (
    <footer className="oryx-footer">
      <div className="oryx-container" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>© {new Date().getFullYear()} ORYX</span>
        <Link href="/providers/apply">{t('nav.becomeProvider')}</Link>
        <Link href="/support">{t('nav.support')}</Link>
      </div>
    </footer>
  );
}
