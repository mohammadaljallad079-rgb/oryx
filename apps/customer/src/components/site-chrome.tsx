'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { IS_STATIC_PREVIEW, previewNotice } from '@/lib/preview-data';
import { BrandLogo } from '@/components/brand-logo';
import { Icon } from '@/components/icons';

/**
 * The notice that marks the static GitHub Pages build.
 *
 * It is rendered once, at the top of every page, rather than per screen, so a
 * visitor cannot mistake the exported preview for the live platform. It renders
 * nothing in a normal build.
 */
function PreviewStrip() {
  const { t, locale } = useUi();
  if (!IS_STATIC_PREVIEW) return null;
  return (
    <div className="oryx-preview-strip" role="note" data-testid="preview-strip">
      <div className="oryx-container oryx-preview-strip__inner">
        <span className="oryx-preview-strip__badge">{t('preview.badge')}</span>
        <span className="oryx-preview-strip__text">{previewNotice(locale)}</span>
      </div>
    </div>
  );
}

/**
 * The public navigation.
 *
 * These are the browsing destinations a visitor — signed in or not — can use.
 * The private account functions (bookings, orders, invoices, quotations,
 * returns, the garage, notifications and the profile) deliberately do not
 * appear here; they live in the account menu so a visitor is never offered a
 * link the API would refuse. See `ACCOUNT_LINKS` below.
 */
const PUBLIC_LINKS = [
  { href: '/', key: 'nav.home' },
  { href: '/categories', key: 'nav.categories' },
  { href: '/products', key: 'nav.products' },
  { href: '/services', key: 'nav.services' },
  { href: '/providers', key: 'nav.providers' },
  { href: '/about', key: 'nav.about' },
  { href: '/contact', key: 'nav.contact' },
];

/** Account destinations, in the order the menu presents them. */
const ACCOUNT_LINKS = [
  { href: '/dashboard', key: 'account.nav.overview', icon: 'grid' as const },
  { href: '/bookings', key: 'account.nav.bookings', icon: 'calendar' as const },
  { href: '/garage', key: 'account.nav.garage', icon: 'car' as const },
  { href: '/orders', key: 'account.nav.orders', icon: 'cart' as const },
  { href: '/rfqs', key: 'account.nav.rfqs', icon: 'clipboard' as const },
  { href: '/quotations', key: 'account.nav.quotations', icon: 'file' as const },
  { href: '/invoices', key: 'account.nav.invoices', icon: 'wallet' as const },
  { href: '/returns', key: 'account.nav.returns', icon: 'arrow' as const },
  { href: '/my-credits', key: 'account.nav.credits', icon: 'wallet' as const },
  { href: '/notifications', key: 'account.nav.notifications', icon: 'bell' as const },
  { href: '/profile', key: 'account.nav.profile', icon: 'user' as const },
  { href: '/support', key: 'account.nav.support', icon: 'headset' as const },
];

/**
 * Public site header.
 *
 * Two rows: a brand/search/actions row and a browsing row. Navigation is
 * identical in both directions — the markup order is fixed and the document
 * direction flips it, so nothing is duplicated for RTL.
 *
 * Below 900px the browsing row is replaced by a disclosure panel and the
 * account menu becomes a section of that panel, so no destination is
 * unreachable on a phone.
 */
