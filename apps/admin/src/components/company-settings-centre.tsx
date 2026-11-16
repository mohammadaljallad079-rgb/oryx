'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  COMPANY_SETTING_DEFAULTS,
  COMPANY_SETTING_SECTIONS,
  type CompanySettingSection,
} from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBranding } from '@/lib/branding-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Button, Card, ErrorBanner, Field, Skeleton } from '@/components/ui';

type SectionData = Record<string, unknown>;

/**
 * The company settings centre.
 *
 * Each section is an independent card backed by its own `(companyId, section)`
 * row, so changing the company selector reloads exactly that company's settings
 * and never another tenant's. The field list is described here rather than
 * hard-coded per section so a new field is a one-line addition and the same
 * renderer covers text, number, toggle and select controls.
 */

interface FieldSpec {
  key: string;
  labelEn: string;
  labelAr: string;
  type: 'text' | 'number' | 'toggle' | 'select' | 'textarea';
  options?: Array<{ value: string; labelEn: string; labelAr: string }>;
}

const SECTION_META: Record<CompanySettingSection, { labelEn: string; labelAr: string; icon: string; fields: FieldSpec[] }> = {
  general: {
    labelEn: 'General',
    labelAr: 'عام',
    icon: 'building',
    fields: [
      { key: 'nameEn', labelEn: 'Company name (EN)', labelAr: 'اسم الشركة (EN)', type: 'text' },
      { key: 'nameAr', labelEn: 'Company name (AR)', labelAr: 'اسم الشركة (AR)', type: 'text' },
      { key: 'tradeNameEn', labelEn: 'Trade name (EN)', labelAr: 'الاسم التجاري (EN)', type: 'text' },
      { key: 'tradeNameAr', labelEn: 'Trade name (AR)', labelAr: 'الاسم التجاري (AR)', type: 'text' },
      { key: 'crNumber', labelEn: 'CR number', labelAr: 'رقم السجل التجاري', type: 'text' },
      { key: 'taxNumber', labelEn: 'VAT number', labelAr: 'الرقم الضريبي', type: 'text' },
      { key: 'phone', labelEn: 'Phone', labelAr: 'الهاتف', type: 'text' },
      { key: 'email', labelEn: 'Email', labelAr: 'البريد الإلكتروني', type: 'text' },
      { key: 'website', labelEn: 'Website', labelAr: 'الموقع الإلكتروني', type: 'text' },
      { key: 'addressLine', labelEn: 'Address', labelAr: 'العنوان', type: 'text' },
      { key: 'city', labelEn: 'City', labelAr: 'المدينة', type: 'text' },
      { key: 'countryCode', labelEn: 'Country', labelAr: 'الدولة', type: 'text' },
      { key: 'currency', labelEn: 'Base currency', labelAr: 'العملة الرئيسية', type: 'text' },
      { key: 'timezone', labelEn: 'Timezone', labelAr: 'المنطقة الزمنية', type: 'text' },
      {
        key: 'defaultLocale',
        labelEn: 'Default language',
        labelAr: 'اللغة الافتراضية',
        type: 'select',
        options: [
          { value: 'ar', labelEn: 'Arabic', labelAr: 'العربية' },
          { value: 'en', labelEn: 'English', labelAr: 'الإنجليزية' },
        ],
      },
      { key: 'dateFormat', labelEn: 'Date format', labelAr: 'تنسيق التاريخ', type: 'text' },
      { key: 'numberFormat', labelEn: 'Number format', labelAr: 'تنسيق الأرقام', type: 'text' },
      { key: 'logoUrl', labelEn: 'Logo URL', labelAr: 'رابط الشعار', type: 'text' },
    ],
  },
  typography: {
    labelEn: 'Typography & layout',
    labelAr: 'الخطوط والتنسيق',
    icon: 'type',
    fields: [
      { key: 'baseSize', labelEn: 'Base text size (px)', labelAr: 'حجم النص الأساسي (بكسل)', type: 'number' },
      { key: 'headingScale', labelEn: 'Heading multiplier', labelAr: 'معامل العناوين', type: 'number' },
      { key: 'moduleScale', labelEn: 'Module banner multiplier', labelAr: 'معامل بانر الوحدة', type: 'number' },
      { key: 'descriptionScale', labelEn: 'Body text multiplier', labelAr: 'معامل النص التوضيحي', type: 'number' },
      {
        key: 'fontFamily',
        labelEn: 'Typeface',
        labelAr: 'نوع الخط',
        type: 'select',
        options: [
          { value: 'default', labelEn: 'ORYX (IBM Plex Sans Arabic)', labelAr: 'ORYX (IBM Plex Sans Arabic)' },
          { value: 'system', labelEn: 'System UI', labelAr: 'خط النظام' },
        ],
      },
      { key: 'headingWeight', labelEn: 'Heading weight (400-800)', labelAr: 'ثقل العناوين (400-800)', type: 'number' },
      { key: 'labelTracking', labelEn: 'Label letter spacing (em)', labelAr: 'تباعد حروف التسميات (em)', type: 'number' },
    ],
  },
  invoicing: {
    labelEn: 'Invoices',
    labelAr: 'الفواتير',
    icon: 'file',
    fields: [
      { key: 'numberPrefix', labelEn: 'Invoice prefix', labelAr: 'بادئة رقم الفاتورة', type: 'text' },
      { key: 'nextNumber', labelEn: 'Next number', labelAr: 'الرقم التالي', type: 'number' },
      { key: 'showLogo', labelEn: 'Show logo', labelAr: 'إظهار الشعار', type: 'toggle' },
      { key: 'showTaxNumber', labelEn: 'Show VAT number', labelAr: 'إظهار الرقم الضريبي', type: 'toggle' },
      { key: 'showCrNumber', labelEn: 'Show CR number', labelAr: 'إظهار السجل التجاري', type: 'toggle' },
      { key: 'showBankDetails', labelEn: 'Show bank details', labelAr: 'إظهار بيانات البنك', type: 'toggle' },
      { key: 'headerNoteEn', labelEn: 'Header note (EN)', labelAr: 'ملاحظة الترويسة (EN)', type: 'text' },
      { key: 'headerNoteAr', labelEn: 'Header note (AR)', labelAr: 'ملاحظة الترويسة (AR)', type: 'text' },
      { key: 'footerNoteEn', labelEn: 'Footer note (EN)', labelAr: 'ملاحظة التذييل (EN)', type: 'text' },
      { key: 'footerNoteAr', labelEn: 'Footer note (AR)', labelAr: 'ملاحظة التذييل (AR)', type: 'text' },
      {
        key: 'paperSize',
        labelEn: 'Paper size',
        labelAr: 'حجم الورق',
        type: 'select',
        options: [
          { value: 'A4', labelEn: 'A4', labelAr: 'A4' },
          { value: 'A5', labelEn: 'A5', labelAr: 'A5' },
          { value: 'THERMAL', labelEn: 'Thermal', labelAr: 'حراري' },
        ],
      },
      { key: 'pdfTemplate', labelEn: 'PDF template', labelAr: 'قالب PDF', type: 'text' },
      { key: 'printCopies', labelEn: 'Print copies', labelAr: 'عدد النسخ', type: 'number' },
    ],
  },
  accounting: {
    labelEn: 'Accounting',
    labelAr: 'المحاسبة',
    icon: 'calculator',
    fields: [
      { key: 'fiscalYearStartMonth', labelEn: 'Fiscal year start (month)', labelAr: 'بداية السنة المالية (شهر)', type: 'number' },
      { key: 'defaultSalesAccount', labelEn: 'Default sales account', labelAr: 'حساب المبيعات الافتراضي', type: 'text' },
      { key: 'defaultPurchaseAccount', labelEn: 'Default purchase account', labelAr: 'حساب المشتريات الافتراضي', type: 'text' },
      { key: 'defaultTaxAccount', labelEn: 'Default VAT account', labelAr: 'حساب الضريبة الافتراضي', type: 'text' },
      { key: 'defaultReceivableAccount', labelEn: 'Default receivable account', labelAr: 'حساب المدينون', type: 'text' },
      { key: 'defaultPayableAccount', labelEn: 'Default payable account', labelAr: 'حساب الدائنون', type: 'text' },
      { key: 'defaultCashAccount', labelEn: 'Default cash account', labelAr: 'حساب النقدية', type: 'text' },
      { key: 'journalPrefix', labelEn: 'Journal prefix', labelAr: 'بادئة القيد', type: 'text' },
      { key: 'allowManualJournals', labelEn: 'Allow manual journals', labelAr: 'السماح بالقيود اليدوية', type: 'toggle' },
      { key: 'requireApproval', labelEn: 'Require approval', labelAr: 'طلب الموافقة', type: 'toggle' },
      {
        key: 'roundingMode',
        labelEn: 'Rounding',
        labelAr: 'التقريب',
        type: 'select',
        options: [
          { value: 'NONE', labelEn: 'None', labelAr: 'بدون' },
          { value: 'NEAREST', labelEn: 'Nearest', labelAr: 'الأقرب' },
          { value: 'UP', labelEn: 'Up', labelAr: 'أعلى' },
          { value: 'DOWN', labelEn: 'Down', labelAr: 'أدنى' },
        ],
      },
      { key: 'currencyDecimals', labelEn: 'Currency decimals', labelAr: 'خانات العملة', type: 'number' },
    ],
  },
  tax: {
    labelEn: 'Tax',
    labelAr: 'الضرائب',
    icon: 'scale',
    fields: [
      { key: 'vatEnabled', labelEn: 'VAT enabled', labelAr: 'تفعيل الضريبة', type: 'toggle' },
      { key: 'defaultRateBp', labelEn: 'Default rate (bp)', labelAr: 'النسبة الافتراضية (نقطة أساس)', type: 'number' },
      { key: 'salesRateBp', labelEn: 'Sales rate (bp)', labelAr: 'نسبة المبيعات (نقطة أساس)', type: 'number' },
      { key: 'purchasesRateBp', labelEn: 'Purchases rate (bp)', labelAr: 'نسبة المشتريات (نقطة أساس)', type: 'number' },
      { key: 'companyTaxNumber', labelEn: 'Company VAT number', labelAr: 'الرقم الضريبي للشركة', type: 'text' },
      { key: 'pricesIncludeTax', labelEn: 'Prices include VAT', labelAr: 'الأسعار شاملة الضريبة', type: 'toggle' },
      {
        key: 'calculationMethod',
        labelEn: 'Calculation method',
        labelAr: 'طريقة الاحتساب',
        type: 'select',
        options: [
          { value: 'LINE', labelEn: 'Per line', labelAr: 'لكل بند' },
          { value: 'TOTAL', labelEn: 'On total', labelAr: 'على الإجمالي' },
        ],
      },
      { key: 'exemptEnabled', labelEn: 'Exemptions enabled', labelAr: 'تفعيل الإعفاءات', type: 'toggle' },
      { key: 'exemptNoteEn', labelEn: 'Exemption note (EN)', labelAr: 'ملاحظة الإعفاء (EN)', type: 'text' },
      { key: 'exemptNoteAr', labelEn: 'Exemption note (AR)', labelAr: 'ملاحظة الإعفاء (AR)', type: 'text' },
    ],
  },
  hr: {
    labelEn: 'Human resources',
    labelAr: 'الموارد البشرية',
    icon: 'users',
    fields: [
      { key: 'workdayStart', labelEn: 'Workday start', labelAr: 'بداية الدوام', type: 'text' },
      { key: 'workdayEnd', labelEn: 'Workday end', labelAr: 'نهاية الدوام', type: 'text' },
      { key: 'workDaysPerWeek', labelEn: 'Work days per week', labelAr: 'أيام العمل بالأسبوع', type: 'number' },
      { key: 'annualLeaveDays', labelEn: 'Annual leave (days)', labelAr: 'الإجازة السنوية (أيام)', type: 'number' },
      { key: 'attendanceEnabled', labelEn: 'Attendance tracking', labelAr: 'تتبع الحضور', type: 'toggle' },
      { key: 'attendanceGraceMinutes', labelEn: 'Attendance grace (min)', labelAr: 'سماح الحضور (دقائق)', type: 'number' },
      { key: 'overtimeEnabled', labelEn: 'Overtime enabled', labelAr: 'تفعيل الوقت الإضافي', type: 'toggle' },
      { key: 'overtimeRateBp', labelEn: 'Overtime rate (bp)', labelAr: 'نسبة الوقت الإضافي (نقطة أساس)', type: 'number' },
      { key: 'payrollDayOfMonth', labelEn: 'Payroll day of month', labelAr: 'يوم الرواتب', type: 'number' },
      { key: 'requireDocuments', labelEn: 'Require documents', labelAr: 'طلب المستندات', type: 'toggle' },
    ],
  },
  purchasing: {
    labelEn: 'Purchasing',
    labelAr: 'المشتريات',
    icon: 'truck',
    fields: [
      { key: 'orderPrefix', labelEn: 'PO prefix', labelAr: 'بادئة أمر الشراء', type: 'text' },
      { key: 'nextOrderNumber', labelEn: 'Next PO number', labelAr: 'رقم أمر الشراء التالي', type: 'number' },
      { key: 'defaultWarehouseId', labelEn: 'Default warehouse', labelAr: 'المستودع الافتراضي', type: 'text' },
      {
        key: 'valuationMethod',
        labelEn: 'Valuation',
        labelAr: 'التقييم',
        type: 'select',
        options: [
          { value: 'MOVING_AVERAGE', labelEn: 'Moving average', labelAr: 'المتوسط المرجّح' },
          { value: 'FIFO', labelEn: 'FIFO', labelAr: 'الوارد أولاً' },
        ],
      },
      { key: 'lowStockAlertsEnabled', labelEn: 'Low-stock alerts', labelAr: 'تنبيهات المخزون', type: 'toggle' },
      { key: 'reorderLeadDays', labelEn: 'Reorder lead (days)', labelAr: 'مهلة إعادة الطلب (أيام)', type: 'number' },
      { key: 'requireSupplierTaxNumber', labelEn: 'Require supplier VAT number', labelAr: 'طلب الرقم الضريبي للمورد', type: 'toggle' },
    ],
  },
  inventory: {
    labelEn: 'Inventory',
    labelAr: 'المخزون',
    icon: 'warehouse',
    fields: [
      {
        key: 'valuationMethod',
        labelEn: 'Valuation',
        labelAr: 'التقييم',
        type: 'select',
        options: [
          { value: 'MOVING_AVERAGE', labelEn: 'Moving average', labelAr: 'المتوسط المرجّح' },
          { value: 'FIFO', labelEn: 'FIFO', labelAr: 'الوارد أولاً' },
        ],
      },
      { key: 'lowStockThreshold', labelEn: 'Low-stock threshold', labelAr: 'حد المخزون المنخفض', type: 'number' },
      { key: 'allowNegativeStock', labelEn: 'Allow negative stock', labelAr: 'السماح بالمخزون السالب', type: 'toggle' },
      { key: 'defaultWarehouseId', labelEn: 'Default warehouse', labelAr: 'المستودع الافتراضي', type: 'text' },
      { key: 'barcodeRequired', labelEn: 'Require barcode', labelAr: 'طلب الباركود', type: 'toggle' },
    ],
  },
  sales: {
    labelEn: 'Sales & customers',
    labelAr: 'المبيعات والعملاء',
    icon: 'cart',
    fields: [
      { key: 'quotationPrefix', labelEn: 'Quotation prefix', labelAr: 'بادئة عرض السعر', type: 'text' },
      { key: 'orderPrefix', labelEn: 'Order prefix', labelAr: 'بادئة أمر البيع', type: 'text' },
      { key: 'invoicePrefix', labelEn: 'Invoice prefix', labelAr: 'بادئة الفاتورة', type: 'text' },
      { key: 'defaultCustomerTermsDays', labelEn: 'Default terms (days)', labelAr: 'مهلة السداد الافتراضية (أيام)', type: 'number' },
      { key: 'defaultCreditLimitMinor', labelEn: 'Default credit limit (minor)', labelAr: 'حد الائتمان الافتراضي', type: 'number' },
      { key: 'allowDiscounts', labelEn: 'Allow discounts', labelAr: 'السماح بالخصومات', type: 'toggle' },
      { key: 'maxDiscountBp', labelEn: 'Max discount (bp)', labelAr: 'أقصى خصم (نقطة أساس)', type: 'number' },
      { key: 'requireCustomerDocuments', labelEn: 'Require customer documents', labelAr: 'طلب مستندات العميل', type: 'toggle' },
    ],
  },
  maintenance: {
    labelEn: 'Maintenance',
    labelAr: 'الصيانة',
    icon: 'wrench',
    fields: [
      { key: 'orderPrefix', labelEn: 'Work order prefix', labelAr: 'بادئة أمر الصيانة', type: 'text' },
      { key: 'nextOrderNumber', labelEn: 'Next work order number', labelAr: 'رقم أمر الصيانة التالي', type: 'number' },
      { key: 'defaultLabourRateMinor', labelEn: 'Default labour rate (minor)', labelAr: 'أجر العمل الافتراضي', type: 'number' },
      { key: 'defaultTaxRateBp', labelEn: 'Default VAT (bp)', labelAr: 'الضريبة الافتراضية (نقطة أساس)', type: 'number' },
      { key: 'requireInspection', labelEn: 'Require inspection', labelAr: 'طلب الفحص', type: 'toggle' },
      { key: 'allowPartsFromAnyWarehouse', labelEn: 'Parts from any warehouse', labelAr: 'قطع من أي مستودع', type: 'toggle' },
      { key: 'autoAssignTechnician', labelEn: 'Auto-assign technician', labelAr: 'إسناد الفني تلقائياً', type: 'toggle' },
    ],
  },
  documents: {
    labelEn: 'Documents',
    labelAr: 'المستندات',
    icon: 'file',
    fields: [
      { key: 'headerTextEn', labelEn: 'Header (EN)', labelAr: 'الترويسة (EN)', type: 'text' },
      { key: 'headerTextAr', labelEn: 'Header (AR)', labelAr: 'الترويسة (AR)', type: 'text' },
      { key: 'footerTextEn', labelEn: 'Footer (EN)', labelAr: 'التذييل (EN)', type: 'text' },
      { key: 'footerTextAr', labelEn: 'Footer (AR)', labelAr: 'التذييل (AR)', type: 'text' },
      { key: 'contactLine', labelEn: 'Contact line', labelAr: 'سطر التواصل', type: 'text' },
      { key: 'showStamp', labelEn: 'Show stamp', labelAr: 'إظهار الختم', type: 'toggle' },
      { key: 'showSignature', labelEn: 'Show signature', labelAr: 'إظهار التوقيع', type: 'toggle' },
      { key: 'stampUrl', labelEn: 'Stamp image URL', labelAr: 'رابط صورة الختم', type: 'text' },
      { key: 'signatureUrl', labelEn: 'Signature image URL', labelAr: 'رابط صورة التوقيع', type: 'text' },
      {
        key: 'paperSize',
        labelEn: 'Paper size',
        labelAr: 'حجم الورق',
        type: 'select',
        options: [
          { value: 'A4', labelEn: 'A4', labelAr: 'A4' },
          { value: 'A5', labelEn: 'A5', labelAr: 'A5' },
          { value: 'THERMAL', labelEn: 'Thermal', labelAr: 'حراري' },
        ],
      },
    ],
  },
};

