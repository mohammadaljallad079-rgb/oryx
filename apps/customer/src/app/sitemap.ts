import type { MetadataRoute } from 'next';
import { SITE_URL, publicFetch } from '@/lib/structured-data';

/**
 * Sitemap.
 *
 * The four sections and the other static routes are listed explicitly; the
 * product entries are read from the public API, so a newly published product
 * appears without a code change. If the API is unreachable the sitemap still
 * returns the static routes rather than failing the build.
 */

const STATIC_ROUTES = [
  '',
  '/services',
  '/services/inspections',
  '/services/maintenance',
  '/products',
  '/spare-parts',
  '/categories',
  '/providers',
  '/about',
  '/contact',
] as const;

interface ProductPage {
  items: Array<{ id: string }>;
  total: number;
}

/**
 * Page through the catalogue.
 *
 * The endpoint caps `pageSize` at 50, so asking for everything at once is
 * rejected; the loop stops when the collected count reaches `total` or a page
 * comes back empty, and is bounded so a pathological response cannot hang the
 * build.
 */
async function fetchAllProductIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const body = await publicFetch<ProductPage>(`/customer/catalog/products?pageSize=50&page=${page}`);
    if (!body || body.items.length === 0) break;
    ids.push(...body.items.map((item) => item.id));
    if (ids.length >= body.total) break;
  }
  return ids;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  const productIds = await fetchAllProductIds();
  const productRoutes: MetadataRoute.Sitemap = productIds.map((id) => ({
    url: `${SITE_URL}/products/${id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes];
}