export function SiteHeader() {
  const { t, locale, toggleLocale, theme, toggleTheme } = useUi();
  const { isAuthenticated, profile, signOut } = useCustomerAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState('');
  const accountRef = useRef<HTMLDivElement | null>(null);

  // A navigation always closes every panel, so the next page is not covered.
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Close the account menu on an outside click or Escape, so it cannot be left
  // floating over the page.
  useEffect(() => {
    if (!accountOpen) return;
    function onPointer(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/products?query=${encodeURIComponent(trimmed)}` : '/products');
  }

  const firstName = profile?.fullName?.split(' ')[0];

  return (
    <header className="oryx-header">
      <PreviewStrip />
      <div className="oryx-container oryx-header-inner">
        <Link href="/" className="oryx-brand" aria-label="ORYX">
          <BrandLogo height={30} />
          <span className="oryx-brand__tagline oryx-muted">{t('brand.tagline')}</span>
        </Link>

        <form className="oryx-search" role="search" onSubmit={submitSearch}>
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nav.search')}
            aria-label={t('nav.search')}
            data-testid="site-search"
          />
          <button type="submit" className="oryx-search__submit">
            {t('nav.searchAction')}
          </button>
        </form>

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
              <Link
                href="/cart"
                className="oryx-btn oryx-btn-ghost oryx-header-icon"
                aria-label={t('nav.cart')}
                data-testid="header-cart"
              >
                <Icon name="cart" size={18} />
              </Link>
              <div className="oryx-account" ref={accountRef}>
                <button
                  type="button"
                  className="oryx-btn oryx-header-auth oryx-account__trigger"
                  onClick={() => setAccountOpen((v) => !v)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  aria-label={t('nav.accountMenu')}
                  data-testid="account-menu-trigger"
                >
                  <Icon name="user" size={16} />
                  <span className="oryx-account__name">{firstName ?? t('nav.account')}</span>
                  <Icon name="chevron" size={14} />
                </button>
                {accountOpen && (
                  <div className="oryx-account__menu" role="menu" data-testid="account-menu">
                    <p className="oryx-account__header">
                      <strong>{profile?.fullName}</strong>
                      <span className="oryx-muted">{profile?.email}</span>
                    </p>
                    {ACCOUNT_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        role="menuitem"
                        className="oryx-account__item"
                        aria-current={pathname === link.href ? 'page' : undefined}
                      >
                        <Icon name={link.icon} size={16} />
                        {t(link.key)}
                      </Link>
                    ))}
                    <button
                      type="button"
                      role="menuitem"
                      className="oryx-account__item oryx-account__item--danger"
                      onClick={() => void signOut()}
                    >
                      <Icon name="logout" size={16} />
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
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

      <nav className="oryx-navbar" aria-label={t('nav.home')}>
        <div className="oryx-container oryx-navbar__inner">
          {PUBLIC_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
            >
              {t(link.key)}
            </Link>
          ))}
        </div>
      </nav>

      {menuOpen && (
        <nav id="oryx-mobile-nav" className="oryx-mobile-nav" aria-label={t('nav.home')}>
          <form className="oryx-search oryx-search--mobile" role="search" onSubmit={submitSearch}>
            <Icon name="search" size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('nav.search')}
              aria-label={t('nav.search')}
            />
            <button type="submit" className="oryx-search__submit">
              {t('nav.searchAction')}
            </button>
          </form>
          {PUBLIC_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
            >
              {t(link.key)}
            </Link>
          ))}

          {isAuthenticated ? (
            <div className="oryx-mobile-nav__section">
              <p className="oryx-mobile-nav__title">{t('account.nav.title')}</p>
              {ACCOUNT_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="oryx-mobile-nav__account">
                  <Icon name={link.icon} size={16} />
                  {t(link.key)}
                </Link>
              ))}
              <button type="button" className="oryx-btn" onClick={() => void signOut()}>
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <div className="oryx-mobile-nav__auth">
              <Link href="/login" className="oryx-btn">
                {t('nav.login')}
              </Link>
              <Link href="/register" className="oryx-btn oryx-btn-primary">
                {t('nav.register')}
              </Link>
            </div>
          )}
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
        { href: '/categories', label: t('nav.categories') },
        { href: '/products', label: t('nav.products') },
        { href: '/services', label: t('nav.services') },
        { href: '/providers', label: t('nav.providers') },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { href: '/about', label: t('footer.about') },
        { href: '/#how', label: t('footer.howItWorks') },
        { href: '/providers/apply', label: t('footer.becomeProvider') },
        { href: '/credits', label: t('footer.credits') },
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { href: '/contact', label: t('footer.contact') },
        { href: '/support', label: t('nav.support') },
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
