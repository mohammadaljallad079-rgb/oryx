'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';

const NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/services', key: 'nav.services' },
  { href: '/booking', key: 'nav.book' },
  { href: '/store', key: 'nav.store' },
  { href: '/offers', key: 'nav.offers' },
  { href: '/branches', key: 'nav.branches' },
  { href: '/about', key: 'nav.about' },
  { href: '/contact', key: 'nav.contact' },
];

/** The approved ORYX wordmark, themed for the current surface. */
function BrandLogo({ theme }: { theme: 'dark' | 'light' }) {
  const src = theme === 'dark' ? '/brand/oryx-logo-dark.png' : '/brand/oryx-logo.png';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="oryx-brand-logo" src={src} alt="ORYX" width={140} height={35} />
  );
}

/**
 * Public site header.
 *
 * Navigation is identical in both directions: the markup order is fixed and the
 * document direction flips it, so nothing is duplicated for RTL. The bar is
 * sticky and collapses into a full-screen panel below the tablet breakpoint.
 */
export function SiteHeader() {
  const { t, locale, toggleLocale, theme, toggleTheme } = useUi();
  const { isAuthenticated, profile, signOut } = useCustomerAuth();
  const { count } = useCart();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header className="oryx-header">
      <div className="oryx-container oryx-header-inner">
        <Link href="/" className="oryx-brand" aria-label="ORYX Auto Services">
          <BrandLogo theme={theme} />
        </Link>

        <nav className="oryx-nav" aria-label={t('nav.menu')}>
          {NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={
                link.href === '/' ? (pathname === '/' ? 'page' : undefined) : pathname.startsWith(link.href) ? 'page' : undefined
              }
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="oryx-header-actions">
          <button
            type="button"
            className="oryx-btn oryx-btn-ghost oryx-icon-btn"
            onClick={toggleLocale}
            aria-label={t('common.language')}
            data-testid="locale-toggle"
          >
            {locale === 'ar' ? 'EN' : 'ع'}
          </button>
          <button
            type="button"
            className="oryx-btn oryx-btn-ghost oryx-icon-btn"
            onClick={toggleTheme}
            aria-label={t('common.theme')}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          <Link
            href="/cart"
            className="oryx-btn oryx-btn-ghost oryx-icon-btn oryx-cart-link"
            aria-label={t('nav.cart')}
            data-testid="cart-link"
          >
            <span aria-hidden>🛒</span>
            {count > 0 && (
              <span className="oryx-cart-count" data-testid="cart-count">
                {count}
              </span>
            )}
          </Link>

          <span className="oryx-desktop-only" style={{ display: 'inline-flex', gap: 8 }}>
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="oryx-btn">
                  {profile?.fullName?.split(' ')[0] ?? t('nav.account')}
                </Link>
                <button
                  type="button"
                  className="oryx-btn oryx-btn-ghost"
                  onClick={() => void signOut()}
                >
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
          </span>

          <button
            type="button"
            className="oryx-btn oryx-btn-ghost oryx-icon-btn oryx-mobile-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={t('nav.menu')}
            data-testid="mobile-menu-toggle"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      <div className="oryx-mobile-panel" data-open={menuOpen} data-testid="mobile-menu">
        <nav aria-label={t('nav.menu')}>
          {NAV.map((link) => (
            <Link key={link.href} href={link.href}>
              {t(link.key)}
            </Link>
          ))}
          <Link href="/cart">{t('nav.cart')}</Link>
          {isAuthenticated ? (
            <>
              <Link href="/dashboard">{t('nav.account')}</Link>
              <Link href="/account/orders">{t('account.orders')}</Link>
              <Link href="/account/appointments">{t('account.appointments')}</Link>
              <Link href="/account/wishlist">{t('account.wishlist')}</Link>
            </>
          ) : (
            <>
              <Link href="/login">{t('nav.login')}</Link>
              <Link href="/register">{t('nav.register')}</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/**
 * Public site footer.
 *
 * Branch contact details are the real published branches fetched from the
 * storefront API, so the footer never shows a phone number the database does
 * not hold.
 */
export function SiteFooter() {
  const { t, locale } = useUi();
  const { content, pick } = useSiteContent();
  const [branches, setBranches] = useState<
    Array<{ id: string; nameEn: string; nameAr: string; phone: string | null; city: string | null }>
  >([]);

  useEffect(() => {
    let active = true;
    import('@/lib/api')
      .then(({ publicApi }) => publicApi.storefrontBranches())
      .then((rows) => {
        if (active) setBranches(rows.filter((b) => b.isPublished).slice(0, 3));
      })
      .catch(() => {
        if (active) setBranches([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <footer className="oryx-footer">
      <div className="oryx-container">
        <div className="oryx-footer-grid">
          <div>
            <BrandLogo theme="dark" />
            <p className="oryx-muted" style={{ marginTop: 16, maxWidth: 340 }}>
              {pick(content.footer.introEn, content.footer.introAr) || t('footer.intro')}
            </p>
            {(content.contact.phone || content.contact.email) && (
              <div className="oryx-muted" style={{ marginTop: 8, direction: 'ltr' }}>
                {content.contact.phone && <div>{content.contact.phone}</div>}
                {content.contact.email && <div>{content.contact.email}</div>}
              </div>
            )}
          </div>

          <div>
            <h4>{t('footer.quick')}</h4>
            <Link href="/">{t('nav.home')}</Link>
            <Link href="/services">{t('nav.services')}</Link>
            <Link href="/booking">{t('nav.book')}</Link>
            <Link href="/store">{t('nav.store')}</Link>
            <Link href="/offers">{t('nav.offers')}</Link>
          </div>

          <div>
            <h4>{t('footer.branches')}</h4>
            {branches.length === 0 ? (
              <Link href="/branches">{t('nav.branches')}</Link>
            ) : (
              branches.map((branch) => (
                <span key={branch.id} style={{ display: 'block', padding: '4px 0' }}>
                  <Link href={`/branches#${branch.id}`}>
                    {locale === 'ar' ? branch.nameAr : branch.nameEn}
                  </Link>
                  {branch.phone && (
                    <span className="oryx-faint" style={{ display: 'block', direction: 'ltr' }}>
                      {branch.phone}
                    </span>
                  )}
                </span>
              ))
            )}
          </div>

          <div>
            <h4>{t('footer.account')}</h4>
            <Link href="/about">{t('nav.about')}</Link>
            <Link href="/contact">{t('nav.contact')}</Link>
            <Link href="/account/orders">{t('account.orders')}</Link>
            <Link href="/account/appointments">{t('account.appointments')}</Link>
            <Link href="/privacy">{t('footer.privacy')}</Link>
            <Link href="/terms">{t('footer.terms')}</Link>
          </div>
        </div>

        <div className="oryx-footer-bottom">
          <span>
            © {new Date().getFullYear()} {content.brand.nameEn}. {t('footer.rights')}.
          </span>
          <div className="oryx-social">
            {content.contact.social.instagram && (
              <a href={content.contact.social.instagram} target="_blank" rel="noreferrer noopener" aria-label="Instagram">
                Instagram
              </a>
            )}
            {content.contact.social.facebook && (
              <a href={content.contact.social.facebook} target="_blank" rel="noreferrer noopener" aria-label="Facebook">
                Facebook
              </a>
            )}
            {content.contact.social.twitter && (
              <a href={content.contact.social.twitter} target="_blank" rel="noreferrer noopener" aria-label="X">
                X
              </a>
            )}
            {content.contact.social.youtube && (
              <a href={content.contact.social.youtube} target="_blank" rel="noreferrer noopener" aria-label="YouTube">
                YouTube
              </a>
            )}
            {content.contact.social.linkedin && (
              <a href={content.contact.social.linkedin} target="_blank" rel="noreferrer noopener" aria-label="LinkedIn">
                LinkedIn
              </a>
            )}
            <a href="/contact" aria-label={t('nav.contact')}>
              ✉
            </a>
            <a href="/branches" aria-label={t('nav.branches')}>
              ⌖
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
