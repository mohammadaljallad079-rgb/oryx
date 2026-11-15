'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { toMinorInput } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { Button, ErrorBanner, Field, Modal } from '@/components/ui';
import { DocumentsPanel } from '@/components/documents-panel';
import type { CustomerBranchDto, CustomerDto, CustomerTypeDto } from '@oryx/shared';

type Tab = 'identity' | 'commercial' | 'branches' | 'documents';

interface BranchDraft {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  countryCode: string;
  isHeadOffice: boolean;
}

const emptyBranch = (headOffice = false): BranchDraft => ({
  name: '',
  contactName: '',
  phone: '',
  email: '',
  addressLine: '',
  city: '',
  countryCode: '',
  isHeadOffice: headOffice,
});

interface CustomerFormState {
  code: string;
  nameEn: string;
  nameAr: string;
  email: string;
  phone: string;
  nationalId: string;
  crNumber: string;
  crExpiresAt: string;
  taxNumber: string;
  website: string;
  contactPersonName: string;
  contactPersonPhone: string;
  contactPersonEmail: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  creditLimit: string;
  paymentTermsDays: string;
  currency: string;
  notes: string;
}

function fromCustomer(c: CustomerDto | null, type: CustomerTypeDto): CustomerFormState {
  return {
    code: c?.code ?? '',
    nameEn: c?.nameEn ?? '',
    nameAr: c?.nameAr ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    nationalId: c?.nationalId ?? '',
    crNumber: c?.crNumber ?? '',
    crExpiresAt: c?.crExpiresAt ? c.crExpiresAt.slice(0, 10) : '',
    taxNumber: c?.taxNumber ?? '',
    website: c?.website ?? '',
    contactPersonName: c?.contactPersonName ?? '',
    contactPersonPhone: c?.contactPersonPhone ?? '',
    contactPersonEmail: c?.contactPersonEmail ?? '',
    addressLine: c?.addressLine ?? '',
    city: c?.city ?? '',
    state: c?.state ?? '',
    postalCode: c?.postalCode ?? '',
    countryCode: c?.countryCode ?? 'SA',
    creditLimit: c ? (c.creditLimitMinor / 100).toFixed(2) : '0.00',
    paymentTermsDays: c ? String(c.paymentTermsDays) : '30',
    currency: c?.currency ?? 'SAR',
    notes: c?.notes ?? '',
  };
  void type;
}

function fromBranches(branches: CustomerBranchDto[] | undefined): BranchDraft[] {
  if (!branches?.length) return [];
  return branches.map((b) => ({
    name: b.name,
    contactName: b.contactName ?? '',
    phone: b.phone ?? '',
    email: b.email ?? '',
    addressLine: b.addressLine ?? '',
    city: b.city ?? '',
    countryCode: b.countryCode ?? '',
    isHeadOffice: b.isHeadOffice,
  }));
}

/**
 * The full customer form, used both by the customers page and by the
 * quick-create modal in any dropdown.
 *
 * There is one form: the modal a picker opens renders this same component, so a
 * customer created from inside a maintenance order is created with exactly the
 * fields, validation and permissions the standalone page uses. An individual
 * and a company get different field sets, chosen by `type`.
 */
