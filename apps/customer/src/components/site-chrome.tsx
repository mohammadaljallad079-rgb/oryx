'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/brand-logo';
import { Icon } from '@/components/icons';

/**
 * Public site header.
 *
 * Navigation is identical in both directions: the markup order is fixed and the
 * document direction flips it, so nothing is duplicated for RTL.
 *
 * Below 900px the desktop nav is replaced by a disclosure panel. Without it the
 * primary navigation was simply unreachable on a phone.
 */
export function SiteHeader() {
  const { t, locale, toggleLocale, theme, toggleTheme } = useUi();
  const { isAuthenticated, profile, signOut } = useCustomerAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: '/', key: 'nav.home' },
    { href: '/services', key: 'nav.services' },
    { href: '/providers', key: 'nav.providers' },
    { href: '/bookings', key: 'nav.bookings' },
    { href: '/invoices', key: 'nav.invoices' },
    { href: '/support', key: 'nav.support' },
  ];

  // A navigation always closes the panel, so the next page is not covered.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="oryx-header">
      <div className="oryx-container oryx-header-inner">
        <Link href="/" className="oryx-brand" aria-label="ORYX">
          <BrandLogo height={30} />
          <span className="oryx-brand__tagline oryx-muted">{t('brand.tagline')}</span>
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

        <div className="oryx-header-actions">
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
              <Link href="/dashboard" className="oryx-btn oryx-header-auth">
                {profile?.fullName?.split(' ')[0] ?? t('nav.dashboard')}
              </Link>
              <button
                type="button"
                className="oryx-btn oryx-btn-ghost oryx-header-auth"
                onClick={() => void signOut()}
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="oryx-btn oryx-header-auth">
                {t('nav.login')}
              </Link>
              <Link href="/register" className="oryx-btn oryx-btn-primary oryx-header-auth">
                {t('nav.register')}
              </Link>
            </>
          )}

          <button
            type="button"
            className="oryx-btn oryx-btn-ghost oryx-menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="oryx-mobile-nav"
            aria-label={t('nav.home')}
            data-testid="menu-toggle"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="oryx-mobile-nav" className="oryx-mobile-nav" aria-label={t('nav.home')}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
            >
              {t(link.key)}
            </Link>
          ))}
          <div className="oryx-mobile-nav__auth">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="oryx-btn">
                  {t('nav.dashboard')}
                </Link>
                <button type="button" className="oryx-btn" onClick={() => void signOut()}>
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
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { t, locale, setLocale } = useUi();

  const columns = [
    {
      title: t('footer.services'),
      links: [
        { href: '/services', label: t('nav.services') },
        { href: '/providers', label: t('nav.providers') },
        { href: '/bookings', label: t('nav.bookings') },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { href: '/', label: t('footer.about') },
        { href: '/#how', label: t('footer.howItWorks') },
        { href: '/providers/apply', label: t('footer.becomeProvider') },
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { href: '/support', label: t('footer.contact') },
        { href: '/invoices', label: t('nav.invoices') },
      ],
    },
  ];

  return (
    <footer className="oryx-footer">
      <div className="oryx-container">
        <div className="oryx-footer__grid">
          <div className="oryx-footer__brand">
            <BrandLogo height={30} />
            <p className="oryx-footer__tagline">{t('home.subtitle')}</p>
          </div>
          {columns.map((col) => (
            <div key={col.title} className="oryx-footer__col">
              <h3>{col.title}</h3>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="oryx-footer__bar">
          <span>{t('footer.legal', { year: new Date().getFullYear() })}</span>
          <button
            type="button"
            className="oryx-btn oryx-btn-ghost oryx-btn-sm"
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            aria-label={t('common.language')}
          >
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
      </div>
    </footer>
  );
}
