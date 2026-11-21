/**
 * The marketplace data access layer.
 *
 * Every screen calls this module and never imports `demo/*` directly. That is
 * the whole point: when the backend is connected, each function below is
 * reimplemented against the API and no screen changes. The signatures are
 * already shaped like the eventual HTTP calls — they take an optional filter
 * object, they return promises, and they never expose a demo-only field.
 *
 * The demo implementation reads the seeded catalogue in `demo/`. It resolves
 * synchronously but is wrapped in a resolved promise so swapping in `fetch`
 * later is not a breaking change.
 *
 * A deliberately small artificial delay is applied on list reads so the loading
 * states are real and reviewable rather than unreachable code.
 */

import {
  CATEGORY_PHOTO,
  DEMO_CITIES,
  DEMO_CURRENCY,
  DEMO_CURRENCY_SCALE,
  DEMO_PRODUCTS,
  DEMO_STORES,
  type CategoryKey,
  type DemoBanner,
  type DemoOffer,
  type DemoPlan,
  type DemoProduct,
  type DemoProvider,
  type DemoStore,
} from '../demo/catalogue';
import { DEMO_BANNERS, DEMO_OFFERS, DEMO_PLANS, planById } from '../demo/merchandising';
import { DEMO_PROVIDERS } from '../demo/providers';
import {
  DEMO_ACCOUNTS,
  DEMO_ADDRESSES,
  DEMO_BOOKINGS,
  DEMO_FAVOURITES,
  DEMO_NOTIFICATIONS,
  DEMO_ORDERS,
  DEMO_RECOVERY_JOBS,
  DEMO_REVENUE_SERIES,
  DEMO_SENSAGE_REPORTS,
  DEMO_VEHICLES,
  DEMO_WALLET_ENTRIES,
  SENSAGE_FINDINGS,
  demoAccountByEmail,
  demoOrder,
  demoProduct,
  demoProvider,
  demoRecoveryJob,
  demoSensageReport,
  demoStore,
  demoVehicle,
  merchantCategoryMix,
  merchantOrderStats,
  reviewsFor,
  type DemoAccount,
  type DemoAddress,
  type DemoBooking,
  type DemoNotification,
  type DemoOrder,
  type DemoRecoveryJob,
  type DemoReview,
  type DemoSensageReport,
  type DemoVehicle,
  type DemoWalletEntry,
} from '../demo/activity';

export { DEMO_CURRENCY, DEMO_CURRENCY_SCALE, CATEGORY_PHOTO, DEMO_CITIES, SENSAGE_FINDINGS };
export type {
  DemoAccount,
  DemoAddress,
  DemoBanner,
  DemoBooking,
  DemoNotification,
  DemoOffer,
  DemoOrder,
  DemoProduct,
  DemoProvider,
  DemoRecoveryJob,
  DemoReview,
  DemoSensageReport,
  DemoStore,
  DemoVehicle,
  DemoWalletEntry,
  CategoryKey,
};

/** How long the demo pretends a list read takes, so loading states are visible. */
const DEMO_LATENCY_MS = 180;

