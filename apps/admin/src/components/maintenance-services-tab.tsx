'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { minorToInput, toMinorInput } from '@/lib/erp-format';
import { Button, Card, ErrorBanner, Field, Modal, Skeleton, TableShell } from '@/components/ui';

type MaintenanceService = Awaited<ReturnType<typeof api.maintenanceServices>>[number];
type Draft = {
  code: string; nameEn: string; nameAr: string; descriptionEn: string;
  descriptionAr: string; price: string; duration: string; imageUrl: string;
  branchIds: string[]; isActive: boolean; isPublished: boolean; sortOrder: string;
};
const blank = (): Draft => ({
  code: '', nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '',
  price: '0.000', duration: '60', imageUrl: '', branchIds: [],
  isActive: true, isPublished: true, sortOrder: '0',
});
const editDraft = (s: MaintenanceService): Draft => ({
  code: s.code, nameEn: s.nameEn, nameAr: s.nameAr,
  descriptionEn: s.descriptionEn ?? '', descriptionAr: s.descriptionAr ?? '',
  price: minorToInput(s.priceMinor), duration: String(s.durationMinutes),
  imageUrl: s.imageUrl ?? '', branchIds: s.branchIds,
  isActive: s.isActive, isPublished: s.isPublished, sortOrder: String(s.sortOrder),
});

