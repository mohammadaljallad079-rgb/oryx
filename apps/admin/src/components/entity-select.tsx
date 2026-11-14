'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync, useDebounced } from '@/lib/hooks';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { SearchableSelect, type SearchableOption } from '@/components/ui';

/**
 * The catalogues an operator picks from while filling a form, and the one API
 * call that creates a new record in each.
 *
 * Every entry pairs the fetch that populates the picker with the create that
 * the picker's inline form calls, so a screen converts a native `<select>` to a
 * searchable, creatable picker by naming the catalogue rather than by repeating
 * the option mapping and the create payload in every file.
 *
 * `options` maps a row to the `value`/`label`/`hint` the picker renders and is
 * the only part that differs between callers that shape the label differently.
 */
type CatalogueKey =
  | 'customer'
  | 'supplier'
  | 'product'
  | 'warehouse'
  | 'employee'
  | 'department'
  | 'account'
  | 'vehicle'
  | 'tax'
  | 'branch'
  | 'inspectionService';

interface CatalogueEntry {
  /** Loads the options for a query, scoped to the active company. */
  load: (companyId: string | null, search: string) => Promise<SearchableOption[]>;
  /** The inline-create fields and the call that saves them. */
  create?: {
    fields: Array<{ key: string; labelKey: string; required?: boolean; placeholder?: string }>;
    submit: (companyId: string | null, values: Record<string, string>) => Promise<string>;
  };
}

