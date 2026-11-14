'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { minorToInput, toMinorInput } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { CatalogModal, EntityPicker, type EntityOption } from '@/components/inline-create';
import {
  Button,
  ErrorBanner,
  Field,
  Modal,
} from '@/components/ui';
import type { CustomerDto } from '@oryx/shared';

export interface CustomerFormState {
  code: string;
  kind: 'INDIVIDUAL' | 'COMPANY';
  nameEn: string;
  nameAr: string;
  email: string;
  phone: string;
  taxNumber: string;
  nationalId: string;
  crNumber: string;
  crExpiryDate: string;
  website: string;
  contactPersonName: string;
  contactPersonPhone: string;
  addressLine: string;
  city: string;
  countryCode: string;
  sourceId: string | null;
  departmentId: string | null;
  creditLimit: string;
  paymentTermsDays: string;
  notes: string;
}

const EMPTY: CustomerFormState = {
  code: '',
  kind: 'INDIVIDUAL',
  nameEn: '',
  nameAr: '',
  email: '',
  phone: '',
  taxNumber: '',
  nationalId: '',
  crNumber: '',
  crExpiryDate: '',
  website: '',
  contactPersonName: '',
  contactPersonPhone: '',
  addressLine: '',
  city: '',
  countryCode: '',
  sourceId: null,
  departmentId: null,
  creditLimit: '0.000',
  paymentTermsDays: '30',
  notes: '',
};

/**
 * The single customer create/edit form.
 *
 * Every screen that captures a customer — the sales customer list, the invoice
 * and quotation forms, maintenance, POS — renders this one component, so the
 * fields, validation and the API call are identical wherever a customer is
 * created. It is used both as a standalone screen modal and, via `EntityPicker`
 * and `InlineCreateCustomer`, as the popup behind a dropdown's "+ Add new".
 */
