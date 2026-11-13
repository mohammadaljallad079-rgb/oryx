'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, EmptyState, ErrorBanner, SectionHeader, Skeleton, TableShell } from '@/components/ui';
import { CustomerFormModal } from '@/components/customer-form';
import type { CustomerDto, CustomerTypeDto } from '@oryx/shared';

type Tab = 'all' | 'individuals' | 'companies';

/**
 * Customers and companies.
 *
 * One page lists every customer and splits them into the two types the business
 * uses: an individual and a company. Each type opens its own form (see
 * `CustomerFormModal`), so the fields collected match the type — a company's
 * commercial registration and tax numbers are not shown for an individual.
 */
export default function CustomersPage() {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ type: CustomerTypeDto; id: string | null } | null>(null);

  const typeFilter: CustomerTypeDto | undefined =
    tab === 'individuals' ? 'INDIVIDUAL' : tab === 'companies' ? 'COMPANY' : undefined;
  const list = useAsync(
    () => api.salesCustomers({ search: search || undefined, type: typeFilter }),
    [search, typeFilter],
  );
  const canManage = can('erp.sales.customer.manage');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'all', label: t('customers.tab.all') },
    { key: 'individuals', label: t('customers.tab.individuals') },
    { key: 'companies', label: t('customers.tab.companies') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="customers-page">
      <SectionHeader
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setEditing({ type: 'INDIVIDUAL', id: null })} data-testid="new-individual">
                <Icon name="plus" size={15} />
                {t('customers.newIndividual')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => setEditing({ type: 'COMPANY', id: null })} data-testid="new-company">
                <Icon name="plus" size={15} />
                {t('customers.newCompany')}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="tablist">
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={tab === x.key}
              className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
              onClick={() => setTab(x.key)}
              data-testid={`customers-tab-${x.key}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="customer-search" />
        </label>
      </div>

      <Card>
        {list.error ? (
          <div className="p-4">
            <ErrorBanner message={list.error} onRetry={list.reload} />
          </div>
        ) : null}
        {list.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={34} />
            ))}
          </div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title={t('common.empty')}
            hint={tab === 'companies' ? t('customers.emptyCompanies') : t('customers.emptyIndividuals')}
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{t('customers.type')}</th>
                <th>{t('erp.sales.phone')}</th>
                <th>{t('customers.creditLimit')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.items.map((c: CustomerDto) => (
                <tr key={c.id} data-testid={`customer-row-${c.code}`}>
                  <td className="font-mono text-[12px]">{c.code}</td>
                  <td>
                    <span className="block font-semibold">{locale === 'ar' ? c.nameAr : c.nameEn}</span>
                    <span className="oryx-faint block text-[11px]">{locale === 'ar' ? c.nameEn : c.nameAr}</span>
                  </td>
                  <td>
                    <Badge tone={c.type === 'COMPANY' ? 'gold' : 'info'}>{t(`customers.type.${c.type}`)}</Badge>
                  </td>
                  <td className="text-[12.5px]">{c.phone ?? '—'}</td>
                  <td className="tabular-nums text-[12.5px]">{money(c.creditLimitMinor, c.currency)}</td>
                  <td>
                    {canManage ? (
                      <Button
                        size="sm"
                        onClick={() => setEditing({ type: c.type, id: c.id })}
                        data-testid={`edit-customer-${c.code}`}
                      >
                        {t('common.edit')}
                      </Button>
                    ) : (
                      <span className="oryx-faint text-[12px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {editing ? (
        <CustomerFormModal
          open
          type={editing.type}
          customerId={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => void list.reload()}
        />
      ) : null}
    </div>
  );
}