export function CustomerFormModal({
  open,
  type,
  customerId,
  onClose,
  onSaved,
}: {
  open: boolean;
  type: CustomerTypeDto;
  /** When set, the form loads and updates that customer instead of creating. */
  customerId?: string | null;
  onClose: () => void;
  onSaved: (customer: CustomerDto) => void;
}) {
  const { t } = useUi();
  const isCompany = type === 'COMPANY';
  const [tab, setTab] = useState<Tab>('identity');
  const [form, setForm] = useState<CustomerFormState>(() => fromCustomer(null, type));
  const [branches, setBranches] = useState<BranchDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(customerId ?? null);

  useEffect(() => {
    if (!open) return;
    setTab('identity');
    setError(null);
    if (!customerId) {
      setForm(fromCustomer(null, type));
      setBranches(isCompany ? [emptyBranch(true)] : []);
      setExistingId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api
      .customer(customerId)
      .then((c) => {
        if (cancelled) return;
        setForm(fromCustomer(c, type));
        setBranches(fromBranches(c.branches));
        setExistingId(c.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId, type]);

  const payload = useMemo(
    () => ({
      code: form.code,
      type,
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      email: form.email || undefined,
      phone: form.phone || undefined,
      nationalId: form.nationalId || undefined,
      crNumber: form.crNumber || undefined,
      crExpiresAt: form.crExpiresAt || undefined,
      taxNumber: form.taxNumber || undefined,
      website: form.website || undefined,
      contactPersonName: form.contactPersonName || undefined,
      contactPersonPhone: form.contactPersonPhone || undefined,
      contactPersonEmail: form.contactPersonEmail || undefined,
      addressLine: form.addressLine || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      postalCode: form.postalCode || undefined,
      countryCode: form.countryCode || undefined,
      creditLimitMinor: toMinorInput(form.creditLimit),
      paymentTermsDays: Number(form.paymentTermsDays) || 0,
      currency: form.currency || undefined,
      notes: form.notes || undefined,
      branches: branches.map((b) => ({
        name: b.name,
        contactName: b.contactName || undefined,
        phone: b.phone || undefined,
        email: b.email || undefined,
        addressLine: b.addressLine || undefined,
        city: b.city || undefined,
        countryCode: b.countryCode || undefined,
        isHeadOffice: b.isHeadOffice,
      })),
    }),
    [form, branches, type],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = existingId
        ? await api.updateCustomer(existingId, payload)
        : await api.createCustomer(payload);
      onSaved(saved as CustomerDto);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'identity', label: t('customers.tab.identity') },
    ...(isCompany ? [{ key: 'commercial' as Tab, label: t('customers.tab.commercial') }] : []),
    ...(isCompany ? [{ key: 'branches' as Tab, label: t('customers.tab.branches') }] : []),
    ...(existingId ? [{ key: 'documents' as Tab, label: t('customers.tab.documents') }] : []),
  ];

  return (
    <Modal
      open={open}
      title={existingId ? t('customers.edit') : isCompany ? t('customers.newCompany') : t('customers.newIndividual')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || loading || !form.code || !form.nameEn || !form.nameAr}
            onClick={submit}
            data-testid="save-customer"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <div className="mb-3"><ErrorBanner message={error} /></div> : null}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`customer-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'identity' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.code')} required>
            <input
              className="oryx-input"
              value={form.code}
              disabled={!!existingId}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              data-testid="customer-code"
            />
          </Field>
          <Field label={t('erp.sales.phone')}>
            <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="customer-phone" />
          </Field>
          <Field label={`${t('common.name')} (EN)`} required>
            <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="customer-name-en" />
          </Field>
          <Field label={`${t('common.name')} (AR)`} required>
            <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="customer-name-ar" />
          </Field>
          <Field label={t('auth.email')}>
            <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="customer-email" />
          </Field>
          {!isCompany ? (
            <Field label={t('customers.nationalId')}>
              <input className="oryx-input" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} data-testid="customer-national-id" />
            </Field>
          ) : null}
          <Field label={t('customers.address')}>
            <input className="oryx-input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
          </Field>
          <Field label={t('common.city')}>
            <input className="oryx-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label={t('customers.state')}>
            <input className="oryx-input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </Field>
          <Field label={t('customers.postalCode')}>
            <input className="oryx-input" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
          </Field>
          <Field label={t('customers.country')}>
            <input className="oryx-input" value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })} />
          </Field>
          {isCompany ? (
            <Field label={t('customers.website')}>
              <input className="oryx-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </Field>
          ) : null}
        </div>
      ) : null}

      {tab === 'commercial' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('customers.crNumber')}>
            <input className="oryx-input" value={form.crNumber} onChange={(e) => setForm({ ...form, crNumber: e.target.value })} data-testid="customer-cr-number" />
          </Field>
          <Field label={t('customers.crExpiresAt')}>
            <input type="date" className="oryx-input" value={form.crExpiresAt} onChange={(e) => setForm({ ...form, crExpiresAt: e.target.value })} />
          </Field>
          <Field label={t('customers.taxNumber')}>
            <input className="oryx-input" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} data-testid="customer-tax-number" />
          </Field>
          <Field label={t('customers.contactPerson')}>
            <input className="oryx-input" value={form.contactPersonName} onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })} />
          </Field>
          <Field label={t('customers.contactPersonPhone')}>
            <input className="oryx-input" value={form.contactPersonPhone} onChange={(e) => setForm({ ...form, contactPersonPhone: e.target.value })} />
          </Field>
          <Field label={t('customers.contactPersonEmail')}>
            <input className="oryx-input" value={form.contactPersonEmail} onChange={(e) => setForm({ ...form, contactPersonEmail: e.target.value })} />
          </Field>
          <Field label={t('customers.creditLimit')}>
            <input className="oryx-input" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
          </Field>
          <Field label={t('customers.paymentTerms')}>
            <input className="oryx-input" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
          </Field>
          <Field label={t('customers.currency')}>
            <input className="oryx-input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </Field>
          <Field label={t('customers.notes')}>
            <textarea className="oryx-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      ) : null}

      {tab === 'branches' ? (
        <div className="flex flex-col gap-3">
          {branches.length === 0 ? (
            <p className="oryx-muted m-0 text-[12.5px]">{t('customers.branchesEmpty')}</p>
          ) : null}
          {branches.map((b, index) => (
            <div key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2" style={{ borderColor: 'var(--border)' }}>
              <Field label={t('customers.branch.name')} required>
                <input className="oryx-input" value={b.name} onChange={(e) => setBranches(branches.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))} />
              </Field>
              <Field label={t('customers.branch.contact')}>
                <input className="oryx-input" value={b.contactName} onChange={(e) => setBranches(branches.map((x, i) => (i === index ? { ...x, contactName: e.target.value } : x)))} />
              </Field>
              <Field label={t('erp.sales.phone')}>
                <input className="oryx-input" value={b.phone} onChange={(e) => setBranches(branches.map((x, i) => (i === index ? { ...x, phone: e.target.value } : x)))} />
              </Field>
              <Field label={t('common.city')}>
                <input className="oryx-input" value={b.city} onChange={(e) => setBranches(branches.map((x, i) => (i === index ? { ...x, city: e.target.value } : x)))} />
              </Field>
              <Field label={t('customers.address')}>
                <input className="oryx-input" value={b.addressLine} onChange={(e) => setBranches(branches.map((x, i) => (i === index ? { ...x, addressLine: e.target.value } : x)))} />
              </Field>
              <Field label={t('customers.branch.headOffice')}>
                <select
                  className="oryx-select"
                  value={b.isHeadOffice ? 'yes' : 'no'}
                  onChange={(e) => setBranches(branches.map((x, i) => (i === index ? { ...x, isHeadOffice: e.target.value === 'yes' } : x)))}
                >
                  <option value="yes">{t('common.yes')}</option>
                  <option value="no">{t('common.no')}</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Button size="sm" variant="danger" onClick={() => setBranches(branches.filter((_, i) => i !== index))}>
                  {t('settings.list.remove')}
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" onClick={() => setBranches([...branches, emptyBranch(branches.length === 0)])} data-testid="customer-add-branch">
              <Icon name="plus" size={15} />
              {t('customers.branch.add')}
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'documents' && existingId ? (
        <DocumentsPanel entityType="CUSTOMER" entityId={existingId} canUpload canDelete title={t('customers.tab.documents')} />
      ) : null}
    </Modal>
  );
}