export function CustomerModal({
  open,
  customer,
  sourceOptions = [],
  departmentOptions = [],
  onClose,
  onCreated,
  onSaved,
  onCreatedSource,
  onCreatedDepartment,
}: {
  open: boolean;
  customer: CustomerDto | null;
  sourceOptions?: EntityOption[];
  departmentOptions?: EntityOption[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  /** Receives the saved record so an inline picker can select it. */
  onSaved?: (saved: CustomerDto) => void;
  onCreatedSource?: () => Promise<void> | void;
  onCreatedDepartment?: () => Promise<void> | void;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      code: customer?.code ?? '',
      kind: customer?.kind ?? 'INDIVIDUAL',
      nameEn: customer?.nameEn ?? '',
      nameAr: customer?.nameAr ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      taxNumber: customer?.taxNumber ?? '',
      nationalId: customer?.nationalId ?? '',
      crNumber: customer?.crNumber ?? '',
      crExpiryDate: customer?.crExpiryDate ? customer.crExpiryDate.slice(0, 10) : '',
      website: customer?.website ?? '',
      contactPersonName: customer?.contactPersonName ?? '',
      contactPersonPhone: customer?.contactPersonPhone ?? '',
      addressLine: customer?.addressLine ?? '',
      city: customer?.city ?? '',
      countryCode: customer?.countryCode ?? '',
      sourceId: customer?.sourceId ?? null,
      departmentId: customer?.departmentId ?? null,
      creditLimit: minorToInput(customer?.creditLimitMinor ?? 0, customer?.currency),
      paymentTermsDays: String(customer?.paymentTermsDays ?? 30),
      notes: customer?.notes ?? '',
    });
  }, [open, customer]);

  const submit = async (): Promise<CustomerDto | null> => {
    setBusy(true);
    setError(null);
    try {
      if (!form.nameEn.trim() && !form.nameAr.trim()) {
        setError(t('erp.sales.nameRequired'));
        return null;
      }
      const body: Record<string, unknown> = {
        kind: form.kind,
        ...(form.nameEn.trim() ? { nameEn: form.nameEn.trim() } : {}),
        ...(form.nameAr.trim() ? { nameAr: form.nameAr.trim() } : {}),
        email: form.email || undefined,
        phone: form.phone || undefined,
        taxNumber: form.taxNumber || undefined,
        nationalId: form.kind === 'INDIVIDUAL' ? form.nationalId || undefined : undefined,
        crNumber: form.kind === 'COMPANY' ? form.crNumber || undefined : undefined,
        crExpiryDate: form.kind === 'COMPANY' && form.crExpiryDate ? form.crExpiryDate : undefined,
        website: form.kind === 'COMPANY' ? form.website || undefined : undefined,
        contactPersonName: form.kind === 'COMPANY' ? form.contactPersonName || undefined : undefined,
        contactPersonPhone: form.kind === 'COMPANY' ? form.contactPersonPhone || undefined : undefined,
        addressLine: form.addressLine || undefined,
        city: form.city || undefined,
        countryCode: form.countryCode || undefined,
        sourceId: form.sourceId ?? undefined,
        departmentId: form.departmentId ?? undefined,
        creditLimitMinor: toMinorInput(form.creditLimit, customer?.currency),
        paymentTermsDays: Number(form.paymentTermsDays) || 0,
        notes: form.notes || undefined,
      };
      const saved = customer
        ? await api.updateCustomer(customer.id, body)
        : await api.createCustomer({ ...body, code: form.code });
      await onCreated();
      onSaved?.(saved);
      onClose();
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={customer ? t('erp.sales.customerEdit') : t('erp.sales.newCustomer')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()} data-testid="save-customer">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="mb-4" role="tablist" aria-label={t('erp.sales.customerType')}>
        <div className="flex gap-2">
          {(['INDIVIDUAL', 'COMPANY'] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={form.kind === k ? 'primary' : 'default'}
              onClick={() => setForm({ ...form, kind: k })}
              data-testid={`customer-kind-${k.toLowerCase()}`}
            >
              <Icon name={k === 'COMPANY' ? 'building' : 'users'} size={15} />
              {k === 'COMPANY' ? t('erp.sales.customerKindCompany') : t('erp.sales.customerKindIndividual')}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input
            className="oryx-input"
            value={form.code}
            disabled={Boolean(customer)}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            data-testid="customer-code"
          />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={`${t('common.name')} (EN)`} hint={t('erp.sales.nameOptionalHint')}>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="customer-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} hint={t('erp.sales.nameOptionalHint')}>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="customer-name-ar" />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="customer-email" />
        </Field>
        <Field label={t('erp.sales.taxNumber')}>
          <input className="oryx-input" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
        </Field>
        <Field label={t('common.address')}>
          <input className="oryx-input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
        </Field>
        <Field label={t('common.city')}>
          <input className="oryx-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label={t('common.country')} hint={t('erp.sales.countryHint')}>
          <input
            className="oryx-input"
            value={form.countryCode}
            maxLength={2}
            placeholder="BH"
            onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
            data-testid="customer-country"
          />
        </Field>
        {form.kind === 'INDIVIDUAL' ? (
          <Field label={t('erp.sales.nationalId')} hint={t('erp.sales.nationalIdHint')}>
            <input
              className="oryx-input"
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
              data-testid="customer-national-id"
            />
          </Field>
        ) : (
          <>
            <Field label={t('erp.sales.crNumber')}>
              <input
                className="oryx-input"
                value={form.crNumber}
                onChange={(e) => setForm({ ...form, crNumber: e.target.value })}
                data-testid="customer-cr-number"
              />
            </Field>
            <Field label={t('erp.sales.crExpiry')}>
              <input
                className="oryx-input"
                type="date"
                value={form.crExpiryDate}
                onChange={(e) => setForm({ ...form, crExpiryDate: e.target.value })}
                data-testid="customer-cr-expiry"
              />
            </Field>
            <Field label={t('erp.sales.website')}>
              <input
                className="oryx-input"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                data-testid="customer-website"
              />
            </Field>
            <Field label={t('erp.sales.contactPerson')}>
              <input
                className="oryx-input"
                value={form.contactPersonName}
                onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })}
                data-testid="customer-contact-person"
              />
            </Field>
            <Field label={t('erp.sales.contactPersonPhone')}>
              <input
                className="oryx-input"
                value={form.contactPersonPhone}
                onChange={(e) => setForm({ ...form, contactPersonPhone: e.target.value })}
                data-testid="customer-contact-person-phone"
              />
            </Field>
          </>
        )}
        <Field label={t('erp.sales.customerSource')} hint={t('erp.sales.customerSourceHint')}>
          <EntityPicker
            value={form.sourceId}
            options={sourceOptions}
            onChange={(v) => setForm((f) => ({ ...f, sourceId: v }))}
            placeholder={t('common.select')}
            emptyLabel={t('common.none')}
            testId="customer-source"
            createLabel={t('erp.sales.customerSource')}
            reloadOptions={onCreatedSource}
            renderCreate={({ onClose, onSaved }) => (
              <CatalogModal
                open
                label={t('erp.sales.customerSource')}
                onClose={onClose}
                onCreate={(code, nameEn, nameAr) => api.createLeadSource({ code, nameEn, nameAr })}
                onSaved={onSaved}
              />
            )}
          />
        </Field>
        <Field label={t('erp.sales.customerDepartment')} hint={t('erp.sales.customerDepartmentHint')}>
          <EntityPicker
            value={form.departmentId}
            options={departmentOptions}
            onChange={(v) => setForm((f) => ({ ...f, departmentId: v }))}
            placeholder={t('common.select')}
            emptyLabel={t('common.none')}
            testId="customer-department"
            createLabel={t('erp.sales.customerDepartment')}
            reloadOptions={onCreatedDepartment}
            renderCreate={({ onClose, onSaved }) => (
              <CatalogModal
                open
                label={t('erp.sales.customerDepartment')}
                onClose={onClose}
                onCreate={(code, nameEn, nameAr) => api.createDepartment({ code, nameEn, nameAr })}
                onSaved={onSaved}
              />
            )}
          />
        </Field>
        <Field label={t('erp.sales.creditLimit')}>
          <input className="oryx-input" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
        </Field>
        <Field label={t('erp.sales.paymentTerms')}>
          <input className="oryx-input" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('common.notes')}>
            <textarea className="oryx-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>
      <p className="oryx-faint m-0 mt-3 text-[11px]">{locale === 'ar' ? 'يُسمح باسم واحد على الأقل.' : 'At least one name is required.'}</p>
    </Modal>
  );
}
