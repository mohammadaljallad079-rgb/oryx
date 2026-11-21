import type { StorefrontInspectionService } from './api';

/**
 * The one-line text shown under an inspection's name.
 *
 * An operator may write a description of their own; when they have not, the
 * approved catalogue's summary is shown in the reader's language rather than
 * leaving the card blank or falling back to the other language.
 */
export function inspectionDescription(
  service: Pick<StorefrontInspectionService, 'description' | 'summaryEn' | 'summaryAr'>,
  locale: string,
): string {
  if (service.description) return service.description;
  return (locale === 'ar' ? service.summaryAr : service.summaryEn) ?? '';
}
