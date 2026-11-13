'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { toMinorInput, toQuantityInput } from '@/lib/erp-format';
import {
  Button,
  ErrorBanner,
  Field,
  Modal,
} from '@/components/ui';
import type { ErpAccountDto, LeadDto, ProductDto, SupplierDto, VehicleDto } from '@oryx/shared';

/**
 * The shared create/edit forms for the entities a form most often needs to add
 * without leaving the page: a supplier, a product, a warehouse, a vehicle, an
 * employee, a CRM lead and a chart-of-accounts account.
 *
 * Each is the same form the entity's own screen uses — the same fields, the
 * same validation and the same API call — so an inline "+ Add new" never
 * produces a partial record. They are rendered by `EntityPicker`'s
 * `renderCreate`, which reloads the option list and selects the new id.
 */

export function SupplierModal({
  open,
  supplier,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  supplier: SupplierDto | null;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: SupplierDto) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    phone: '',
    email: '',
    taxNumber: '',
    addressLine: '',
    city: '',
    paymentTermsDays: '30',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      code: supplier?.code ?? '',
      nameEn: supplier?.nameEn ?? '',
      nameAr: supplier?.nameAr ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      taxNumber: supplier?.taxNumber ?? '',
      addressLine: supplier?.addressLine ?? '',
      city: supplier?.city ?? '',
      paymentTermsDays: String(supplier?.paymentTermsDays ?? 30),
      notes: supplier?.notes ?? '',
    });
  }, [open, supplier]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        phone: form.phone || undefined,
        email: form.email || undefined,
        taxNumber: form.taxNumber || undefined,
        addressLine: form.addressLine || undefined,
        city: form.city || undefined,
        paymentTermsDays: Number(form.paymentTermsDays) || 0,
        notes: form.notes || undefined,
      };
      const saved = supplier
        ? await api.updateSupplier(supplier.id, body)
        : await api.createSupplier({ ...body, code: form.code });
      await onCreated();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={supplier ? t('erp.purchasing.editSupplier') : t('erp.purchasing.newSupplier')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.nameEn || !form.nameAr || (!supplier && !form.code)}
            onClick={submit}
            data-testid="save-supplier"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} disabled={Boolean(supplier)} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="supplier-code" />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="supplier-phone" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="supplier-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="supplier-name-ar" />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="supplier-email" />
        </Field>
        <Field label={t('erp.sales.taxNumber')}>
          <input className="oryx-input" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} data-testid="supplier-tax-number" />
        </Field>
        <Field label={t('common.address')}>
          <input className="oryx-input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} data-testid="supplier-address" />
        </Field>
        <Field label={t('common.city')}>
          <input className="oryx-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="supplier-city" />
        </Field>
        <Field label={t('erp.sales.paymentTerms')}>
          <input className="oryx-input" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} data-testid="supplier-payment-terms" />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="supplier-notes" />
        </Field>
      </div>
    </Modal>
  );
}

export function ProductModal({
  open,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: ProductDto) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sku: '', nameEn: '', nameAr: '', unit: 'unit', salesPrice: '0.00', costPrice: '0.00', taxRate: '15',
    barcode: '', category: '', reorderLevel: '0', reorderQuantity: '0', trackStock: true,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      sku: '', nameEn: '', nameAr: '', unit: 'unit', salesPrice: '0.00', costPrice: '0.00', taxRate: '15',
      barcode: '', category: '', reorderLevel: '0', reorderQuantity: '0', trackStock: true,
    });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createProduct({
        sku: form.sku,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        unit: form.unit,
        salesPriceMinor: toMinorInput(form.salesPrice),
        costPriceMinor: toMinorInput(form.costPrice),
        taxRateBp: Math.round(Number(form.taxRate) * 100),
        barcode: form.barcode || undefined,
        category: form.category || undefined,
        // The reorder level is stored scaled by 10^4, exactly like a quantity.
        reorderLevel: toQuantityInput(form.reorderLevel),
        reorderQuantity: toQuantityInput(form.reorderQuantity),
        trackStock: form.trackStock,
      });
      await onCreated();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.inventory.newProduct')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.sku || !form.nameEn || !form.nameAr} onClick={submit} data-testid="save-product">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.sku')} required>
          <input className="oryx-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} data-testid="product-sku" />
        </Field>
        <Field label={t('erp.inventory.unit')}>
          <input className="oryx-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="product-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="product-name-ar" />
        </Field>
        <Field label={t('erp.inventory.salesPrice')}>
          <input className="oryx-input" value={form.salesPrice} onChange={(e) => setForm({ ...form, salesPrice: e.target.value })} />
        </Field>
        <Field label={t('erp.inventory.costPrice')}>
          <input className="oryx-input" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
        </Field>
        <Field label={t('erp.inventory.taxRate')}>
          <input className="oryx-input" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
        </Field>
        <Field label={t('erp.inventory.barcode')}>
          <input className="oryx-input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} data-testid="product-barcode" />
        </Field>
        <Field label={t('erp.inventory.category')}>
          <input className="oryx-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="product-category" />
        </Field>
        <Field label={t('erp.inventory.reorderLevel')}>
          <input className="oryx-input" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} data-testid="product-reorder-level" />
        </Field>
        <Field label={t('erp.inventory.reorderQuantity')}>
          <input className="oryx-input" value={form.reorderQuantity} onChange={(e) => setForm({ ...form, reorderQuantity: e.target.value })} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold">
        <input
          type="checkbox"
          className="oryx-checkbox"
          checked={form.trackStock}
          onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
          data-testid="product-track-stock"
        />
        {t('erp.inventory.trackStock')}
      </label>
    </Modal>
  );
}

