/**
 * Server-side helpers for SEO metadata and JSON-LD structured data.
 *
 * The public pages are client components, so their per-route `layout.tsx`
 * files fetch the catalogue on the server and emit `<script type="application/
 * ld+json">` blocks plus canonical/Open Graph tags. The API base here must be
 * absolute because these run in the Node process, not the browser.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002').replace(
  /\/$/,
  '',
);

function absoluteHttp(value: string | undefined): string | undefined {
  if (!value || !/^https?:\/\//i.test(value)) return undefined;
  return value.replace(/\/$/, '');
}

/**
 * Absolute API origin for server-side fetches.
 *
 * `NEXT_PUBLIC_API_BASE_URL` is inlined at build time and is deliberately
 * browser-relative (`/api`) so the browser talks to the site origin. Node's
 * `fetch` cannot resolve a relative URL, so a relative value is ignored here
 * and an absolute origin is used instead.
 */
export const SERVER_API_BASE =
  absoluteHttp(process.env.ORYX_API_BASE_URL) ??
  absoluteHttp(process.env.NEXT_PUBLIC_API_BASE_URL) ??
  'http://127.0.0.1:3001/api';

export async function publicFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${SERVER_API_BASE}/v1${path}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface ProductLike {
  sku: string;
  partNumber: string | null;
  nameEn: string;
  nameAr: string;
  brand: string | null;
  categoryKey: string | null;
  condition: 'NEW' | 'REFURBISHED';
  priceMinor: number;
  currency: string;
  currencyScale: number;
  descriptionEn: string | null;
  descriptionAr: string | null;
  image: string;
  inStock: boolean;
}

export interface ServiceLike {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  image: string;
}

export interface BranchLike {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string | null;
  addressLine: string | null;
  phone: string | null;
  email: string | null;
  image: string | null;
}

/** Minor units -> decimal string, e.g. 41800 @ scale 3 -> "41.800". */
export function money(minor: number, scale: number): string {
  return (minor / 10 ** scale).toFixed(scale);
}

export function productJsonLd(product: ProductLike): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.nameEn,
    alternateName: product.nameAr,
    sku: product.sku,
    ...(product.partNumber ? { mpn: product.partNumber } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.descriptionEn ? { description: product.descriptionEn } : {}),
    image: `${SITE_URL}${product.image}`,
    category: product.categoryKey ?? undefined,
    ...(product.condition === 'NEW'
      ? { itemCondition: 'https://schema.org/NewCondition' }
      : { itemCondition: 'https://schema.org/RefurbishedCondition' }),
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/store/${product.sku}`,
      priceCurrency: product.currency,
      price: money(product.priceMinor, product.currencyScale),
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'ORYX Auto Services' },
    },
  };
}

export function serviceJsonLd(service: ServiceLike): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.nameEn,
    alternateName: service.nameAr,
    description: service.descriptionEn,
    serviceType: service.nameEn,
    url: `${SITE_URL}/services/${service.key}`,
    image: `${SITE_URL}${service.image}`,
    provider: {
      '@type': 'AutoRepair',
      name: 'ORYX Auto Services',
      url: SITE_URL,
    },
  };
}

export function autoRepairJsonLd(branches: BranchLike[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: 'ORYX Auto Services',
    url: SITE_URL,
    image: `${SITE_URL}/media/hero-services.jpg`,
    logo: `${SITE_URL}/brand/oryx-logo.png`,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'BH',
    },
    department: branches.map((branch) => ({
      '@type': 'AutoRepair',
      name: branch.nameEn,
      ...(branch.phone ? { telephone: branch.phone } : {}),
      ...(branch.email ? { email: branch.email } : {}),
      address: {
        '@type': 'PostalAddress',
        streetAddress: branch.addressLine ?? undefined,
        addressLocality: branch.city ?? undefined,
        addressCountry: 'BH',
      },
    })),
  };
}
