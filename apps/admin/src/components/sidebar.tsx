'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useBranding } from '@/lib/branding-context';
import { ALL_NAV_GROUPS, type NavItem } from '@/lib/navigation';
import { Icon } from './icons';
import { Badge } from './ui';
import { BrandLogo } from './brand-logo';

function visible(item: NavItem, ctx: {
  isPlatform: boolean;
  can: (p: string) => boolean;
  canAny: (...p: string[]) => boolean;
  hasModule: (m: string) => boolean;
  companySelected: boolean;
}): boolean {
  if (item.platformOnly && !ctx.isPlatform) return false;
  if (item.moduleKey && ctx.companySelected && !ctx.hasModule(item.moduleKey)) return false;
  if (item.anyPermission) {
    // Accepts either code, so one entry can serve platform and tenant principals.
    if (!ctx.canAny(...item.anyPermission)) return false;
  } else if (item.permission) {
    // Platform principals hold platform.* codes; company principals hold company.*.
    const platformVariant = item.permission.replace(/^company\./, 'platform.company.');
    if (!ctx.can(item.permission) && !ctx.can(platformVariant) && !ctx.canAny(item.permission)) return false;
  }
  return true;
}

const COLLAPSE_KEY = 'oryx.navCollapsed';

export function Sidebar({
  open,
  onNavigate,
  collapsed = false,
}: {
  open: boolean;
  onNavigate: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useUi();
  const { isPlatform, can, canAny, hasModule, companyId, logout } = useAuth();
  const { logoAssetId, displayName, branding } = useBranding();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [signingOut, setSigningOut] = useState(false);

  const ctx = { isPlatform, can, canAny, hasModule, companySelected: Boolean(companyId) };

  /**
   * Sign out from the sidebar.
   *
   * `logout()` calls the API (revoking the refresh token and clearing the
   * HttpOnly cookie server-side) and drops the in-memory access token. Only then
   * does this navigate to /login, so the user never lands on a protected page
   * holding a live session.
   */
  async function onLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      onNavigate();
      router.replace('/login');
    }
  }

  return (
    <aside
      className="oryx-sidebar"
      data-open={open}
      data-collapsed={collapsed}
      aria-label={t('nav.label')}
    >
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="oryx-sidebar__brand"
        title={branding.isDefault ? t('brand.tagline') : displayName}
        data-testid="sidebar-brand"
      >
        <BrandLogo height={26} assetId={logoAssetId} alt={displayName} />
        <span className="oryx-sidebar__brand-text oryx-faint block truncate text-[10.5px]">
          {branding.isDefault ? t('brand.tagline') : displayName}
        </span>
      </Link>

      {ALL_NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => visible(i, ctx));
        if (items.length === 0) return null;
        if (group.platformOnly && !isPlatform) return null;
        const isCollapsible = group.items.length > 6;
        const isOpen = expanded[group.key] !== false;

        return (
          <div key={group.key}>
            <button
              type="button"
              className="oryx-nav-group-label flex w-full items-center justify-between text-start"
              onClick={() => isCollapsible && setExpanded((p) => ({ ...p, [group.key]: !isOpen }))}
              style={{ background: 'none', border: 0, cursor: isCollapsible ? 'pointer' : 'default' }}
              title={collapsed ? t(group.labelKey) : undefined}
            >
              <span className="oryx-nav-group-label__text">{t(group.labelKey)}</span>
              {isCollapsible ? (
                <Icon
                  name="chevronDown"
                  size={13}
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}
                />
              ) : null}
            </button>
            {isOpen || collapsed
              ? items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const label = t(item.labelKey);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onNavigate}
                      className="oryx-nav-item"
                      aria-current={active ? 'page' : undefined}
                      // In icon-only mode the label is hidden, so it is exposed
                      // as a tooltip and as the accessible name.
                      title={collapsed ? label : undefined}
                      aria-label={collapsed ? label : undefined}
                    >
                      <Icon name={item.icon} size={16} />
                      <span className="oryx-nav-item__label min-w-0 flex-1 truncate">{label}</span>
                      {item.planned ? (
                        <Badge tone="neutral">
                          <span className="text-[10px]">{t('nav.planned')}</span>
                        </Badge>
                      ) : null}
                    </Link>
                  );
                })
              : null}
          </div>
        );
      })}

      {/* Always-visible sign-out, pinned to the bottom of the rail. It sits
          outside the nav groups so a collapsed group cannot hide it. */}
      <div className="oryx-sidebar__footer">
        <button
          type="button"
          className="oryx-nav-item oryx-nav-item--logout"
          onClick={() => void onLogout()}
          disabled={signingOut}
          data-testid="sidebar-logout"
          title={collapsed ? t('auth.logout') : undefined}
          aria-label={collapsed ? t('auth.logout') : undefined}
        >
          <Icon name="logout" size={16} />
          <span className="oryx-nav-item__label min-w-0 flex-1 truncate">{t('auth.logout')}</span>
        </button>
      </div>
    </aside>
  );
}

export { COLLAPSE_KEY };