export function WarehouseModal({
  open,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: { id: string }) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ code: '', nameEn: '', nameAr: '' });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createWarehouse(form);
      await onCreated();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.inventory.newWarehouse')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.code || !form.nameEn || !form.nameAr} onClick={submit} data-testid="save-warehouse">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="warehouse-code" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="warehouse-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="warehouse-name-ar" />
        </Field>
      </div>
    </Modal>
  );
}

export function VehicleModal({
  open,
  customers,
  defaultCustomerId,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  customers: Array<{ id: string; code: string; nameEn: string; nameAr?: string }>;
  /** Preselected customer when the modal is opened from a customer-scoped form. */
  defaultCustomerId?: string;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: VehicleDto) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerId: '', vin: '', plateNumber: '', make: '', model: '', modelYear: '2024', mileage: '0', color: '', registrationExpiresAt: '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      customerId: defaultCustomerId ?? '',
      vin: '', plateNumber: '', make: '', model: '', modelYear: '2024', mileage: '0', color: '', registrationExpiresAt: '',
    });
  }, [open, defaultCustomerId]);

  // A VIN is 17 characters excluding I, O and Q. The server enforces this too;
  // checking here gives the operator an immediate, specific message.
  const vinValid = /^[A-HJ-NPR-Z0-9]{11,17}$/.test(form.vin.toUpperCase());

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createVehicle({
        customerId: form.customerId,
        vin: form.vin.toUpperCase(),
        plateNumber: form.plateNumber || undefined,
        make: form.make,
        model: form.model,
        modelYear: Number(form.modelYear),
        mileage: Number(form.mileage) || 0,
        color: form.color || undefined,
        registrationExpiresAt: form.registrationExpiresAt || undefined,
      });
      await onCreated();
      onSaved?.(created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.automotive.newVehicle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.customerId || !vinValid || !form.make || !form.model}
            onClick={submit}
            data-testid="save-vehicle"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.sales.customer')} required>
          <select className="oryx-select" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} data-testid="vehicle-customer">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.vin')} required hint={vinValid ? t('erp.automotive.vinHint') : t('erp.automotive.vinInvalid')}>
          <input className={`oryx-input${form.vin && !vinValid ? ' oryx-input--invalid' : ''}`} value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} maxLength={17} data-testid="vehicle-vin" />
        </Field>
        <Field label={t('erp.automotive.make')} required><input className="oryx-input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} data-testid="vehicle-make" /></Field>
        <Field label={t('erp.automotive.model')} required><input className="oryx-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="vehicle-model" /></Field>
        <Field label={t('erp.automotive.modelYear')} required><input className="oryx-input" value={form.modelYear} onChange={(e) => setForm({ ...form, modelYear: e.target.value })} data-testid="vehicle-year" /></Field>
        <Field label={t('erp.automotive.plate')}><input className="oryx-input" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} data-testid="vehicle-plate" /></Field>
        <Field label={t('erp.automotive.mileage')}><input className="oryx-input" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} data-testid="vehicle-mileage" /></Field>
        <Field label={t('erp.automotive.color')}><input className="oryx-input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} data-testid="vehicle-color" /></Field>
        <Field label={t('erp.automotive.registrationExpiresAt')}><input type="date" className="oryx-input" value={form.registrationExpiresAt} onChange={(e) => setForm({ ...form, registrationExpiresAt: e.target.value })} data-testid="vehicle-registration-expires" /></Field>
      </div>
    </Modal>
  );
}

