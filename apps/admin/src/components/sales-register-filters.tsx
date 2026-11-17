'use client';

import { useUi } from '@/lib/ui-context';

export type SalesRegisterKind = 'invoices' | 'quotations' | 'returns' | 'pos';
export interface SalesRegisterFilterValues {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
  paymentState: string;
}
export const EMPTY_SALES_REGISTER_FILTERS: SalesRegisterFilterValues = {
  search: '', status: '', dateFrom: '', dateTo: '',
  minAmount: '', maxAmount: '', paymentState: '',
};

const STATES: Record<SalesRegisterKind, string[]> = {
  invoices: ['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'VOID'],
  quotations: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'],
  returns: ['DRAFT', 'POSTED', 'CANCELLED'],
  pos: ['COMPLETED', 'VOID'],
};

/**
 * Filter values stay controlled by the owning sales tab so each register can
 * query the API, not just hide the current page of results in the browser.
 */
export function SalesRegisterFilters({
  kind, value, onChange,
}: {
  kind: SalesRegisterKind;
  value: SalesRegisterFilterValues;
  onChange: (next: SalesRegisterFilterValues) => void;
}) {
  const { locale } = useUi();
  const ar = locale === 'ar';
  const set = (key: keyof SalesRegisterFilterValues, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] p-4 lg:grid-cols-4 xl:grid-cols-8"
      data-testid={`sales-filters-${kind}`}>
      <label className="col-span-2 flex flex-col gap-1 xl:col-span-2">
        <span className="oryx-label">{ar ? 'بحث باسم العميل أو رقم المستند' : 'Customer name or document number'}</span>
        <input className="oryx-input" value={value.search} onChange={e => set('search', e.target.value)}
          placeholder={ar ? 'ابحث...' : 'Search...'} data-testid={`${kind}-filter-search`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="oryx-label">{ar ? 'من تاريخ' : 'From date'}</span>
        <input type="date" className="oryx-input" value={value.dateFrom}
          onChange={e => set('dateFrom', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="oryx-label">{ar ? 'إلى تاريخ' : 'To date'}</span>
        <input type="date" className="oryx-input" value={value.dateTo}
          onChange={e => set('dateTo', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="oryx-label">{ar ? 'المبلغ من' : 'Amount from'}</span>
        <input type="number" min="0" step="0.001" className="oryx-input" value={value.minAmount}
          onChange={e => set('minAmount', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="oryx-label">{ar ? 'المبلغ إلى' : 'Amount to'}</span>
        <input type="number" min="0" step="0.001" className="oryx-input" value={value.maxAmount}
          onChange={e => set('maxAmount', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="oryx-label">{ar ? 'الحالة' : 'Status'}</span>
        <select className="oryx-select" value={value.status} onChange={e => set('status', e.target.value)}>
          <option value="">{ar ? 'كل الحالات' : 'All statuses'}</option>
          {STATES[kind].map(x => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}
        </select>
      </label>
      {kind === 'invoices' ? (
        <label className="flex flex-col gap-1">
          <span className="oryx-label">{ar ? 'الاستحقاق' : 'Receivable'}</span>
          <select className="oryx-select" value={value.paymentState}
            onChange={e => set('paymentState', e.target.value)}>
            <option value="">{ar ? 'الكل' : 'All'}</option>
            <option value="due">{ar ? 'مستحق' : 'Due'}</option>
            <option value="settled">{ar ? 'غير مستحق' : 'Settled'}</option>
          </select>
        </label>
      ) : null}
      <button type="button" className="oryx-btn oryx-btn--sm self-end"
        onClick={() => onChange({ ...EMPTY_SALES_REGISTER_FILTERS })}
        data-testid={`${kind}-clear-filters`}>
        {ar ? 'مسح الفلاتر' : 'Clear filters'}
      </button>
    </div>
  );
}

/** Inputs are major currency units; the existing API stores minor units. */
export function salesFilterQuery(value: SalesRegisterFilterValues) {
  const minor = (amount: string) => {
    const number = Number(amount);
    return amount.trim() !== '' && Number.isFinite(number) && number >= 0
      ? Math.round(number * 100) : undefined;
  };
  return {
    search: value.search.trim() || undefined,
    status: value.status || undefined,
    dateFrom: value.dateFrom || undefined,
    dateTo: value.dateTo || undefined,
    minAmountMinor: minor(value.minAmount),
    maxAmountMinor: minor(value.maxAmount),
    paymentState: value.paymentState === 'due' || value.paymentState === 'settled'
      ? value.paymentState : undefined,
  };
}
