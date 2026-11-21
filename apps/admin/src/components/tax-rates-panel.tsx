'use client';

import { useCallback, useEffect, useState } from 'react';
import { type TaxRateDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Badge, Button, ErrorBanner, Skeleton, TableShell } from '@/components/ui';
import { Icon } from '@/components/icons';
import { TaxModal } from '@/components/tax-modal';

/**
 * The tenant's tax list.
 *
 * Authoring needs `company.settings.update`; the panel is only rendered to a
 * principal that holds it (the settings page gates it), and every write is
 * re-checked server-side. A rate is entered as a whole percentage and stored in
 * basis points, so the boundary conversion happens once, here.
 */
export function TaxRatesPanel() {
  const { t, locale } = useUi();
  const { companyId, can } = useAuth();
  const canEdit = can('company.settings.update');

  const [items, setItems] = useState<TaxRateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaxRateDto | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.taxes({ companyId, includeInactive: 'true' });
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (tax: TaxRateDto) => {
    try {
      await api.setTaxActive(tax.id, !tax.isActive);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const remove = async (tax: TaxRateDto) => {
    if (!window.confirm(t('tax.confirmDelete'))) return;
    try {
      await api.deleteTax(tax.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="tax-rates-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="oryx-muted m-0 text-[12px]">{t('tax.hint')}</p>
        {canEdit ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            data-testid="new-tax"
          >
            <Icon name="plus" size={15} />
            {t('tax.new')}
          </Button>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onRetry={load} retryLabel={t('common.retry')} /> : null}

      {loading ? (
        <Skeleton height={90} />
      ) : items.length === 0 ? (
        <p className="oryx-faint m-0 text-[12.5px]">{t('tax.empty')}</p>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('tax.rate')}</th>
              <th>{t('tax.scope')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tax) => (
              <tr key={tax.id} data-testid={`tax-row-${tax.code}`}>
                <td className="font-mono text-[12px]">{tax.code}</td>
                <td className="text-[12.5px]">
                  {locale === 'ar' ? tax.nameAr : tax.nameEn}
                  {tax.isDefault ? (
                    <Badge tone="gold">{t('tax.default')}</Badge>
                  ) : null}
                </td>
                <td className="tabular-nums text-[12.5px] font-semibold">{tax.rateBp / 100}%</td>
                <td className="text-[12px]">{t(`tax.scope.${tax.scope}` as const)}</td>
                <td>
                  <Badge tone={tax.isActive ? 'success' : 'neutral'}>
                    {tax.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    {canEdit ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t('common.edit')} ${tax.code}`}
                          onClick={() => {
                            setEditing(tax);
                            setOpen(true);
                          }}
                          data-testid={`edit-tax-${tax.code}`}
                        >
                          <Icon name="edit" size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${tax.isActive ? t('common.deactivate') : t('common.activate')} ${tax.code}`}
                          onClick={() => void toggle(tax)}
                          data-testid={`toggle-tax-${tax.code}`}
                        >
                          <Icon name={tax.isActive ? 'close' : 'check'} size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t('common.delete')} ${tax.code}`}
                          onClick={() => void remove(tax)}
                          data-testid={`delete-tax-${tax.code}`}
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {companyId ? (
        <TaxModal
          open={open}
          companyId={companyId}
          tax={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
