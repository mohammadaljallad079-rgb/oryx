'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  SectionHeader,
  Skeleton,
  StatusBadge,
  TableShell,
} from '@/components/ui';
import type { PartsReservationDto } from '@oryx/shared';

type Tab = 'catalog' | 'references' | 'compatibility' | 'reservations';

export default function SparePartsPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('catalog');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'catalog', label: t('erp.parts.catalog') },
    { key: 'references', label: t('erp.parts.partNumbers') },
    { key: 'compatibility', label: t('erp.parts.compatibility') },
    { key: 'reservations', label: t('erp.parts.reservations') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="spare-parts-page">
      <SectionHeader
        title={t('nav.spare_parts')}
        subtitle={t('erp.parts.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`parts-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'catalog' ? <CatalogTab /> : null}
      {tab === 'references' ? <ReferencesTab canManage={can('erp.parts.reference.manage')} /> : null}
      {tab === 'compatibility' ? <CompatibilityTab canManage={can('erp.parts.compatibility.manage')} /> : null}
      {tab === 'reservations' ? <ReservationsTab canIssue={can('erp.parts.issue')} /> : null}
    </div>
  );
}

function CatalogTab() {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const list = useAsync(() => api.products({ search: search || undefined }), [search]);
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="parts-search" />
        </label>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.parts.emptyCatalog')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.inventory.sku')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.inventory.salesPrice')}</th>
              <th>{t('erp.inventory.costPrice')}</th>
              <th>{t('erp.parts.reorderLevel')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((p) => (
              <tr key={p.id} data-testid={`part-catalog-${p.sku}`}>
                <td className="font-mono text-[12px]">{p.sku}</td>
                <td className="text-[12.5px]">{p.nameEn}</td>
                <td className="tabular-nums text-[12.5px]">{(p.salesPriceMinor / 100).toFixed(2)}</td>
                <td className="tabular-nums text-[12.5px]">{(p.costPriceMinor / 100).toFixed(2)}</td>
                <td className="tabular-nums text-[12.5px]">{(p.reorderLevel / 10000).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

function ReferencesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.partReferences(), []);
  const products = useAsync(() => api.products(), []);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.parts.partNumbers')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-part-reference">
            <Icon name="plus" size={16} />
            {t('erp.parts.newPartNumber')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.parts.emptyPartNumbers')} />
      ) : (
        <TableShell>
          <thead><tr><th>{t('erp.parts.partNumber')}</th><th>{t('common.type')}</th><th>{t('erp.inventory.sku')}</th><th>{t('erp.parts.brand')}</th></tr></thead>
          <tbody>
            {list.data!.items.map((r) => (
              <tr key={String(r.id)} data-testid={`part-ref-${String(r.partNumber)}`}>
                <td className="font-mono text-[12px]">{String(r.partNumber)}</td>
                <td><Badge tone="info">{String(r.type)}</Badge></td>
                <td className="text-[12.5px]">{String((r.product as { sku?: string } | undefined)?.sku ?? '—')}</td>
                <td className="text-[12.5px]">{r.brand ? String(r.brand) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateReferenceModal open={open} products={products.data?.items ?? []} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateReferenceModal({
  open,
  products,
  onClose,
  onCreated,
}: {
  open: boolean;
  products: Array<{ id: string; sku: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ productId: '', partNumber: '', type: 'OEM', brand: '' });
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.createPartReference({ productId: form.productId, partNumber: form.partNumber, type: form.type, brand: form.brand || undefined });
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={t('erp.parts.newPartNumber')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.productId} onClick={submit} data-testid="save-part-reference">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.product')} required>
          <select className="oryx-select" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} data-testid="reference-product">
            <option value="">—</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.parts.partNumber')} required>
          <input className="oryx-input" value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} data-testid="reference-number" />
        </Field>
        <Field label={t('common.type')}>
          <select className="oryx-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['OEM', 'AFTERMARKET', 'CROSS_REFERENCE'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label={t('erp.parts.brand')}><input className="oryx-input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function CompatibilityTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.partCompatibility(), []);
  const products = useAsync(() => api.products(), []);
  const [open, setOpen] = useState(false);
  const [lookup, setLookup] = useState({ make: '', model: '', year: '' });
  const matches = useAsync(
    () => (lookup.make && lookup.model && lookup.year ? api.compatibleParts(lookup.make, lookup.model, Number(lookup.year)) : Promise.resolve(null)),
    [lookup.make, lookup.model, lookup.year],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('erp.parts.compatibility')}</p>
          {canManage ? (
            <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-compatibility">
              <Icon name="plus" size={16} />
              {t('erp.parts.newCompatibility')}
            </Button>
          ) : null}
        </div>
        {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
        {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('erp.parts.emptyCompatibility')} />
        ) : (
          <TableShell>
            <thead><tr><th>{t('erp.inventory.sku')}</th><th>{t('erp.automotive.make')}</th><th>{t('erp.automotive.model')}</th><th>{t('erp.automotive.modelYear')}</th></tr></thead>
            <tbody>
              {list.data!.items.map((c) => (
                <tr key={String(c.id)}>
                  <td className="text-[12.5px]">{String((c.product as { sku?: string } | undefined)?.sku ?? '—')}</td>
                  <td className="text-[12.5px]">{String(c.make)}</td>
                  <td className="text-[12.5px]">{String(c.model)}</td>
                  <td className="text-[12.5px]">{String(c.yearFrom)}{c.yearTo ? ` – ${String(c.yearTo)}` : '+'}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card className="p-4">
        <p className="oryx-panel-title m-0 mb-3">{t('erp.parts.findByVehicle')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label><span className="oryx-label">{t('erp.automotive.make')}</span><input className="oryx-input" value={lookup.make} onChange={(e) => setLookup({ ...lookup, make: e.target.value })} data-testid="compat-make" /></label>
          <label><span className="oryx-label">{t('erp.automotive.model')}</span><input className="oryx-input" value={lookup.model} onChange={(e) => setLookup({ ...lookup, model: e.target.value })} data-testid="compat-model" /></label>
          <label><span className="oryx-label">{t('erp.automotive.modelYear')}</span><input className="oryx-input" value={lookup.year} onChange={(e) => setLookup({ ...lookup, year: e.target.value })} data-testid="compat-year" /></label>
        </div>
        {matches.data ? (
          <div className="mt-3" data-testid="compatible-parts">
            {(matches.data.items.length ?? 0) === 0 ? (
              <p className="oryx-muted text-[12.5px]">{t('erp.parts.noMatches')}</p>
            ) : (
              <TableShell>
                <thead><tr><th>{t('erp.inventory.sku')}</th><th>{t('common.name')}</th><th>{t('erp.inventory.salesPrice')}</th></tr></thead>
                <tbody>
                  {matches.data.items.map((m, i) => {
                    const prod = (m.product ?? {}) as { sku?: string; nameEn?: string; salesPriceMinor?: number };
                    return (
                      <tr key={i}><td className="font-mono text-[12px]">{prod.sku}</td><td className="text-[12.5px]">{prod.nameEn}</td><td className="tabular-nums text-[12.5px]">{((prod.salesPriceMinor ?? 0) / 100).toFixed(2)}</td></tr>
                    );
                  })}
                </tbody>
              </TableShell>
            )}
          </div>
        ) : null}
      </Card>

      <CreateCompatibilityModal open={open} products={products.data?.items ?? []} onClose={() => setOpen(false)} onCreated={list.reload} />
    </div>
  );
}

function CreateCompatibilityModal({
  open,
  products,
  onClose,
  onCreated,
}: {
  open: boolean;
  products: Array<{ id: string; sku: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ productId: '', make: '', model: '', yearFrom: '2015', yearTo: '' });
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.createPartCompatibility({
        productId: form.productId,
        make: form.make,
        model: form.model,
        yearFrom: Number(form.yearFrom),
        yearTo: form.yearTo ? Number(form.yearTo) : undefined,
      });
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={t('erp.parts.newCompatibility')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.productId} onClick={submit} data-testid="save-compatibility">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.product')} required>
          <select className="oryx-select" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} data-testid="compatibility-product">
            <option value="">—</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.make')} required><input className="oryx-input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} data-testid="compatibility-make" /></Field>
        <Field label={t('erp.automotive.model')} required><input className="oryx-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="compatibility-model" /></Field>
        <Field label={t('erp.parts.yearFrom')} required><input className="oryx-input" value={form.yearFrom} onChange={(e) => setForm({ ...form, yearFrom: e.target.value })} data-testid="compatibility-year-from" /></Field>
        <Field label={t('erp.parts.yearTo')}><input className="oryx-input" value={form.yearTo} onChange={(e) => setForm({ ...form, yearTo: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function ReservationsTab({ canIssue }: { canIssue: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.partReservations(), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4"><p className="oryx-panel-title m-0">{t('erp.parts.reservations')}</p></div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.parts.emptyReservations')} />
      ) : (
        <TableShell>
          <thead><tr><th>{t('erp.automotive.jobNumber')}</th><th>{t('erp.parts.lines')}</th><th>{t('common.date')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {list.data!.items.map((r: PartsReservationDto) => (
              <tr key={r.id} data-testid={`reservation-row-${r.id.slice(-6)}`}>
                <td className="text-[12.5px]">{r.jobCardId.slice(-6)}</td>
                <td className="tabular-nums text-[12.5px]">{r.lines.length}</td>
                <td className="text-[12.5px]">{r.reservedAt.slice(0, 10)}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td>
                  {canIssue && (r.status === 'RESERVED' || r.status === 'PARTIALLY_ISSUED') ? (
                    <Button size="sm" data-testid={`issue-reservation-${r.id.slice(-6)}`} onClick={async () => { await api.issuePartReservation(r.id); await list.reload(); }}>
                      {t('erp.automotive.issue')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}
