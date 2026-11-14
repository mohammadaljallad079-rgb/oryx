import { whatsappLink } from '@oryx/shared';

/**
 * Build a WhatsApp chat link to the site-wide number from the CMS document.
 *
 * Returns `null` when no number is configured, so every WhatsApp action can be
 * hidden rather than rendered as a dead link.
 */
export function siteWhatsappLink(
  number: string | null | undefined,
  message?: string,
): string | null {
  return whatsappLink(number, message);
}

/** Format a minor-unit amount the way the site shows it, e.g. `1.750 BHD`. */
export function formatMinorAmount(minor: number, scale: number, currency: string): string {
  return `${(minor / 10 ** scale).toLocaleString('en-BH', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  })} ${currency}`;
}

/**
 * Absolute link to a product page.
 *
 * Built from the build-time site URL, not `window.location`, so the server and
 * client render the same enquiry text and hydration does not mismatch.
 */
export function productUrl(sku: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  return `${origin}/store/${sku}`;
}

/** The enquiry text a product action pre-fills, in the visitor's language. */
export function productEnquiryMessage(input: {
  locale: 'ar' | 'en';
  name: string;
  sku: string;
  price: string;
  url: string;
}): string {
  if (input.locale === 'ar') {
    return [
      'مرحباً أوريكس، أرغب في طلب قطعة الغيار التالية:',
      `• الاسم: ${input.name}`,
      `• رقم القطعة: ${input.sku}`,
      `• السعر: ${input.price}`,
      `• الرابط: ${input.url}`,
    ].join('\n');
  }
  return [
    'Hello ORYX, I would like to order the following spare part:',
    `• Item: ${input.name}`,
    `• Part number: ${input.sku}`,
    `• Price: ${input.price}`,
    `• Link: ${input.url}`,
  ].join('\n');
}
