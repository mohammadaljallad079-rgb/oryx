'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { RequireCustomer } from '@/components/require-customer';
import { Icon, type IconName } from '@/components/icons';

/**
 * The account shell.
 *
 * Every private screen shares one layout: a sidebar on a wide viewport and a
 * horizontal rail on a phone. The guard runs once here rather than in each
 * page, so an expired session redirects before any page fetches.
 *
 * The navigation is grouped, because a flat list of ten destinations reads as a
 * dump rather than a menu.
 */
interface NavItem {
  href: string;
  key: string;
  icon: IconName;
}

const SECTIONS: Array<{ titleKey: string; items: NavItem[] }> = [
  {
    titleKey: 'account.nav.sectionActivity',
    items: [
      { href: '/dashboard', key: 'account.nav.overview', icon: 'grid' },
      { href: '/bookings', key: 'account.nav.bookings', icon: 'calendar' },
      { href: '/garage', key: 'account.nav.garage', icon: 'car' },
      { href: '/support', key: 'account.nav.support', icon: 'headset' },
    ],
  },
  {
    titleKey: 'account.nav.sectionCommerce',
    items: [
      { href: '/orders', key: 'account.nav.orders', icon: 'cart' },
      { href: '/rfqs', key: 'account.nav.rfqs', icon: 'clipboard' },
      { href: '/quotations', key: 'account.nav.quotations', icon: 'file' },
      { href: '/invoices', key: 'account.nav.invoices', icon: 'wallet' },
      { href: '/returns', key: 'account.nav.returns', icon: 'arrow' },
      { href: '/my-credits', key: 'account.nav.credits', icon: 'wallet' },
    ],
  },
  {
    titleKey: 'account.nav.sectionAccount',
    items: [
      { href: '/notifications', key: 'account.nav.notifications', icon: 'bell' },
      { href: '/profile', key: 'account.nav.profile', icon: 'user' },
    ],
  },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { t } = useUi();
  const { profile, signOut } = useCustomerAuth();
  const pathname = usePathname();

  return (
    <RequireCustomer>
      <div className="oryx-container oryx-account-shell">
        <aside className="oryx-account-side" aria-label={t('account.nav.menu')}>
          <div className="oryx-account-side__identity">
            <span className="oryx-account-side__avatar" aria-hidden>
              <Icon name="user" size={18} />
            </span>
            <span className="oryx-account-side__meta">
              <strong>{profile?.fullName}</strong>
              <span className="oryx-muted">{profile?.email}</span>
            </span>
          </div>

          {SECTIONS.map((section) => (
            <div key={section.titleKey} className="oryx-account-side__section">
              <p className="oryx-account-side__title">{t(section.titleKey)}</p>
              <nav className="oryx-account-side__nav">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="oryx-account-side__link"
                    aria-current={pathname === item.href ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={16} />
                    {t(item.key)}
                  </Link>
                ))}
              </nav>
            </div>
          ))}

          <button
            type="button"
            className="oryx-account-side__link oryx-account-side__link--danger"
            onClick={() => void signOut()}
          >
            <Icon name="logout" size={16} />
            {t('nav.logout')}
          </button>
        </aside>

        <div className="oryx-account-body">{children}</div>
      </div>
    </RequireCustomer>
  );
}
