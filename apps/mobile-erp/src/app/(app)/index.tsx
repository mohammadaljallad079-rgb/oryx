import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { api } from '../../lib/api';
import { useApp } from '../../lib/app-context';
import { useAsync } from '../../lib/use-async';
import { formatCount, formatMoney, formatQuantity } from '../../lib/format';
import { Card, Heading, MetricTile, Screen, SectionTitle, StateView, TableRow } from '../../components/ui';
import { space, typography } from '../../lib/theme';

interface SalesSummary {
  invoiceCount: number;
  totalSalesMinor: number;
  totalPaidMinor: number;
  totalOutstandingMinor: number;
}

interface InventorySummary {
  totalValueMinor: number;
  reorderAlerts: Array<{ sku: string; nameEn: string; nameAr: string; onHand: number; reorderLevel: number }>;
}

/**
 * Dashboard.
 *
 * The figures are the real trading numbers for the selected company and branch,
 * read from the permission-aware report endpoints — not the platform KPI block
 * (which counts companies and users and would be meaningless to a branch
 * operator). Each tile is scoped the same way the control plane scopes its own
 * report pages, so the two agree.
 *
 * A section is hidden when the signed-in user cannot read its report, and the
 * API would refuse the call regardless, so the hiding is a convenience only.
 */
export default function DashboardScreen() {
  const { user, companyId, branchId, branches, theme, t, locale, can } = useApp();
  const canSales = can('erp.sales.read');
  const canInventory = can('erp.inventory.read');

  const sales = useAsync<SalesSummary | null>(
    () => (canSales ? (api.reports.sales() as unknown as Promise<SalesSummary>) : Promise.resolve(null)),
    [companyId, branchId, canSales],
  );
  const inventory = useAsync<InventorySummary | null>(
    () =>
      canInventory
        ? (api.reports.inventory() as unknown as Promise<InventorySummary>)
        : Promise.resolve(null),
    [companyId, branchId, canInventory],
  );
  const customers = useAsync(
    () => (canSales ? api.count('/sales/customers') : Promise.resolve(0)),
    [companyId, branchId, canSales],
  );

  if ((sales.loading && !sales.data) || (inventory.loading && !inventory.data)) {
    return (
      <Screen scroll={false}>
        <StateView kind="loading" />
      </Screen>
    );
  }

  const currency = 'BHD';
  const branchName = branches.find((b) => b.id === branchId);
  const greeting = locale === 'ar' ? user?.fullNameAr : user?.fullNameEn;
  const salesData = sales.data;

  return (
    <Screen>
      <View style={{ marginBottom: space.md }}>
        <Heading>
          {t('welcome')}
          {greeting ? `، ${greeting}` : ''}
        </Heading>
        <Text style={{ color: theme.textMuted, fontSize: typography.label }}>
          {branchName ? (locale === 'ar' ? branchName.nameAr : branchName.nameEn) : t('allBranches')}
        </Text>
      </View>

      {canSales && salesData ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md }}>
          <MetricTile label={t('revenue')} value={formatMoney(salesData.totalSalesMinor, currency)} />
          <MetricTile label={t('invoices')} value={formatCount(salesData.invoiceCount)} />
          <MetricTile
            label={t('outstanding')}
            value={formatMoney(salesData.totalOutstandingMinor, currency)}
          />
          <MetricTile label={t('customers')} value={formatCount(customers.data ?? 0)} />
        </View>
      ) : null}

      {canInventory && inventory.data ? (
        <Card>
          <SectionTitle>{t('lowStock')}</SectionTitle>
          <TableRow
            label={t('total')}
            value={formatMoney(inventory.data.totalValueMinor, currency)}
            strong
            last={inventory.data.reorderAlerts.length === 0}
          />
          {inventory.data.reorderAlerts.slice(0, 5).map((alert, index, all) => (
            <TableRow
              key={alert.sku}
              label={locale === 'ar' ? alert.nameAr : alert.nameEn}
              value={`${formatQuantity(alert.onHand)} / ${formatQuantity(alert.reorderLevel)}`}
              valueColor={theme.warning}
              last={index === all.length - 1}
            />
          ))}
        </Card>
      ) : null}

      <Card onPress={() => router.push('/(app)/records')}>
        <Text style={{ color: theme.gold, fontWeight: '700' }}>{t('browse')} ›</Text>
      </Card>
    </Screen>
  );
}
