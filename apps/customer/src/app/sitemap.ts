import type { MetadataRoute } from 'next';
import { SERVICE_CATEGORIES } from '@/lib/api';
import { SITE_URL, SERVER_API_BASE, publicFetch } from '@/lib/structured-data';

/**
 * sitemap.xml.
 *
 * The static routes and the service catalogue are listed explicitly; the
 * product entries are read from the public API, so a newly published product
 * appears without a code change. Both storefronts are covered: the marketplace
 * catalogue (`/products/:id`) and the parts store (`/store/:sku`). If the API is
 * unreachable the sitemap still returns the static and service routes rather
 * than failing the build.
 */

const STATIC_ROUTES = [
  '',
  '/services',
  '/booking',
  '/store',
  '/offers',
  '/branches',
  '/products',
  '/categories',
  '/providers',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
] as const;

interface ProductPage {
  items: Array<{ id: string }>;
  total: number;
}

interface StorefrontProductPage {
  items: Array<{ sku: string; updatedAt?: string }>;
  total: number;
}

/**
 * Page through a catalogue endpoint.
 *
 * Both catalogue endpoints cap `pageSize`, so asking for everything at once is
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

async function fetchAllStorefrontSkus(): Promise<Array<{ sku: string; updatedAt?: string }>> {
  const collected: Array<{ sku: string; updatedAt?: string }> = [];
  for (let page = 1; page <= 100; page += 1) {
    try {
      const response = await fetch(
        `${SERVER_API_BASE}/v1/storefront/products?pageSize=60&page=${page}`,
        { cache: 'no-store' },
      );
      if (!response.ok) break;
      const body = (await response.json()) as StorefrontProductPage;
      collected.push(...body.items);
      if (collected.length >= body.total || body.items.length === 0) break;
    } catch {
      break;
    }
  }
  return collected;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  const serviceRoutes: MetadataRoute.Sitemap = SERVICE_CATEGORIES.map((category) => ({
    url: `${SITE_URL}/services/${encodeURIComponent(category.key)}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const [productIds, storefrontProducts] = await Promise.all([
    fetchAllProductIds(),
    fetchAllStorefrontSkus(),
  ]);

  const productRoutes: MetadataRoute.Sitemap = productIds.map((id) => ({
    url: `${SITE_URL}/products/${id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const storeRoutes: MetadataRoute.Sitemap = storefrontProducts.map((product) => ({
    url: `${SITE_URL}/store/${product.sku}`,
    lastModified: product.updatedAt ? new Date(product.updatedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...serviceRoutes, ...productRoutes, ...storeRoutes];
}