const CATALOGUES: Record<CatalogueKey, CatalogueEntry> = {
  customer: {
    load: async (companyId, search) => {
      const page = await api.salesCustomers({ companyId: companyId ?? undefined, search: search || undefined });
      return page.items.map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.nameEn || c.nameAr}`,
        hint: c.phone ?? undefined,
      }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: 'CUS-001' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
        { key: 'phone', labelKey: 'common.phone', required: false },
      ],
      submit: async (_companyId, values) => {
        const created = await api.createCustomer({
          code: values.code,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          ...(values.phone ? { phone: values.phone } : {}),
        });
        return created.id;
      },
    },
  },
  supplier: {
    load: async (companyId, search) => {
      const page = await api.suppliers({ companyId: companyId ?? undefined, search: search || undefined });
      return page.items.map((s) => ({
        value: s.id,
        label: `${s.code} — ${s.nameEn || s.nameAr}`,
        hint: s.phone ?? undefined,
      }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: 'SUP-001' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
        { key: 'phone', labelKey: 'common.phone', required: false },
      ],
      submit: async (_companyId, values) => {
        const created = await api.createSupplier({
          code: values.code,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          ...(values.phone ? { phone: values.phone } : {}),
        });
        return created.id;
      },
    },
  },
  product: {
    load: async (companyId, search) => {
      const page = await api.products({ companyId: companyId ?? undefined, search: search || undefined, page: 1, pageSize: 50 });
      return page.items.map((p) => ({
        value: p.id,
        label: `${p.sku} — ${p.nameEn || p.nameAr}`,
        // A sales line copies the product's price and rate on pick, so the
        // record rides along with the option rather than being re-fetched.
        data: {
          id: p.id,
          nameEn: p.nameEn,
          salesPriceMinor: p.salesPriceMinor,
          costPriceMinor: p.costPriceMinor,
          taxRateBp: p.taxRateBp,
        },
      }));
    },
    create: {
      fields: [
        { key: 'sku', labelKey: 'common.code', placeholder: 'SKU-001' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
      ],
      submit: async (_companyId, values) => {
        const created = await api.createProduct({
          sku: values.sku,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          type: 'PRODUCT',
        });
        return created.id;
      },
    },
  },
  warehouse: {
    load: async (companyId) => {
      const page = await api.warehouses({ companyId: companyId ?? undefined });
      return page.items.map((w) => ({ value: w.id, label: `${w.code} — ${w.nameEn || w.nameAr}` }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: 'WH-001' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
      ],
      submit: async (_companyId, values) => {
        const created = await api.createWarehouse({
          code: values.code,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
        });
        return created.id;
      },
    },
  },
  employee: {
    load: async (companyId, search) => {
      const page = await api.hrEmployees({ companyId: companyId ?? undefined, search: search || undefined });
      return page.items.map((e) => ({
        value: e.id,
        label: `${e.code} — ${e.fullNameEn || e.fullNameAr}`,
        hint: e.email ?? undefined,
      }));
    },
  },
  department: {
    load: async (companyId) => {
      const page = await api.hrDepartments({ companyId: companyId ?? undefined });
      return page.items.map((d) => ({ value: d.id, label: `${d.code} — ${d.nameEn || d.nameAr}` }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: 'DEP-001' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
      ],
      submit: async (_companyId, values) => {
        const created = await api.createDepartment({
          code: values.code,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
        });
        return created.id;
      },
    },
  },
  account: {
    load: async (companyId, search) => {
      const page = await api.accountingAccounts({ companyId: companyId ?? undefined, search: search || undefined });
      return page.items.map((a) => ({ value: a.id, label: `${a.code} — ${a.nameEn || a.nameAr}` }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: '1010' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
        { key: 'type', labelKey: 'erp.accounting.type', placeholder: 'ASSET' },
      ],
      submit: async (_companyId, values) => {
        const type = (values.type || 'ASSET').toUpperCase();
        const created = await api.createAccount({
          code: values.code,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          type,
          normalBalance: type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
        });
        return created.id;
      },
    },
  },
  vehicle: {
    load: async (companyId, search) => {
      const page = await api.vehicles({ companyId: companyId ?? undefined, search: search || undefined });
      return page.items.map((v) => ({
        value: v.id,
        label: `${v.make} ${v.model} · ${v.modelYear} · ${v.vin}`,
        hint: v.plateNumber ?? undefined,
      }));
    },
  },
  branch: {
    load: async (companyId) => {
      if (!companyId) return [];
      const page = await api.listBranches(companyId, { pageSize: 200 });
      return page.items.map((b) => ({ value: b.id, label: `${b.code} — ${b.nameEn || b.nameAr}` }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: 'BR-001' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
      ],
      submit: async (companyId, values) => {
        if (!companyId) throw new Error('No company scope');
        const created = await api.createBranch(companyId, {
          // The API accepts uppercase codes only, so the picker normalises as it saves.
          code: values.code.toUpperCase(),
          nameEn: values.nameEn,
          nameAr: values.nameAr,
        });
        return created.id;
      },
    },
  },
  inspectionService: {
    load: async (companyId) => {
      const page = await api.inspectionServices({ companyId: companyId ?? undefined });
      return page.items.map((s) => ({ value: s.id, label: `${s.code} — ${s.nameEn || s.nameAr}` }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: 'SRV-001' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
        { key: 'price', labelKey: 'erp.automotive.basePrice', required: false, placeholder: '0.000' },
      ],
      submit: async (_companyId, values) => {
        const created = await api.createInspectionService({
          code: values.code,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          ...(values.price ? { priceMinor: Math.round(Number(values.price) * 1000) } : {}),
        });
        return created.id;
      },
    },
  },
  tax: {
    load: async (companyId) => {
      const page = await api.taxes({ companyId: companyId ?? undefined });
      return page.items.map((r) => ({
        value: r.id,
        label: `${r.rateBp / 100}% — ${r.nameEn || r.nameAr}`,
        data: { id: r.id, rateBp: r.rateBp },
      }));
    },
    create: {
      fields: [
        { key: 'code', labelKey: 'common.code', placeholder: 'VAT10' },
        { key: 'nameEn', labelKey: 'common.nameEn' },
        { key: 'nameAr', labelKey: 'common.nameAr' },
        { key: 'rate', labelKey: 'common.ratePercent', placeholder: '10' },
      ],
      submit: async (_companyId, values) => {
        const created = await api.createTax({
          code: values.code,
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          rateBp: Math.round(Number(values.rate) * 100),
        });
        return created.id;
      },
    },
  },
};

/**
 * A searchable picker over a named catalogue, with an optional inline create.
 *
 * It loads the catalogue itself (scoped to the active company) and reloads it
 * after an inline create, so the caller only owns the selected value.
 */
export function EntitySelect({
  catalogue,
  value,
  onChange,
  placeholder,
  emptyLabel,
  disabled = false,
  testId,
  allowCreate = false,
  labelOf,
  onSelectData,
  className,
  filter,
}: {
  catalogue: CatalogueKey;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  testId?: string;
  /** Whether the picker offers an inline create; ignored when the catalogue has none. */
  allowCreate?: boolean;
  /** Overrides the label a row renders, when a screen needs a different shape. */
  labelOf?: (option: SearchableOption) => string;
  /** Receives the picked option's record, when the caller needs more than the id. */
  onSelectData?: (data: Record<string, unknown>) => void;
  /** Applied to the wrapper, so a picker can sit in a grid cell of its own. */
  className?: string;
  /** Keeps only the options a caller considers valid (postable accounts, say). */
  filter?: (option: SearchableOption) => boolean;
}) {
  const { t } = useUi();
  const { companyId } = useAuth();
  const entry = CATALOGUES[catalogue];
  const [term, setTerm] = useState('');
  const search = useDebounced(term, 300);
  const list = useAsync(() => entry.load(companyId, search), [companyId, search]);

  const raw = (list.data ?? []).filter((o) => (filter ? filter(o) : true));
  const options = labelOf ? raw.map((o) => ({ ...o, label: labelOf(o) })) : raw;

  const create = allowCreate && entry.create
    ? {
        actionLabel: t('common.create'),
        fields: entry.create.fields.map((f) => ({ ...f, label: t(f.labelKey) })),
        onSubmit: async (values: Record<string, string>) => {
          const id = await entry.create!.submit(companyId, values);
          await list.reload();
          return id;
        },
      }
    : undefined;

  return (
    <div className={className}>
      <SearchableSelect
        value={value}
        options={options}
        onChange={onChange}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        disabled={disabled}
        testId={testId}
        create={create}
        onSearch={setTerm}
        loading={list.loading}
        onSelectData={onSelectData}
      />
    </div>
  );
}
