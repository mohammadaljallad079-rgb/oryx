'use client';

import { useState } from 'react';
import { DEFAULT_COMPANY_PAYMENT_METHODS, type CompanyPaymentMethodSetting } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { Button } from '@/components/ui';

const ACCOUNTING_METHODS = [
  'CASH', 'CARD', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'OTHER', 'CREDIT',
] as const;

export function PaymentMethodsEditor({
  value, canEdit, onChange,
}: {
  value: CompanyPaymentMethodSetting[] | undefined;
  canEdit: boolean;
  onChange: (next: CompanyPaymentMethodSetting[]) => void;
}) {
  const { locale } = useUi();
  const ar = locale === 'ar';
  const methods = value ?? DEFAULT_COMPANY_PAYMENT_METHODS;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CompanyPaymentMethodSetting>({
    code: '', nameEn: '', nameAr: '', accountingMethod: 'OTHER',
    isActive: true, useInInvoices: true, useInPos: true,
  });
  const patch = (index: number, part: Partial<CompanyPaymentMethodSetting>) =>
    onChange(methods.map((method, i) => i === index ? { ...method, ...part } : method));
  const add = () => {
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)
      || !draft.nameEn.trim() || !draft.nameAr.trim()
      || methods.some(m => m.code === code)) return;
    onChange([...methods, { ...draft, code, nameEn: draft.nameEn.trim(), nameAr: draft.nameAr.trim() }]);
    setAdding(false);
    setDraft({
      code: '', nameEn: '', nameAr: '', accountingMethod: 'OTHER',
      isActive: true, useInInvoices: true, useInPos: true,
    });
  };
  return (
    <section className="mt-4 rounded-lg border border-[var(--border)] p-3"
      data-testid="company-payment-methods">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {ar ? 'طرق الدفع' : 'Payment methods'}
          </h3>
          <p className="text-xs text-[var(--muted)]">
            {ar ? 'يمكن تعديل اسم طريقة الدفع بالعربية والإنجليزية مباشرة، ثم الضغط على حفظ إعدادات المبيعات. الكود ثابت لحماية الربط بالفواتير.' :
              'Edit payment names in Arabic and English, then save Sales settings. Codes stay fixed to preserve invoice references.'}
          </p>
        </div>
        {canEdit ? <Button size="sm" onClick={() => setAdding(true)}
          data-testid="payment-method-add">{ar ? 'إضافة طريقة دفع' : 'Add payment method'}</Button> : null}
      </div>
      <div className="flex flex-col gap-2">
        {methods.map((method, i) => (
          <div key={method.code} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 md:grid-cols-12"
            data-testid={`payment-method-${method.code}`}>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="oryx-label">{ar ? 'الكود' : 'Code'}</span>
              <input className="oryx-input font-mono" value={method.code} disabled />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="oryx-label">{ar ? 'الاسم بالعربية' : 'Arabic name'}</span>
              <input className="oryx-input" value={method.nameAr} disabled={!canEdit}
                onChange={e => patch(i, { nameAr: e.target.value })} data-testid={`payment-method-name-ar-${method.code}`} />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="oryx-label">{ar ? 'الاسم بالإنجليزية' : 'English name'}</span>
              <input className="oryx-input" value={method.nameEn} disabled={!canEdit}
                onChange={e => patch(i, { nameEn: e.target.value })} data-testid={`payment-method-name-en-${method.code}`} />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="oryx-label">{ar ? 'التسوية' : 'Settlement'}</span>
              <select className="oryx-select" value={method.accountingMethod} disabled={!canEdit}
                onChange={e => patch(i, { accountingMethod: e.target.value as CompanyPaymentMethodSetting['accountingMethod'],
                  useInPos: e.target.value === 'CREDIT' ? false : method.useInPos })}>
                {ACCOUNTING_METHODS.map(m => <option key={m} value={m}>{m.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 md:col-span-3">
              {([
                ['isActive', ar ? 'مفعّلة' : 'Active'],
                ['useInInvoices', ar ? 'الفواتير' : 'Invoices'],
                ['useInPos', ar ? 'نقاط البيع' : 'POS'],
              ] as const).map(([field, label]) => (
                <label className="flex items-center gap-1 text-xs" key={field}>
                  <input type="checkbox" className="oryx-checkbox" checked={method[field]}
                    disabled={!canEdit || (field === 'useInPos' && method.accountingMethod === 'CREDIT')}
                    onChange={e => patch(i, { [field]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            {canEdit ? <div className="flex items-end md:col-span-1">
              <Button size="sm" variant="danger" onClick={() => {
                if (window.confirm(ar ? 'حذف طريقة الدفع من الإعدادات؟' : 'Remove this method from settings?')) {
                  onChange(methods.filter((_, index) => i !== index));
                }
              }} data-testid={`payment-method-remove-${method.code}`}>
                {ar ? 'حذف' : 'Delete'}
              </Button>
            </div> : null}
          </div>
        ))}
      </div>
      {adding && canEdit ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-4"
          data-testid="payment-method-create-form">
          <label className="flex flex-col gap-1">
            <span className="oryx-label">{ar ? 'كود فريد' : 'Unique code'}</span>
            <input className="oryx-input font-mono" value={draft.code}
              onChange={e => setDraft(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="oryx-label">{ar ? 'الاسم بالعربية' : 'Arabic name'}</span>
            <input className="oryx-input" value={draft.nameAr}
              onChange={e => setDraft(prev => ({ ...prev, nameAr: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="oryx-label">{ar ? 'الاسم بالإنجليزية' : 'English name'}</span>
            <input className="oryx-input" value={draft.nameEn}
              onChange={e => setDraft(prev => ({ ...prev, nameEn: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="oryx-label">{ar ? 'التسوية المحاسبية' : 'Settlement'}</span>
            <select className="oryx-select" value={draft.accountingMethod}
              onChange={e => setDraft(prev => ({
                ...prev, accountingMethod: e.target.value as CompanyPaymentMethodSetting['accountingMethod'],
                useInPos: e.target.value === 'CREDIT' ? false : prev.useInPos,
              }))}>
              {ACCOUNTING_METHODS.map(m => <option key={m} value={m}>{m.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <Button variant="primary" size="sm" onClick={add}>{ar ? 'إضافة' : 'Add'}</Button>
            <Button size="sm" onClick={() => setAdding(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
