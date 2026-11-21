import type { DocumentIssuer, DocumentVerification } from '../../documents/document-payload';
import { esc, docDate } from '../../documents/templates/html.util';
import { CHROME_CSS, officialFooterTemplate } from '../../documents/templates/chrome';
import { identityBand, trnStrip } from '../../documents/templates/official-financial.template';

/**
 * The employee payslip.
 *
 * Printed on the same chrome as every other ORYX document — the identity band,
 * the TRN strip, the gold rule, the running footer — so a payslip handed to an
 * employee looks like part of the same system. It is its own template because
 * the reference is a payslip, not an invoice: the fields, the earnings/deductions
 * two-column table and the net-pay block are its own design.
 *
 * The template is pure: it renders only the snapshot passed in, so reprinting a
 * historical payslip shows the figures that were paid, not today's salary.
 */

export interface PayslipRenderInput {
  issuer: DocumentIssuer;
  baseCss: string;
  verification?: DocumentVerification | null;
  payslip: {
    employeeCode: string;
    employeeNameEn: string;
    employeeNameAr: string;
    periodNameEn: string | null;
    periodNameAr: string | null;
    runNumber: string | null;
    /** Net worked hours for the period, in hundredths. */
    workedMinutes: number;
    overtimeMinutes: number;
    lateMinutes: number;
    absenceDays: number;
    basicMinor: number;
    allowancesMinor: number;
    deductionsMinor: number;
    grossMinor: number;
    netMinor: number;
    currency: string;
    lines: Array<{ type: string; code: string; nameEn: string; nameAr: string; amountMinor: number }>;
  };
  /** Payroll period bounds, printed under the document meta. */
  periodStart?: Date | null;
  periodEnd?: Date | null;
  issuedAt: Date;
}

/** Format integer minor units as a fixed 3-decimal money string. */
function money(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 1000);
  const frac = String(abs % 1000).padStart(3, '0');
  return `${sign}${whole.toLocaleString('en-US')}.${frac}`;
}