export function EmployeeModal({
  open,
  departments,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  departments: Array<{ id: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: { id: string }) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '', fullNameEn: '', fullNameAr: '', email: '', phone: '', secondaryPhone: '',
    departmentId: '', hireDate: new Date().toISOString().slice(0, 10), addressLine: '', notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      code: '', fullNameEn: '', fullNameAr: '', email: '', phone: '', secondaryPhone: '',
      departmentId: '', hireDate: new Date().toISOString().slice(0, 10), addressLine: '', notes: '',
    });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createEmployee({
        code: form.code,
        fullNameEn: form.fullNameEn,
        fullNameAr: form.fullNameAr,
        email: form.email || undefined,
        phone: form.phone || undefined,
        secondaryPhone: form.secondaryPhone || undefined,
        departmentId: form.departmentId || undefined,
        addressLine: form.addressLine || undefined,
        notes: form.notes || undefined,
        hireDate: form.hireDate,
      });
      await onCreated();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.hr.newEmployee')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.fullNameEn || !form.fullNameAr || !form.code}
            onClick={submit}
            data-testid="save-employee"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="employee-code" />
        </Field>
        <Field label={t('erp.hr.department')}>
          <select className="oryx-select" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} data-testid="employee-department">
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}
          </select>
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} data-testid="employee-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} data-testid="employee-name-ar" />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="employee-email" />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="employee-phone" />
        </Field>
        <Field label={t('erp.hr.secondaryPhone')}>
          <input className="oryx-input" value={form.secondaryPhone} onChange={(e) => setForm({ ...form, secondaryPhone: e.target.value })} data-testid="employee-secondary-phone" />
        </Field>
        <Field label={t('erp.hr.hireDate')} required>
          <input type="date" className="oryx-input" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} data-testid="employee-hire-date" />
        </Field>
        <Field label={t('common.address')}>
          <input className="oryx-input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} data-testid="employee-address" />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="employee-notes" />
        </Field>
      </div>
    </Modal>
  );
}

export function LeadModal({
  open,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: LeadDto) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', contactName: '', email: '', phone: '', estimatedValue: '0.00', notes: '' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ code: '', nameEn: '', nameAr: '', contactName: '', email: '', phone: '', estimatedValue: '0.00', notes: '' });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createLead({
        code: form.code,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        estimatedValueMinor: toMinorInput(form.estimatedValue),
        notes: form.notes || undefined,
      });
      await onCreated();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.crm.newLead')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.nameEn || !form.nameAr || !form.code} onClick={submit} data-testid="save-lead">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="lead-code" />
        </Field>
        <Field label={t('erp.crm.contact')}>
          <input className="oryx-input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} data-testid="lead-contact" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="lead-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="lead-name-ar" />
        </Field>
        <Field label={t('erp.crm.estimatedValue')}>
          <input className="oryx-input" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} data-testid="lead-estimated-value" />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="lead-phone" />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="lead-email" />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="lead-notes" />
        </Field>
      </div>
    </Modal>
  );
}

export function AccountModal({
  open,
  parentAccounts,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  parentAccounts: ErpAccountDto[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: ErpAccountDto) => void;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '', nameEn: '', nameAr: '', type: 'ASSET', normalBalance: 'DEBIT', parentId: '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ code: '', nameEn: '', nameAr: '', type: 'ASSET', normalBalance: 'DEBIT', parentId: '' });
  }, [open]);

  // A new account is numbered automatically: whenever the type changes, ask the
  // API for the next free code in that type's block. The field stays editable,
  // so an operator may still type their own code.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const { code } = await api.nextAccountCode({ type: form.type });
        if (!cancelled) setForm((f) => ({ ...f, code }));
      } catch {
        /* leave the field for manual entry if the suggestion fails */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, form.type]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createAccount({
        code: form.code,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        type: form.type,
        normalBalance: form.normalBalance,
        parentId: form.parentId || undefined,
      });
      await onCreated();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.accounting.newAccount')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.nameEn || !form.nameAr || !form.code}
            onClick={submit}
            data-testid="save-account"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="account-code" />
        </Field>
        <Field label={t('erp.accounting.type')} required>
          <select
            className="oryx-select"
            value={form.type}
            onChange={(e) => {
              const type = e.target.value;
              // Follow the conventional balance so the operator rarely has to
              // change it: assets and expenses are debit, the rest credit.
              const normalBalance = type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
              setForm({ ...form, type, normalBalance });
            }}
            data-testid="account-type"
          >
            {(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map((x) => (
              <option key={x} value={x}>{t(`erp.accounting.typeValue.${x}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={t('erp.accounting.parentAccount')}>
          <select className="oryx-select" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} data-testid="account-parent">
            <option value="">{t('erp.accounting.noParent')}</option>
            {parentAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {locale === 'ar' ? a.nameAr : a.nameEn}</option>
            ))}
          </select>
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="account-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="account-name-ar" />
        </Field>
        <Field label={t('erp.accounting.normalBalance')}>
          <select className="oryx-select" value={form.normalBalance} onChange={(e) => setForm({ ...form, normalBalance: e.target.value })} data-testid="account-normal-balance">
            <option value="DEBIT">{t('erp.accounting.debit')}</option>
            <option value="CREDIT">{t('erp.accounting.credit')}</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
