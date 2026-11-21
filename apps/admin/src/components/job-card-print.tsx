'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Button } from '@/components/ui';
import { Icon } from '@/components/icons';

type PrintableJob = {
  jobNumber: string;
  status: string;
  complaint: string | null;
  diagnosis: string | null;
  odometer: number | null;
  vehicle?: { make: string; model: string; vin: string; plateNumber: string | null } | null;
  estimates?: Array<{ lines: Array<{ type: string; description: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }> }>;
};

const escaped = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
);

function htmlForJob(job: PrintableJob, locale: string, name: string): string {
  const ar = locale === 'ar';
  const lines = job.estimates?.[0]?.lines ?? [];
  const rows = lines.map((line) => `<tr>
      <td>${escaped(line.type === 'PART' ? (ar ? 'قطعة' : 'Part') : (ar ? 'خدمة' : 'Service'))}</td>
      <td>${escaped(line.description)}</td>
      <td>${escaped((line.quantity / 10000).toFixed(2))}</td>
      <td>${escaped((line.unitPriceMinor / 1000).toFixed(3))}</td>
      <td>${escaped((line.lineTotalMinor / 1000).toFixed(3))}</td>
    </tr>`).join('');
  const total = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  return `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><title>${escaped(job.jobNumber)}</title>
<style>
@page { size:A4; margin:15mm; }
body { font-family:'Tajawal','Segoe UI',Arial,sans-serif; color:#0b3158; background:white; margin:0; }
header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #0a4175; padding-bottom:20px; }
header img { width:200px; max-height:75px; object-fit:contain; }
h1 { text-align:center; font-size:20px; margin:24px 0; }
.meta { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; padding:15px; background:#f3f6f9; margin-bottom:20px; }
.meta div { min-width:0; overflow-wrap:anywhere; }
.meta strong { display:inline-block; margin-inline-end:8px; }
table { width:100%; border-collapse:collapse; font-size:12px; }
th { background:#0a4175; color:white; padding:9px; text-align:start; }
td { border-bottom:1px solid #cbd5e1; padding:9px; }
.total { text-align:end; font-size:16px; font-weight:bold; padding-top:20px; }
.note { border:1px solid #cbd5e1; padding:12px; margin-top:14px; overflow-wrap:anywhere; }
.toolbar { display:flex; justify-content:end; padding:10px; background:#0a4175; }
.toolbar button { color:#0a4175; background:#fff; border:0; padding:8px 16px; cursor:pointer; }
@media print { .toolbar { display:none } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Print / طباعة</button></div>
<header><img src="/brand/oryx-logo-on-light.png" alt="ORYX"><strong>ORYX AUTO SERVICES</strong></header>
<h1>${ar ? 'بطاقة عمل صيانة مركبة' : 'Vehicle Maintenance Job Card'}</h1>
<section class="meta">
<div><strong>${ar ? 'رقم البطاقة' : 'Job card'}:</strong>${escaped(job.jobNumber)}</div>
<div><strong>${ar ? 'الحالة' : 'Status'}:</strong>${escaped(job.status)}</div>
<div><strong>${ar ? 'العميل' : 'Customer'}:</strong>${escaped(name)}</div>
<div><strong>${ar ? 'المركبة' : 'Vehicle'}:</strong>${escaped([job.vehicle?.make,job.vehicle?.model].filter(Boolean).join(' '))}</div>
<div><strong>${ar ? 'رقم اللوحة' : 'Plate'}:</strong>${escaped(job.vehicle?.plateNumber)}</div>
<div><strong>VIN:</strong>${escaped(job.vehicle?.vin)}</div>
</section>
<div class="note"><strong>${ar ? 'وصف المشكلة' : 'Complaint'}:</strong> ${escaped(job.complaint)}</div>
<div class="note"><strong>${ar ? 'التشخيص' : 'Diagnosis'}:</strong> ${escaped(job.diagnosis)}</div>
<h2>${ar ? 'بنود العمل' : 'Work items'}</h2>
<table><thead><tr><th>${ar ? 'النوع' : 'Type'}</th><th>${ar ? 'الوصف' : 'Description'}</th><th>${ar ? 'الكمية' : 'Qty'}</th><th>${ar ? 'سعر الوحدة' : 'Unit price'}</th><th>${ar ? 'المبلغ' : 'Amount'}</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="total">${ar ? 'إجمالي البنود قبل الضريبة' : 'Items total before tax'}: ${(total / 1000).toFixed(3)} BHD</div>
</body></html>`;
}

export function JobCardPrintActions({ id, customerName }: { id: string; customerName: string }) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open(mode: 'preview' | 'print') {
    if (busy) return;
    const windowRef = window.open('', '_blank', 'width=920,height=1040');
    if (!windowRef) { setError(t('print.popupBlocked')); return; }
    setBusy(true);
    setError('');
    try {
      const job = await api.jobCard(id) as unknown as PrintableJob;
      windowRef.document.open();
      windowRef.document.write(htmlForJob(job, locale, customerName));
      windowRef.document.close();
      if (mode === 'print') {
        windowRef.focus();
        windowRef.setTimeout(() => windowRef.print(), 450);
      }
    } catch (err) {
      windowRef.close();
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }
  return <span className="inline-flex items-center gap-1" data-testid={`job-print-actions-${id}`}>
    <Button size="sm" disabled={busy} onClick={() => void open('preview')} data-testid={`job-preview-${id}`} title={t('print.preview')}>
      <Icon name="eye" size={14} />
    </Button>
    <Button size="sm" disabled={busy} onClick={() => void open('print')} data-testid={`job-print-${id}`} title={t('print.print')}>
      <Icon name="print" size={14} />
    </Button>
    {error ? <span role="alert" className="text-[11px] text-red-600">{error}</span> : null}
  </span>;
}