export function CompanySettingsCentre({ canEdit }: { canEdit: boolean }) {
  const { t, locale } = useUi();
  const { companyId } = useAuth();
  const { refreshTypography } = useBranding();
  const [active, setActive] = useState<CompanySettingSection>('general');
  const [values, setValues] = useState<Record<string, SectionData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const meta = SECTION_META[active];

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .companySettings(companyId)
      .then((res) => {
        if (!cancelled) setValues(res.sections as unknown as Record<string, SectionData>);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('common.error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, t]);

  const current = useMemo(
    () => ({ ...COMPANY_SETTING_DEFAULTS[active], ...(values[active] ?? {}) }) as SectionData,
    [active, values],
  );

  const setField = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [active]: { ...(prev[active] ?? {}), [key]: value } }));

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await api.updateCompanySettingSection(active, values[active] ?? {}, companyId);
      setValues((prev) => ({ ...prev, [active]: updated }));
      setSaved(true);
      // Typography is applied to the document root, so the shell must re-read it
      // the moment it is saved or the change would only appear after a reload.
      if (active === 'typography') await refreshTypography();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="settings-centre">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('settings.centre')}>
        {COMPANY_SETTING_SECTIONS.map((section) => {
          const m = SECTION_META[section];
          return (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={active === section}
              className={`oryx-btn oryx-btn--sm ${active === section ? 'oryx-btn--primary' : ''}`}
              onClick={() => {
                setActive(section);
                setSaved(false);
              }}
              data-testid={`settings-tab-${section}`}
            >
              <Icon name={m.icon} size={14} />
              {locale === 'ar' ? m.labelAr : m.labelEn}
            </button>
          );
        })}
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {saved ? (
        <p
          className="m-0 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px] font-semibold"
          style={{
            color: 'var(--success)',
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
          }}
          data-testid="settings-section-saved"
        >
          <Icon name="check" size={15} />
          {t('settings.saved')}
        </p>
      ) : null}

      <Card className="p-4" data-testid={`settings-panel-${active}`}>
        <p className="oryx-panel-title m-0 mb-4">{locale === 'ar' ? meta.labelAr : meta.labelEn}</p>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={40} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {meta.fields.map((f) => (
              <Field key={f.key} label={locale === 'ar' ? f.labelAr : f.labelEn}>
                {f.type === 'toggle' ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(current[f.key])}
                    disabled={!canEdit}
                    className={`oryx-btn oryx-btn--sm ${current[f.key] ? 'oryx-btn--primary' : ''}`}
                    onClick={() => setField(f.key, !current[f.key])}
                    data-testid={`setting-${active}-${f.key}`}
                  >
                    <Icon name={current[f.key] ? 'check' : 'close'} size={14} />
                    {current[f.key] ? t('common.yes') : t('common.no')}
                  </button>
                ) : f.type === 'select' ? (
                  <select
                    className="oryx-input"
                    disabled={!canEdit}
                    value={String(current[f.key] ?? '')}
                    onChange={(e) => setField(f.key, e.target.value)}
                    data-testid={`setting-${active}-${f.key}`}
                  >
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {locale === 'ar' ? o.labelAr : o.labelEn}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="oryx-input"
                    type={f.type === 'number' ? 'number' : 'text'}
                    disabled={!canEdit}
                    value={String(current[f.key] ?? '')}
                    onChange={(e) =>
                      setField(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)
                    }
                    data-testid={`setting-${active}-${f.key}`}
                  />
                )}
              </Field>
            ))}
          </div>
        )}
        {canEdit ? (
          <div className="mt-4">
            <Button variant="primary" disabled={saving || loading} onClick={() => void save()} data-testid="save-settings-section">
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
