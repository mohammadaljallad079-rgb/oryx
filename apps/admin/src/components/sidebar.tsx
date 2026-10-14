'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { ALL_NAV_GROUPS, type NavItem } from '@/lib/navigation';
import { Icon } from './icons';
import { Badge } from './ui';

function visible(item: NavItem, ctx: {
  isPlatform: boolean;
  can: (p: string) => boolean;
  canAny: (...p: string[]) => boolean;
  hasModule: (m: string) => boolean;
  companySelected: boolean;
}): boolean {
  if (item.platformOnly && !ctx.isPlatform) return false;
  if (item.moduleKey && ctx.companySelected && !ctx.hasModule(item.moduleKey)) return false;
  if (item.permission) {
    // Platform principals hold platform.* codes; company principals hold company.*.
    const platformVariant = item.permission.replace(/^company\./, 'platform.company.');
    if (!ctx.can(item.permission) && !ctx.can(platformVariant) && !ctx.canAny(item.permission)) return false;
  }
  return true;
}

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const { t } = useUi();
  const { isPlatform, can, canAny, hasModule, companyId } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const ctx = { isPlatform, can, canAny, hasModule, companySelected: Boolean(companyId) };

  return (
    <aside className="oryx-sidebar" data-open={open} aria-label={t('context.scope')}>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="mb-2 flex items-center gap-3 rounded-xl px-3 py-3"
        style={{ border: '1px solid var(--border)' }}
      >
        <BrandMark />
        <span className="min-w-0">
          <span className="block text-[15px] font-extrabold leading-tight tracking-[0.18em]">ORYX</span>
          <span className="oryx-faint block truncate text-[10.5px]">{t('brand.tagline')}</span>
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
            >
              <span>{t(group.labelKey)}</span>
              {isCollapsible ? (
                <Icon
                  name="chevronDown"
                  size={13}
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}
                />
              ) : null}
            </button>
            {isOpen
              ? items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onNavigate}
                      className="oryx-nav-item"
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon name={item.icon} size={16} />
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
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
    </aside>
  );
}

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 flex-none place-items-center rounded-[10px]"
      style={{
        background: 'linear-gradient(145deg, var(--gold-soft), var(--gold-deep))',
        color: 'var(--text-inverse)',
      }}
    >
      {/* Geometric monogram placeholder: the official logo asset is not in the
          repository yet, so no third-party mark is reproduced here. */}
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3 21 12 12 21 3 12Z" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    </span>
  );
}