export function MaintenanceServicesTab({ canManage }: { canManage: boolean }) {
  const { locale } = useUi();
  const { companyId } = useAuth();
  const ar = locale === 'ar';
  const services = useAsync(() => api.maintenanceServices(), []);
  const branches = useAsync(
    () => companyId ? api.listBranches(companyId, { pageSize: 100 }) : Promise.resolve(null),
    [companyId],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (changes: Partial<Draft>) => setDraft((v) => ({ ...v, ...changes }));
  const start = (item?: MaintenanceService) => {
    setSelected(item?.id ?? null);
    setDraft(item ? editDraft(item) : blank());
    setError('');
    setOpen(true);
  };

  const save = async () => {
    if (!draft.nameEn.trim() || !draft.nameAr.trim() || !draft.code.trim()) {
      setError(ar ? 'الرمز والاسمان مطلوبان' : 'Code and both names are required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = {
        nameEn: draft.nameEn.trim(), nameAr: draft.nameAr.trim(),
        descriptionEn: draft.descriptionEn.trim(),
        descriptionAr: draft.descriptionAr.trim(),
        priceMinor: toMinorInput(draft.price),
        durationMinutes: Number(draft.duration),
        imageUrl: draft.imageUrl.trim(), branchIds: draft.branchIds,
        isActive: draft.isActive, isPublished: draft.isPublished,
        sortOrder: Number(draft.sortOrder),
      };
      if (selected) await api.updateMaintenanceService(selected, data);
      else await api.createMaintenanceService({ ...data, code: draft.code.trim().toUpperCase() });
      await services.reload();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: MaintenanceService) => {
    if (!window.confirm(ar ? `حذف خدمة ${item.nameAr}؟` : `Delete service ${item.nameEn}?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteMaintenanceService(item.id);
      await services.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
      <div>
        <h2 className="oryx-panel-title m-0">{ar ? 'خدمات صيانة المركبات' : 'Vehicle maintenance services'}</h2>
        <p className="oryx-muted text-[12px]">{ar ? 'الخدمات المنشورة هنا تظهر بالموقع وتتوفر للاختيار في بطاقة العمل' : 'Published services appear on the website and inside job cards'}</p>
      </div>
      {canManage ? <Button variant="primary" onClick={() => start()} data-testid="new-maintenance-service">{ar ? 'إضافة خدمة' : 'Add service'}</Button> : null}
    </div>
    {error ? <ErrorBanner message={error} /> : null}
    {services.error ? <ErrorBanner message={services.error} onRetry={services.reload} /> : null}
    {services.loading ? <Skeleton height={160} /> : (
      <TableShell>
        <thead><tr>
          <th>{ar ? 'الخدمة' : 'Service'}</th>
          <th>{ar ? 'السعر (د.ب)' : 'Price (BHD)'}</th>
          <th>{ar ? 'المدة' : 'Duration'}</th>
          <th>{ar ? 'الحالة' : 'Status'}</th>
          <th>{ar ? 'إجراءات' : 'Actions'}</th>
        </tr></thead>
        <tbody>{(services.data ?? []).map((item) => <tr key={item.id}>
          <td><strong>{ar ? item.nameAr : item.nameEn}</strong><small className="oryx-faint block">{item.code}</small></td>
          <td>{minorToInput(item.priceMinor)}</td>
          <td>{item.durationMinutes} min</td>
          <td>{item.isActive && item.isPublished ? (ar ? 'منشورة' : 'Published') : (ar ? 'مخفية' : 'Hidden')}</td>
          <td><div className="flex gap-2">
            {canManage ? <>
              <Button size="sm" onClick={() => start(item)} data-testid={`edit-maintenance-service-${item.code}`}>{ar ? 'تعديل' : 'Edit'}</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove(item)} data-testid={`delete-maintenance-service-${item.code}`}>{ar ? 'حذف' : 'Delete'}</Button>
            </> : null}
          </div></td>
        </tr>)}</tbody>
      </TableShell>
    )}
    <Modal open={open} onClose={() => setOpen(false)} title={selected ? (ar ? 'تعديل خدمة الصيانة' : 'Edit maintenance service') : (ar ? 'إضافة خدمة الصيانة' : 'Add maintenance service')}
      size="document" footer={<>
        <Button onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
        <Button variant="primary" disabled={busy} onClick={() => void save()} data-testid="save-maintenance-service">{ar ? 'حفظ' : 'Save'}</Button>
      </>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={ar ? 'الرمز' : 'Code'} required><input className="oryx-input" value={draft.code} disabled={!!selected} onChange={(e) => patch({ code: e.target.value })} /></Field>
        <Field label={ar ? 'السعر بالدينار البحريني' : 'Price (BHD)'} required><input className="oryx-input" inputMode="decimal" value={draft.price} onChange={(e) => patch({ price: e.target.value })} /></Field>
        <Field label={ar ? 'الاسم بالعربي' : 'Arabic name'} required><input className="oryx-input" value={draft.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} /></Field>
        <Field label={ar ? 'الاسم بالإنجليزي' : 'English name'} required><input className="oryx-input" value={draft.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} /></Field>
        <Field label={ar ? 'الوصف بالعربي' : 'Arabic description'}><textarea className="oryx-input" value={draft.descriptionAr} onChange={(e) => patch({ descriptionAr: e.target.value })} /></Field>
        <Field label={ar ? 'الوصف بالإنجليزي' : 'English description'}><textarea className="oryx-input" value={draft.descriptionEn} onChange={(e) => patch({ descriptionEn: e.target.value })} /></Field>
        <Field label={ar ? 'المدة بالدقائق' : 'Minutes'}><input className="oryx-input" inputMode="numeric" value={draft.duration} onChange={(e) => patch({ duration: e.target.value })} /></Field>
        <Field label={ar ? 'ترتيب الظهور' : 'Display order'}><input className="oryx-input" inputMode="numeric" value={draft.sortOrder} onChange={(e) => patch({ sortOrder: e.target.value })} /></Field>
        <Field label={ar ? 'رابط الصورة' : 'Image URL'}><input className="oryx-input" value={draft.imageUrl} onChange={(e) => patch({ imageUrl: e.target.value })} /></Field>
        <Field label={ar ? 'الفروع المتاحة' : 'Available branches'}>
          <select className="oryx-input" multiple size={Math.min(6, Math.max(2, branches.data?.items.length ?? 2))}
            value={draft.branchIds} onChange={(e) => patch({ branchIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
            {(branches.data?.items ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.nameEn}</option>)}
          </select>
          <small className="oryx-faint">{ar ? 'عدم اختيار أي فرع يعني جميع الفروع المنشورة' : 'No selection means all published branches'}</small>
        </Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isActive} onChange={(e) => patch({ isActive: e.target.checked })} />{ar ? 'مفعلة' : 'Active'}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isPublished} onChange={(e) => patch({ isPublished: e.target.checked })} />{ar ? 'تظهر بالموقع' : 'Published on site'}</label>
      </div>
    </Modal>
  </Card>;
}