function delay<T>(value: T, ms = DEMO_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/* ------------------------------------------------------------------ catalogue */

export interface ProductFilter {
  categoryKey?: CategoryKey | 'all';
  storeId?: string;
  groupEn?: string | 'all';
  make?: string | 'all';
  /** Free-text query matched against name, brand, SKU and part group. */
  query?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  inStockOnly?: boolean;
  discountedOnly?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
}

/** Applies a filter and sort to the product list. Pure, so it is unit-testable. */
export function filterProducts(products: DemoProduct[], filter: ProductFilter): DemoProduct[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  let out = products.filter((p) => {
    if (filter.categoryKey && filter.categoryKey !== 'all' && p.categoryKey !== filter.categoryKey) return false;
    if (filter.storeId && p.storeId !== filter.storeId) return false;
    if (filter.groupEn && filter.groupEn !== 'all' && p.groupEn !== filter.groupEn) return false;
    if (filter.make && filter.make !== 'all' && !p.fits.includes(filter.make)) return false;
    if (filter.minPriceMinor != null && p.priceMinor < filter.minPriceMinor) return false;
    if (filter.maxPriceMinor != null && p.priceMinor > filter.maxPriceMinor) return false;
    if (filter.inStockOnly && p.stock <= 0) return false;
    if (filter.discountedOnly && p.compareAtMinor == null) return false;
    if (q) {
      const haystack = `${p.nameEn} ${p.nameAr} ${p.brand} ${p.sku} ${p.groupEn} ${p.groupAr}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  switch (filter.sort) {
    case 'price_asc':
      out = [...out].sort((a, b) => a.priceMinor - b.priceMinor);
      break;
    case 'price_desc':
      out = [...out].sort((a, b) => b.priceMinor - a.priceMinor);
      break;
    case 'rating':
      out = [...out].sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      break;
    case 'newest':
      out = [...out].sort((a, b) => b.id.localeCompare(a.id));
      break;
    default:
      // Relevance: an exact query prefix on the name wins, then rating.
      out = [...out].sort((a, b) => {
        const aStarts = q && a.nameEn.toLowerCase().startsWith(q) ? 1 : 0;
        const bStarts = q && b.nameEn.toLowerCase().startsWith(q) ? 1 : 0;
        return bStarts - aStarts || b.rating - a.rating;
      });
  }
  return out;
}

export const repository = {
  /* ------------------------------------------------------------ storefront */

  async banners(): Promise<DemoBanner[]> {
    return delay(DEMO_BANNERS);
  },

  async offers(): Promise<DemoOffer[]> {
    return delay(DEMO_OFFERS);
  },

  async stores(filter?: { cityKey?: string; query?: string; sort?: 'rating' | 'name' | 'distance' }): Promise<DemoStore[]> {
    const q = filter?.query?.trim().toLowerCase() ?? '';
    let out = DEMO_STORES.filter((s) => {
      if (filter?.cityKey && s.cityKey !== filter.cityKey) return false;
      if (q && !`${s.nameEn} ${s.nameAr} ${s.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (filter?.sort === 'rating') out = [...out].sort((a, b) => b.rating - a.rating);
    if (filter?.sort === 'name') out = [...out].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    return delay(out);
  },

  store: (id: string) => demoStore(id),

  async products(filter: ProductFilter = {}): Promise<DemoProduct[]> {
    return delay(filterProducts(DEMO_PRODUCTS, filter));
  },

  product: (id: string) => demoProduct(id),

  async productGroups(): Promise<Array<{ en: string; ar: string }>> {
    const seen = new Map<string, string>();
    for (const p of DEMO_PRODUCTS) if (!seen.has(p.groupEn)) seen.set(p.groupEn, p.groupAr);
    return delay([...seen.entries()].map(([en, ar]) => ({ en, ar })));
  },

  /** Products from the same store and group, excluding the one being viewed. */
  async relatedProducts(productId: string, limit = 6): Promise<DemoProduct[]> {
    const product = demoProduct(productId);
    if (!product) return delay([]);
    const related = DEMO_PRODUCTS.filter(
      (p) => p.id !== productId && (p.groupEn === product.groupEn || p.storeId === product.storeId),
    );
    return delay(related.slice(0, limit));
  },

  /** The best sellers across the marketplace, by rating and review volume. */
  async trendingProducts(limit = 8): Promise<DemoProduct[]> {
    const ranked = [...DEMO_PRODUCTS].sort(
      (a, b) => b.rating * Math.log10(b.reviewCount + 10) - a.rating * Math.log10(a.reviewCount + 10),
    );
    return delay(ranked.slice(0, limit));
  },

  /* -------------------------------------------------------------- services */

  async providers(filter?: {
    kind?: 'inspection' | 'maintenance' | 'recovery' | 'all';
    categoryKey?: CategoryKey | 'all';
    cityKey?: string;
    query?: string;
    sort?: 'rating' | 'distance' | 'name';
  }): Promise<DemoProvider[]> {
    const q = filter?.query?.trim().toLowerCase() ?? '';
    let out = DEMO_PROVIDERS.filter((p) => {
      if (filter?.kind && filter.kind !== 'all' && p.kind !== filter.kind) return false;
      if (filter?.categoryKey && filter.categoryKey !== 'all' && p.categoryKey !== filter.categoryKey) return false;
      if (filter?.cityKey && p.cityKey !== filter.cityKey) return false;
      if (q && !`${p.nameEn} ${p.nameAr} ${p.aboutEn} ${p.aboutAr}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (filter?.sort === 'rating') out = [...out].sort((a, b) => b.rating - a.rating);
    if (filter?.sort === 'distance') out = [...out].sort((a, b) => a.distanceKm - b.distanceKm);
    if (filter?.sort === 'name') out = [...out].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    return delay(out);
  },

  provider: (id: string) => demoProvider(id),

  /** Nearby providers for the homepage "services near you" rail. */
  async nearbyProviders(limit = 6): Promise<DemoProvider[]> {
    const sorted = [...DEMO_PROVIDERS].sort((a, b) => a.distanceKm - b.distanceKm);
    return delay(sorted.slice(0, limit));
  },

  /* -------------------------------------------------------------- reviews */

  async reviews(subjectId: string): Promise<DemoReview[]> {
    return delay(reviewsFor(subjectId));
  },

  /* ------------------------------------------------------------ customer */

  async vehicles(ownerId: string): Promise<DemoVehicle[]> {
    return delay(DEMO_VEHICLES.filter((v) => v.ownerId === ownerId));
  },

  vehicle: (id: string) => demoVehicle(id),

  async orders(customerId: string): Promise<DemoOrder[]> {
    return delay(
      DEMO_ORDERS.filter((o) => o.customerId === customerId).sort(
        (a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt),
      ),
    );
  },

  order: (id: string) => demoOrder(id),

  async bookings(customerId: string): Promise<DemoBooking[]> {
    return delay(DEMO_BOOKINGS.filter((b) => b.customerId === customerId));
  },

  async recoveryJobs(customerId: string): Promise<DemoRecoveryJob[]> {
    return delay(
      DEMO_RECOVERY_JOBS.filter((j) => j.customerId === customerId).sort(
        (a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt),
      ),
    );
  },

  recoveryJob: (id: string) => demoRecoveryJob(id),

  async sensageReports(customerId: string): Promise<DemoSensageReport[]> {
    return delay(
      DEMO_SENSAGE_REPORTS.filter((r) => r.customerId === customerId).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    );
  },

  sensageReport: (id: string) => demoSensageReport(id),

  async notifications(audience: 'customer' | 'merchant'): Promise<DemoNotification[]> {
    return delay(DEMO_NOTIFICATIONS.filter((n) => n.audience === audience));
  },

  async wallet(accountId: string): Promise<DemoWalletEntry[]> {
    return delay(DEMO_WALLET_ENTRIES.filter((w) => w.accountId === accountId));
  },

  async addresses(customerId: string): Promise<DemoAddress[]> {
    return delay(DEMO_ADDRESSES.filter((a) => a.customerId === customerId));
  },

  /** The demo favourites, already keyed `kind:id`. */
  async favourites(): Promise<string[]> {
    return delay(DEMO_FAVOURITES);
  },

  /* ---------------------------------------------------------------- plans */

  /** The marketplace subscription plans, for the merchant upgrade screen. */
  async plans(): Promise<DemoPlan[]> {
    return delay(DEMO_PLANS);
  },

  plan: (id: string | null) => planById(id),

  /* -------------------------------------------------------------- merchant */

  async merchantStore(storeId: string): Promise<DemoStore | undefined> {
    return delay(demoStore(storeId), 60);
  },

  async merchantProducts(storeId: string): Promise<DemoProduct[]> {
    return delay(DEMO_PRODUCTS.filter((p) => p.storeId === storeId));
  },

  async merchantOrders(storeId: string): Promise<DemoOrder[]> {
    return delay(merchantOrderStats(storeId).orders);
  },

  /** Bookings against any provider the merchant operates. Demo: the first ten. */
  async merchantBookings(storeId: string): Promise<DemoBooking[]> {
    const store = demoStore(storeId);
    if (!store) return delay([]);
    // A parts store also runs a workshop bay, so it sees a slice of bookings.
    return delay(DEMO_BOOKINGS.slice(0, 6));
  },

  async merchantRecoveryRequests(storeId: string): Promise<DemoRecoveryJob[]> {
    const store = demoStore(storeId);
    if (!store) return delay([]);
    return delay(DEMO_RECOVERY_JOBS.slice(0, 4));
  },

  async merchantRevenue(_storeId: string): Promise<number[]> {
    return delay(DEMO_REVENUE_SERIES, 60);
  },

  async merchantStats(storeId: string) {
    return delay(merchantOrderStats(storeId), 60);
  },

  async merchantCategoryMix(storeId: string) {
    return delay(merchantCategoryMix(storeId), 60);
  },

  /** Distinct customers who have ordered from this store. */
  async merchantCustomers(storeId: string) {
    const orders = DEMO_ORDERS.filter((o) => o.storeId === storeId);
    const spend = orders.reduce((sum, o) => sum + o.totalMinor, 0);
    const account = DEMO_ACCOUNTS.find((a) => a.id === orders[0]?.customerId) ?? DEMO_ACCOUNTS[0]!;
    return delay([
      { account, orderCount: orders.length, spendMinor: spend },
    ]);
  },

  /* ------------------------------------------------------------ accounts */

  accountByEmail: (email: string) => demoAccountByEmail(email),

  accounts: () => DEMO_ACCOUNTS,
};

export type Repository = typeof repository;

/** The demo "today", so relative-date rendering is stable across screenshots. */
export { DEMO_TODAY } from '../demo/activity';
