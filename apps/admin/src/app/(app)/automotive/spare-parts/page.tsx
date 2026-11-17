'use client';

import { Suspense, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { Badge, SectionHeader, Skeleton } from '@/components/ui';
import { ModuleDashboard } from '@/components/module-dashboard';
import { TabDeepLink } from '@/components/tab-deep-link';
import { PartsWorkspace, PARTS_TAB_KEYS, type PartsTabKey } from '@/components/parts-tabs';

type Tab = 'dashboard' | PartsTabKey;

const TAB_KEYS = ['dashboard', ...PARTS_TAB_KEYS] as const;

/**
 * The spare-parts route.
 *
 * Spare parts are products with fitment data and a reservation flow, so the
 * module now also lives inside Warehouses & Inventory → Spare parts, beside the
 * product catalogue it draws on. This route stays so an existing bookmark, a
 * module tile and a deep link keep resolving, and it mounts the same workspace
 * the inventory tab does so the two can never drift.
 */
export default function SparePartsPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <SparePartsInner />
    </Suspense>
  );
}

function SparePartsInner() {
  const { t } = useUi();
  const [tab, setTab] = useState<Tab>('catalog');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'dashboard', label: t('erp.inventory.dashboard') },
    { key: 'catalog', label: t('erp.parts.catalog') },
    { key: 'references', label: t('erp.parts.partNumbers') },
    { key: 'compatibility', label: t('erp.parts.compatibility') },
    { key: 'reservations', label: t('erp.parts.reservations') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="spare-parts-page">
      <TabDeepLink valid={TAB_KEYS} onSelect={(next) => setTab(next as Tab)} />
      <SectionHeader
        title={t('nav.spare_parts')}
        subtitle={t('erp.parts.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`parts-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? (
        <ModuleDashboard moduleKey="spare_parts" />
      ) : (
        // The route owns the tab bar (it also carries the dashboard tab), so the
        // shared workspace renders its body without a second, duplicate bar.
        <PartsWorkspace tab={tab} hideTabBar />
      )}
    </div>
  );
}
