import type { MetadataRoute } from 'next';
import { SERVER_API_BASE } from '@/lib/structured-data';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002';

/**
 * Sitemap.
 *
 * The static routes are listed explicitly and the catalogue entries are read
 * from the public API, so a newly published product or service appears without
 * a code change. If the API is unreachable the sitemap still returns the static
 * routes rather than failing the build.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    '',
    '/services',
    '/booking',
    '/store',
    '/offers',
    '/branches',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.7,
  }));

  // Server-side fetch: needs an absolute origin, unlike the browser client
  // which goes through the site's own `/api` rewrite. `SERVER_API_BASE` is
  // already absolute (a relative `NEXT_PUBLIC_API_BASE_URL` is ignored).
  const apiBase = SERVER_API_BASE;

  // The catalogue endpoint caps `pageSize` at 60, so page through it rather
  // than asking for everything at once (which the API rejects with a 400).
  const fetchAllProducts = async (): Promise<Array<{ sku: string; updatedAt?: string }>> => {
    const collected: Array<{ sku: string; updatedAt?: string }> = [];
    for (let page = 1; page <= 50; page += 1) {
      const response = await fetch(
        `${apiBase}/v1/storefront/products?pageSize=60&page=${page}`,
        { cache: 'no-store' },
      );
      if (!response.ok) break;
      const body = (await response.json()) as {
        items: Array<{ sku: string; updatedAt?: string }>;
        total: number;
      };
      collected.push(...body.items);
      if (collected.length >= body.total || body.items.length === 0) break;
    }
    return collected;
  };

  try {
    const [services, products] = await Promise.all([
      fetch(`${apiBase}/v1/storefront/services`, { cache: 'no-store' }).then((r) => r.json()),
      fetchAllProducts(),
    ]);

    const serviceRoutes = (services as Array<{ key: string }>).map((service) => ({
      url: `${siteUrl}/services/${service.key}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

    const productRoutes = products.map((product) => ({
      url: `${siteUrl}/store/${product.sku}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    return [...staticRoutes, ...serviceRoutes, ...productRoutes];
  } catch {
    return staticRoutes;
  }
}
