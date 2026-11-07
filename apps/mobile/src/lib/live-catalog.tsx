/**
 * The server-backed consumer catalogue.
 *
 * Reads the public catalogue the API serves (`/customer/catalog/...`). It is
 * public by design — a guest browses parts and stores before signing in — so the
 * requests carry no token and no account.
 *
 * ## What is never invented
 *
 * A product's rating, review count and discount are not in the public projection,
 * so the cards are given neutral values and simply draw no badge. A store's
 * delivery fee and rating are likewise absent, so the card does not claim free
 * delivery it cannot substantiate. Availability is the API's boolean, not a stock
 * count the catalogue deliberately withholds.
 *
 * ## Demo fallback is explicit
 *
 * A screen decides what to show when this returns nothing; the store never
 * substitutes a demo record for a failed call. `mode` says which source the
 * caller is looking at.
 */
import { useCallback, useMemo, useState } from 'react';

import {
  catalogApi,
  marketplaceApi,
  type CatalogCategory,
  type CatalogProduct,
  type CatalogStore,
  type PublicProvider,
} from './api';
import { useAsync } from './use-async';
import { useApp } from './app-context';

export interface LiveCatalogState {
  products: CatalogProduct[];
  stores: CatalogStore[];
  categories: CatalogCategory[];
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/** Reads the catalogue, optionally narrowed by a query and a tenant. */
export function useLiveCatalog(params: {
  query?: string;
  companyId?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name';
  enabled?: boolean;
}): LiveCatalogState {
  const { locale, dataVersion } = useApp();
  const enabled = params.enabled ?? true;
  const query = params.query?.trim() ?? '';
  const companyId = params.companyId;
  const sort = params.sort ?? 'relevance';

  const products = useAsync(async () => {
    if (!enabled) return [] as CatalogProduct[];
    const page = await catalogApi.products({ locale, query: query || undefined, companyId, sort, pageSize: 50 });
    return page.items;
  }, [locale, query, companyId, sort, enabled, dataVersion]);

  const stores = useAsync(async () => {
    if (!enabled) return [] as CatalogStore[];
    const page = await catalogApi.stores({ locale, query: query || undefined, sort: 'products' });
    return page.items;
  }, [locale, query, enabled, dataVersion]);

  const categories = useAsync(async () => {
    const page = await catalogApi.categories(locale);
    return page.items;
  }, [locale, dataVersion]);

  return {
    products: products.data ?? [],
    stores: stores.data ?? [],
    categories: categories.data ?? [],
    loading: products.loading || stores.loading,
    error: (products.error ?? stores.error) as Error | null,
    reload: products.reload,
  };
}

/**
 * One product with its images and related items.
 *
 * `related` comes from the API's own same-tenant selection, so the rail cannot
 * suggest a product from another catalogue.
 */
export function useLiveProduct(id: string | undefined) {
  const { locale, dataVersion } = useApp();
  return useAsync(async () => {
    if (!id) return null;
    return catalogApi.product(id, locale);
  }, [id, locale, dataVersion]);
}

/** One store with its whole public catalogue. */
export function useLiveStore(id: string | undefined) {
  const { locale, dataVersion } = useApp();
  return useAsync(async () => {
    if (!id) return null;
    return catalogApi.store(id, locale);
  }, [id, locale, dataVersion]);
}

/**
 * Client-side narrowing of a live product list.
 *
 * Only the filters the public projection can honour: a text term over the name,
 * SKU and store, a price sort, and availability. A filter the API cannot express
 * (a discount, a car make) is not offered against live data rather than applied
 * to fields that do not exist.
 */
export function filterLiveProducts(
  products: CatalogProduct[],
  filter: { query?: string; sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name'; availableOnly?: boolean },
): CatalogProduct[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  let out = products.filter((p) => {
    if (filter.availableOnly && !p.available) return false;
    if (!q) return true;
    return `${p.nameEn} ${p.nameAr} ${p.sku} ${p.store.name}`.toLowerCase().includes(q);
  });
  switch (filter.sort) {
    case 'price_asc':
      out = [...out].sort((a, b) => a.priceMinor - b.priceMinor);
      break;
    case 'price_desc':
      out = [...out].sort((a, b) => b.priceMinor - a.priceMinor);
      break;
    case 'name':
      out = [...out].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
      break;
    default:
      break;
  }
  return out;
}

/**
 * The approved service providers, from the real public marketplace.
 *
 * Only `APPROVED` providers are returned, and the rating is the server's
 * aggregate over published reviews only. A guest can read this: the directory is
 * public, so it carries no token.
 */
export function useLiveProviders(params: { categoryKey?: string; enabled?: boolean } = {}) {
  const { dataVersion } = useApp();
  const enabled = params.enabled ?? true;
  const categoryKey = params.categoryKey;

  const providers = useAsync(async () => {
    if (!enabled) return [] as PublicProvider[];
    const page = await marketplaceApi.providers({
      categoryKey: categoryKey && categoryKey !== 'all' ? categoryKey : undefined,
      pageSize: 50,
    });
    return page.items;
  }, [categoryKey, enabled, dataVersion]);

  return {
    providers: providers.data ?? [],
    loading: providers.loading,
    error: providers.error,
    reload: providers.reload,
  };
}

/** A small helper for a screen that wants a client-side term over live rows. */
export function useLocalQuery(initial = '') {
  const [value, setValue] = useState(initial);
  const onChange = useCallback((next: string) => setValue(next), []);
  return useMemo(() => ({ value, setValue: onChange }), [value, onChange]);
}
