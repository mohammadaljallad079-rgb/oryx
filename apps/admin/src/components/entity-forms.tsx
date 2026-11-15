'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { toMinorInput } from '@/lib/erp-format';
import { Button, ErrorBanner, Field, Modal } from '@/components/ui';
import { SearchableSelect, usePickerLabels, type PickerOption } from '@/components/searchable-select';
import type {
  DepartmentDto,
  EmployeeDto,
  ErpAccountDto,
  ProductDto,
  ProjectDto,
  SupplierDto,
  WarehouseDto,
} from '@oryx/shared';

/**
 * Reusable create forms for the records a picker can add in place.
 *
 * Each modal here is the *same* form the standalone page renders: a picker's
 * "add new" action mounts this component over the current form, the form posts
 * to the API through the module's own endpoint, and the created record is
 * handed back so the caller can select it. There is no second, cut-down copy of
 * a create form, so validation, permissions and the save path cannot diverge
 * between the page and the dropdown.
 */

interface FormModalProps {
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------- supplier

export function SupplierFormModal({
  open,
  onClose,
  onSaved,
}: FormModalProps & { onSaved: (supplier: SupplierDto) => void }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', phone: '', paymentTermsDays: '30' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ code: '', nameEn: '', nameAr: '', phone: '', paymentTermsDays: '30' });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createSupplier({
        code: form.code,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        phone: form.phone || undefined,
        paymentTermsDays: Number(form.paymentTermsDays) || 0,
      });
      onSaved(saved);
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
      title={t('erp.purchasing.newSupplier')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-supplier">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="supplier-code" />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="supplier-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="supplier-name-ar" />
        </Field>
        <Field label={t('erp.sales.paymentTerms')}>
          <input className="oryx-input" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- warehouse

export function WarehouseFormModal({
  open,
  onClose,
  onSaved,
}: FormModalProps & { onSaved: (warehouse: WarehouseDto) => void }) {
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
      onSaved(saved);
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
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-warehouse">
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

// ----------------------------------------------------------------- product

export function ProductFormModal({
  open,
  onClose,
  onSaved,
}: FormModalProps & { onSaved: (product: ProductDto) => void }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sku: '', nameEn: '', nameAr: '', unit: 'unit', salesPrice: '0.00', costPrice: '0.00', taxRate: '15',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ sku: '', nameEn: '', nameAr: '', unit: 'unit', salesPrice: '0.00', costPrice: '0.00', taxRate: '15' });
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
      });
      onSaved(saved);
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
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-product">
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
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- account

export function AccountFormModal({
  open,
  onClose,
  onSaved,
}: FormModalProps & { onSaved: (account: ErpAccountDto) => void }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', type: 'ASSET', normalBalance: 'DEBIT' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ code: '', nameEn: '', nameAr: '', type: 'ASSET', normalBalance: 'DEBIT' });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createAccount(form);
      onSaved(saved);
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
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-account">
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
          <select className="oryx-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
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
          <select className="oryx-select" value={form.normalBalance} onChange={(e) => setForm({ ...form, normalBalance: e.target.value })}>
            <option value="DEBIT">DEBIT</option>
            <option value="CREDIT">CREDIT</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- department

export function DepartmentFormModal({
  open,
  onClose,
  onSaved,
}: FormModalProps & { onSaved: (department: DepartmentDto) => void }) {
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
      const saved = await api.createDepartment(form);
      onSaved(saved);
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
      title={t('erp.hr.newDepartment')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-department">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="department-code" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="department-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="department-name-ar" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- employee

export function EmployeeFormModal({
  open,
  departments,
  onClose,
  onSaved,
}: FormModalProps & {
  departments: Array<{ id: string; nameEn: string }>;
  onSaved: (employee: EmployeeDto) => void;
}) {
  const { t } = useUi();
  const pickerLabels = usePickerLabels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    fullNameEn: '',
    fullNameAr: '',
    email: '',
    departmentId: '',
    hireDate: new Date().toISOString().slice(0, 10),
  });
  const [departmentOptions, setDepartmentOptions] = useState<PickerOption[]>([]);

  useEffect(() => {
    setDepartmentOptions(departments.map((d) => ({ id: d.id, label: d.nameEn })));
  }, [departments]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ code: '', fullNameEn: '', fullNameAr: '', email: '', departmentId: '', hireDate: new Date().toISOString().slice(0, 10) });
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
        departmentId: form.departmentId || undefined,
        hireDate: form.hireDate,
      });
      onSaved(saved);
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
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-employee">
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
          <SearchableSelect
            testId="employee-department"
            value={form.departmentId}
            onChange={(id) => setForm({ ...form, departmentId: id })}
            options={departmentOptions}
            placeholder={t('common.selectPlaceholder')}
            labels={pickerLabels}
            renderCreate={(props) => (
              <DepartmentFormModal
                open={props.open}
                onClose={props.onClose}
                onSaved={(d) => {
                  setDepartmentOptions((prev) => [...prev, { id: d.id, label: d.nameEn }]);
                  props.onCreated({ id: d.id, label: d.nameEn });
                }}
              />
            )}
          />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} data-testid="employee-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} data-testid="employee-name-ar" />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={t('erp.hr.hireDate')} required>
          <input type="date" className="oryx-input" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- project

export function ProjectFormModal({
  open,
  onClose,
  onSaved,
}: FormModalProps & { onSaved: (project: ProjectDto) => void }) {
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
      const saved = await api.createOperationsProject(form);
      onSaved(saved);
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
      title={t('erp.operations.newProject')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-project">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="project-code" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="project-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="project-name-ar" />
        </Field>
      </div>
    </Modal>
  );
}
