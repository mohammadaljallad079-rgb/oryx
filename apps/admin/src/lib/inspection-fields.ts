import type { Locale } from '@oryx/shared';

/**
 * The identification fields the inspection report prints on its cover.
 *
 * The report's cover is the source of truth: it carries these eleven values
 * under these exact bilingual labels. The entry form and the workspace render
 * the same keys, so the input screen mirrors the printed document field for
 * field rather than approximating it.
 */
export type InspectionIdentityKey =
  | 'customerName'
  | 'contactNumber'
  | 'inspectedAt'
  | 'jobNumber'
  | 'plateNumber'
  | 'make'
  | 'model'
  | 'modelYear'
  | 'odometer'
  | 'color'
  | 'vin';

export const INSPECTION_IDENTITY_FIELDS: Record<InspectionIdentityKey, { en: string; ar: string }> = {
  customerName: { en: 'Customer Name', ar: 'اسم العميل' },
  contactNumber: { en: 'Contact No.', ar: 'رقم التواصل' },
  inspectedAt: { en: 'Date & Time', ar: 'التاريخ والوقت' },
  jobNumber: { en: 'Job No.', ar: 'رقم العمل' },
  plateNumber: { en: 'Plate No.', ar: 'رقم اللوحة' },
  make: { en: 'Car Make', ar: 'نوع السيارة' },
  model: { en: 'Car Model', ar: 'طراز السيارة' },
  modelYear: { en: 'Car Year', ar: 'سنة الصنع' },
  odometer: { en: 'ODO Meter', ar: 'عداد المسافات' },
  color: { en: 'Car Color', ar: 'لون السيارة' },
  vin: { en: 'VIN Number', ar: 'رقم القاعدة (الشاصي)' },
};

/** The cover's section heading, printed above the identification grid. */
export const INSPECTION_VEHICLE_INFO = { en: 'Vehicle Information', ar: 'معلومات المركبة' };

/**
 * The cover grid, cell by cell, in the order the report prints it.
 *
 * Each row carries four cells; the VIN closes the table across two columns, the
 * way the approved form prints it. The entry form and the workspace render from
 * this list, so the screen layout follows the printed table rather than being
 * maintained twice.
 */
export const INSPECTION_COVER_ROWS: Array<
  Array<{ key: InspectionIdentityKey; span?: 2 }>
> = [
  [
    { key: 'customerName' },
    { key: 'contactNumber' },
    { key: 'inspectedAt' },
    { key: 'jobNumber' },
  ],
  [
    { key: 'plateNumber' },
    { key: 'make' },
    { key: 'model' },
    { key: 'modelYear' },
  ],
  [
    { key: 'odometer' },
    { key: 'color' },
    { key: 'vin', span: 2 },
  ],
];

/** The printed label for one cover field, in the active interface language. */
export function inspectionFieldLabel(
  key: InspectionIdentityKey | 'vehicleInformation',
  locale: Locale,
): string {
  const entry = key === 'vehicleInformation' ? INSPECTION_VEHICLE_INFO : INSPECTION_IDENTITY_FIELDS[key];
  return locale === 'ar' ? entry.ar : entry.en;
}

/** The bilingual label pair for one cover field, as the report prints both. */
export function inspectionFieldLabelParts(key: InspectionIdentityKey): { en: string; ar: string } {
  return INSPECTION_IDENTITY_FIELDS[key];
}