/** Minutes to a `H:MM` string (the payslip prints hours, not hundredths). */
function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.abs(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

const PAYSLIP_CSS = `
.ps-page{font-size:9.4pt;color:#1f2d3d;}
.ps-title{text-align:center;margin:4mm 0 2mm;}
.ps-title-ar{font-size:15pt;font-weight:800;color:#0F2B48;}
.ps-title-en{font-size:10pt;font-weight:700;letter-spacing:.08em;color:#8a6d1f;text-transform:uppercase;}
.ps-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:0;border:0.75px solid #cbd5e1;margin-top:2mm;}
.ps-meta-cell{padding:2mm 3mm;border-bottom:0.5px solid #e2e8f0;}
.ps-meta-cell:nth-child(odd){border-inline-end:0.5px solid #e2e8f0;}
.ps-meta-label{font-size:7pt;color:#64748b;text-transform:uppercase;letter-spacing:.04em;}
.ps-meta-value{font-size:9.6pt;font-weight:700;color:#0F2B48;}
.ps-cols{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm;}
.ps-box{border:0.75px solid #cbd5e1;}
.ps-box-head{background:#0F2B48;color:#fff;font-weight:700;font-size:8.6pt;padding:1.6mm 3mm;display:flex;justify-content:space-between;}
.ps-row{display:flex;justify-content:space-between;padding:1.4mm 3mm;border-bottom:0.5px solid #eef2f7;font-size:9pt;}
.ps-row:last-child{border-bottom:0;}
.ps-row .num{font-variant-numeric:tabular-nums;}
.ps-empty{padding:2mm 3mm;color:#94a3b8;font-size:8.6pt;}
.ps-total{display:flex;justify-content:space-between;padding:1.6mm 3mm;font-weight:800;background:#f1f5f9;border-top:0.75px solid #cbd5e1;}
.ps-net{margin-top:4mm;background:#0F2B48;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:3mm 4mm;}
.ps-net-label{font-size:10pt;font-weight:700;letter-spacing:.03em;}
.ps-net-value{font-size:16pt;font-weight:800;font-variant-numeric:tabular-nums;}
.ps-attend{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:4mm;}
.ps-attend-cell{border:0.75px solid #cbd5e1;padding:2mm;text-align:center;}
.ps-attend-value{font-size:12pt;font-weight:800;color:#0F2B48;}
.ps-attend-label{font-size:7.2pt;color:#64748b;}
`;

function metaCell(labelAr: string, labelEn: string, value: string): string {
  return `<div class="ps-meta-cell">
    <div class="ps-meta-label">${esc(labelAr)} / ${esc(labelEn)}</div>
    <div class="ps-meta-value">${esc(value)}</div>
  </div>`;
}

function lineRows(lines: Array<{ code: string; nameEn: string; nameAr: string; amountMinor: number }>): string {
  if (lines.length === 0) return '<div class="ps-empty">—</div>';
  return lines
    .map((l) => `<div class="ps-row"><span>${esc(l.nameAr)} <span style="color:#94a3b8">/ ${esc(l.nameEn)}</span></span><span class="num">${money(l.amountMinor)}</span></div>`)
    .join('');
}

export function renderPayslipHtml(input: PayslipRenderInput): string {
  const p = input.payslip;
  const docLocale: 'ar' | 'en' = input.issuer.documentLocale === 'ar' ? 'ar' : 'en';
  const dir = docLocale === 'en' ? 'ltr' : 'rtl';
  const earnings = p.lines.filter((l) => l.type === 'ALLOWANCE');
  const deductions = p.lines.filter((l) => l.type === 'DEDUCTION');

  return `<!doctype html>
<html lang="${docLocale}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>Payslip · ${esc(p.employeeCode)}</title>
<style>${input.baseCss}
${CHROME_CSS}
${PAYSLIP_CSS}
</style>
</head>
<body>
<section class="ps-page">
  ${identityBand(input.issuer)}
  ${trnStrip(input.issuer)}

  <div class="ps-title">
    <div class="ps-title-ar">قسيمة راتب</div>
    <div class="ps-title-en">Payslip</div>
  </div>

  <div class="ps-meta">
    ${metaCell('رقم الموظف', 'Employee No.', p.employeeCode)}
    ${metaCell('الاسم', 'Name', docLocale === 'ar' ? p.employeeNameAr : p.employeeNameEn)}
    ${metaCell('فترة الرواتب', 'Payroll Period', p.periodNameEn ?? p.runNumber ?? '—')}
    ${metaCell('تاريخ الإصدار', 'Issue Date', docDate(input.issuedAt))}
  </div>

  <div class="ps-cols">
    <div class="ps-box">
      <div class="ps-box-head"><span>الاستحقاقات</span><span>Earnings</span></div>
      <div class="ps-row"><span>الراتب الأساسي / Basic Salary</span><span class="num">${money(p.basicMinor)}</span></div>
      ${lineRows(earnings)}
      <div class="ps-total"><span>إجمالي الاستحقاقات / Gross</span><span class="num">${money(p.grossMinor)}</span></div>
    </div>
    <div class="ps-box">
      <div class="ps-box-head"><span>الاستقطاعات</span><span>Deductions</span></div>
      ${lineRows(deductions)}
      <div class="ps-total"><span>إجمالي الاستقطاعات / Total</span><span class="num">${money(p.deductionsMinor)}</span></div>
    </div>
  </div>

  <div class="ps-net">
    <span class="ps-net-label">صافي الراتب / NET PAY (${esc(p.currency)})</span>
    <span class="ps-net-value">${money(p.netMinor)}</span>
  </div>

  <div class="ps-attend">
    <div class="ps-attend-cell"><div class="ps-attend-value">${hours(p.workedMinutes)}</div><div class="ps-attend-label">ساعات العمل / Worked</div></div>
    <div class="ps-attend-cell"><div class="ps-attend-value">${hours(p.overtimeMinutes)}</div><div class="ps-attend-label">إضافي / Overtime</div></div>
    <div class="ps-attend-cell"><div class="ps-attend-value">${hours(p.lateMinutes)}</div><div class="ps-attend-label">تأخير / Late</div></div>
    <div class="ps-attend-cell"><div class="ps-attend-value">${p.absenceDays}</div><div class="ps-attend-label">غياب / Absence</div></div>
  </div>
</section>
</body>
</html>`;
}

export { officialFooterTemplate };
