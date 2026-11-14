/**
 * Server-side helpers for SEO metadata and JSON-LD structured data.
 *
 * The public pages are client components, so their per-route `layout.tsx` files
 * fetch the catalogue on the server and emit `<script type="application/ld+json">`
 * blocks plus canonical and Open Graph tags. The API base here must be absolute
 * because these run in the Node process, not the browser: the browser client
 * deliberately uses a relative `/api` so the site talks to the API same-origin.
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
 * `fetch` cannot resolve a relative URL, so a relative value is ignored here and
 * an absolute origin is used instead.
 */
export const SERVER_API_BASE =
  absoluteHttp(process.env.ORYX_API_BASE_URL) ??
  absoluteHttp(process.env.NEXT_PUBLIC_API_BASE_URL) ??
  'http://127.0.0.1:3001/api';

/** A public read that returns null instead of throwing, for build-time SEO. */
export async function publicFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${SERVER_API_BASE}/v1${path}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Resolve a possibly-relative asset path to an absolute URL for JSON-LD. */
export function absoluteAsset(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Minor units -> decimal string, e.g. 41800 @ scale 3 -> "41.800". */
export function money(minor: number, scale = 3): string {
  return (minor / 10 ** scale).toFixed(scale);
}

/** The shape `GET /customer/catalog/products/:id` returns. */
export interface CatalogProductLike {
  id: string;
  sku: string;
  name: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  available: boolean;
  imageUrl: string | null;
  store: { id: string; code: string; name: string };
}

export interface CatalogCategoryLike {
  key: string;
  name: string;
  imageUrl: string | null;
}

/**
 * Product structured data.
 *
 * Prices are published in BHD (ISO 4217, three decimals). An out-of-stock item
 * is emitted as `OutOfStock` rather than omitted, so a search engine does not
 * keep advertising an availability the store cannot honour.
 */
export function productJsonLd(product: CatalogProductLike): Record<string, unknown> {
  const price = money(product.priceMinor);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.nameEn || product.name,
    ...(product.nameAr ? { alternateName: product.nameAr } : {}),
    sku: product.sku,
    ...(product.imageUrl ? { image: [absoluteAsset(product.imageUrl)].filter(Boolean) } : {}),
    brand: { '@type': 'Brand', name: product.store?.name ?? 'ORYX' },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/products/${product.id}`,
      priceCurrency: 'BHD',
      price,
      availability: product.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: product.store?.name ?? 'ORYX' },
    },
  };
}

/** ItemList of a catalogue page, so search engines understand the listing. */
export function productListJsonLd(
  products: CatalogProductLike[],
  canonicalUrl: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: canonicalUrl,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/products/${product.id}`,
      name: product.nameEn || product.name,
    })),
  };
}

/** A single ORYX service offering. */
export function serviceJsonLd(service: {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.nameEn,
    ...(service.nameAr ? { alternateName: service.nameAr } : {}),
    ...(service.descriptionEn ? { description: service.descriptionEn } : {}),
    serviceType: service.nameEn,
    url: `${SITE_URL}/services?category=${encodeURIComponent(service.key)}`,
    provider: { '@type': 'Organization', name: 'ORYX Auto Services' },
    areaServed: { '@type': 'Country', name: 'Bahrain' },
  };
}

/**
 * LocalBusiness for the ORYX service centres.
 *
 * Only fields the owner has published are emitted; no address, phone number or
 * opening hours are invented. Coordinates are omitted unless real ones exist,
 * because a wrong pin is worse than none.
 */
export function localBusinessJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: 'ORYX Auto Services',
    url: SITE_URL,
    image: `${SITE_URL}/media/auto-service.jpg`,
    description:
      'ORYX automotive services: inspections, maintenance, repair and genuine spare parts in Bahrain.',
    areaServed: { '@type': 'Country', name: 'Bahrain' },
    priceRange: 'BHD',
  };
}

/** Organization, emitted once from the root layout. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ORYX',
    url: SITE_URL,
    logo: `${SITE_URL}/brand/oryx-logo-on-light.png`,
  };
}

/** A WebSite node with a search action, so a sitelinks search box can appear. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ORYX Auto Services',
    url: SITE_URL,
    inLanguage: ['ar', 'en'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/products?query={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
